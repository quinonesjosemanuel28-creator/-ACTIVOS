/**
 * Ticket 11A — el OBSERVADOR por HTTP, de punta a punta: la app Express real
 * sobre SQLite en memoria.
 *
 * Las dos mitades del rol:
 *  - lo que NO puede: las diez superficies de escritura de la ficha devuelven
 *    403 desde la RUTA (el rechazo viene de la consulta, no de la UI), y el
 *    módulo contable entero le contesta 403 — la regla dura de siempre.
 *  - lo que SÍ puede: ver TODA la cartera (ámbito total), abrir cualquier
 *    ficha, escribir bitácora y registrar contacto — los dos con su autor.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { getDbMemoria } from '../../src/infrastructure/sqlite/db';
import { infraestructuraDesdeDb, type Infraestructura } from '../../src/infrastructure/db/conexion';
import type { Hasher } from '../../src/application/auth/ports';
import * as uauth from '../../src/application/auth/useCases';
import { crearApp } from '../app';

const hasherFake: Hasher = {
  hash: async (p) => `fake:${p}`,
  verificar: async (p, h) => h === `fake:${p}`,
};

const json = { 'content-type': 'application/json' };
const FICHA = { nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS' };

interface Ctx {
  base: string;
  server: Server;
  infra: Infraestructura;
  cookies: { admin: string; consultor: string; otroConsultor: string; observador: string };
  ids: { consultor: string; otroConsultor: string; observador: string };
}

async function levantarApp(): Promise<Ctx> {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);

  await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234');
  const { usuario: consu } = await uauth.crearUsuario(infra.reposAuth, { email: 'consu@activos.com', nombre: 'Matías', rol: 'CONSULTOR', password: 'Clave1234' });
  const { usuario: otro } = await uauth.crearUsuario(infra.reposAuth, { email: 'otro@activos.com', nombre: 'Otro', rol: 'CONSULTOR', password: 'Clave1234' });
  const { usuario: obse } = await uauth.crearUsuario(infra.reposAuth, { email: 'obse@activos.com', nombre: 'Alejandro', rol: 'OBSERVADOR', password: 'Clave1234' });

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
      consultor: await loguear('consu@activos.com'),
      otroConsultor: await loguear('otro@activos.com'),
      observador: await loguear('obse@activos.com'),
    },
    ids: { consultor: consu.id, otroConsultor: otro.id, observador: obse.id },
  };
}

let ctx: Ctx;
beforeAll(async () => { ctx = await levantarApp(); });
afterAll(() => { ctx.server.close(); });

async function crearAlumno(cookie: string, nombre: string): Promise<string> {
  const res = await fetch(`${ctx.base}/api/alumnos`, {
    method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ ...FICHA, nombre }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

describe('HTTP · OBSERVADOR: las diez superficies de escritura → 403 desde la ruta', () => {
  it('cada ruta rechaza ANTES de mirar el cuerpo: el permiso corta primero', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Blindado');
    // Las diez del ticket (11A §5.4) + las hermanas que también escriben.
    // Ids inventados alcanzan: requiere() rechaza antes de resolver nada.
    const rutas: [string, string][] = [
      ['PUT', `/api/alumnos/${id}`], //                    1 · editar la ficha
      ['PUT', `/api/alumnos/${id}/estado`], //             2 · cambiar estado
      ['PUT', '/api/planes/PL-X/fecha-inicio'], //         3 · fecha de inicio
      ['PUT', '/api/krs/KR-X'], //                         4 · vencimiento de KR
      ['PUT', '/api/acciones/AC-X/estado'], //             5 · selector ☐◐☑
      ['POST', '/api/krs/KR-X/mediciones'], //             6 · mediciones
      ['POST', '/api/checkins/CH-X/resolucion'], //        7 · resolver/archivar notas
      ['POST', '/api/planes/PL-X/documentos'], //          8 · documento del plan
      ['POST', '/api/planes/PL-X/link'], //                9 · emitir link
      ['DELETE', `/api/alumnos/${id}`], //                10 · papelera
      // Hermanas fuera de la lista de diez:
      ['POST', '/api/alumnos'], //                         alta
      ['POST', `/api/alumnos/${id}/token`], //             link de diagnóstico
      ['DELETE', '/api/planes/PL-X/link'], //              revocar link
      ['POST', `/api/alumnos/${id}/plan`], //              cargar plan
      ['POST', `/api/alumnos/${id}/plan/previa`], //       previa del plan
      ['PUT', '/api/diagnosticos/DG-X'], //                corregir diagnóstico
      ['POST', '/api/alumnos/reasignar'], //               reasignación (11C)
    ];
    for (const [metodo, ruta] of rutas) {
      const res = await fetch(`${ctx.base}${ruta}`, {
        method: metodo, headers: { ...json, cookie: ctx.cookies.observador }, body: JSON.stringify({}),
      });
      expect(res.status, `${metodo} ${ruta}`).toBe(403);
    }
  });

  it('la papelera tampoco se lista, ni la gestión de usuarios', async () => {
    expect((await fetch(`${ctx.base}/api/alumnos/papelera`, { headers: { cookie: ctx.cookies.observador } })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/usuarios`, { headers: { cookie: ctx.cookies.observador } })).status).toBe(403);
  });
});

describe('HTTP · OBSERVADOR: cero contabilidad (regla dura, como CONSULTOR)', () => {
  it('las lecturas del contable devuelven 403', async () => {
    for (const ruta of ['/api/meses', '/api/cierres']) {
      const res = await fetch(`${ctx.base}${ruta}`, { headers: { cookie: ctx.cookies.observador } });
      expect(res.status, ruta).toBe(403);
    }
  });

  it('/auth/yo declara exactamente sus dos acciones', async () => {
    const res = await fetch(`${ctx.base}/api/auth/yo`, { headers: { cookie: ctx.cookies.observador } });
    const r = (await res.json()) as { acciones: string[] };
    expect(r.acciones).toEqual(['ver_alumnos', 'registrar_seguimiento']);
  });
});

describe('HTTP · OBSERVADOR: toda la cartera en lectura + registrar seguimiento', () => {
  it('ve el listado COMPLETO (ámbito total) y abre cualquier ficha', async () => {
    await crearAlumno(ctx.cookies.consultor, 'De Matías');
    const idAjeno = await crearAlumno(ctx.cookies.otroConsultor, 'Del Otro');

    const lista = await fetch(`${ctx.base}/api/alumnos`, { headers: { cookie: ctx.cookies.observador } });
    expect(lista.status).toBe(200);
    const alumnos = (await lista.json()) as { consultorId: string }[];
    const titulares = new Set(alumnos.map((a) => a.consultorId));
    expect(titulares.has(ctx.ids.consultor)).toBe(true);
    expect(titulares.has(ctx.ids.otroConsultor)).toBe(true);

    expect((await fetch(`${ctx.base}/api/alumnos/${idAjeno}`, { headers: { cookie: ctx.cookies.observador } })).status).toBe(200);
    expect((await fetch(`${ctx.base}/api/alumnos/panel`, { headers: { cookie: ctx.cookies.observador } })).status).toBe(200);
  });

  it('escribe bitácora sobre un alumno ajeno y la entrada queda con SU usuario', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Con Bitácora');
    const res = await fetch(`${ctx.base}/api/alumnos/${id}/bitacora`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.observador },
      body: JSON.stringify({ texto: 'Sesión de coaching: revisamos la estructura.', tipoContacto: 'consultoria_1a1' }),
    });
    expect(res.status).toBe(200);
    const entrada = (await res.json()) as { usuarioId: string };
    expect(entrada.usuarioId).toBe(ctx.ids.observador);

    // La bitácora registra contacto (10B) → la ficha muestra el AUTOR (11A §5.3):
    // ese contacto apaga la alerta del responsable, y sin el nombre nadie sabe por qué.
    const contactos = await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, { headers: { cookie: ctx.cookies.consultor } });
    const lista = (await contactos.json()) as { consultorId: string; autorNombre: string | null }[];
    expect(lista).toHaveLength(1);
    expect(lista[0]!.consultorId).toBe(ctx.ids.observador);
    expect(lista[0]!.autorNombre).toBe('Alejandro');
  });

  it('registra contacto directo (el botón de WhatsApp) con su autor', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Con WhatsApp');
    const res = await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.observador }, body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const contacto = (await res.json()) as { consultorId: string };
    expect(contacto.consultorId).toBe(ctx.ids.observador);
  });

  it('borde §9: un alumno PAUSADO se ve y admite bitácora igual', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Pausado Visible');
    await fetch(`${ctx.base}/api/alumnos/${id}/estado`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.consultor }, body: JSON.stringify({ estado: 'PAUSADO' }),
    });
    expect((await fetch(`${ctx.base}/api/alumnos/${id}`, { headers: { cookie: ctx.cookies.observador } })).status).toBe(200);
    const bitacora = await fetch(`${ctx.base}/api/alumnos/${id}/bitacora`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.observador },
      body: JSON.stringify({ texto: 'Le escribí para ver cómo sigue.', tipoContacto: 'whatsapp' }),
    });
    expect(bitacora.status).toBe(200);
  });

  it('CONSULTOR y ADMIN siguen escribiendo bitácora y contactos: la capacidad efectiva no cambió', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Sin Regresión');
    for (const cookie of [ctx.cookies.consultor, ctx.cookies.admin]) {
      const bitacora = await fetch(`${ctx.base}/api/alumnos/${id}/bitacora`, {
        method: 'POST', headers: { ...json, cookie },
        body: JSON.stringify({ texto: 'Registro de control.', tipoContacto: 'otro' }),
      });
      expect(bitacora.status).toBe(200);
      const contacto = await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, {
        method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({}),
      });
      expect(contacto.status).toBe(200);
    }
  });
});
