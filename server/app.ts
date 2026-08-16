/**
 * SERVER · Factory de la app Express: rutas + guardias de rol.
 *
 * Recibe la infraestructura ya armada (SQLite o Postgres) y devuelve la app
 * lista para escuchar. Separada de index.ts para poder testearla con base en
 * memoria (los tests de integración por rol golpean HTTP de verdad).
 *
 * SEGURIDAD — orden de capas:
 *  1. Rutas públicas: /api/health y /api/auth/login|logout (nada más).
 *  2. `autenticar`: TODO el resto de /api exige sesión válida (cookie
 *     HttpOnly). Sin sesión → 401, siempre.
 *  3. `requiere(accion)`: cada ruta declara su acción mínima según la matriz
 *     del dominio — las de LECTURA también, no solo las de escritura. Tener
 *     sesión no alcanza para leer: el contable exige 'ver', y un CONSULTOR
 *     (que no lo tiene) recibe 403 en todas ellas.
 *  4. Ámbito por fila: qué filas alcanza la sesión sale de `alcanceDe(res)`
 *     — del USUARIO, nunca de la query string. Los filtros que manda el
 *     cliente son cosméticos: pueden achicar el resultado, jamás ensancharlo.
 */
import { resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import type { Infraestructura } from '../src/infrastructure/db/conexion';
import {
  alcanceDe,
  borrarCookieSesion,
  crearGuardias,
  crearLimitadorLogin,
  exigirAmbitoTotal,
  setCookieSesion,
  tokenDe,
  usuarioDe,
} from './auth';
import { accionesDe, aUsuarioPublico } from '../src/domain/auth/permisos';
import * as uauth from '../src/application/auth/useCases';
import * as uce from '../src/application/egresos/useCases';
import * as ucom from '../src/application/comisiones/useCases';
import * as ucf from '../src/application/funnel/useCases';
import * as ucob from '../src/application/cobranza/useCases';
import * as ucia from '../src/application/asistente/useCases';
import { asistenteDisponible } from '../src/infrastructure/anthropic/cliente';
import type { FiltrosEgresos } from '../src/application/egresos/useCases';
import * as uc from '../src/application/useCases';
import * as ucc from '../src/application/cierres/useCases';
import * as ual from '../src/application/alumnos/useCases';
import type { MotivoTokenInvalido } from '../src/domain/alumnos/tipos';
import type { MotivoSeguimientoInvalido } from '../src/domain/alumnos/plan';
import type { Programa } from '../src/domain/types';
import type { Filtro } from '../src/application/ports';
import type { FiltrosCierres } from '../src/application/cierres/ports';

export interface OpcionesApp {
  /** Cookie con flag Secure (true en producción HTTPS). */
  cookieSegura?: boolean;
  /** Limitador de login (inyectable para tests). */
  limitadorLogin?: ReturnType<typeof crearLimitadorLogin>;
  /** Limitador del formulario público de diagnóstico (inyectable para tests). */
  limitadorFormulario?: ReturnType<typeof crearLimitadorLogin>;
  /** Limitador del link de seguimiento (inyectable para tests). */
  limitadorSeguimiento?: ReturnType<typeof crearLimitadorLogin>;
  /**
   * Carpeta del frontend compilado (vite build → dist). Si se pasa, Express
   * sirve esos archivos y hace fallback SPA (index.html) para las rutas del
   * cliente. En dev no se pasa: Vite sirve la UI y proxea /api.
   */
  dirEstaticos?: string;
}

const STATUS_AUTH: Record<uauth.ErrorAuth['codigo'], number> = {
  CREDENCIALES: 401,
  NO_AUTORIZADO: 403,
  VALIDACION: 400,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
};

/**
 * Token público (formulario o seguimiento) → respuesta. 410 (Gone) para el que
 * existió y ya no sirve: le dice al alumno que el link es real pero se agotó,
 * así sabe que tiene que pedir otro en vez de pensar que se equivocó al
 * copiarlo.
 */
type MotivoLink = MotivoTokenInvalido | MotivoSeguimientoInvalido;

const STATUS_TOKEN: Record<MotivoLink, number> = {
  inexistente: 404,
  vencido: 410,
  usado: 410,
  revocado: 410,
};

const MENSAJE_TOKEN: Record<MotivoLink, string> = {
  inexistente: 'Este link no es válido. Pedile uno nuevo a tu consultor.',
  vencido: 'Este link venció. Pedile uno nuevo a tu consultor.',
  usado: 'Este formulario ya fue enviado. Si necesitás corregir algo, escribile a tu consultor.',
  revocado: 'Este link fue dado de baja. Pedile el nuevo a tu consultor.',
};

export function crearApp(infra: Infraestructura, opciones: OpcionesApp = {}): express.Express {
  const { repos, reposDash, reposCierres, reposEgresos, reposLiquidacion, reposFunnelCanal, reposAuth, reposAlumnos } = infra;
  const cookieSegura = opciones.cookieSegura ?? process.env.NODE_ENV === 'production';
  const limitador = opciones.limitadorLogin ?? crearLimitadorLogin();
  /**
   * Limitadores de las rutas públicas (mismo mecanismo que el del login, por
   * IP). Los tokens son de 256 bits, así que adivinarlos no es el riesgo real:
   * esto corta el sondeo automatizado. Tolerantes, porque un alumno legítimo
   * recarga y tilda muchas veces. Instancias separadas: que un alumno activo en
   * su checklist no bloquee el formulario de diagnóstico, ni al revés.
   */
  const limitadorFormulario = opciones.limitadorFormulario ?? crearLimitadorLogin({ max: 30 });
  const limitadorSeguimiento = opciones.limitadorSeguimiento ?? crearLimitadorLogin({ max: 60 });
  const { autenticar, requiere } = crearGuardias(reposAuth);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.raw({
    type: [
      'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // El documento del plan (ticket 7B). El límite fino (10 MB) lo corta el
      // caso de uso con mensaje claro; este es el techo del transporte.
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    limit: '50mb',
  }));

  /**
   * Filtro del dashboard. La unidad de negocio la elige el cliente (es un
   * recorte de presentación, no un permiso), pero antes se verifica que la
   * sesión alcance TODAS las filas del contable: si algún día no fuera así,
   * acá no habría con qué acotar y la consulta se corta.
   */
  const filtroDe = (q: express.Request['query'], res: express.Response): Filtro | undefined => {
    exigirAmbitoTotal(alcanceDe(res), 'contable');
    const u = typeof q.unidad === 'string' ? q.unidad : undefined;
    return u ? { unidadNegocio: u as Filtro['unidadNegocio'] } : undefined;
  };

  /** Lee un parámetro de ruta garantizando string (noUncheckedIndexedAccess). */
  const param = (req: express.Request, nombre: string): string => req.params[nombre] ?? '';

  // Wrapper para capturar errores (sync y async): Zod → 400, ErrorAuth → su código.
  const h =
    (fn: (req: express.Request, res: express.Response) => unknown) =>
    async (req: express.Request, res: express.Response) => {
      try {
        const out = await fn(req, res);
        if (!res.headersSent) res.json(out ?? { ok: true });
      } catch (err) {
        if (err instanceof ZodError) {
          res.status(400).json({ error: 'Validación', detalles: err.flatten() });
        } else if (err instanceof uauth.ErrorAuth) {
          res.status(STATUS_AUTH[err.codigo]).json({ error: err.message });
        } else if (err instanceof ual.ErrorAlumnos) {
          if (err.codigo === 'TOKEN_INVALIDO') {
            const motivo = err.motivo ?? 'inexistente';
            res.status(STATUS_TOKEN[motivo]).json({ error: MENSAJE_TOKEN[motivo], motivo });
          } else {
            res.status(err.codigo === 'NO_ENCONTRADO' ? 404 : 400).json({ error: err.message });
          }
        } else {
          res.status(400).json({ error: err instanceof Error ? err.message : 'Error desconocido' });
        }
      }
    };

  // ───────────────────── Rutas públicas (las ÚNICAS sin sesión) ─────────────────────

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/auth/login', h(async (req, res) => {
    const ip = req.ip ?? 'desconocida';
    if (!limitador.permitido(ip)) {
      res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
      return;
    }
    try {
      const r = await uauth.login(reposAuth, req.body?.email, req.body?.password);
      limitador.exito(ip);
      setCookieSesion(res, r.token, cookieSegura);
      return { usuario: r.usuario, acciones: accionesDe(r.usuario.rol), expiraEn: r.expiraEn };
    } catch (err) {
      limitador.fallo(ip);
      throw err;
    }
  }));

  app.post('/api/auth/logout', h(async (req, res) => {
    const token = tokenDe(req);
    if (token) await uauth.logout(reposAuth, token);
    borrarCookieSesion(res, cookieSegura);
    return { ok: true };
  }));

  // ────────────── Formulario público de diagnóstico (token = credencial) ──────────────
  // Las ÚNICAS rutas sin sesión además de health y login/logout. Van ANTES del
  // gate a propósito: el alumno no tiene cuenta — su token de un solo uso ES la
  // credencial. Por eso acá NO se responde nada que exceda lo que el dueño del
  // link tiene derecho a ver, y el limitador por IP corta el sondeo de tokens.
  const conLimite = (limitador: ReturnType<typeof crearLimitadorLogin>) =>
    (fn: (req: express.Request, res: express.Response) => unknown) =>
      h(async (req, res) => {
        const ip = req.ip ?? 'desconocida';
        if (!limitador.permitido(ip)) {
          res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
          return;
        }
        try {
          const out = await fn(req, res);
          limitador.exito(ip);
          return out;
        } catch (err) {
          // Solo el token inválido cuenta como intento: un error de validación
          // es un alumno legítimo corrigiendo, no un sondeo.
          if (err instanceof ual.ErrorAlumnos && err.codigo === 'TOKEN_INVALIDO') limitador.fallo(ip);
          throw err;
        }
      });
  const conLimiteFormulario = conLimite(limitadorFormulario);
  const conLimiteSeguimiento = conLimite(limitadorSeguimiento);

  app.get('/api/formulario/:token', conLimiteFormulario((req) => ual.abrirFormulario(reposAlumnos, param(req, 'token'))));
  app.post('/api/formulario/:token', conLimiteFormulario(async (req) => {
    const d = await ual.enviarDiagnostico(reposAlumnos, param(req, 'token'), req.body);
    // Mínimo indispensable: la ruta es pública. El índice y el detalle son
    // material del CONSULTOR (fase del panel), no de la pantalla de gracias.
    return { enviado: true, id: d.id };
  }));

  // El link de seguimiento: el checklist del trimestre que el alumno tilda.
  // Misma familia que el formulario (token = credencial, sin sesión), pero el
  // token es REUSABLE: vive en el WhatsApp del alumno los ~90 días del plan.
  app.get('/api/seguimiento/:token', conLimiteSeguimiento((req) =>
    ual.abrirSeguimiento(reposAlumnos, param(req, 'token')),
  ));
  app.post('/api/seguimiento/:token/acciones/:accionId', conLimiteSeguimiento((req) =>
    ual.marcarAccion(reposAlumnos, param(req, 'token'), param(req, 'accionId'), req.body?.marcado),
  ));

  // ───────────────────── Gate global: de acá en adelante, SESIÓN ─────────────────────
  app.use('/api', autenticar);

  // ───────────────────── Sesión propia ─────────────────────

  app.get('/api/auth/yo', h(async (_req, res) => {
    const u = usuarioDe(res);
    return { usuario: aUsuarioPublico(u), acciones: accionesDe(u.rol) };
  }));

  app.post('/api/auth/password', h(async (req, res) => {
    // Cambia la propia contraseña; invalida TODAS las sesiones del usuario
    // (incluida esta): hay que volver a loguear con la nueva.
    await uauth.cambiarMiPassword(reposAuth, usuarioDe(res).id, req.body?.passwordActual, req.body?.passwordNueva);
    borrarCookieSesion(res, cookieSegura);
    return { ok: true };
  }));

  // ───────────────────── Gestión de usuarios (solo ADMIN) ─────────────────────

  app.get('/api/usuarios', requiere('gestionar_usuarios'), h(() => uauth.listarUsuarios(reposAuth)));
  app.post('/api/usuarios', requiere('gestionar_usuarios'), h((req) => uauth.crearUsuario(reposAuth, req.body)));
  app.put('/api/usuarios/:id/rol', requiere('gestionar_usuarios'), h((req) => uauth.cambiarRol(reposAuth, param(req, 'id'), req.body?.rol)));
  app.delete('/api/usuarios/:id', requiere('gestionar_usuarios'), h((req) => uauth.darDeBaja(reposAuth, param(req, 'id'))));
  app.post('/api/usuarios/:id/reactivar', requiere('gestionar_usuarios'), h((req) => uauth.reactivar(reposAuth, param(req, 'id'))));
  app.post('/api/usuarios/:id/reset-password', requiere('gestionar_usuarios'), h((req) => uauth.resetearPassword(reposAuth, param(req, 'id'))));

  // ───────────────────── Lecturas del contable (exigen 'ver') ─────────────────────
  // Ojo: NO alcanza con estar logueado. Un CONSULTOR tiene sesión válida y no
  // tiene 'ver' → 403 en todo este bloque.

  app.get('/api/meses', requiere('ver'), h(() => uc.obtenerMeses(reposDash)));

  app.get(
    '/api/dashboard/:mes',
    requiere('ver'),
    h((req, res) =>
      uc.obtenerDashboardDelMes(reposDash, param(req, 'mes'), {
        filtro: filtroDe(req.query, res),
        programa: (req.query.programa as 'TODOS' | Programa) ?? 'TODOS',
      }),
    ),
  );

  app.get('/api/historico', requiere('ver'), h((req, res) => uc.obtenerHistorico(reposDash, filtroDe(req.query, res))));

  app.get('/api/comparar/:mes', requiere('ver'), h((req, res) => uc.compararProgramas(reposDash, param(req, 'mes'), filtroDe(req.query, res))));

  app.get('/api/parametros', requiere('ver'), h(() => repos.parametros.obtener()));
  app.put('/api/parametros', requiere('editar'), h((req) => uc.guardarParametros(repos, req.body)));

  app.post('/api/ventas', requiere('editar'), h((req) => uc.agregarVenta(repos, req.body)));
  app.post('/api/cobros', requiere('editar'), h((req) => uc.agregarCobro(repos, req.body)));
  // Módulo Egresos (CRUD + resumen). Una sola tabla `egresos` (la que lee el dashboard).
  const filtrosEgresosDe = (q: express.Request['query']): FiltrosEgresos => ({
    mes: typeof q.mes === 'string' ? q.mes : undefined,
    categoria: typeof q.categoria === 'string' ? q.categoria : undefined,
    tipo: typeof q.tipo === 'string' ? q.tipo : undefined,
    moneda: typeof q.moneda === 'string' ? q.moneda : undefined,
    q: typeof q.q === 'string' ? q.q : undefined,
  });
  app.get('/api/egresos', requiere('ver'), h((req) => uce.listarEgresos(reposEgresos, filtrosEgresosDe(req.query))));
  app.get('/api/egresos/resumen/:mes', requiere('ver'), h((req) => uce.resumenEgresos(reposEgresos, param(req, 'mes'), filtrosEgresosDe(req.query))));
  app.post('/api/egresos', requiere('editar'), h((req) => uce.crearEgreso(reposEgresos, req.body)));
  app.put('/api/egresos/:id', requiere('editar'), h((req) => uce.editarEgreso(reposEgresos, param(req, 'id'), req.body)));
  app.delete('/api/egresos/:id', requiere('editar'), h((req) => uce.eliminarEgreso(reposEgresos, param(req, 'id'))));

  // Comisiones (cálculo automático + liquidación idempotente)
  app.get('/api/comisiones/liquidaciones', requiere('ver'), h(() => ucom.listarLiquidaciones(reposLiquidacion)));
  app.get('/api/comisiones/:mes', requiere('ver'), h((req) => ucom.obtenerEstado(reposCierres, reposLiquidacion, param(req, 'mes'))));
  app.post('/api/comisiones/liquidar/:mes', requiere('editar'), h((req) =>
    ucom.liquidarComisiones(reposCierres, reposEgresos, reposLiquidacion, param(req, 'mes'), { reemplazar: req.body?.reemplazar === true }),
  ));
  app.delete('/api/comisiones/liquidar/:mes', requiere('editar'), h((req) => ucom.anularLiquidacion(reposEgresos, reposLiquidacion, param(req, 'mes'))));

  app.get('/api/funnel/:mes', requiere('ver'), h((req) => ucf.obtenerFunnel(reposCierres, reposFunnelCanal, repos.funnel, param(req, 'mes'))));
  app.put('/api/funnel/:mes', requiere('editar'), h((req) => ucf.guardarFunnelCanales(reposFunnelCanal, param(req, 'mes'), req.body)));

  app.post('/api/cierre/:mes', requiere('editar'), h((req) => uc.cerrarMes(repos, param(req, 'mes'))));
  app.delete('/api/cierre/:mes', requiere('editar'), h((req) => uc.reabrirMes(repos, param(req, 'mes'))));

  // Importación legacy de Excel: acción destructiva → solo ADMIN.
  app.post(
    '/api/importar',
    requiere('importar'),
    h((req) => {
      if (!Buffer.isBuffer(req.body)) throw new Error('Enviá el .xlsx como application/octet-stream.');
      return uc.importarExcel(repos, req.body);
    }),
  );

  // ───────────────────── Módulo "Cierres y Clientes" ─────────────────────
  /**
   * Filtros del listado de cierres. TODOS son cosméticos: acotan lo que el
   * usuario ya tiene derecho a ver. `closer` incluido — es el nombre del
   * closer en texto libre, no un titular ligado a `usuarios`, así que no
   * sirve como control de acceso. El control real es 'ver' + ámbito total.
   */
  const filtrosCierresDe = (q: express.Request['query'], res: express.Response): FiltrosCierres => {
    exigirAmbitoTotal(alcanceDe(res), 'cierres');
    return {
      mes: typeof q.mes === 'string' ? q.mes : undefined,
      programa: typeof q.programa === 'string' ? (q.programa as FiltrosCierres['programa']) : undefined,
      closer: typeof q.closer === 'string' ? q.closer : undefined,
      estado: typeof q.estado === 'string' ? (q.estado as FiltrosCierres['estado']) : undefined,
      q: typeof q.q === 'string' ? q.q : undefined,
      unidadNegocio: typeof q.unidad === 'string' ? q.unidad : undefined,
    };
  };

  app.get('/api/cierres', requiere('ver'), h((req, res) => ucc.listarCierresConPagos(reposCierres, filtrosCierresDe(req.query, res))));
  app.get('/api/cierres/resumen/:mes', requiere('ver'), h((req, res) => ucc.resumenDelMes(reposCierres, param(req, 'mes'), filtrosCierresDe(req.query, res))));
  app.get('/api/cierres/:id', requiere('ver'), h((req) => ucc.obtenerCierre(reposCierres, param(req, 'id'))));
  app.post('/api/cierres', requiere('editar'), h((req) => ucc.crearCierre(reposCierres, req.body)));
  app.put('/api/cierres/:id', requiere('editar'), h((req) => ucc.editarCierre(reposCierres, param(req, 'id'), req.body)));
  app.delete('/api/cierres/:id', requiere('editar'), h((req) => ucc.eliminarCierre(reposCierres, param(req, 'id'))));

  // Importación masiva de cierres/pagos: destructiva en potencia → solo ADMIN.
  app.post('/api/cierres/importar', requiere('importar'), h((req) => ucc.importarCierresPagos(reposCierres, req.body)));
  app.delete('/api/cierres/:id/revisar', requiere('editar'), h((req) => ucc.quitarRevisar(reposCierres, param(req, 'id'))));

  // Asistente IA (text-to-SQL de solo lectura sobre el contable → exige 'ver').
  // Un CONSULTOR no llega acá: sería la puerta de atrás al contable, y además
  // el SQL generado pasaría por encima del ámbito por fila. Por eso las tablas
  // del módulo de alumnos siguen en TABLAS_SENSIBLES hasta el ticket 6.
  app.get('/api/asistente/estado', requiere('ver'), (_req, res) => res.json({ disponible: asistenteDisponible() }));
  app.post('/api/asistente', requiere('ver'), (req, res) => {
    ucia
      .responderPregunta(req.body?.pregunta)
      .then((r) => res.json(r))
      .catch((e) => res.status(500).json({ disponible: true, ok: false, respuesta: e instanceof Error ? e.message : 'Error' }));
  });

  // Cobranza y morosidad (deriva del plan de cuotas + pagos reales)
  app.get('/api/cobranza', requiere('ver'), h(() => ucob.obtenerCobranza(reposCierres)));
  app.post('/api/cierres/:id/inactivar', requiere('editar'), h((req) => ucc.marcarInactivo(reposCierres, param(req, 'id'))));
  app.delete('/api/cierres/:id/inactivar', requiere('editar'), h((req) => ucc.reactivar(reposCierres, param(req, 'id'))));

  app.post('/api/pagos', requiere('editar'), h((req) => ucc.agregarPago(reposCierres, req.body)));
  app.put('/api/pagos/:id', requiere('editar'), h((req) => ucc.editarPago(reposCierres, param(req, 'id'), req.body)));
  app.delete('/api/pagos/:id', requiere('editar'), h((req) => ucc.eliminarPago(reposCierres, param(req, 'id'))));

  // Reseteo seguro: destructivo → solo ADMIN.
  app.delete('/api/cierres-demo', requiere('importar'), h(() => ucc.borrarDatosDemo(reposCierres)));
  app.post('/api/cierres-reset', requiere('importar'), h((req) => ucc.reiniciarCierresYPagos(reposCierres, req.body)));

  // ───────────────────── Módulo de gestión de alumnos ─────────────────────
  // Acciones de la familia ALUMNOS ('ver_alumnos'/'editar_alumnos'): las tienen
  // CONSULTOR y ADMIN — un LECTOR o EDITOR del contable recibe 403 acá, espejo
  // exacto de lo que le pasa al consultor en el contable. Además de la acción,
  // cada consulta baja el ÁMBITO de la sesión (alcanceDe): el consultor solo
  // alcanza su cartera, y la ficha ajena responde 404, no 403 — no se revela
  // que existe.
  app.get('/api/alumnos', requiere('ver_alumnos'), h((req, res) =>
    ual.listarAlumnos(reposAlumnos, alcanceDe(res), {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      // Cosmético (útil para ADMIN); con ámbito acotado el caso de uso lo pisa.
      consultorId: typeof req.query.consultor === 'string' ? req.query.consultor : undefined,
    }),
  ));
  // El panel de control (ticket 7): la cartera con fase, semáforo de salud y
  // orden por riesgo. ANTES de /api/alumnos/:id para que "panel" no matchee
  // como id. Filtros cosméticos; el ámbito manda igual que en el listado.
  app.get('/api/alumnos/panel', requiere('ver_alumnos'), h((req, res) =>
    ual.panelAlumnos(reposAlumnos, reposAuth.usuarios, alcanceDe(res), {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      estado: typeof req.query.estado === 'string' ? (req.query.estado as ual.FiltrosPanel['estado']) : undefined,
      salud: typeof req.query.salud === 'string' ? (req.query.salud as ual.FiltrosPanel['salud']) : undefined,
      consultorId: typeof req.query.consultor === 'string' ? req.query.consultor : undefined,
    }),
  ));
  // Papelera (ticket 7): borrado lógico, restaurar y purga definitiva. La
  // acción 'eliminar_alumnos' la tiene SOLO ADMIN — un consultor gestiona su
  // cartera pero no la borra. También antes de /:id por el matcheo.
  app.get('/api/alumnos/papelera', requiere('eliminar_alumnos'), h(() =>
    ual.listarPapelera(reposAlumnos, reposAuth.usuarios),
  ));
  app.post('/api/alumnos', requiere('editar_alumnos'), h((req, res) =>
    ual.crearAlumno(reposAlumnos, usuarioDe(res).id, req.body),
  ));
  app.get('/api/alumnos/:id', requiere('ver_alumnos'), h(async (req, res) => {
    const alumno = await ual.obtenerAlumno(reposAlumnos, alcanceDe(res), param(req, 'id'));
    if (!alumno) throw new ual.ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
    return alumno;
  }));
  app.put('/api/alumnos/:id', requiere('editar_alumnos'), h((req, res) =>
    ual.editarAlumno(reposAlumnos, alcanceDe(res), param(req, 'id'), req.body),
  ));
  // Estado del ciclo de vida (ticket 7): ACTIVO/PAUSADO/FINALIZADO/ABANDONADO.
  // Gobierna semáforo y alertas; lo cambia el consultor asignado o ADMIN.
  app.put('/api/alumnos/:id/estado', requiere('editar_alumnos'), h((req, res) =>
    ual.cambiarEstadoAlumno(reposAlumnos, alcanceDe(res), param(req, 'id'), req.body),
  ));
  app.delete('/api/alumnos/:id', requiere('eliminar_alumnos'), h((req, res) =>
    ual.eliminarAlumno(reposAlumnos, alcanceDe(res), usuarioDe(res).id, param(req, 'id')),
  ));
  app.post('/api/alumnos/:id/restaurar', requiere('eliminar_alumnos'), h((req) =>
    ual.restaurarAlumno(reposAlumnos, param(req, 'id')),
  ));
  // Borrado FÍSICO: solo desde la papelera y confirmando con el nombre exacto.
  app.delete('/api/alumnos/:id/definitivo', requiere('eliminar_alumnos'), h((req) =>
    ual.eliminarAlumnoDefinitivo(reposAlumnos, param(req, 'id'), req.body?.confirmacion),
  ));
  app.post('/api/alumnos/:id/token', requiere('editar_alumnos'), h((req, res) =>
    ual.emitirToken(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));
  app.get('/api/alumnos/:id/diagnosticos', requiere('ver_alumnos'), h((req, res) =>
    ual.listarDiagnosticos(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));
  // Corrección durante la llamada: ajusta la fila y la marca como editada por
  // el consultor (no crea envío nuevo). Fuera de ámbito responde 404.
  app.put('/api/diagnosticos/:id', requiere('editar_alumnos'), h((req, res) =>
    ual.editarDiagnostico(reposAlumnos, alcanceDe(res), param(req, 'id'), req.body),
  ));
  // Exportación para la skill del plan de 90 días: el consultor copia el texto
  // y lo pega en Claude. La generación del plan vive fuera de la app.
  app.get('/api/diagnosticos/:id/exportacion', requiere('ver_alumnos'), h((req, res) =>
    ual.exportarDiagnosticoParaSkill(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));

  // El plan de 90 días entra pegando el bloque JSON de la skill
  // (CONTRATO-PLAN.md). Dos pasos: previa (valida y junta advertencias, sin
  // escribir) → carga (transaccional, con la fecha corregida si hizo falta).
  app.post('/api/alumnos/:id/plan/previa', requiere('editar_alumnos'), h((req, res) =>
    ual.previaPlan(reposAlumnos, alcanceDe(res), param(req, 'id'), req.body?.bloque),
  ));
  app.post('/api/alumnos/:id/plan', requiere('editar_alumnos'), h((req, res) =>
    ual.cargarPlan(reposAlumnos, alcanceDe(res), param(req, 'id'), req.body?.bloque, req.body?.fechaInicio),
  ));
  app.get('/api/alumnos/:id/planes', requiere('ver_alumnos'), h((req, res) =>
    ual.listarPlanes(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));
  // Link de seguimiento del plan: emitir es ESTABLE (devuelve el vigente si lo
  // hay); revocar lo da de baja (link filtrado o reemplazo deliberado).
  app.post('/api/planes/:id/link', requiere('editar_alumnos'), h((req, res) =>
    ual.emitirLinkSeguimiento(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));
  app.delete('/api/planes/:id/link', requiere('editar_alumnos'), h((req, res) =>
    ual.revocarLinkSeguimiento(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));
  // El tablero de avance: estado por acción, % por fase y última actividad.
  app.get('/api/planes/:id/avance', requiere('ver_alumnos'), h((req, res) =>
    ual.avancePlan(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));
  // Fecha de inicio editable (ticket 7): mueve la fecha, desplaza los
  // vencimientos de los KRs por el delta y deja rastro en el historial.
  app.put('/api/planes/:id/fecha-inicio', requiere('editar_alumnos'), h((req, res) =>
    ual.cambiarFechaInicioPlan(reposAlumnos, alcanceDe(res), usuarioDe(res).id, param(req, 'id'), req.body),
  ));
  // Seguimiento de un KR (ticket 7): cumplimiento (alimenta el semáforo) y
  // vencimiento. El KR de un alumno ajeno responde 404, como toda fila ajena.
  app.put('/api/krs/:id', requiere('editar_alumnos'), h((req, res) =>
    ual.editarKr(reposAlumnos, alcanceDe(res), param(req, 'id'), req.body),
  ));

  // El documento del plan (ticket 7B): el .pdf/.docx viaja como binario crudo
  // y vive en la base (el filesystem de Railway es efímero). El nombre va en
  // la query porque el body ES el archivo. Versionado: nunca pisa el anterior.
  app.post('/api/planes/:id/documentos', requiere('editar_alumnos'), h((req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new ual.ErrorAlumnos('VALIDACION', 'Solo se aceptan .pdf o .docx.');
    }
    return ual.subirDocumentoPlan(
      reposAlumnos, alcanceDe(res), usuarioDe(res).id, param(req, 'id'),
      typeof req.query.nombre === 'string' ? req.query.nombre : '',
      new Uint8Array(req.body),
    );
  }));
  app.get('/api/planes/:id/documentos', requiere('ver_alumnos'), h((req, res) =>
    ual.listarDocumentosPlan(reposAlumnos, alcanceDe(res), param(req, 'id')),
  ));
  // El contenido: inline para el visor de PDF, attachment para el .docx. El
  // ámbito baja igual que en toda fila (el documento ajeno no existe).
  app.get('/api/documentos/:id', requiere('ver_alumnos'), h(async (req, res) => {
    const { doc, contenido } = await ual.obtenerDocumentoPlan(reposAlumnos, alcanceDe(res), param(req, 'id'));
    const disposicion = doc.mimeType === 'application/pdf' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `${disposicion}; filename*=UTF-8''${encodeURIComponent(doc.nombreArchivo)}`);
    res.send(Buffer.from(contenido));
  }));

  // ───────────────────── Frontend compilado (producción) ─────────────────────
  // Una ruta /api/* que no matcheó nada llega acá → 404 JSON (no el index.html),
  // así un endpoint inexistente nunca devuelve la SPA por error.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta de API inexistente.' }));

  if (opciones.dirEstaticos) {
    app.use(express.static(opciones.dirEstaticos));
    // Fallback SPA: cualquier otra ruta devuelve index.html (React Router del
    // lado del cliente). Express 4: '*' evita chocar con las rutas de /api.
    app.get('*', (_req, res) => res.sendFile(resolve(opciones.dirEstaticos!, 'index.html')));
  }

  return app;
}
