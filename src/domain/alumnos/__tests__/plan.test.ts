import { describe, it, expect } from 'vitest';
import { faseActual, planVencido } from '../plan';
import { getDbMemoria } from '../../../infrastructure/sqlite/db';
import { TABLAS_SENSIBLES } from '../../auth/permisos';

describe('Plan · las tablas de la fase 2 existen (los dos motores se espejan vía tablasMigracion)', () => {
  it('planes, okrs, krs, acciones y checkins están en la base', () => {
    const db = getDbMemoria();
    for (const t of ['planes', 'okrs', 'krs', 'acciones', 'checkins']) {
      const existe = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
      expect(existe, `falta la tabla ${t}`).toBeTruthy();
    }
  });

  it('acciones.fase solo acepta 1, 2 o 3 (estructural, con CHECK)', () => {
    const db = getDbMemoria();
    db.exec(`INSERT INTO usuarios (id,email,nombre,rol,password_hash,activo,debe_cambiar_password,creado_en)
             VALUES ('u1','c@a.com','C','CONSULTOR','h',1,0,'2026-08-01')`);
    db.exec(`INSERT INTO alumnos (id,consultor_id,nombre,programa,moneda,creado_en)
             VALUES ('a1','u1','G','Prestamista a Empresario','ARS','2026-08-01')`);
    db.exec(`INSERT INTO planes (id,alumno_id,fecha_inicio,creado_en) VALUES ('p1','a1','2026-08-18','2026-08-12')`);
    expect(() =>
      db.exec(`INSERT INTO acciones (id,plan_id,fase,orden,texto,creado_en) VALUES ('x','p1',4,1,'t','2026-08-12')`),
    ).toThrow();
    db.exec(`INSERT INTO acciones (id,plan_id,fase,orden,texto,creado_en) VALUES ('ok','p1',3,1,'t','2026-08-12')`);
  });

  it('borrar el plan arrastra okrs, krs, acciones y checkins (cascade)', () => {
    const db = getDbMemoria();
    db.exec(`INSERT INTO usuarios (id,email,nombre,rol,password_hash,activo,debe_cambiar_password,creado_en)
             VALUES ('u1','c@a.com','C','CONSULTOR','h',1,0,'2026-08-01')`);
    db.exec(`INSERT INTO alumnos (id,consultor_id,nombre,programa,moneda,creado_en)
             VALUES ('a1','u1','G','Prestamista a Empresario','ARS','2026-08-01')`);
    db.exec(`INSERT INTO planes (id,alumno_id,fecha_inicio,creado_en) VALUES ('p1','a1','2026-08-18','2026-08-12')`);
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

  it('las cinco tablas nuevas quedan fuera del asistente IA', () => {
    for (const t of ['planes', 'okrs', 'krs', 'acciones', 'checkins']) {
      expect(TABLAS_SENSIBLES).toContain(t);
    }
  });
});

describe('Plan · fase actual derivada de fecha_inicio', () => {
  const INICIO = '2026-08-18';

  it('días 0-29 → fase 1 · 30-59 → 2 · 60+ → 3', () => {
    expect(faseActual(INICIO, '2026-08-18')).toBe(1); // día 0
    expect(faseActual(INICIO, '2026-09-16')).toBe(1); // día 29
    expect(faseActual(INICIO, '2026-09-17')).toBe(2); // día 30
    expect(faseActual(INICIO, '2026-10-16')).toBe(2); // día 59
    expect(faseActual(INICIO, '2026-10-17')).toBe(3); // día 60
    expect(faseActual(INICIO, '2026-12-01')).toBe(3); // pasado el 90 sigue en 3
  });

  it('antes del arranque se muestra la fase 1 (el plan todavía no corrió)', () => {
    expect(faseActual(INICIO, '2026-08-10')).toBe(1);
  });

  it('el plan vence el día 90', () => {
    expect(planVencido(INICIO, '2026-11-15')).toBe(false); // día 89
    expect(planVencido(INICIO, '2026-11-16')).toBe(true); // día 90
    expect(planVencido(INICIO, '2026-08-18')).toBe(false);
  });
});
