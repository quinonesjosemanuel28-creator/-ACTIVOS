/**
 * Ticket 6 · Fase 2 del módulo de alumnos — esquema del plan de 90 días.
 * Garantías del DDL: existencia, CHECK estructural de fase, y cascada.
 */
import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { getDbMemoria } from '../sqlite/db';

function sembrarPlan(db: Database.Database): void {
  db.exec(`INSERT INTO usuarios (id,email,nombre,rol,password_hash,activo,debe_cambiar_password,creado_en)
           VALUES ('u1','c@a.com','C','CONSULTOR','h',1,0,'2026-08-01')`);
  db.exec(`INSERT INTO alumnos (id,consultor_id,nombre,programa,moneda,creado_en)
           VALUES ('a1','u1','G','Prestamista a Empresario','ARS','2026-08-01')`);
  db.exec(`INSERT INTO planes (id,alumno_id,fecha_inicio,creado_en) VALUES ('p1','a1','2026-08-18','2026-08-12')`);
}

describe('Plan · esquema', () => {
  it('planes, okrs, krs, acciones y checkins existen', () => {
    const db = getDbMemoria();
    for (const t of ['planes', 'okrs', 'krs', 'acciones', 'checkins']) {
      const existe = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
      expect(existe, `falta la tabla ${t}`).toBeTruthy();
    }
  });

  it('acciones.fase solo acepta 1, 2 o 3 (estructural, con CHECK)', () => {
    const db = getDbMemoria();
    sembrarPlan(db);
    expect(() =>
      db.exec(`INSERT INTO acciones (id,plan_id,fase,orden,texto,creado_en) VALUES ('x','p1',4,1,'t','2026-08-12')`),
    ).toThrow();
    db.exec(`INSERT INTO acciones (id,plan_id,fase,orden,texto,creado_en) VALUES ('ok','p1',3,1,'t','2026-08-12')`);
  });

  it('borrar el plan arrastra okrs, krs, acciones y checkins (cascade)', () => {
    const db = getDbMemoria();
    sembrarPlan(db);
    db.exec(`INSERT INTO okrs (id,plan_id,orden,objetivo,creado_en) VALUES ('o1','p1',1,'Ordenar','2026-08-12')`);
    db.exec(`INSERT INTO krs (id,okr_id,orden,texto,creado_en) VALUES ('k1','o1',1,'Tablero','2026-08-12')`);
    db.exec(`INSERT INTO acciones (id,plan_id,okr_id,fase,orden,texto,creado_en) VALUES ('ac1','p1','o1',1,1,'Armar tablero','2026-08-12')`);
    db.exec(`INSERT INTO checkins (id,accion_id,marcado,origen,creado_en) VALUES ('ch1','ac1',1,'alumno','2026-08-20')`);

    db.exec(`DELETE FROM planes WHERE id='p1'`);
    for (const t of ['okrs', 'krs', 'acciones', 'checkins']) {
      const n = db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number };
      expect(n.n, `${t} no se vació en cascada`).toBe(0);
    }
  });
});
