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
 *  3. `requiere(accion)`: cada ruta de escritura declara su acción mínima
 *     según la matriz del dominio (LECTOR ve; EDITOR edita; ADMIN importa,
 *     resetea y gestiona usuarios).
 */
import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import type { Infraestructura } from '../src/infrastructure/db/conexion';
import {
  borrarCookieSesion,
  crearGuardias,
  crearLimitadorLogin,
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
import type { Programa } from '../src/domain/types';
import type { Filtro } from '../src/application/ports';
import type { FiltrosCierres } from '../src/application/cierres/ports';

export interface OpcionesApp {
  /** Cookie con flag Secure (true en producción HTTPS). */
  cookieSegura?: boolean;
  /** Limitador de login (inyectable para tests). */
  limitadorLogin?: ReturnType<typeof crearLimitadorLogin>;
}

const STATUS_AUTH: Record<uauth.ErrorAuth['codigo'], number> = {
  CREDENCIALES: 401,
  NO_AUTORIZADO: 403,
  VALIDACION: 400,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
};

export function crearApp(infra: Infraestructura, opciones: OpcionesApp = {}): express.Express {
  const { repos, reposDash, reposCierres, reposEgresos, reposLiquidacion, reposFunnelCanal, reposAuth } = infra;
  const cookieSegura = opciones.cookieSegura ?? process.env.NODE_ENV === 'production';
  const limitador = opciones.limitadorLogin ?? crearLimitadorLogin();
  const { autenticar, requiere } = crearGuardias(reposAuth);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.raw({ type: ['application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], limit: '50mb' }));

  const filtroDe = (q: express.Request['query']): Filtro | undefined => {
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

  // ───────────────────── Lecturas (cualquier rol logueado: 'ver') ─────────────────────

  app.get('/api/meses', h(() => uc.obtenerMeses(reposDash)));

  app.get(
    '/api/dashboard/:mes',
    h((req) =>
      uc.obtenerDashboardDelMes(reposDash, param(req, 'mes'), {
        filtro: filtroDe(req.query),
        programa: (req.query.programa as 'TODOS' | Programa) ?? 'TODOS',
      }),
    ),
  );

  app.get('/api/historico', h((req) => uc.obtenerHistorico(reposDash, filtroDe(req.query))));

  app.get('/api/comparar/:mes', h((req) => uc.compararProgramas(reposDash, param(req, 'mes'), filtroDe(req.query))));

  app.get('/api/parametros', h(() => repos.parametros.obtener()));
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
  app.get('/api/egresos', h((req) => uce.listarEgresos(reposEgresos, filtrosEgresosDe(req.query))));
  app.get('/api/egresos/resumen/:mes', h((req) => uce.resumenEgresos(reposEgresos, param(req, 'mes'), filtrosEgresosDe(req.query))));
  app.post('/api/egresos', requiere('editar'), h((req) => uce.crearEgreso(reposEgresos, req.body)));
  app.put('/api/egresos/:id', requiere('editar'), h((req) => uce.editarEgreso(reposEgresos, param(req, 'id'), req.body)));
  app.delete('/api/egresos/:id', requiere('editar'), h((req) => uce.eliminarEgreso(reposEgresos, param(req, 'id'))));

  // Comisiones (cálculo automático + liquidación idempotente)
  app.get('/api/comisiones/liquidaciones', h(() => ucom.listarLiquidaciones(reposLiquidacion)));
  app.get('/api/comisiones/:mes', h((req) => ucom.obtenerEstado(reposCierres, reposLiquidacion, param(req, 'mes'))));
  app.post('/api/comisiones/liquidar/:mes', requiere('editar'), h((req) =>
    ucom.liquidarComisiones(reposCierres, reposEgresos, reposLiquidacion, param(req, 'mes'), { reemplazar: req.body?.reemplazar === true }),
  ));
  app.delete('/api/comisiones/liquidar/:mes', requiere('editar'), h((req) => ucom.anularLiquidacion(reposEgresos, reposLiquidacion, param(req, 'mes'))));

  app.get('/api/funnel/:mes', h((req) => ucf.obtenerFunnel(reposCierres, reposFunnelCanal, repos.funnel, param(req, 'mes'))));
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
  const filtrosCierresDe = (q: express.Request['query']): FiltrosCierres => ({
    mes: typeof q.mes === 'string' ? q.mes : undefined,
    programa: typeof q.programa === 'string' ? (q.programa as FiltrosCierres['programa']) : undefined,
    closer: typeof q.closer === 'string' ? q.closer : undefined,
    estado: typeof q.estado === 'string' ? (q.estado as FiltrosCierres['estado']) : undefined,
    q: typeof q.q === 'string' ? q.q : undefined,
    unidadNegocio: typeof q.unidad === 'string' ? q.unidad : undefined,
  });

  app.get('/api/cierres', h((req) => ucc.listarCierresConPagos(reposCierres, filtrosCierresDe(req.query))));
  app.get('/api/cierres/resumen/:mes', h((req) => ucc.resumenDelMes(reposCierres, param(req, 'mes'), filtrosCierresDe(req.query))));
  app.get('/api/cierres/:id', h((req) => ucc.obtenerCierre(reposCierres, param(req, 'id'))));
  app.post('/api/cierres', requiere('editar'), h((req) => ucc.crearCierre(reposCierres, req.body)));
  app.put('/api/cierres/:id', requiere('editar'), h((req) => ucc.editarCierre(reposCierres, param(req, 'id'), req.body)));
  app.delete('/api/cierres/:id', requiere('editar'), h((req) => ucc.eliminarCierre(reposCierres, param(req, 'id'))));

  // Importación masiva de cierres/pagos: destructiva en potencia → solo ADMIN.
  app.post('/api/cierres/importar', requiere('importar'), h((req) => ucc.importarCierresPagos(reposCierres, req.body)));
  app.delete('/api/cierres/:id/revisar', requiere('editar'), h((req) => ucc.quitarRevisar(reposCierres, param(req, 'id'))));

  // Asistente IA (text-to-SQL de solo lectura: cualquier rol logueado).
  app.get('/api/asistente/estado', (_req, res) => res.json({ disponible: asistenteDisponible() }));
  app.post('/api/asistente', (req, res) => {
    ucia
      .responderPregunta(req.body?.pregunta)
      .then((r) => res.json(r))
      .catch((e) => res.status(500).json({ disponible: true, ok: false, respuesta: e instanceof Error ? e.message : 'Error' }));
  });

  // Cobranza y morosidad (deriva del plan de cuotas + pagos reales)
  app.get('/api/cobranza', h(() => ucob.obtenerCobranza(reposCierres)));
  app.post('/api/cierres/:id/inactivar', requiere('editar'), h((req) => ucc.marcarInactivo(reposCierres, param(req, 'id'))));
  app.delete('/api/cierres/:id/inactivar', requiere('editar'), h((req) => ucc.reactivar(reposCierres, param(req, 'id'))));

  app.post('/api/pagos', requiere('editar'), h((req) => ucc.agregarPago(reposCierres, req.body)));
  app.put('/api/pagos/:id', requiere('editar'), h((req) => ucc.editarPago(reposCierres, param(req, 'id'), req.body)));
  app.delete('/api/pagos/:id', requiere('editar'), h((req) => ucc.eliminarPago(reposCierres, param(req, 'id'))));

  // Reseteo seguro: destructivo → solo ADMIN.
  app.delete('/api/cierres-demo', requiere('importar'), h(() => ucc.borrarDatosDemo(reposCierres)));
  app.post('/api/cierres-reset', requiere('importar'), h((req) => ucc.reiniciarCierresYPagos(reposCierres, req.body)));

  return app;
}
