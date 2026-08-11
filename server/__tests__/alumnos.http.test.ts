/**
 * Integración HTTP del módulo de alumnos: la app Express real sobre SQLite en
 * memoria, golpeada con requests de verdad.
 *
 * Lo que solo se puede probar acá y no en las capas de abajo:
 *  - que el formulario público quede ANTES del gate de sesión (sin cookie),
 *  - que esa ruta no filtre ni un campo de más (es pública),
 *  - que el limitador por IP corte el sondeo de tokens,
 *  - y que el ámbito por fila sobreviva el viaje por Express: un consultor
 *    logueado de verdad no llega a la cartera de otro ni con la URL exacta.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { getDbMemoria } from '../../src/infrastructure/sqlite/db';
import { infraestructuraDesdeDb, type Infraestructura } from '../../src/infrastructure/db/conexion';
import type { Hasher } from '../../src/application/auth/ports';
import * as uauth from '../../src/application/auth/useCases';
import * as ual from '../../src/application/alumnos/useCases';
import { alcanceDeUsuario } from '../../src/domain/auth/permisos';
import { crearApp } from '../app';
import { crearLimitadorLogin } from '../auth';

const hasherFake: Hasher = {
  hash: async (p) => `fake:${p}`,
  verificar: async (p, h) => h === `fake:${p}`,
};

const json = { 'content-type': 'application/json' };

const FICHA = { nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS' };

/** Obligatorias del bloque 0 pendiente + bloques 1–8 (mismo payload que la integración). */
function diagnosticoCompleto(): Record<string, unknown> {
  return {
    edad: 38,
    zona: 'Córdoba Capital',
    whatsapp: '+5493510000000',
    canal_origen: 'Instagram',
    antiguedad_meses: 24,
    tipo_dedicacion: 'Negocio principal',
    objetivo_6m: 'Duplicar la cartera',
    vision_negocio: 'Armar una empresa financiera',
    bloqueo_principal: 'La cobranza',
    capital_colocado: 13_000_000,
    origen_capital: 'Mixto',
    costo_capital_mensual: 5,
    capital_disponible: 2_000_000,
    recupero_mensual: 3_000_000,
    separacion_dinero: 'Parcialmente',
    ganancia_mensual: 900_000,
    retiro_mensual: 400_000,
    gastos_operativos: 150_000,
    clientes_activos: 62,
    clientes_nuevos_mes: 8,
    ticket_promedio: 210_000,
    estructura_plazos: '3, 6 y 12 cuotas',
    plazo_promedio_meses: 6,
    perfil_cliente: ['Comerciantes'],
    recurrencia: 45,
    tasa_declarada: '10% mensual',
    ejemplo_total_100k: 160_000,
    punitorio: '2% semanal',
    tasa_competencia: 'Entre 8 y 12',
    documentacion_solicitada: ['DNI'],
    firma_documentacion: 'Solo pagaré',
    porcentaje_documentado: 80,
    criterio_monto: 'Por antigüedad',
    criterios_aprobacion: 'Sí, escritos',
    herramienta_consulta: 'Nosis',
    politica_garantias: 'Garante arriba de 500 mil',
    mora_clientes: 12,
    monto_en_mora: 1_400_000,
    proceso_cobranza: 'Solo aviso el día del vencimiento',
    descripcion_cobranza: 'WhatsApp al vencer',
    dificultad_cobranza: 'Insistir',
    sistema_registro: ['Cuaderno'],
    canales_captacion: ['Instagram'],
    equipo: 'Solo yo',
    situacion_fiscal: 'Monotributo',
    unidad_ventas: 'No, solo presto dinero',
    prioridad_declarada: ['Cobranza'],
    vision_12m: 'Financiera formal',
    freno_percibido: 'Procesos',
  };
}

interface Ctx {
  base: string;
  server: Server;
  infra: Infraestructura;
  cookies: { admin: string; lector: string; consultor: string; otroConsultor: string };
  ids: { consultor: string; otroConsultor: string };
}

async function levantarApp(): Promise<Ctx> {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);

  await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234');
  await uauth.crearUsuario(infra.reposAuth, { email: 'lector@activos.com', nombre: 'Lec', rol: 'LECTOR', password: 'Clave1234' });
  const { usuario: consu } = await uauth.crearUsuario(infra.reposAuth, { email: 'consu@activos.com', nombre: 'Consu', rol: 'CONSULTOR', password: 'Clave1234' });
  const { usuario: otro } = await uauth.crearUsuario(infra.reposAuth, { email: 'otro@activos.com', nombre: 'Otro', rol: 'CONSULTOR', password: 'Clave1234' });

  const app = crearApp(infra, { cookieSegura: false });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const loguear = async (email: string): Promise<string> => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: json, body: JSON.stringify({ email, password: 'Clave1234' }),
    });
    expect(res.status).toBe(200);
    return res.headers.get('set-cookie')!.split(';')[0]!;
  };

  return {
    base,
    server,
    infra,
    cookies: {
      admin: await loguear('admin@activos.com'),
      lector: await loguear('lector@activos.com'),
      consultor: await loguear('consu@activos.com'),
      otroConsultor: await loguear('otro@activos.com'),
    },
    ids: { consultor: consu.id, otroConsultor: otro.id },
  };
}

let ctx: Ctx;
beforeAll(async () => {
  ctx = await levantarApp();
});
afterAll(() => {
  ctx.server.close();
});

/** Alta de alumno + token por HTTP, con la cookie del consultor. */
async function crearAlumnoConToken(cookie: string): Promise<{ alumnoId: string; token: string }> {
  const alta = await fetch(`${ctx.base}/api/alumnos`, {
    method: 'POST', headers: { ...json, cookie }, body: JSON.stringify(FICHA),
  });
  expect(alta.status).toBe(200);
  const alumno = (await alta.json()) as { id: string };
  const emision = await fetch(`${ctx.base}/api/alumnos/${alumno.id}/token`, { method: 'POST', headers: { cookie } });
  expect(emision.status).toBe(200);
  const t = (await emision.json()) as { token: string };
  return { alumnoId: alumno.id, token: t.token };
}

describe('HTTP · formulario público (sin sesión)', () => {
  it('un token válido abre el formulario SIN cookie y devuelve solo lo mínimo', async () => {
    const { token } = await crearAlumnoConToken(ctx.cookies.consultor);
    const res = await fetch(`${ctx.base}/api/formulario/${token}`);
    expect(res.status).toBe(200);
    const datos = (await res.json()) as Record<string, unknown>;
    // Ruta pública: saludo + qué campos de ficha faltan (nombres, no valores).
    expect(Object.keys(datos).sort()).toEqual(['fichaPendiente', 'moneda', 'nombre', 'programa']);
    expect(datos.nombre).toBe('Gonzalo');
    expect(datos.fichaPendiente).toEqual(['edad', 'zona', 'whatsapp', 'marca_comercial', 'canal_origen']);
  });

  it('un token inventado → 404 con mensaje para el alumno', async () => {
    const res = await fetch(`${ctx.base}/api/formulario/token-trucho`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/pedile uno nuevo/i);
  });

  it('un token vencido → 410 con motivo (el link existió, ya no sirve)', async () => {
    // El vencimiento se fabrica por casos de uso (no hay HTTP que viaje en el tiempo).
    const alcance = alcanceDeUsuario({ id: ctx.ids.consultor, rol: 'CONSULTOR' });
    const alumno = await ual.crearAlumno(ctx.infra.reposAlumnos, ctx.ids.consultor, FICHA);
    const viejo = await ual.emitirToken(ctx.infra.reposAlumnos, alcance, alumno.id, '2026-01-01T00:00:00.000Z');

    const res = await fetch(`${ctx.base}/api/formulario/${viejo.token}`);
    expect(res.status).toBe(410);
    expect(((await res.json()) as { motivo: string }).motivo).toBe('vencido');
  });

  it('el envío completo guarda, responde lo mínimo y consume el token', async () => {
    const { alumnoId, token } = await crearAlumnoConToken(ctx.cookies.consultor);

    const envio = await fetch(`${ctx.base}/api/formulario/${token}`, {
      method: 'POST', headers: json, body: JSON.stringify(diagnosticoCompleto()),
    });
    expect(envio.status).toBe(200);
    const r = (await envio.json()) as Record<string, unknown>;
    // La pantalla de gracias no necesita el diagnóstico: eso es del panel.
    expect(Object.keys(r).sort()).toEqual(['enviado', 'id']);

    // El mismo link ya no sirve: ni para reenviar ni para volver a abrir.
    const reenvio = await fetch(`${ctx.base}/api/formulario/${token}`, {
      method: 'POST', headers: json, body: JSON.stringify(diagnosticoCompleto()),
    });
    expect(reenvio.status).toBe(410);
    expect(((await reenvio.json()) as { motivo: string }).motivo).toBe('usado');

    // Y el consultor lo ve en la ficha, con el índice calculado.
    const lista = await fetch(`${ctx.base}/api/alumnos/${alumnoId}/diagnosticos`, {
      headers: { cookie: ctx.cookies.consultor },
    });
    expect(lista.status).toBe(200);
    const diagnosticos = (await lista.json()) as { indiceClaridad: number; origen: string }[];
    expect(diagnosticos).toHaveLength(1);
    expect(diagnosticos[0]!.indiceClaridad).toBe(100);
    expect(diagnosticos[0]!.origen).toBe('alumno');
  });

  it('un envío incompleto → 400 con detalle de Zod y el token SIGUE vivo', async () => {
    const { token } = await crearAlumnoConToken(ctx.cookies.consultor);
    const incompleto = { ...diagnosticoCompleto(), mora_clientes: null };

    const envio = await fetch(`${ctx.base}/api/formulario/${token}`, {
      method: 'POST', headers: json, body: JSON.stringify(incompleto),
    });
    expect(envio.status).toBe(400);
    const detalle = (await envio.json()) as { detalles?: { fieldErrors: Record<string, string[]> } };
    expect(detalle.detalles?.fieldErrors.mora_clientes?.[0]).toMatch(/no lo tengo claro/i);

    // El alumno corrige y reenvía con el MISMO link.
    const reintento = await fetch(`${ctx.base}/api/formulario/${token}`, {
      method: 'POST', headers: json, body: JSON.stringify(diagnosticoCompleto()),
    });
    expect(reintento.status).toBe(200);
  });
});

describe('HTTP · limitador del formulario público', () => {
  it('el sondeo de tokens inventados se corta con 429; los errores de validación NO cuentan', async () => {
    // App propia con límite chico para no pisar el limitador compartido.
    const db = getDbMemoria();
    const infra = infraestructuraDesdeDb(db, hasherFake);
    await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234');
    const { usuario: consu } = await uauth.crearUsuario(infra.reposAuth, {
      email: 'c@activos.com', nombre: 'C', rol: 'CONSULTOR', password: 'Clave1234',
    });
    const alumno = await ual.crearAlumno(infra.reposAlumnos, consu.id, FICHA);
    const valido = await ual.emitirToken(infra.reposAlumnos, alcanceDeUsuario({ id: consu.id, rol: 'CONSULTOR' }), alumno.id);

    const app = crearApp(infra, { cookieSegura: false, limitadorFormulario: crearLimitadorLogin({ max: 3 }) });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      // Tres envíos con el token BUENO pero cuerpo inválido: 400, no cuentan.
      for (let i = 0; i < 3; i++) {
        const r = await fetch(`${base}/api/formulario/${valido.token}`, { method: 'POST', headers: json, body: '{}' });
        expect(r.status).toBe(400);
      }
      // El token válido sigue accesible: el alumno que corrige no queda bloqueado.
      expect((await fetch(`${base}/api/formulario/${valido.token}`)).status).toBe(200);

      // Tres sondeos con tokens truchos: esos SÍ cuentan.
      for (let i = 0; i < 3; i++) {
        expect((await fetch(`${base}/api/formulario/trucho-${i}`)).status).toBe(404);
      }
      // Cuarto intento: bloqueado — incluso con el token válido (la IP manda).
      expect((await fetch(`${base}/api/formulario/trucho-4`)).status).toBe(429);
      expect((await fetch(`${base}/api/formulario/${valido.token}`)).status).toBe(429);
    } finally {
      server.close();
    }
  });
});

describe('HTTP · rutas privadas: acción por rol', () => {
  it('sin sesión → 401 (el gate sigue intacto)', async () => {
    expect((await fetch(`${ctx.base}/api/alumnos`)).status).toBe(401);
  });

  it('LECTOR y ADMIN del contable: solo ADMIN entra al módulo de alumnos', async () => {
    // LECTOR tiene 'ver' pero NO 'ver_alumnos': espejo del consultor en el contable.
    expect((await fetch(`${ctx.base}/api/alumnos`, { headers: { cookie: ctx.cookies.lector } })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/alumnos`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.lector }, body: JSON.stringify(FICHA),
    })).status).toBe(403);

    expect((await fetch(`${ctx.base}/api/alumnos`, { headers: { cookie: ctx.cookies.admin } })).status).toBe(200);
  });

  it('CONSULTOR puede crear y listar; su alumno queda a su nombre', async () => {
    const alta = await fetch(`${ctx.base}/api/alumnos`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.consultor },
      body: JSON.stringify({ ...FICHA, nombre: 'Propio' }),
    });
    expect(alta.status).toBe(200);
    const alumno = (await alta.json()) as { consultorId: string };
    expect(alumno.consultorId).toBe(ctx.ids.consultor);
  });
});

describe('HTTP · rutas privadas: ámbito por fila de punta a punta', () => {
  it('cada consultor lista SOLO su cartera, y ?consultor= ajeno no la ensancha', async () => {
    await crearAlumnoConToken(ctx.cookies.otroConsultor); // alumno del otro

    const lista = await fetch(`${ctx.base}/api/alumnos`, { headers: { cookie: ctx.cookies.consultor } });
    const mios = (await lista.json()) as { consultorId: string }[];
    expect(mios.length).toBeGreaterThan(0);
    expect(mios.every((a) => a.consultorId === ctx.ids.consultor)).toBe(true);

    // Pedir la cartera del otro por query string devuelve LA PROPIA.
    const forzada = await fetch(`${ctx.base}/api/alumnos?consultor=${ctx.ids.otroConsultor}`, {
      headers: { cookie: ctx.cookies.consultor },
    });
    const resultado = (await forzada.json()) as { consultorId: string }[];
    expect(resultado.every((a) => a.consultorId === ctx.ids.consultor)).toBe(true);
  });

  it('la ficha ajena responde 404 — no 403: no se revela que existe', async () => {
    const { alumnoId } = await crearAlumnoConToken(ctx.cookies.otroConsultor);

    const ficha = await fetch(`${ctx.base}/api/alumnos/${alumnoId}`, { headers: { cookie: ctx.cookies.consultor } });
    expect(ficha.status).toBe(404);

    const inventada = await fetch(`${ctx.base}/api/alumnos/no-existe`, { headers: { cookie: ctx.cookies.consultor } });
    expect(inventada.status).toBe(404);
    // Mismo mensaje en ambos casos: indistinguibles desde afuera.
    expect(await ficha.clone().json()).toEqual(await inventada.clone().json());
  });

  it('ni editar, ni emitir link, ni leer diagnósticos de un alumno ajeno', async () => {
    const { alumnoId } = await crearAlumnoConToken(ctx.cookies.otroConsultor);
    const conConsultor = { cookie: ctx.cookies.consultor };

    expect((await fetch(`${ctx.base}/api/alumnos/${alumnoId}`, {
      method: 'PUT', headers: { ...json, ...conConsultor }, body: JSON.stringify({ nombre: 'Hackeado' }),
    })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/alumnos/${alumnoId}/token`, { method: 'POST', headers: conConsultor })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/alumnos/${alumnoId}/diagnosticos`, { headers: conConsultor })).status).toBe(404);
  });

  it('ADMIN alcanza todas las carteras (ve la ficha de cualquiera)', async () => {
    const { alumnoId } = await crearAlumnoConToken(ctx.cookies.otroConsultor);
    const ficha = await fetch(`${ctx.base}/api/alumnos/${alumnoId}`, { headers: { cookie: ctx.cookies.admin } });
    expect(ficha.status).toBe(200);
  });

  it('corregir un diagnóstico: dueño 200 con índice recalculado; LECTOR 403; ajeno 404', async () => {
    const { token } = await crearAlumnoConToken(ctx.cookies.consultor);
    const envio = await fetch(`${ctx.base}/api/formulario/${token}`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ ...diagnosticoCompleto(), mora_clientes: null, mora_clientes_sin_dato: true }),
    });
    const { id } = (await envio.json()) as { id: string };
    const cuerpo = JSON.stringify({ mora_clientes: 9 });

    expect((await fetch(`${ctx.base}/api/diagnosticos/${id}`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.lector }, body: cuerpo,
    })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/diagnosticos/${id}`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.otroConsultor }, body: cuerpo,
    })).status).toBe(404);

    const propio = await fetch(`${ctx.base}/api/diagnosticos/${id}`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.consultor }, body: cuerpo,
    });
    expect(propio.status).toBe(200);
    const d = (await propio.json()) as { indiceClaridad: number; editadoPorConsultor: boolean };
    expect(d.indiceClaridad).toBe(100);
    expect(d.editadoPorConsultor).toBe(true);
  });
});
