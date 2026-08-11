/**
 * Ticket 1 · Módulo de alumnos — esquema y reglas estructurales.
 *
 * Prueba contra SQLite en memoria (mismo esquema espejo que PostgreSQL) las
 * garantías que el DDL debe dar ANTES de que exista lógica del módulo:
 * cascadas, no-sobrescritura de diagnósticos, token de un solo uso, la
 * distinción 0 ≠ sin dato, y el aislamiento respecto del Asistente IA.
 */
import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { getDbMemoria } from '../sqlite/db';
import { TABLAS_SENSIBLES } from '../../domain/auth/permisos';
import { describirEsquema, type TablaInfo } from '../../domain/asistente/esquema';

const AHORA = '2026-08-11T12:00:00.000Z';

function crearConsultor(db: Database.Database, id = 'usr-cons-1'): string {
  db.prepare(
    `INSERT INTO usuarios (id, email, nombre, rol, password_hash, activo, debe_cambiar_password, creado_en)
     VALUES (?, ?, 'Consultor', 'CONSULTOR', 'hash', 1, 0, ?)`,
  ).run(id, `${id}@activos.com`, AHORA);
  return id;
}

function crearAlumno(db: Database.Database, id = 'AL-1', consultorId = 'usr-cons-1'): string {
  db.prepare(
    `INSERT INTO alumnos (id, consultor_id, nombre, programa, moneda, creado_en)
     VALUES (?, ?, 'Alumno Test', 'Prestamista a Empresario', 'ARS', ?)`,
  ).run(id, consultorId, AHORA);
  return id;
}

function crearDiagnostico(db: Database.Database, id: string, alumnoId: string, extras: Record<string, unknown> = {}): void {
  const columnas = ['id', 'alumno_id', 'fecha', 'origen', 'programa', 'moneda', 'creado_en', ...Object.keys(extras)];
  const valores = [id, alumnoId, '2026-08-11', 'alumno', 'Prestamista a Empresario', 'ARS', AHORA, ...Object.values(extras)];
  db.prepare(`INSERT INTO diagnosticos (${columnas.join(',')}) VALUES (${columnas.map(() => '?').join(',')})`).run(...valores);
}

function setup() {
  const db = getDbMemoria();
  crearConsultor(db);
  return db;
}

describe('Alumnos · esquema', () => {
  it('las cuatro tablas del módulo existen', () => {
    const db = setup();
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    for (const t of ['alumnos', 'diagnosticos', 'diagnostico_tokens', 'alumno_consultor_historial']) {
      expect(tablas).toContain(t);
    }
  });

  it('usuarios.rol acepta CONSULTOR y sigue rechazando roles inventados', () => {
    const db = getDbMemoria();
    expect(() => crearConsultor(db)).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO usuarios (id, email, nombre, rol, password_hash, activo, debe_cambiar_password, creado_en)
         VALUES ('usr-x', 'x@x.com', 'X', 'root', 'hash', 1, 0, ?)`,
      ).run(AHORA),
    ).toThrow(/CHECK/i);
  });

  it('borrar un alumno arrastra sus diagnósticos, tokens e historial (cascade)', () => {
    const db = setup();
    crearAlumno(db);
    crearDiagnostico(db, 'DIAG-1', 'AL-1');
    db.prepare(
      "INSERT INTO diagnostico_tokens (token, alumno_id, expira_en, creado_en) VALUES ('tok-1', 'AL-1', '2026-09-10', ?)",
    ).run(AHORA);
    db.prepare(
      "INSERT INTO alumno_consultor_historial (id, alumno_id, consultor_id, desde, creado_en) VALUES ('HIST-1', 'AL-1', 'usr-cons-1', '2026-08-11', ?)",
    ).run(AHORA);

    db.prepare("DELETE FROM alumnos WHERE id = 'AL-1'").run();

    expect(db.prepare('SELECT COUNT(*) AS n FROM diagnosticos').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM diagnostico_tokens').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM alumno_consultor_historial').get()).toEqual({ n: 0 });
  });

  it('dos envíos del mismo alumno son dos filas: el diagnóstico nunca se pisa', () => {
    const db = setup();
    crearAlumno(db);
    crearDiagnostico(db, 'DIAG-1', 'AL-1', { capital_colocado: 1_000_000 });
    crearDiagnostico(db, 'DIAG-2', 'AL-1', { capital_colocado: 2_500_000 }); // los 90 días
    const filas = db
      .prepare("SELECT id, capital_colocado FROM diagnosticos WHERE alumno_id = 'AL-1' ORDER BY id")
      .all() as { id: string; capital_colocado: number }[];
    expect(filas).toHaveLength(2);
    expect(filas[0]!.capital_colocado).toBe(1_000_000); // el inicial sigue intacto
    expect(filas[1]!.capital_colocado).toBe(2_500_000);
  });

  it('el diagnóstico fotografía programa y moneda: editar la ficha no reinterpreta lo viejo', () => {
    const db = setup();
    crearAlumno(db); // programa 'Prestamista a Empresario', moneda ARS
    crearDiagnostico(db, 'DIAG-1', 'AL-1');
    // Replanificación: el alumno pasa a Elite y se muda (moneda nueva)
    db.prepare("UPDATE alumnos SET programa = 'Prestamista a Empresario Elite', moneda = 'MXN' WHERE id = 'AL-1'").run();
    const foto = db.prepare("SELECT programa, moneda FROM diagnosticos WHERE id = 'DIAG-1'").get() as { programa: string; moneda: string };
    expect(foto.programa).toBe('Prestamista a Empresario'); // como era al enviarse
    expect(foto.moneda).toBe('ARS');
  });

  it('token de un solo uso: consumido queda fuera de la consulta de válidos', () => {
    const db = setup();
    crearAlumno(db);
    db.prepare(
      "INSERT INTO diagnostico_tokens (token, alumno_id, expira_en, creado_en) VALUES ('tok-1', 'AL-1', '2026-09-10', ?)",
    ).run(AHORA);

    const validos = "SELECT token FROM diagnostico_tokens WHERE token = ? AND usado_en IS NULL AND expira_en > ?";
    expect(db.prepare(validos).get('tok-1', AHORA)).toBeTruthy();

    // Se consume (doble envío accidental: el segundo ya no encuentra token)
    db.prepare("UPDATE diagnostico_tokens SET usado_en = ?, diagnostico_id = 'DIAG-1' WHERE token = 'tok-1'").run(AHORA);
    expect(db.prepare(validos).get('tok-1', AHORA)).toBeUndefined();
  });

  it('token vencido queda fuera de la consulta de válidos', () => {
    const db = setup();
    crearAlumno(db);
    db.prepare(
      "INSERT INTO diagnostico_tokens (token, alumno_id, expira_en, creado_en) VALUES ('tok-viejo', 'AL-1', '2026-07-01', ?)",
    ).run(AHORA);
    const valido = db
      .prepare("SELECT token FROM diagnostico_tokens WHERE token = 'tok-viejo' AND usado_en IS NULL AND expira_en > ?")
      .get(AHORA);
    expect(valido).toBeUndefined();
  });

  it('mora en 0 y mora sin dato son distinguibles (la regla que protege los promedios)', () => {
    const db = setup();
    crearAlumno(db);
    crearDiagnostico(db, 'DIAG-sana', 'AL-1', { mora_clientes: 0, mora_clientes_sin_dato: 0 });
    crearDiagnostico(db, 'DIAG-nomide', 'AL-1', { mora_clientes: null, mora_clientes_sin_dato: 1 });

    // Un promedio de cohorte solo debe incluir a quien SÍ midió:
    const medidos = db
      .prepare('SELECT COUNT(*) AS n, AVG(mora_clientes) AS avg FROM diagnosticos WHERE mora_clientes_sin_dato = 0')
      .get() as { n: number; avg: number };
    expect(medidos.n).toBe(1);
    expect(medidos.avg).toBe(0); // cartera sana, no "sin dato"
  });

  it('historial de reasignación: tramo cerrado + tramo vigente (hasta null)', () => {
    const db = setup();
    crearConsultor(db, 'usr-cons-2');
    crearAlumno(db);
    db.prepare(
      "INSERT INTO alumno_consultor_historial (id, alumno_id, consultor_id, desde, hasta, creado_en) VALUES ('HIST-1', 'AL-1', 'usr-cons-1', '2026-08-01', '2026-08-10', ?)",
    ).run(AHORA);
    db.prepare(
      "INSERT INTO alumno_consultor_historial (id, alumno_id, consultor_id, desde, creado_en) VALUES ('HIST-2', 'AL-1', 'usr-cons-2', '2026-08-10', ?)",
    ).run(AHORA);
    const vigente = db
      .prepare("SELECT consultor_id FROM alumno_consultor_historial WHERE alumno_id = 'AL-1' AND hasta IS NULL")
      .all() as { consultor_id: string }[];
    expect(vigente).toEqual([{ consultor_id: 'usr-cons-2' }]);
  });

  it('moneda es obligatoria en alumnos y su default es ARS', () => {
    const db = setup();
    crearAlumno(db); // helper la pasa explícita
    // Sin pasarla: toma el default
    db.prepare(
      "INSERT INTO alumnos (id, consultor_id, nombre, programa, creado_en) VALUES ('AL-2', 'usr-cons-1', 'Otro', 'De Cero a Gestor Financiero', ?)",
    ).run(AHORA);
    expect(db.prepare("SELECT moneda FROM alumnos WHERE id = 'AL-2'").get()).toEqual({ moneda: 'ARS' });
  });
});

describe('Alumnos · aislamiento del Asistente IA (exclusión temporal, ver ticket 6)', () => {
  const DEL_MODULO = ['alumnos', 'diagnosticos', 'diagnostico_tokens', 'alumno_consultor_historial'];

  it('las cuatro tablas están en TABLAS_SENSIBLES desde este mismo commit', () => {
    for (const t of DEL_MODULO) expect(TABLAS_SENSIBLES).toContain(t);
  });

  it('describirEsquema no las incluye en el contexto que ve el modelo', () => {
    const tablas: TablaInfo[] = [
      { tabla: 'cierres', columnas: [{ nombre: 'id_cierre', tipo: 'TEXT' }] },
      ...DEL_MODULO.map((t) => ({ tabla: t, columnas: [{ nombre: 'id', tipo: 'TEXT' }] })),
    ];
    const contexto = describirEsquema(tablas);
    expect(contexto).toContain('cierres(');
    for (const t of DEL_MODULO) expect(contexto).not.toContain(`${t}(`);
  });
});
