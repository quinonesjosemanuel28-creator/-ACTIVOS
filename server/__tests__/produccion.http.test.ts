/**
 * Modo producción de la app: con dirEstaticos, Express sirve el frontend
 * compilado y hace fallback SPA, PERO una ruta /api/* inexistente devuelve
 * 404 JSON (nunca el index.html) y el gate de sesión sigue intacto.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDbMemoria } from '../../src/infrastructure/sqlite/db';
import { infraestructuraDesdeDb } from '../../src/infrastructure/db/conexion';
import type { Hasher } from '../../src/application/auth/ports';
import * as uauth from '../../src/application/auth/useCases';
import { crearApp } from '../app';

const hasherFake: Hasher = { hash: async (p) => `fake:${p}`, verificar: async (p, h) => h === `fake:${p}` };

const HTML_SPA = '<!doctype html><html><head><title>+Activos</title></head><body><div id="root"></div></body></html>';

let server: Server;
let base: string;

beforeAll(async () => {
  // dist de prueba con un index.html y un asset.
  const dir = mkdtempSync(join(tmpdir(), 'activos-dist-'));
  writeFileSync(join(dir, 'index.html'), HTML_SPA);
  writeFileSync(join(dir, 'app.js'), 'console.log("bundle");');

  const infra = infraestructuraDesdeDb(getDbMemoria(), hasherFake);
  await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234');

  const app = crearApp(infra, { cookieSegura: false, dirEstaticos: dir });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe('Producción · Express sirve el frontend + API', () => {
  it('la raíz devuelve el index.html del build', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<div id="root">');
  });

  it('sirve los assets estáticos del build', async () => {
    const res = await fetch(`${base}/app.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('bundle');
  });

  it('fallback SPA: una ruta del cliente devuelve index.html (no 404)', async () => {
    const res = await fetch(`${base}/cobranza`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('una ruta /api/* desconocida SIN sesión da 401 (no revela rutas, ni sirve la SPA)', async () => {
    const res = await fetch(`${base}/api/no-existe`);
    expect(res.status).toBe(401); // pasa por el gate de sesión antes que nada
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('la API sigue protegida: sin sesión 401; el health sí responde', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/meses`)).status).toBe(401);
  });

  it('logueado: /api/* inexistente devuelve 404 JSON, NUNCA el index.html', async () => {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@activos.com', password: 'Clave1234' }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    // el ciclo de sesión funciona en modo producción
    expect((await fetch(`${base}/api/meses`, { headers: { cookie } })).status).toBe(200);

    const res = await fetch(`${base}/api/no-existe`, { headers: { cookie } });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()) as { error: string }).toMatchObject({ error: expect.stringMatching(/inexistente/i) });
  });
});
