/**
 * CAPA 4 — INFRAESTRUCTURA · Módulo de alumnos · Repos SQLite.
 *
 * El SQL de `diagnosticos` se ARMA desde el catálogo del dominio
 * (`CAMPOS_RESPUESTA` + las 19 casillas), no se escribe a mano: son ~90
 * columnas por dos motores, y una lista tipeada a mano se desalinea del
 * esquema sin que ningún test lo note — perdiendo respuestas en silencio.
 *
 * Los multi-selección viajan como JSON dentro de una columna TEXT: lo que
 * entra es lo que sale, sin reinterpretar. El espejo SQLite/PostgreSQL exige el
 * mismo tipo de columna en los dos motores y SQLite no tiene JSONB.
 */
import type Database from 'better-sqlite3';
import { METRICAS_CLARIDAD, SUFIJO_SIN_DATO } from '../../domain/alumnos/claridad';
import {
  CAMPOS_RESPUESTA,
  type Alumno,
  type Diagnostico,
  type OrigenDiagnostico,
  type RespuestasDiagnostico,
  type TokenDiagnostico,
} from '../../domain/alumnos/tipos';
import type { Accion, Checkin, Kr, Okr, Plan, PlanCompleto, TokenSeguimiento } from '../../domain/alumnos/plan';
import type {
  AlumnosRepo,
  CheckinsRepo,
  DiagnosticosRepo,
  HistorialRepo,
  PlanesRepo,
  SeguimientoTokensRepo,
  TokensRepo,
  TramoHistorial,
} from '../../application/alumnos/ports';

/** Columnas de respuesta: las 45 preguntas + las 19 casillas. */
export const COLUMNAS_RESPUESTA: readonly string[] = [
  ...CAMPOS_RESPUESTA,
  ...METRICAS_CLARIDAD.map((m) => `${m}${SUFIJO_SIN_DATO}`),
];

const COLUMNAS_CABECERA = [
  'id',
  'alumno_id',
  'fecha',
  'origen',
  'editado_por_consultor',
  'programa',
  'moneda',
  'indice_claridad',
  'metricas_aplicables',
  'metricas_respondidas',
] as const;

const COLUMNAS_DIAGNOSTICO = [...COLUMNAS_CABECERA, ...COLUMNAS_RESPUESTA, 'creado_en'];

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

export function crearAlumnosRepo(db: Database.Database): AlumnosRepo {
  return {
    async obtener(id) {
      const row = db.prepare('SELECT * FROM alumnos WHERE id = ?').get(id) as AlumnoRow | undefined;
      return row ? toAlumno(row) : null;
    },
    async listar(filtros = {}) {
      const where: string[] = [];
      const params: unknown[] = [];
      // El ámbito por fila aterriza acá: con un consultor acotado, la consulta
      // NUNCA sale de su cartera.
      if (filtros.consultorId) {
        where.push('consultor_id = ?');
        params.push(filtros.consultorId);
      }
      if (filtros.activo !== undefined) {
        where.push('activo = ?');
        params.push(filtros.activo ? 1 : 0);
      }
      if (filtros.q) {
        where.push('(LOWER(nombre) LIKE ? OR LOWER(COALESCE(marca_comercial, id)) LIKE ?)');
        const like = `%${filtros.q.toLowerCase()}%`;
        params.push(like, like);
      }
      const sql = `SELECT * FROM alumnos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY nombre`;
      return (db.prepare(sql).all(...params) as AlumnoRow[]).map(toAlumno);
    },
    async guardar(a) {
      db.prepare(
        `INSERT INTO alumnos
          (id, consultor_id, nombre, edad, zona, whatsapp, marca_comercial, programa,
           canal_origen, moneda, activo, id_cierre_vinculado, creado_en)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           consultor_id=excluded.consultor_id, nombre=excluded.nombre, edad=excluded.edad,
           zona=excluded.zona, whatsapp=excluded.whatsapp, marca_comercial=excluded.marca_comercial,
           programa=excluded.programa, canal_origen=excluded.canal_origen, moneda=excluded.moneda,
           activo=excluded.activo, id_cierre_vinculado=excluded.id_cierre_vinculado`,
      ).run(
        a.id, a.consultorId, a.nombre, a.edad, a.zona, a.whatsapp, a.marcaComercial, a.programa,
        a.canalOrigen, a.moneda, a.activo ? 1 : 0, a.idCierreVinculado, a.creadoEn,
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

/** Valores en el orden EXACTO de COLUMNAS_DIAGNOSTICO. */
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

export function crearDiagnosticosRepo(db: Database.Database): DiagnosticosRepo {
  return {
    async obtener(id) {
      const row = db.prepare('SELECT * FROM diagnosticos WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      return row ? toDiagnostico(row) : null;
    },
    async listarPorAlumno(alumnoId) {
      const rows = db
        .prepare('SELECT * FROM diagnosticos WHERE alumno_id = ? ORDER BY fecha DESC')
        .all(alumnoId) as Record<string, unknown>[];
      return rows.map(toDiagnostico);
    },
    async guardar(d) {
      // INSERT puro, sin ON CONFLICT: un diagnóstico NUNCA se sobrescribe. Cada
      // envío es una fila nueva para poder comparar el inicial con el de los 90
      // días. Si alguna vez llega un id repetido, que falle.
      db.prepare(
        `INSERT INTO diagnosticos (${COLUMNAS_DIAGNOSTICO.join(', ')})
         VALUES (${COLUMNAS_DIAGNOSTICO.map(() => '?').join(',')})`,
      ).run(...valoresDe(d));
    },
    async actualizar(d) {
      // Corrección del consultor: SOLO respuestas, índice y el flag. La
      // identidad del envío (fecha, origen, alumno, foto programa/moneda) no
      // aparece en el SET a propósito.
      const set = [
        'editado_por_consultor = ?',
        'indice_claridad = ?',
        'metricas_aplicables = ?',
        'metricas_respondidas = ?',
        ...COLUMNAS_RESPUESTA.map((c) => `${c} = ?`),
      ];
      db.prepare(`UPDATE diagnosticos SET ${set.join(', ')} WHERE id = ?`).run(
        d.editadoPorConsultor ? 1 : 0,
        d.indiceClaridad,
        d.metricasAplicables,
        d.metricasRespondidas,
        ...COLUMNAS_RESPUESTA.map((col) => {
          const v = d.respuestas[col];
          if (ES_CASILLA.has(col)) return v === true ? 1 : 0;
          return v ?? null;
        }),
        d.id,
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

export function crearTokensRepo(db: Database.Database): TokensRepo {
  return {
    async obtener(token) {
      const row = db.prepare('SELECT * FROM diagnostico_tokens WHERE token = ?').get(token) as TokenRow | undefined;
      return row ? toToken(row) : null;
    },
    async crear(t) {
      db.prepare(
        `INSERT INTO diagnostico_tokens (token, alumno_id, expira_en, usado_en, diagnostico_id, creado_en)
         VALUES (?,?,?,?,?,?)`,
      ).run(t.token, t.alumnoId, t.expiraEn, t.usadoEn, t.diagnosticoId, t.creadoEn);
    },
    async marcarUsado(token, usadoEn, diagnosticoId) {
      // El WHERE exige que siga sin usar: si dos envíos entran a la vez, solo
      // uno consume el token. El segundo no actualiza ninguna fila.
      db.prepare(
        'UPDATE diagnostico_tokens SET usado_en = ?, diagnostico_id = ? WHERE token = ? AND usado_en IS NULL',
      ).run(usadoEn, diagnosticoId, token);
    },
    async invalidarPendientes(alumnoId, ahoraIso) {
      // Vencer, no borrar: queda el rastro de que se emitió y se reemplazó.
      return db
        .prepare('UPDATE diagnostico_tokens SET expira_en = ? WHERE alumno_id = ? AND usado_en IS NULL AND expira_en > ?')
        .run(ahoraIso, alumnoId, ahoraIso).changes;
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

export function crearHistorialRepo(db: Database.Database): HistorialRepo {
  return {
    async listarPorAlumno(alumnoId) {
      const rows = db
        .prepare('SELECT * FROM alumno_consultor_historial WHERE alumno_id = ? ORDER BY desde')
        .all(alumnoId) as TramoRow[];
      return rows.map(toTramo);
    },
    async abrirTramo(t) {
      db.prepare(
        `INSERT INTO alumno_consultor_historial (id, alumno_id, consultor_id, desde, hasta, creado_en)
         VALUES (?,?,?,?,?,?)`,
      ).run(t.id, t.alumnoId, t.consultorId, t.desde, t.hasta, t.creadoEn);
    },
    async cerrarTramoVigente(alumnoId, hasta) {
      db.prepare('UPDATE alumno_consultor_historial SET hasta = ? WHERE alumno_id = ? AND hasta IS NULL').run(
        hasta,
        alumnoId,
      );
    },
  };
}

// ───────────────────────── Plan de 90 días ─────────────────────────

interface PlanRow { id: string; alumno_id: string; fecha_inicio: string; etapa: string | null; objetivo_90d: string | null; version: number; creado_en: string }
interface OkrRow { id: string; plan_id: string; orden: number; objetivo: string; creado_en: string }
interface KrRow { id: string; okr_id: string; orden: number; texto: string; meta: string | null; creado_en: string }
interface AccionRow { id: string; plan_id: string; okr_id: string | null; fase: number; orden: number; texto: string; creado_en: string }

const toPlan = (r: PlanRow): Plan => ({
  id: r.id, alumnoId: r.alumno_id, fechaInicio: r.fecha_inicio,
  etapa: r.etapa, objetivo90d: r.objetivo_90d, version: r.version, creadoEn: r.creado_en,
});

export function crearPlanesRepo(db: Database.Database): PlanesRepo {
  const armarCompleto = (p: PlanRow): PlanCompleto => {
    const okrs = (db.prepare('SELECT * FROM okrs WHERE plan_id = ? ORDER BY orden').all(p.id) as OkrRow[]).map(
      (o): Okr & { krs: Kr[] } => ({
        id: o.id, planId: o.plan_id, orden: o.orden, objetivo: o.objetivo, creadoEn: o.creado_en,
        krs: (db.prepare('SELECT * FROM krs WHERE okr_id = ? ORDER BY orden').all(o.id) as KrRow[]).map((k) => ({
          id: k.id, okrId: k.okr_id, orden: k.orden, texto: k.texto, meta: k.meta, creadoEn: k.creado_en,
        })),
      }),
    );
    const acciones = (db.prepare('SELECT * FROM acciones WHERE plan_id = ? ORDER BY fase, orden').all(p.id) as AccionRow[]).map(
      (a): Accion => ({
        id: a.id, planId: a.plan_id, okrId: a.okr_id, fase: a.fase as Accion['fase'],
        orden: a.orden, texto: a.texto, creadoEn: a.creado_en,
      }),
    );
    return { plan: toPlan(p), okrs, acciones };
  };

  // Transacción de better-sqlite3: si algo tira, no queda NADA del plan.
  const guardarTx = db.transaction((pc: PlanCompleto) => {
    db.prepare(
      `INSERT INTO planes (id, alumno_id, fecha_inicio, etapa, objetivo_90d, version, creado_en)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(pc.plan.id, pc.plan.alumnoId, pc.plan.fechaInicio, pc.plan.etapa, pc.plan.objetivo90d, pc.plan.version, pc.plan.creadoEn);
    for (const o of pc.okrs) {
      db.prepare('INSERT INTO okrs (id, plan_id, orden, objetivo, creado_en) VALUES (?,?,?,?,?)').run(
        o.id, o.planId, o.orden, o.objetivo, o.creadoEn,
      );
      for (const k of o.krs) {
        db.prepare('INSERT INTO krs (id, okr_id, orden, texto, meta, creado_en) VALUES (?,?,?,?,?,?)').run(
          k.id, k.okrId, k.orden, k.texto, k.meta, k.creadoEn,
        );
      }
    }
    for (const a of pc.acciones) {
      db.prepare('INSERT INTO acciones (id, plan_id, okr_id, fase, orden, texto, creado_en) VALUES (?,?,?,?,?,?,?)').run(
        a.id, a.planId, a.okrId, a.fase, a.orden, a.texto, a.creadoEn,
      );
    }
  });

  return {
    async guardarCompleto(pc) {
      guardarTx(pc);
    },
    async listarPorAlumno(alumnoId) {
      const rows = db
        .prepare('SELECT * FROM planes WHERE alumno_id = ? ORDER BY fecha_inicio DESC, creado_en DESC')
        .all(alumnoId) as PlanRow[];
      return rows.map(armarCompleto);
    },
    async obtener(planId) {
      const row = db.prepare('SELECT * FROM planes WHERE id = ?').get(planId) as PlanRow | undefined;
      return row ? armarCompleto(row) : null;
    },
  };
}


// ───────────────────────── Seguimiento: tokens y checkins ─────────────────────────

interface SeguimientoRow { token: string; plan_id: string; expira_en: string; revocado_en: string | null; creado_en: string }
interface CheckinRow { id: string; accion_id: string; marcado: number; origen: string; creado_en: string }

const toSeguimiento = (r: SeguimientoRow): TokenSeguimiento => ({
  token: r.token, planId: r.plan_id, expiraEn: r.expira_en, revocadoEn: r.revocado_en, creadoEn: r.creado_en,
});
const toCheckin = (r: CheckinRow): Checkin => ({
  id: r.id, accionId: r.accion_id, marcado: r.marcado === 1,
  origen: r.origen as Checkin['origen'], creadoEn: r.creado_en,
});

export function crearSeguimientoRepo(db: Database.Database): SeguimientoTokensRepo {
  return {
    async obtener(token) {
      const row = db.prepare('SELECT * FROM seguimiento_tokens WHERE token = ?').get(token) as SeguimientoRow | undefined;
      return row ? toSeguimiento(row) : null;
    },
    async vigenteDePlan(planId, ahoraIso) {
      const row = db
        .prepare('SELECT * FROM seguimiento_tokens WHERE plan_id = ? AND revocado_en IS NULL AND expira_en > ? ORDER BY creado_en DESC LIMIT 1')
        .get(planId, ahoraIso) as SeguimientoRow | undefined;
      return row ? toSeguimiento(row) : null;
    },
    async crear(t) {
      db.prepare('INSERT INTO seguimiento_tokens (token, plan_id, expira_en, revocado_en, creado_en) VALUES (?,?,?,?,?)').run(
        t.token, t.planId, t.expiraEn, t.revocadoEn, t.creadoEn,
      );
    },
    async revocarDePlan(planId, ahoraIso) {
      return db
        .prepare('UPDATE seguimiento_tokens SET revocado_en = ? WHERE plan_id = ? AND revocado_en IS NULL')
        .run(ahoraIso, planId).changes;
    },
  };
}

export function crearCheckinsRepo(db: Database.Database): CheckinsRepo {
  return {
    async crear(c) {
      // Solo INSERT: los checkins no se editan ni se borran, a propósito.
      db.prepare('INSERT INTO checkins (id, accion_id, marcado, origen, creado_en) VALUES (?,?,?,?,?)').run(
        c.id, c.accionId, c.marcado ? 1 : 0, c.origen, c.creadoEn,
      );
    },
    async listarPorPlan(planId) {
      const rows = db
        .prepare(
          `SELECT ch.* FROM checkins ch JOIN acciones a ON a.id = ch.accion_id
           WHERE a.plan_id = ? ORDER BY ch.creado_en DESC`,
        )
        .all(planId) as CheckinRow[];
      return rows.map(toCheckin);
    },
  };
}
