/**
 * Integración HTTP del panel de control (ticket 7A): estado del alumno, panel
 * con orden por riesgo, KRs con cumplimiento/vencimiento, fecha de inicio con
 * desplazamiento auditado, y papelera.
 *
 * Lo que solo se puede probar acá: que 'eliminar_alumnos' viva en la RUTA (un
 * CONSULTOR con sesión real recibe 403, no un botón escondido), que el ámbito
 * por fila sobreviva a las rutas nuevas (KR y estado ajenos → 404), y que un
 * eliminado desaparezca de TODAS las lecturas del módulo de una vez.
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

/** Fecha YYYY-MM-DD hace `dias` días (para armar planes con edad conocida). */
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

/** Alta de alumno por HTTP. */
async function crearAlumno(cookie: string, nombre: string): Promise<string> {
  const alta = await fetch(`${ctx.base}/api/alumnos`, {
    method: 'POST',
    headers: { ...json, cookie },
    body: JSON.stringify({ nombre, programa: 'Prestamista a Empresario', moneda: 'ARS' }),
  });
  expect(alta.status).toBe(200);
  return ((await alta.json()) as { id: string }).id;
}

interface PlanCargado {
  plan: { id: string };
  okrs: { krs: { id: string }[] }[];
  acciones: { id: string }[];
}

/** Carga un plan con 2 KRs que arrancó hace `diasAtras` días. */
async function cargarPlan(cookie: string, alumnoId: string, nombre: string, diasAtras: number): Promise<PlanCargado> {
  const bloque = JSON.stringify({
    version: 1, alumno: nombre, fecha_inicio: hace(diasAtras),
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [{ texto: 'Tablero' }, { texto: 'Caja separada' }] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'A' }, { texto: 'B' }, { texto: 'C' }] },
      { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
      { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
    ],
  });
  const carga = await fetch(`${ctx.base}/api/alumnos/${alumnoId}/plan`, {
    method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ bloque }),
  });
  expect(carga.status).toBe(200);
  return (await carga.json()) as PlanCargado;
}

describe('HTTP · estado del alumno', () => {
  it('el consultor asignado cambia el estado y queda registrado cuándo', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Estela');
    const res = await fetch(`${ctx.base}/api/alumnos/${id}/estado`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.consultor }, body: JSON.stringify({ estado: 'PAUSADO' }),
    });
    expect(res.status).toBe(200);
    const a = (await res.json()) as { estado: string; estadoActualizadoEn: string | null };
    expect(a.estado).toBe('PAUSADO');
    expect(a.estadoActualizadoEn).toBeTruthy();
  });

  it('el alumno ajeno responde 404; un estado inventado 400; LECTOR 403', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Ajena');
    expect((await fetch(`${ctx.base}/api/alumnos/${id}/estado`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.otroConsultor }, body: JSON.stringify({ estado: 'PAUSADO' }),
    })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/alumnos/${id}/estado`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.consultor }, body: JSON.stringify({ estado: 'CONGELADO' }),
    })).status).toBe(400);
    expect((await fetch(`${ctx.base}/api/alumnos/${id}/estado`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.lector }, body: JSON.stringify({ estado: 'PAUSADO' }),
    })).status).toBe(403);
  });
});

describe('HTTP · KRs y fecha de inicio', () => {
  it('cumplimiento y vencimiento del KR; el KR ajeno no existe', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Karina');
    const plan = await cargarPlan(ctx.cookies.consultor, id, 'Karina', 10);
    const krId = plan.okrs[0]!.krs[0]!.id;
    const conCookie = { ...json, cookie: ctx.cookies.consultor };

    const marca = await fetch(`${ctx.base}/api/krs/${krId}`, {
      method: 'PUT', headers: conCookie, body: JSON.stringify({ cumplido: true, vencimiento: '2026-12-01' }),
    });
    expect(marca.status).toBe(200);
    const kr = (await marca.json()) as { cumplidoEn: string | null; vencimiento: string | null };
    expect(kr.cumplidoEn).toBeTruthy();
    expect(kr.vencimiento).toBe('2026-12-01');

    // Desmarcar limpia la fecha de cumplimiento; el vencimiento no se toca.
    const desmarca = await fetch(`${ctx.base}/api/krs/${krId}`, {
      method: 'PUT', headers: conCookie, body: JSON.stringify({ cumplido: false }),
    });
    const kr2 = (await desmarca.json()) as { cumplidoEn: string | null; vencimiento: string | null };
    expect(kr2.cumplidoEn).toBeNull();
    expect(kr2.vencimiento).toBe('2026-12-01');

    expect((await fetch(`${ctx.base}/api/krs/${krId}`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.otroConsultor }, body: JSON.stringify({ cumplido: true }),
    })).status).toBe(404);
    // Un body vacío no tiene nada que actualizar.
    expect((await fetch(`${ctx.base}/api/krs/${krId}`, {
      method: 'PUT', headers: conCookie, body: JSON.stringify({}),
    })).status).toBe(400);
  });

  it('criterio de aceptación: mover la fecha 10 días desplaza los vencimientos 10 días y queda registrado', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Fabián');
    const plan = await cargarPlan(ctx.cookies.consultor, id, 'Fabián', 20);
    const conCookie = { ...json, cookie: ctx.cookies.consultor };
    const [kr1, kr2] = plan.okrs[0]!.krs;

    // Un KR con vencimiento, el otro sin: solo se desplaza el que tiene.
    await fetch(`${ctx.base}/api/krs/${kr1!.id}`, {
      method: 'PUT', headers: conCookie, body: JSON.stringify({ vencimiento: '2026-09-05' }),
    });

    const inicioNuevo = hace(10); // 20 → 10 días atrás = +10 días de corrimiento
    const res = await fetch(`${ctx.base}/api/planes/${plan.plan.id}/fecha-inicio`, {
      method: 'PUT', headers: conCookie, body: JSON.stringify({ fechaNueva: inicioNuevo, motivo: 'Arrancó tarde' }),
    });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { deltaDias: number; krsDesplazados: number };
    expect(r.deltaDias).toBe(10);
    expect(r.krsDesplazados).toBe(1);

    // El plan quedó con la fecha nueva, el vencimiento corrido y el rastro en el historial.
    const planes = await fetch(`${ctx.base}/api/alumnos/${id}/planes`, { headers: { cookie: ctx.cookies.consultor } });
    const [p] = (await planes.json()) as { plan: { fechaInicio: string }; okrs: { krs: { id: string; vencimiento: string | null }[] }[] }[];
    expect(p!.plan.fechaInicio).toBe(inicioNuevo);
    const krs = p!.okrs[0]!.krs;
    expect(krs.find((k) => k.id === kr1!.id)!.vencimiento).toBe('2026-09-15');
    expect(krs.find((k) => k.id === kr2!.id)!.vencimiento).toBeNull();

    const avance = await fetch(`${ctx.base}/api/planes/${plan.plan.id}/avance`, { headers: { cookie: ctx.cookies.consultor } });
    const av = (await avance.json()) as { cambiosFecha: { fechaNueva: string; motivo: string | null; cambiadoPor: string }[] };
    expect(av.cambiosFecha).toHaveLength(1);
    expect(av.cambiosFecha[0]!.fechaNueva).toBe(inicioNuevo);
    expect(av.cambiosFecha[0]!.motivo).toBe('Arrancó tarde');
    expect(av.cambiosFecha[0]!.cambiadoPor).toBe(ctx.ids.consultor);

    // La misma fecha no es un cambio; el plan ajeno no existe.
    expect((await fetch(`${ctx.base}/api/planes/${plan.plan.id}/fecha-inicio`, {
      method: 'PUT', headers: conCookie, body: JSON.stringify({ fechaNueva: inicioNuevo }),
    })).status).toBe(400);
    expect((await fetch(`${ctx.base}/api/planes/${plan.plan.id}/fecha-inicio`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.otroConsultor }, body: JSON.stringify({ fechaNueva: '2026-01-01' }),
    })).status).toBe(404);
  });
});

describe('HTTP · el panel (orden por riesgo)', () => {
  it('los trabados gritan arriba y el ámbito manda: cada consultor ve SU panel', async () => {
    // Del otro consultor: un alumno verde (día 45, todas las acciones
    // ejecutadas — desde el switch de 9C el semáforo mide ACCIONES contra la
    // agenda del plan, no KRs tildados)…
    const verdeId = await crearAlumno(ctx.cookies.otroConsultor, 'Verde');
    const planVerde = await cargarPlan(ctx.cookies.otroConsultor, verdeId, 'Verde', 45);
    for (const a of planVerde.acciones) {
      await fetch(`${ctx.base}/api/acciones/${a.id}/estado`, {
        method: 'PUT', headers: { ...json, cookie: ctx.cookies.otroConsultor }, body: JSON.stringify({ estado: 'ejecutado' }),
      });
    }
    // …y uno trabado (día 45, 0 acciones ejecutadas).
    const rojoId = await crearAlumno(ctx.cookies.otroConsultor, 'Rojo');
    await cargarPlan(ctx.cookies.otroConsultor, rojoId, 'Rojo', 45);

    // A los dos se los contactó recién: la alerta de inactividad (45 días sin
    // tildes, ticket 7C) queda apagada y este test mide SOLO el orden por salud.
    for (const id of [verdeId, rojoId]) {
      await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, {
        method: 'POST', headers: { ...json, cookie: ctx.cookies.otroConsultor }, body: JSON.stringify({}),
      });
    }

    const res = await fetch(`${ctx.base}/api/alumnos/panel`, { headers: { cookie: ctx.cookies.otroConsultor } });
    expect(res.status).toBe(200);
    const filas = (await res.json()) as {
      alumno: { id: string; nombre: string };
      salud: { salud: string | null };
      plan: { chip: string } | null;
      consultorNombre: string | null;
      riesgo: number;
    }[];

    // Solo su cartera (los alumnos de "consultor" no aparecen).
    expect(filas.every((f) => ['Verde', 'Rojo'].includes(f.alumno.nombre))).toBe(true);
    // El trabado arriba, con su semáforo y su fase.
    expect(filas[0]!.alumno.nombre).toBe('Rojo');
    expect(filas[0]!.salud.salud).toBe('ROJO');
    expect(filas[0]!.plan!.chip).toBe('Fase 2');
    const verde = filas.find((f) => f.alumno.nombre === 'Verde')!;
    expect(verde.salud.salud).toBe('VERDE');
    expect(verde.consultorNombre).toBe('Otro');
    expect(filas[0]!.riesgo).toBeLessThan(verde.riesgo);

    // LECTOR no tiene panel de alumnos.
    expect((await fetch(`${ctx.base}/api/alumnos/panel`, { headers: { cookie: ctx.cookies.lector } })).status).toBe(403);
  });
});

describe('HTTP · seguimiento activo (ticket 7C)', () => {
  it('criterio de aceptación: 9+ días sin señales → alerta en el panel; el contacto la apaga', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Silencioso');
    await cargarPlan(ctx.cookies.consultor, id, 'Silencioso', 15); // arrancó hace 15 días, nunca tildó nada
    const conCookie = { cookie: ctx.cookies.consultor };

    const filaDe = async () => {
      const filas = (await (await fetch(`${ctx.base}/api/alumnos/panel`, { headers: conCookie })).json()) as {
        alumno: { id: string };
        alerta: { activa: boolean; diasSinSenal: number | null };
        riesgo: number;
        ultimoContacto: string | null;
        krPendiente: string | null;
      }[];
      return filas.find((f) => f.alumno.id === id)!;
    };

    const antes = await filaDe();
    expect(antes.alerta.activa).toBe(true);
    expect(antes.alerta.diasSinSenal).toBeGreaterThanOrEqual(15);
    expect(antes.riesgo).toBe(0); // la alerta manda: arriba de todo
    expect(antes.krPendiente).toBe('Tablero'); // el mensaje de WhatsApp pregunta por esto

    // El filtro "solo trabados" lo incluye.
    const trabados = (await (await fetch(`${ctx.base}/api/alumnos/panel?trabados=1`, { headers: conCookie })).json()) as
      { alumno: { id: string } }[];
    expect(trabados.some((f) => f.alumno.id === id)).toBe(true);

    // Registrar el contacto (lo que hace el botón ANTES de abrir WhatsApp)…
    const reg = await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.consultor }, body: JSON.stringify({ nota: 'Le escribí por el tablero' }),
    });
    expect(reg.status).toBe(200);

    // …apaga la alerta, y el contacto queda en el historial.
    const despues = await filaDe();
    expect(despues.alerta.activa).toBe(false);
    expect(despues.ultimoContacto).toBeTruthy();
    const historial = (await (await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, { headers: conCookie })).json()) as
      { canal: string; nota: string | null }[];
    expect(historial).toHaveLength(1);
    expect(historial[0]!.nota).toBe('Le escribí por el tablero');
  });

  it('criterio de aceptación: un PAUSADO nunca dispara alerta', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Pausado Quieto');
    await cargarPlan(ctx.cookies.consultor, id, 'Pausado Quieto', 20);
    await fetch(`${ctx.base}/api/alumnos/${id}/estado`, {
      method: 'PUT', headers: { ...json, cookie: ctx.cookies.consultor }, body: JSON.stringify({ estado: 'PAUSADO' }),
    });
    const filas = (await (await fetch(`${ctx.base}/api/alumnos/panel`, { headers: { cookie: ctx.cookies.consultor } })).json()) as
      { alumno: { id: string }; alerta: { activa: boolean } }[];
    expect(filas.find((f) => f.alumno.id === id)!.alerta.activa).toBe(false);
  });

  it('teléfono normalizado por la ficha: entra limpio o no entra; ajeno y sin permiso, afuera', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Con Teléfono');
    const conConsultor = { ...json, cookie: ctx.cookies.consultor };

    const ok = await fetch(`${ctx.base}/api/alumnos/${id}`, {
      method: 'PUT', headers: conConsultor, body: JSON.stringify({ telefonoPais: '54', telefonoNumero: '3515551234' }),
    });
    expect(ok.status).toBe(200);
    const a = (await ok.json()) as { telefonoPais: string | null; telefonoNumero: string | null };
    expect(a.telefonoPais).toBe('54');
    expect(a.telefonoNumero).toBe('3515551234');

    // Un número con basura no entra (el link de wa.me exige solo dígitos).
    expect((await fetch(`${ctx.base}/api/alumnos/${id}`, {
      method: 'PUT', headers: conConsultor, body: JSON.stringify({ telefonoNumero: '351-555' }),
    })).status).toBe(400);

    // Contactos: el alumno ajeno no existe; LECTOR no registra.
    expect((await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.otroConsultor }, body: JSON.stringify({}),
    })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/alumnos/${id}/contactos`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.lector }, body: JSON.stringify({}),
    })).status).toBe(403);
  });
});

describe('HTTP · papelera (borrado lógico, solo ADMIN)', () => {
  it('criterio de aceptación: un CONSULTOR no puede eliminar fichas', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Intocable');
    expect((await fetch(`${ctx.base}/api/alumnos/${id}`, {
      method: 'DELETE', headers: { cookie: ctx.cookies.consultor },
    })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/alumnos/papelera`, { headers: { cookie: ctx.cookies.consultor } })).status).toBe(403);
  });

  it('criterio de aceptación: el eliminado desaparece de TODO y es restaurable', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Fantasma');
    const plan = await cargarPlan(ctx.cookies.consultor, id, 'Fantasma', 5);
    // Con link de seguimiento vivo, para verificar que muere con la ficha.
    const link = await fetch(`${ctx.base}/api/planes/${plan.plan.id}/link`, {
      method: 'POST', headers: { ...json, cookie: ctx.cookies.consultor },
    });
    const token = ((await link.json()) as { token: { token: string } }).token.token;
    expect((await fetch(`${ctx.base}/api/seguimiento/${token}`)).status).toBe(200);

    // ADMIN lo manda a la papelera.
    expect((await fetch(`${ctx.base}/api/alumnos/${id}`, {
      method: 'DELETE', headers: { cookie: ctx.cookies.admin },
    })).status).toBe(200);

    // Desaparece de listado, panel, ficha, diagnósticos y del link público.
    const cookieConsu = { cookie: ctx.cookies.consultor };
    const lista = (await (await fetch(`${ctx.base}/api/alumnos`, { headers: cookieConsu })).json()) as { id: string }[];
    expect(lista.some((a) => a.id === id)).toBe(false);
    const panel = (await (await fetch(`${ctx.base}/api/alumnos/panel`, { headers: cookieConsu })).json()) as { alumno: { id: string } }[];
    expect(panel.some((f) => f.alumno.id === id)).toBe(false);
    expect((await fetch(`${ctx.base}/api/alumnos/${id}`, { headers: cookieConsu })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/alumnos/${id}/diagnosticos`, { headers: cookieConsu })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/seguimiento/${token}`)).status).toBe(404);

    // Está en la papelera, con responsable; ADMIN lo restaura y vuelve entero.
    const pape = (await (await fetch(`${ctx.base}/api/alumnos/papelera`, { headers: { cookie: ctx.cookies.admin } })).json()) as
      { alumno: { id: string }; eliminadoPorNombre: string | null }[];
    const fila = pape.find((f) => f.alumno.id === id);
    expect(fila).toBeTruthy();
    expect(fila!.eliminadoPorNombre).toBe('Administrador');

    expect((await fetch(`${ctx.base}/api/alumnos/${id}/restaurar`, {
      method: 'POST', headers: { cookie: ctx.cookies.admin },
    })).status).toBe(200);
    expect((await fetch(`${ctx.base}/api/alumnos/${id}`, { headers: cookieConsu })).status).toBe(200);
    expect((await fetch(`${ctx.base}/api/seguimiento/${token}`)).status).toBe(200);
  });

  it('el borrado definitivo exige el nombre exacto y arrastra todo por cascada', async () => {
    const id = await crearAlumno(ctx.cookies.consultor, 'Adiós Total');
    await cargarPlan(ctx.cookies.consultor, id, 'Adiós Total', 5);
    await fetch(`${ctx.base}/api/alumnos/${id}`, { method: 'DELETE', headers: { cookie: ctx.cookies.admin } });

    // Sin pasar por la papelera no hay borrado físico; con el nombre mal, tampoco.
    const conAdmin = { ...json, cookie: ctx.cookies.admin };
    expect((await fetch(`${ctx.base}/api/alumnos/${id}/definitivo`, {
      method: 'DELETE', headers: conAdmin, body: JSON.stringify({ confirmacion: 'Adios Total' }),
    })).status).toBe(400);

    expect((await fetch(`${ctx.base}/api/alumnos/${id}/definitivo`, {
      method: 'DELETE', headers: conAdmin, body: JSON.stringify({ confirmacion: 'Adiós Total' }),
    })).status).toBe(200);

    // Ya no está ni en la papelera, y las tablas hijas quedaron limpias.
    const pape = (await (await fetch(`${ctx.base}/api/alumnos/papelera`, { headers: { cookie: ctx.cookies.admin } })).json()) as
      { alumno: { id: string } }[];
    expect(pape.some((f) => f.alumno.id === id)).toBe(false);
    const db = ctx.infra; // los planes del alumno murieron con él (FK en cascada)
    expect(await db.reposAlumnos.planes.listarPorAlumno(id)).toEqual([]);
  });
});
