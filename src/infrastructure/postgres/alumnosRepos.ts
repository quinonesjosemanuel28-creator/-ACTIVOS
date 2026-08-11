/**
 * CAPA 4 — INFRAESTRUCTURA · Módulo de alumnos · Repos PostgreSQL.
 * Espejo de src/infrastructure/sqlite/alumnosRepos.ts (pg, $1..$n).
 *
 * Comparte con el espejo SQLite el catálogo de columnas y los conversores de
 * fila: si el esquema de un motor se moviera, el otro se rompe en el mismo
 * lugar en vez de callarse.
 */
import type { Pool } from 'pg';
import { METRICAS_CLARIDAD, SUFIJO_SIN_DATO } from '../../domain/alumnos/claridad';
import {
  CAMPOS_RESPUESTA,
  type Alumno,
  type Diagnostico,
  type OrigenDiagnostico,
  type RespuestasDiagnostico,
  type TokenDiagnostico,
} from '../../domain/alumnos/tipos';
import type {
  AlumnosRepo,
  DiagnosticosRepo,
  HistorialRepo,
  TokensRepo,
  TramoHistorial,
} from '../../application/alumnos/ports';

const COLUMNAS_RESPUESTA: readonly string[] = [
  ...CAMPOS_RESPUESTA,
  ...METRICAS_CLARIDAD.map((m) => `${m}${SUFIJO_SIN_DATO}`),
];

const COLUMNAS_DIAGNOSTICO = [
  'id', 'alumno_id', 'fecha', 'origen', 'editado_por_consultor', 'programa', 'moneda',
  'indice_claridad', 'metricas_aplicables', 'metricas_respondidas',
  ...COLUMNAS_RESPUESTA,
  'creado_en',
];

const ES_CASILLA = new Set(METRICAS_CLARIDAD.map((m) => `${m}${SUFIJO_SIN_DATO}`));

// ───────────────────────── Alumnos ─────────────────────────

interface AlumnoRow {
  id: string;
  consultor_id: string;
  nombre: string;
  edad: number | null;
  zona: string | null;
  whatsapp: string | null;
  marca_comercial: string | null;
  programa: string;
  canal_origen: string | null;
  moneda: string;
  activo: number;
  id_cierre_vinculado: string | null;
  creado_en: string;
}

const toAlumno = (r: AlumnoRow): Alumno => ({
  id: r.id,
  consultorId: r.consultor_id,
  nombre: r.nombre,
  edad: r.edad,
  zona: r.zona,
  whatsapp: r.whatsapp,
  marcaComercial: r.marca_comercial,
  programa: r.programa,
  canalOrigen: r.canal_origen,
  moneda: r.moneda,
  activo: r.activo === 1,
  idCierreVinculado: r.id_cierre_vinculado,
  creadoEn: r.creado_en,
});

export function crearAlumnosRepoPg(pool: Pool): AlumnosRepo {
  return {
    async obtener(id) {
      const r = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
      const row = r.rows[0] as AlumnoRow | undefined;
      return row ? toAlumno(row) : null;
    },
    async listar(filtros = {}) {
      const where: string[] = [];
      const params: unknown[] = [];
      const n = () => `$${params.length}`;
      if (filtros.consultorId) {
        params.push(filtros.consultorId);
        where.push(`consultor_id = ${n()}`);
      }
      if (filtros.activo !== undefined) {
        params.push(filtros.activo ? 1 : 0);
        where.push(`activo = ${n()}`);
      }
      if (filtros.q) {
        params.push(`%${filtros.q.toLowerCase()}%`);
        where.push(`(LOWER(nombre) LIKE ${n()} OR LOWER(COALESCE(marca_comercial, id)) LIKE ${n()})`);
      }
      const sql = `SELECT * FROM alumnos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY nombre`;
      const r = await pool.query(sql, params);
      return (r.rows as AlumnoRow[]).map(toAlumno);
    },
    async guardar(a) {
      await pool.query(
        `INSERT INTO alumnos
          (id, consultor_id, nombre, edad, zona, whatsapp, marca_comercial, programa,
           canal_origen, moneda, activo, id_cierre_vinculado, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           consultor_id=EXCLUDED.consultor_id, nombre=EXCLUDED.nombre, edad=EXCLUDED.edad,
           zona=EXCLUDED.zona, whatsapp=EXCLUDED.whatsapp, marca_comercial=EXCLUDED.marca_comercial,
           programa=EXCLUDED.programa, canal_origen=EXCLUDED.canal_origen, moneda=EXCLUDED.moneda,
           activo=EXCLUDED.activo, id_cierre_vinculado=EXCLUDED.id_cierre_vinculado`,
        [
          a.id, a.consultorId, a.nombre, a.edad, a.zona, a.whatsapp, a.marcaComercial, a.programa,
          a.canalOrigen, a.moneda, a.activo ? 1 : 0, a.idCierreVinculado, a.creadoEn,
        ],
      );
    },
  };
}

// ───────────────────────── Diagnósticos ─────────────────────────

function toDiagnostico(row: Record<string, unknown>): Diagnostico {
  const respuestas: RespuestasDiagnostico = {};
  for (const col of COLUMNAS_RESPUESTA) {
    respuestas[col] = ES_CASILLA.has(col) ? row[col] === 1 : (row[col] as string | number | null);
  }
  return {
    id: row.id as string,
    alumnoId: row.alumno_id as string,
    fecha: row.fecha as string,
    origen: row.origen as OrigenDiagnostico,
    editadoPorConsultor: row.editado_por_consultor === 1,
    programa: row.programa as string,
    moneda: row.moneda as string,
    indiceClaridad: (row.indice_claridad as number | null) ?? null,
    metricasAplicables: row.metricas_aplicables as number,
    metricasRespondidas: row.metricas_respondidas as number,
    respuestas,
    creadoEn: row.creado_en as string,
  };
}

function valoresDe(d: Diagnostico): unknown[] {
  return [
    d.id, d.alumnoId, d.fecha, d.origen, d.editadoPorConsultor ? 1 : 0, d.programa, d.moneda,
    d.indiceClaridad, d.metricasAplicables, d.metricasRespondidas,
    ...COLUMNAS_RESPUESTA.map((col) => {
      const v = d.respuestas[col];
      if (ES_CASILLA.has(col)) return v === true ? 1 : 0;
      return v ?? null;
    }),
    d.creadoEn,
  ];
}

export function crearDiagnosticosRepoPg(pool: Pool): DiagnosticosRepo {
  return {
    async obtener(id) {
      const r = await pool.query('SELECT * FROM diagnosticos WHERE id = $1', [id]);
      const row = r.rows[0] as Record<string, unknown> | undefined;
      return row ? toDiagnostico(row) : null;
    },
    async listarPorAlumno(alumnoId) {
      const r = await pool.query('SELECT * FROM diagnosticos WHERE alumno_id = $1 ORDER BY fecha DESC', [alumnoId]);
      return (r.rows as Record<string, unknown>[]).map(toDiagnostico);
    },
    async guardar(d) {
      // Sin ON CONFLICT a propósito: un diagnóstico nunca se sobrescribe.
      await pool.query(
        `INSERT INTO diagnosticos (${COLUMNAS_DIAGNOSTICO.join(', ')})
         VALUES (${COLUMNAS_DIAGNOSTICO.map((_, i) => `$${i + 1}`).join(',')})`,
        valoresDe(d),
      );
    },
  };
}

// ───────────────────────── Tokens ─────────────────────────

interface TokenRow {
  token: string;
  alumno_id: string;
  expira_en: string;
  usado_en: string | null;
  diagnostico_id: string | null;
  creado_en: string;
}

const toToken = (r: TokenRow): TokenDiagnostico => ({
  token: r.token,
  alumnoId: r.alumno_id,
  expiraEn: r.expira_en,
  usadoEn: r.usado_en,
  diagnosticoId: r.diagnostico_id,
  creadoEn: r.creado_en,
});

export function crearTokensRepoPg(pool: Pool): TokensRepo {
  return {
    async obtener(token) {
      const r = await pool.query('SELECT * FROM diagnostico_tokens WHERE token = $1', [token]);
      const row = r.rows[0] as TokenRow | undefined;
      return row ? toToken(row) : null;
    },
    async crear(t) {
      await pool.query(
        `INSERT INTO diagnostico_tokens (token, alumno_id, expira_en, usado_en, diagnostico_id, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.token, t.alumnoId, t.expiraEn, t.usadoEn, t.diagnosticoId, t.creadoEn],
      );
    },
    async marcarUsado(token, usadoEn, diagnosticoId) {
      await pool.query(
        'UPDATE diagnostico_tokens SET usado_en = $1, diagnostico_id = $2 WHERE token = $3 AND usado_en IS NULL',
        [usadoEn, diagnosticoId, token],
      );
    },
    async invalidarPendientes(alumnoId, ahoraIso) {
      const r = await pool.query(
        'UPDATE diagnostico_tokens SET expira_en = $1 WHERE alumno_id = $2 AND usado_en IS NULL AND expira_en > $3',
        [ahoraIso, alumnoId, ahoraIso],
      );
      return r.rowCount ?? 0;
    },
  };
}

// ───────────────────────── Historial de asignación ─────────────────────────

interface TramoRow {
  id: string;
  alumno_id: string;
  consultor_id: string;
  desde: string;
  hasta: string | null;
  creado_en: string;
}

const toTramo = (r: TramoRow): TramoHistorial => ({
  id: r.id,
  alumnoId: r.alumno_id,
  consultorId: r.consultor_id,
  desde: r.desde,
  hasta: r.hasta,
  creadoEn: r.creado_en,
});

export function crearHistorialRepoPg(pool: Pool): HistorialRepo {
  return {
    async listarPorAlumno(alumnoId) {
      const r = await pool.query('SELECT * FROM alumno_consultor_historial WHERE alumno_id = $1 ORDER BY desde', [
        alumnoId,
      ]);
      return (r.rows as TramoRow[]).map(toTramo);
    },
    async abrirTramo(t) {
      await pool.query(
        `INSERT INTO alumno_consultor_historial (id, alumno_id, consultor_id, desde, hasta, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.id, t.alumnoId, t.consultorId, t.desde, t.hasta, t.creadoEn],
      );
    },
    async cerrarTramoVigente(alumnoId, hasta) {
      await pool.query('UPDATE alumno_consultor_historial SET hasta = $1 WHERE alumno_id = $2 AND hasta IS NULL', [
        hasta,
        alumnoId,
      ]);
    },
  };
}
