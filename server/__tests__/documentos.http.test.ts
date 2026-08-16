/**
 * Integración HTTP del documento del plan (ticket 7B): subida binaria,
 * versionado que nunca pisa, límites con mensaje claro, y el ámbito por fila
 * también sobre el binario (el documento de un alumno ajeno no existe).
 *
 * El contenido vive en la BASE (no en disco): el round-trip byte a byte de
 * estos tests es la garantía de que el PDF "sobrevive al reinicio del
 * contenedor" — lo que persiste es la fila, no un archivo del filesystem.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { getDbMemoria } from '../../src/infrastructure/sqlite/db';
import { infraestructuraDesdeDb, type Infraestructura } from '../../src/infrastructure/db/conexion';
import type { Hasher } from '../../src/application/auth/ports';
import * as uauth from '../../src/application/auth/useCases';
import { MAX_BYTES_DOCUMENTO } from '../../src/domain/alumnos/plan';
import { crearApp } from '../app';

const hasherFake: Hasher = {
  hash: async (p) => `fake:${p}`,
  verificar: async (p, h) => h === `fake:${p}`,
};

const json = { 'content-type': 'application/json' };
const PDF = 'application/pdf';

interface Ctx {
  base: string;
  server: Server;
  infra: Infraestructura;
  cookies: { admin: string; lector: string; consultor: string; otroConsultor: string };
}

async function levantarApp(): Promise<Ctx> {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);

  await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234');
  await uauth.crearUsuario(infra.reposAuth, { email: 'lector@activos.com', nombre: 'Lec', rol: 'LECTOR', password: 'Clave1234' });
  await uauth.crearUsuario(infra.reposAuth, { email: 'consu@activos.com', nombre: 'Consu', rol: 'CONSULTOR', password: 'Clave1234' });
  await uauth.crearUsuario(infra.reposAuth, { email: 'otro@activos.com', nombre: 'Otro', rol: 'CONSULTOR', password: 'Clave1234' });

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
  };
}

let ctx: Ctx;
beforeAll(async () => {
  ctx = await levantarApp();
});
afterAll(() => {
  ctx.server.close();
});

/** Alta de alumno + plan mínimo, devuelve el planId. */
async function crearPlan(cookie: string, nombre: string): Promise<string> {
  const alta = await fetch(`${ctx.base}/api/alumnos`, {
    method: 'POST', headers: { ...json, cookie },
    body: JSON.stringify({ nombre, programa: 'Prestamista a Empresario', moneda: 'ARS' }),
  });
  expect(alta.status).toBe(200);
  const { id } = (await alta.json()) as { id: string };
  const bloque = JSON.stringify({
    version: 1, alumno: nombre, fecha_inicio: '2026-08-10',
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [{ texto: 'Tablero' }] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'A' }, { texto: 'B' }, { texto: 'C' }] },
      { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
      { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
    ],
  });
  const carga = await fetch(`${ctx.base}/api/alumnos/${id}/plan`, {
    method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ bloque }),
  });
  expect(carga.status).toBe(200);
  return ((await carga.json()) as { plan: { id: string } }).plan.id;
}

const subir = (cookie: string, planId: string, nombre: string, contenido: Uint8Array, mime = PDF) =>
  fetch(`${ctx.base}/api/planes/${planId}/documentos?nombre=${encodeURIComponent(nombre)}`, {
    method: 'POST', headers: { 'content-type': mime, cookie }, body: contenido,
  });

describe('HTTP · documento del plan', () => {
  it('sube un PDF, lo lista y lo devuelve BYTE a BYTE con headers de visor', async () => {
    const planId = await crearPlan(ctx.cookies.consultor, 'Con Documento');
    const bytes = new TextEncoder().encode('%PDF-1.4 contenido de prueba del plan de Gonzalo');

    const alta = await subir(ctx.cookies.consultor, planId, 'Plan Gonzalo v1.pdf', bytes);
    expect(alta.status).toBe(200);
    const doc = (await alta.json()) as { id: string; mimeType: string; tamanoBytes: number };
    expect(doc.mimeType).toBe(PDF);
    expect(doc.tamanoBytes).toBe(bytes.byteLength);

    const lista = await fetch(`${ctx.base}/api/planes/${planId}/documentos`, { headers: { cookie: ctx.cookies.consultor } });
    expect(lista.status).toBe(200);
    const docs = (await lista.json()) as { id: string; nombreArchivo: string }[];
    expect(docs).toHaveLength(1);
    expect(docs[0]!.nombreArchivo).toBe('Plan Gonzalo v1.pdf');

    const descarga = await fetch(`${ctx.base}/api/documentos/${doc.id}`, { headers: { cookie: ctx.cookies.consultor } });
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get('content-type')).toContain(PDF);
    expect(descarga.headers.get('content-disposition')).toContain('inline'); // el PDF se embebe
    expect(new Uint8Array(await descarga.arrayBuffer())).toEqual(bytes);
  });

  it('versionado: la segunda versión queda vigente y la primera sigue accesible', async () => {
    const planId = await crearPlan(ctx.cookies.consultor, 'Con Versiones');
    const conCookie = ctx.cookies.consultor;
    await subir(conCookie, planId, 'v1.pdf', new TextEncoder().encode('%PDF v1'));
    // subido_en tiene precisión de milisegundos: separar las versiones.
    await new Promise((r) => setTimeout(r, 5));
    await subir(conCookie, planId, 'v2.pdf', new TextEncoder().encode('%PDF v2 corregido'));

    const docs = (await (await fetch(`${ctx.base}/api/planes/${planId}/documentos`, { headers: { cookie: conCookie } })).json()) as
      { nombreArchivo: string }[];
    expect(docs.map((d) => d.nombreArchivo)).toEqual(['v2.pdf', 'v1.pdf']); // vigente primero, nada se pisa
  });

  it('el .docx entra y se sirve como descarga (attachment), no embebido', async () => {
    const planId = await crearPlan(ctx.cookies.consultor, 'Con Docx');
    const alta = await subir(
      ctx.cookies.consultor, planId, 'Plan.docx', new TextEncoder().encode('PK docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(alta.status).toBe(200);
    const doc = (await alta.json()) as { id: string };
    const descarga = await fetch(`${ctx.base}/api/documentos/${doc.id}`, { headers: { cookie: ctx.cookies.consultor } });
    expect(descarga.headers.get('content-disposition')).toContain('attachment');
  });

  it('criterio de aceptación: tipo no permitido o >10 MB se rechazan con mensaje claro', async () => {
    const planId = await crearPlan(ctx.cookies.consultor, 'Con Rechazos');

    const exe = await subir(ctx.cookies.consultor, planId, 'virus.exe', new TextEncoder().encode('MZ'));
    expect(exe.status).toBe(400);
    expect(((await exe.json()) as { error: string }).error).toMatch(/\.pdf o \.docx/i);

    const gordo = await subir(ctx.cookies.consultor, planId, 'gordo.pdf', new Uint8Array(MAX_BYTES_DOCUMENTO + 1));
    expect(gordo.status).toBe(400);
    expect(((await gordo.json()) as { error: string }).error).toMatch(/10 MB/);

    // Nada de eso quedó guardado.
    const docs = (await (await fetch(`${ctx.base}/api/planes/${planId}/documentos`, { headers: { cookie: ctx.cookies.consultor } })).json()) as unknown[];
    expect(docs).toHaveLength(0);
  });

  it('ámbito y permisos: el documento ajeno no existe; LECTOR no entra', async () => {
    const planId = await crearPlan(ctx.cookies.consultor, 'Privado');
    const alta = await subir(ctx.cookies.consultor, planId, 'privado.pdf', new TextEncoder().encode('%PDF privado'));
    const doc = (await alta.json()) as { id: string };

    expect((await subir(ctx.cookies.otroConsultor, planId, 'intruso.pdf', new TextEncoder().encode('%PDF')) ).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/planes/${planId}/documentos`, { headers: { cookie: ctx.cookies.otroConsultor } })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/documentos/${doc.id}`, { headers: { cookie: ctx.cookies.otroConsultor } })).status).toBe(404);
    expect((await fetch(`${ctx.base}/api/documentos/${doc.id}`, { headers: { cookie: ctx.cookies.lector } })).status).toBe(403);
    // ADMIN alcanza todas las carteras.
    expect((await fetch(`${ctx.base}/api/documentos/${doc.id}`, { headers: { cookie: ctx.cookies.admin } })).status).toBe(200);
  });
});
