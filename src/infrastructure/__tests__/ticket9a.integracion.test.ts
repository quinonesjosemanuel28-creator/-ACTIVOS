/**
 * Ticket 9A · Integración sobre SQLite real: el backfill de checkins.estado
 * es IDEMPOTENTE, las mediciones son append-only en los dos sentidos del
 * puerto, y — el criterio que manda — el semáforo da EXACTAMENTE el mismo
 * valor que antes del deploy: 9A es aditivo puro.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { migrar } from '../sqlite/schema';
import { infraestructuraDesdeDb } from '../db/conexion';
import { getDbMemoria } from '../sqlite/db';
import { calcularSalud } from '../../domain/alumnos/panel';
import { estadoDe } from '../../domain/alumnos/plan';
import * as uauth from '../../application/auth/useCases';
import * as ua from '../../application/alumnos/useCases';
import { alcanceDeUsuario } from '../../domain/auth/permisos';
import type { Hasher } from '../../application/auth/ports';

const hasherFake: Hasher = { hash: async (p) => `fake:${p}`, verificar: async (p, h) => h === `fake:${p}` };

describe('Ticket 9A · backfill de checkins.estado', () => {
  it('una base PREVIA al ticket 9 migra sola, y la migración es idempotente', () => {
    // Base "vieja": el esquema del ticket 8, simulado quitando las columnas
    // nuevas después de migrar (SQLite permite DROP COLUMN desde 3.35).
    const db = new Database(':memory:');
    migrar(db);
    db.exec('ALTER TABLE checkins DROP COLUMN estado');
    db.exec('ALTER TABLE checkins DROP COLUMN nota');
    db.exec('ALTER TABLE checkins DROP COLUMN usuario_id');

    // Datos legados: filas con SOLO el booleano, como las de producción hoy.
    db.exec(`
      INSERT INTO usuarios (id, email, nombre, rol, password_hash, creado_en)
        VALUES ('u1','a@a.com','A','ADMIN','h','2026-08-01T00:00:00Z');
      INSERT INTO alumnos (id, consultor_id, nombre, programa, creado_en)
        VALUES ('al1','u1','Gonzalo','Prestamista a Empresario','2026-08-01T00:00:00Z');
      INSERT INTO planes (id, alumno_id, fecha_inicio, creado_en)
        VALUES ('p1','al1','2026-08-01','2026-08-01T00:00:00Z');
      INSERT INTO acciones (id, plan_id, fase, orden, texto, creado_en)
        VALUES ('ac1','p1',1,1,'Armar tablero','2026-08-01T00:00:00Z'),
               ('ac2','p1',1,2,'Separar cuentas','2026-08-01T00:00:00Z');
      INSERT INTO checkins (id, accion_id, marcado, origen, creado_en)
        VALUES ('c1','ac1',1,'alumno','2026-08-05T00:00:00Z'),
               ('c2','ac2',0,'alumno','2026-08-06T00:00:00Z');
    `);

    // El arranque de la app (migrar) agrega columnas Y backfillea datos.
    migrar(db);
    const filas = db.prepare('SELECT id, marcado, estado FROM checkins ORDER BY id').all() as
      { id: string; marcado: number; estado: string | null }[];
    expect(filas).toEqual([
      { id: 'c1', marcado: 1, estado: 'ejecutado' },
      { id: 'c2', marcado: 0, estado: 'pendiente' },
    ]);

    // IDEMPOTENCIA: una fila ya migrada y luego cambiada a mano NO se pisa en
    // el siguiente arranque (el WHERE estado IS NULL la deja en paz).
    db.prepare("UPDATE checkins SET estado = 'en_curso' WHERE id = 'c2'").run();
    migrar(db);
    migrar(db); // dos arranques más
    const despues = db.prepare('SELECT id, estado FROM checkins ORDER BY id').all();
    expect(despues).toEqual([
      { id: 'c1', estado: 'ejecutado' },
      { id: 'c2', estado: 'en_curso' },
    ]);
  });
});

describe('Ticket 9A · aditivo puro: el semáforo no se mueve', () => {
  async function armar() {
    const infra = infraestructuraDesdeDb(getDbMemoria(), hasherFake);
    const admin = (await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234'))!;
    const alcance = alcanceDeUsuario({ id: admin.id, rol: 'ADMIN' });
    const alumno = await ua.crearAlumno(infra.reposAlumnos, admin, {
      nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS',
    });
    const bloque = JSON.stringify({
      version: 1, alumno: 'Gonzalo', fecha_inicio: '2026-07-02', // día 45 el 2026-08-16
      okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [{ texto: 'K1' }, { texto: 'K2' }, { texto: 'K3' }, { texto: 'K4' }] }],
      fases: [
        { fase: 1, acciones: [{ texto: 'A' }, { texto: 'B' }, { texto: 'C' }] },
        { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
        { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
      ],
    });
    const plan = await ua.cargarPlan(infra.reposAlumnos, alcance, alumno.id, bloque);
    return { infra, alcance, alumno, plan };
  }

  it('las KRs nuevas nacen entregables y el semáforo sigue leyendo cumplido_en', async () => {
    const { infra, alcance, plan } = await armar();
    const krs = plan.okrs[0]!.krs;
    expect(krs.every((k) => k.tipo === 'entregable')).toBe(true);
    expect(krs.every((k) => k.valorInicial === null && k.direccion === null)).toBe(true);

    // El consultor tilda 2 de 4 KRs (el flujo del ticket 7, intacto).
    const HOY = '2026-08-16T12:00:00.000Z';
    await ua.editarKr(infra.reposAlumnos, alcance, krs[0]!.id, { cumplido: true }, HOY);
    await ua.editarKr(infra.reposAlumnos, alcance, krs[1]!.id, { cumplido: true }, HOY);

    // El MISMO cálculo del ticket 7, con los mismos valores: día 45, 2/4 KRs
    // → brecha = 0.5 − 0.5 = 0 → VERDE. Si 9A moviera esto, el test grita.
    const recargado = (await infra.reposAlumnos.planes.obtener(plan.plan.id))!;
    const cumplidos = recargado.okrs[0]!.krs.filter((k) => k.cumplidoEn !== null).length;
    const salud = calcularSalud(
      { estado: 'ACTIVO', fechaInicio: '2026-07-02', krsTotales: 4, krsCumplidos: cumplidos },
      HOY,
    );
    expect(cumplidos).toBe(2);
    expect(salud.salud).toBe('VERDE');
    expect(salud.brecha).toBeCloseTo(0, 5);
  });

  it('marcarAccion escribe estado y marcado COHERENTES (reversible por revert)', async () => {
    const { infra, alcance, plan } = await armar();
    const { token } = await ua.emitirLinkSeguimiento(infra.reposAlumnos, alcance, plan.plan.id);
    await ua.marcarAccion(infra.reposAlumnos, token.token, plan.acciones[0]!.id, { marcado: true }, '2026-08-16T12:00:00.000Z');
    await ua.marcarAccion(infra.reposAlumnos, token.token, plan.acciones[1]!.id, { marcado: false }, '2026-08-16T12:01:00.000Z');

    const checkins = await infra.reposAlumnos.checkins.listarPorPlan(plan.plan.id);
    expect(checkins).toHaveLength(2);
    for (const c of checkins) {
      expect(estadoDe(c)).toBe(c.marcado ? 'ejecutado' : 'pendiente');
      expect(c.estado).not.toBeNull(); // las filas nuevas nacen migradas
      expect(c.usuarioId).toBeNull(); // las marcó el alumno
    }
  });
});

describe('Ticket 9A · mediciones append-only', () => {
  it('cada carga es una fila nueva; la serie sale más reciente primero', async () => {
    const infra = infraestructuraDesdeDb(getDbMemoria(), hasherFake);
    const admin = (await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234'))!;
    const alcance = alcanceDeUsuario({ id: admin.id, rol: 'ADMIN' });
    const alumno = await ua.crearAlumno(infra.reposAlumnos, admin, {
      nombre: 'Marta', programa: 'Prestamista a Empresario', moneda: 'ARS',
    });
    const plan = await ua.cargarPlan(infra.reposAlumnos, alcance, alumno.id, JSON.stringify({
      version: 1, alumno: 'Marta', fecha_inicio: '2026-08-01',
      okrs: [{ orden: 1, objetivo: 'Cobranza', krs: [{ texto: 'Bajar la mora' }] }],
      fases: [
        { fase: 1, acciones: [{ texto: 'A' }, { texto: 'B' }, { texto: 'C' }] },
        { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
        { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
      ],
    }));
    const krId = plan.okrs[0]!.krs[0]!.id;

    const m = infra.reposAlumnos.mediciones;
    await m.crear({ id: randomUUID(), krId, valor: 20, origen: 'consultor', usuarioId: admin.id, cargadoEn: '2026-08-05T00:00:00Z' });
    await m.crear({ id: randomUUID(), krId, valor: 14, origen: 'alumno', usuarioId: null, cargadoEn: '2026-08-16T00:00:00Z' });

    const serie = await m.listarPorKr(krId);
    expect(serie.map((x) => x.valor)).toEqual([14, 20]); // nada se pisó
    expect(serie[0]!.origen).toBe('alumno');
    expect(serie[1]!.usuarioId).toBe(admin.id);
    expect(await m.listarPorPlan(plan.plan.id)).toHaveLength(2);
    // Numérico de verdad: 9 < 10 aunque como texto '9' > '10'.
    expect(serie.every((x) => typeof x.valor === 'number')).toBe(true);
  });
});
