/**
 * Integración HTTP por ROL: levanta la app real (Express) sobre una base
 * SQLite en memoria y verifica, con requests de verdad, que cada rol puede
 * exactamente lo que la matriz permite — y nada más.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { getDbMemoria } from '../../src/infrastructure/sqlite/db';
import { infraestructuraDesdeDb } from '../../src/infrastructure/db/conexion';
import type { Hasher } from '../../src/application/auth/ports';
import * as uauth from '../../src/application/auth/useCases';
import { crearApp } from '../app';
import { crearLimitadorLogin, exigirAmbitoTotal } from '../auth';
import { alcanceDeUsuario } from '../../src/domain/auth/permisos';

/** Hasher rápido para tests (bcrypt real se cubre en auth.integracion). */
const hasherFake: Hasher = {
  hash: async (p) => `fake:${p}`,
  verificar: async (p, h) => h === `fake:${p}`,
};

interface Ctx {
  base: string;
  server: Server;
  cookies: { admin: string; editor: string; lector: string; consultor: string };
}

async function levantarApp(): Promise<Ctx> {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);

  // Usuarios de los 4 roles, vía casos de uso (no HTTP, para no acoplar el setup).
  await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234');
  await uauth.crearUsuario(infra.reposAuth, { email: 'editor@activos.com', nombre: 'Edi', rol: 'EDITOR', password: 'Clave1234' });
  await uauth.crearUsuario(infra.reposAuth, { email: 'lector@activos.com', nombre: 'Lec', rol: 'LECTOR', password: 'Clave1234' });
  await uauth.crearUsuario(infra.reposAuth, { email: 'consultor@activos.com', nombre: 'Consu', rol: 'CONSULTOR', password: 'Clave1234' });

  const app = crearApp(infra, { cookieSegura: false });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const loguear = async (email: string): Promise<string> => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'Clave1234' }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toContain('HttpOnly');
    return setCookie.split(';')[0]!; // "activos_sesion=<token>"
  };

  return {
    base,
    server,
    cookies: {
      admin: await loguear('admin@activos.com'),
      editor: await loguear('editor@activos.com'),
      lector: await loguear('lector@activos.com'),
      consultor: await loguear('consultor@activos.com'),
    },
  };
}

const json = { 'content-type': 'application/json' };
const CIERRE_NUEVO = JSON.stringify({
  fechaCierre: '2026-05-10', clienteNombre: 'Cliente Test', programa: 'Empresario', ticketTotalUsd: 1000,
});

let ctx: Ctx;
beforeAll(async () => {
  ctx = await levantarApp();
});
afterAll(() => {
  ctx.server.close();
});

describe('HTTP · sin sesión', () => {
  it('health y login son públicos; todo lo demás da 401', async () => {
    expect((await fetch(`${ctx.base}/api/health`)).status).toBe(200);
    expect((await fetch(`${ctx.base}/api/meses`)).status).toBe(401);
    expect((await fetch(`${ctx.base}/api/dashboard/2026-05`)).status).toBe(401);
    expect((await fetch(`${ctx.base}/api/cierres`, { method: 'POST', headers: json, body: CIERRE_NUEVO })).status).toBe(401);
    expect((await fetch(`${ctx.base}/api/usuarios`)).status).toBe(401);
  });

  it('login con credenciales incorrectas → 401 con mensaje genérico', async () => {
    const res = await fetch(`${ctx.base}/api/auth/login`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@activos.com', password: 'mala' }),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/incorrectos/i);
  });

  it('una cookie inventada no sirve', async () => {
    const res = await fetch(`${ctx.base}/api/meses`, { headers: { cookie: 'activos_sesion=trucha' } });
    expect(res.status).toBe(401);
  });
});

describe('HTTP · LECTOR (solo ve)', () => {
  const conLector = () => ({ cookie: ctx.cookies.lector });

  it('puede leer dashboards y métricas', async () => {
    expect((await fetch(`${ctx.base}/api/meses`, { headers: conLector() })).status).toBe(200);
    expect((await fetch(`${ctx.base}/api/dashboard/2026-05`, { headers: conLector() })).status).toBe(200);
    expect((await fetch(`${ctx.base}/api/cobranza`, { headers: conLector() })).status).toBe(200);
    expect((await fetch(`${ctx.base}/api/cierres`, { headers: conLector() })).status).toBe(200);
  });

  it('NO puede crear/editar (403 en POST/PUT/DELETE de datos)', async () => {
    expect((await fetch(`${ctx.base}/api/cierres`, { method: 'POST', headers: { ...json, ...conLector() }, body: CIERRE_NUEVO })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/pagos`, { method: 'POST', headers: { ...json, ...conLector() }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/egresos`, { method: 'POST', headers: { ...json, ...conLector() }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/parametros`, { method: 'PUT', headers: { ...json, ...conLector() }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/funnel/2026-05`, { method: 'PUT', headers: { ...json, ...conLector() }, body: '{}' })).status).toBe(403);
  });

  it('NO puede importar, resetear ni gestionar usuarios', async () => {
    expect((await fetch(`${ctx.base}/api/cierres/importar`, { method: 'POST', headers: { ...json, ...conLector() }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/cierres-reset`, { method: 'POST', headers: { ...json, ...conLector() }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/usuarios`, { headers: conLector() })).status).toBe(403);
  });
});

describe('HTTP · EDITOR (ve y edita, no importa ni administra)', () => {
  const conEditor = () => ({ cookie: ctx.cookies.editor });

  it('puede crear un cierre y un pago (carga del día a día)', async () => {
    const res = await fetch(`${ctx.base}/api/cierres`, { method: 'POST', headers: { ...json, ...conEditor() }, body: CIERRE_NUEVO });
    expect(res.status).toBe(200);
    const cierre = (await res.json()) as { idCierre: string };
    const pago = await fetch(`${ctx.base}/api/pagos`, {
      method: 'POST', headers: { ...json, ...conEditor() },
      body: JSON.stringify({ idCierre: cierre.idCierre, fechaPago: '2026-05-11', montoUsd: 500, tipoPago: 'Reserva/Seña', medioPago: 'Otro' }),
    });
    expect(pago.status).toBe(200);
  });

  it('NO puede importar ni resetear (403)', async () => {
    expect((await fetch(`${ctx.base}/api/importar`, { method: 'POST', headers: { ...conEditor(), 'content-type': 'application/octet-stream' }, body: Buffer.from('x') })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/cierres/importar`, { method: 'POST', headers: { ...json, ...conEditor() }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/cierres-reset`, { method: 'POST', headers: { ...json, ...conEditor() }, body: JSON.stringify({ confirm: 'BORRAR' }) })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/cierres-demo`, { method: 'DELETE', headers: conEditor() })).status).toBe(403);
  });

  it('NO puede gestionar usuarios (403)', async () => {
    expect((await fetch(`${ctx.base}/api/usuarios`, { headers: conEditor() })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/usuarios`, { method: 'POST', headers: { ...json, ...conEditor() }, body: '{}' })).status).toBe(403);
  });
});

describe('HTTP · ADMIN (todo)', () => {
  const conAdmin = () => ({ cookie: ctx.cookies.admin });

  it('puede resetear la base (con el token BORRAR) y gestionar usuarios', async () => {
    const reset = await fetch(`${ctx.base}/api/cierres-reset`, {
      method: 'POST', headers: { ...json, ...conAdmin() }, body: JSON.stringify({ confirm: 'BORRAR' }),
    });
    expect(reset.status).toBe(200);

    const lista = await fetch(`${ctx.base}/api/usuarios`, { headers: conAdmin() });
    expect(lista.status).toBe(200);
    expect(((await lista.json()) as unknown[]).length).toBe(4);
  });

  it('alta de usuario por HTTP devuelve la contraseña temporal UNA vez', async () => {
    const res = await fetch(`${ctx.base}/api/usuarios`, {
      method: 'POST', headers: { ...json, ...conAdmin() },
      body: JSON.stringify({ email: 'socio@activos.com', nombre: 'Socio', rol: 'LECTOR' }),
    });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { usuario: { rol: string }; passwordTemporal: string };
    expect(r.usuario.rol).toBe('LECTOR');
    expect(r.passwordTemporal).toBeTruthy();
  });

  it('email duplicado → 409; rol inválido → 400', async () => {
    const dup = await fetch(`${ctx.base}/api/usuarios`, {
      method: 'POST', headers: { ...json, ...conAdmin() },
      body: JSON.stringify({ email: 'editor@activos.com', nombre: 'X', rol: 'LECTOR' }),
    });
    expect(dup.status).toBe(409);
    const malRol = await fetch(`${ctx.base}/api/usuarios`, {
      method: 'POST', headers: { ...json, ...conAdmin() },
      body: JSON.stringify({ email: 'nuevo@activos.com', nombre: 'X', rol: 'root' }),
    });
    expect(malRol.status).toBe(400);
  });
});

/**
 * La regla dura del módulo de alumnos: "los consultores no ven NADA de
 * contabilidad". Y la otra: "los permisos se aplican a nivel de consulta, no
 * de interfaz". Estos tests golpean la API a mano, sin pasar por la UI —
 * que es exactamente como un consultor curioso intentaría saltearla.
 */
describe('HTTP · CONSULTOR (cero contabilidad, aunque llame la API a mano)', () => {
  const conConsultor = () => ({ cookie: ctx.cookies.consultor });

  /** Toda la superficie de LECTURA del contable. */
  const LECTURAS_CONTABLES = [
    '/api/meses',
    '/api/dashboard/2026-05',
    '/api/historico',
    '/api/comparar/2026-05',
    '/api/parametros',
    '/api/egresos',
    '/api/egresos/resumen/2026-05',
    '/api/comisiones/liquidaciones',
    '/api/comisiones/2026-05',
    '/api/funnel/2026-05',
    '/api/cierres',
    '/api/cierres/resumen/2026-05',
    '/api/cierres/cualquiera',
    '/api/cobranza',
    '/api/asistente/estado',
  ];

  it('recibe 403 en TODAS las lecturas del contable', async () => {
    for (const ruta of LECTURAS_CONTABLES) {
      const res = await fetch(`${ctx.base}${ruta}`, { headers: conConsultor() });
      expect(res.status, `GET ${ruta} debería ser 403`).toBe(403);
    }
  });

  it('no se abre nada tocando la query string (el filtro del cliente no da permisos)', async () => {
    const trucos = [
      '/api/cierres?closer=Consu',
      '/api/cierres?unidad=ACADEMY',
      '/api/cierres?mes=2026-05&programa=Empresario',
      '/api/dashboard/2026-05?unidad=CONSOLIDADO',
      '/api/historico?unidad=ACADEMY',
    ];
    for (const ruta of trucos) {
      const res = await fetch(`${ctx.base}${ruta}`, { headers: conConsultor() });
      expect(res.status, `GET ${ruta} debería ser 403`).toBe(403);
    }
  });

  it('tampoco puede escribir, importar ni usar el asistente IA', async () => {
    const escrituras: [string, string, string][] = [
      ['POST', '/api/cierres', CIERRE_NUEVO],
      ['POST', '/api/pagos', '{}'],
      ['POST', '/api/egresos', '{}'],
      ['PUT', '/api/parametros', '{}'],
      ['PUT', '/api/funnel/2026-05', '{}'],
      ['POST', '/api/cierres/importar', '{}'],
      ['POST', '/api/cierres-reset', JSON.stringify({ confirm: 'BORRAR' })],
      ['POST', '/api/asistente', JSON.stringify({ pregunta: '¿Cuánto facturamos?' })],
    ];
    for (const [method, ruta, body] of escrituras) {
      const res = await fetch(`${ctx.base}${ruta}`, { method, headers: { ...json, ...conConsultor() }, body });
      expect(res.status, `${method} ${ruta} debería ser 403`).toBe(403);
    }
  });

  it('no puede gestionar usuarios (no es un ADMIN por otra puerta)', async () => {
    expect((await fetch(`${ctx.base}/api/usuarios`, { headers: conConsultor() })).status).toBe(403);
    expect((await fetch(`${ctx.base}/api/usuarios`, { method: 'POST', headers: { ...json, ...conConsultor() }, body: '{}' })).status).toBe(403);
  });

  it('SÍ conserva la sesión propia: /auth/yo declara sus acciones de alumnos', async () => {
    const res = await fetch(`${ctx.base}/api/auth/yo`, { headers: conConsultor() });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { usuario: { rol: string }; acciones: string[] };
    expect(r.usuario.rol).toBe('CONSULTOR');
    expect(r.acciones).toEqual(['ver_alumnos', 'editar_alumnos']);
    expect(r.acciones).not.toContain('ver');
  });
});

describe('HTTP · el contable NO cambió para los roles que ya lo usaban', () => {
  it('LECTOR/EDITOR/ADMIN siguen leyendo todo lo de siempre (200)', async () => {
    const rutas = ['/api/meses', '/api/dashboard/2026-05', '/api/cierres', '/api/cobranza', '/api/egresos', '/api/parametros'];
    for (const cookie of [ctx.cookies.lector, ctx.cookies.editor, ctx.cookies.admin]) {
      for (const ruta of rutas) {
        const res = await fetch(`${ctx.base}${ruta}`, { headers: { cookie } });
        expect(res.status, `GET ${ruta} debería seguir siendo 200`).toBe(200);
      }
    }
  });

  it('el filtro por closer de la query string sigue funcionando (es cosmético, no un permiso)', async () => {
    const res = await fetch(`${ctx.base}/api/cierres?closer=Nadie`, { headers: { cookie: ctx.cookies.lector } });
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toEqual([]);
  });
});

/**
 * El contable no sabe acotar por titular (`cierres.closer` es texto libre, no
 * un id de usuario). Hoy ningún rol con 'ver' está acotado, así que la red no
 * se dispara nunca — pero si mañana alguien le da 'ver' a un rol acotado, la
 * consulta tiene que MORIR, no devolver la tabla entera.
 */
describe('Contable · la red de ámbito falla cerrada', () => {
  it('un ámbito acotado sobre el contable corta la consulta en vez de devolver de más', () => {
    const acotado = alcanceDeUsuario({ id: 'usr-x', rol: 'CONSULTOR' });
    expect(() => exigirAmbitoTotal(acotado, 'cierres')).toThrow(/no sabe acotar por titular/i);
  });

  it('con ámbito total no molesta a nadie', () => {
    for (const rol of ['LECTOR', 'EDITOR', 'ADMIN'] as const) {
      expect(() => exigirAmbitoTotal(alcanceDeUsuario({ id: 'usr-y', rol }), 'cierres')).not.toThrow();
    }
  });
});

describe('HTTP · ciclo de sesión', () => {
  it('GET /api/auth/yo devuelve usuario y acciones del rol', async () => {
    const res = await fetch(`${ctx.base}/api/auth/yo`, { headers: { cookie: ctx.cookies.lector } });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { usuario: { rol: string }; acciones: string[] };
    expect(r.usuario.rol).toBe('LECTOR');
    expect(r.acciones).toEqual(['ver']);
  });

  it('logout invalida la sesión en el servidor (no solo borra la cookie)', async () => {
    // sesión propia para no matar la cookie compartida del resto de los tests
    const login = await fetch(`${ctx.base}/api/auth/login`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: 'lector@activos.com', password: 'Clave1234' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await fetch(`${ctx.base}/api/meses`, { headers: { cookie } })).status).toBe(200);

    await fetch(`${ctx.base}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    expect((await fetch(`${ctx.base}/api/meses`, { headers: { cookie } })).status).toBe(401); // el token murió en la tabla
  });

  it('dar de baja a un usuario lo expulsa al instante (su cookie deja de servir)', async () => {
    const { base, cookies } = ctx;
    // alta + login del usuario a echar
    const alta = await fetch(`${base}/api/usuarios`, {
      method: 'POST', headers: { ...json, cookie: cookies.admin },
      body: JSON.stringify({ email: 'temporal@activos.com', nombre: 'Temp', rol: 'EDITOR', password: 'Clave1234' }),
    });
    const { usuario } = (await alta.json()) as { usuario: { id: string } };
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: 'temporal@activos.com', password: 'Clave1234' }),
    });
    const cookieTemp = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await fetch(`${base}/api/meses`, { headers: { cookie: cookieTemp } })).status).toBe(200);

    // baja por el ADMIN → expulsión inmediata
    expect((await fetch(`${base}/api/usuarios/${usuario.id}`, { method: 'DELETE', headers: { cookie: cookies.admin } })).status).toBe(200);
    expect((await fetch(`${base}/api/meses`, { headers: { cookie: cookieTemp } })).status).toBe(401);
  });
});

describe('HTTP · rate limit del login', () => {
  it('tras superar el máximo de intentos fallidos responde 429', async () => {
    // App propia con límite chico para no interferir con el resto.
    const db = getDbMemoria();
    const infra = infraestructuraDesdeDb(db, hasherFake);
    await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234');
    const app = crearApp(infra, { cookieSegura: false, limitadorLogin: crearLimitadorLogin({ max: 3 }) });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const intento = () =>
        fetch(`${base}/api/auth/login`, {
          method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@activos.com', password: 'mala' }),
        });
      for (let i = 0; i < 3; i++) expect((await intento()).status).toBe(401);
      expect((await intento()).status).toBe(429); // bloqueado
      // y con la contraseña CORRECTA también bloquea (la ventana manda)
      const buena = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@activos.com', password: 'Clave1234' }),
      });
      expect(buena.status).toBe(429);
    } finally {
      server.close();
    }
  });
});
