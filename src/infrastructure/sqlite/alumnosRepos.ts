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
import type { NotaResolucion } from '../../domain/alumnos/notas';
import type { EntradaBitacora } from '../../domain/alumnos/bitacora';
import { METRICAS_CLARIDAD, SUFIJO_SIN_DATO } from '../../domain/alumnos/claridad';
import {
  CAMPOS_RESPUESTA,
  type Alumno,
  type Contacto,
  type Diagnostico,
  type OrigenDiagnostico,
  type RespuestasDiagnostico,
  type TokenDiagnostico,
} from '../../domain/alumnos/tipos';
import { diasEntre } from '../../domain/alumnos/plan';
import type { Accion, CambioFechaPlan, Checkin, Kr, Medicion, Okr, Plan, PlanCompleto, PlanDocumento, TokenSeguimiento } from '../../domain/alumnos/plan';
import type {
  AlumnosRepo,
  CheckinsRepo,
  ContactosRepo,
  DiagnosticosRepo,
  DocumentosRepo,
  HistorialRepo,
  MedicionesRepo,
  PlanesRepo,
  SeguimientoTokensRepo,
  TokensRepo,
  TramoHistorial,
BitacoraRepo,
  NotaResolucionesRepo,
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
  estado: string;
  estado_actualizado_en: string | null;
  telefono_pais: string | null;
  telefono_numero: string | null;
  ultimo_acceso_link: string | null;
  id_cierre_vinculado: string | null;
  eliminado_en: string | null;
  eliminado_por: string | null;
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
  estado: r.estado as Alumno['estado'],
  estadoActualizadoEn: r.estado_actualizado_en,
  telefonoPais: r.telefono_pais,
  telefonoNumero: r.telefono_numero,
  ultimoAccesoLink: r.ultimo_acceso_link,
  idCierreVinculado: r.id_cierre_vinculado,
  eliminadoEn: r.eliminado_en,
  eliminadoPor: r.eliminado_por,
  creadoEn: r.creado_en,
});

export function crearAlumnosRepo(db: Database.Database): AlumnosRepo {
  return {
    async obtener(id) {
      // eliminado_en IS NULL en la CONSULTA: una ficha en papelera no existe
      // para el módulo (ni ficha, ni token público, ni exportación).
      const row = db.prepare('SELECT * FROM alumnos WHERE id = ? AND eliminado_en IS NULL').get(id) as AlumnoRow | undefined;
      return row ? toAlumno(row) : null;
    },
    async listar(filtros = {}) {
      const where: string[] = ['eliminado_en IS NULL'];
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
      if (filtros.estado) {
        where.push('estado = ?');
        params.push(filtros.estado);
      }
      if (filtros.q) {
        where.push('(LOWER(nombre) LIKE ? OR LOWER(COALESCE(marca_comercial, id)) LIKE ?)');
        const like = `%${filtros.q.toLowerCase()}%`;
        params.push(like, like);
      }
      const sql = `SELECT * FROM alumnos WHERE ${where.join(' AND ')} ORDER BY nombre`;
      return (db.prepare(sql).all(...params) as AlumnoRow[]).map(toAlumno);
    },
    async guardar(a) {
      db.prepare(
        `INSERT INTO alumnos
          (id, consultor_id, nombre, edad, zona, whatsapp, marca_comercial, programa,
           canal_origen, moneda, activo, estado, estado_actualizado_en, telefono_pais,
           telefono_numero, ultimo_acceso_link, id_cierre_vinculado, eliminado_en, eliminado_por, creado_en)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           consultor_id=excluded.consultor_id, nombre=excluded.nombre, edad=excluded.edad,
           zona=excluded.zona, whatsapp=excluded.whatsapp, marca_comercial=excluded.marca_comercial,
           programa=excluded.programa, canal_origen=excluded.canal_origen, moneda=excluded.moneda,
           activo=excluded.activo, estado=excluded.estado, estado_actualizado_en=excluded.estado_actualizado_en,
           telefono_pais=excluded.telefono_pais, telefono_numero=excluded.telefono_numero,
           id_cierre_vinculado=excluded.id_cierre_vinculado`,
      ).run(
        a.id, a.consultorId, a.nombre, a.edad, a.zona, a.whatsapp, a.marcaComercial, a.programa,
        a.canalOrigen, a.moneda, a.activo ? 1 : 0, a.estado, a.estadoActualizadoEn, a.telefonoPais,
        a.telefonoNumero, a.ultimoAccesoLink, a.idCierreVinculado, a.eliminadoEn, a.eliminadoPor, a.creadoEn,
      );
    },
    async registrarAccesoLink(id, ahoraIso) {
      // Canal propio, fuera del upsert de guardar(): la apertura del link
      // corre en paralelo a cualquier edición de la ficha y no debe pisarse.
      db.prepare('UPDATE alumnos SET ultimo_acceso_link = ? WHERE id = ?').run(ahoraIso, id);
    },
    async eliminar(id, eliminadoEn, eliminadoPor) {
      db.prepare('UPDATE alumnos SET eliminado_en = ?, eliminado_por = ? WHERE id = ? AND eliminado_en IS NULL').run(
        eliminadoEn, eliminadoPor, id,
      );
    },
    async listarEliminados() {
      const rows = db.prepare('SELECT * FROM alumnos WHERE eliminado_en IS NOT NULL ORDER BY eliminado_en DESC').all() as AlumnoRow[];
      return rows.map(toAlumno);
    },
    async obtenerEliminado(id) {
      const row = db.prepare('SELECT * FROM alumnos WHERE id = ? AND eliminado_en IS NOT NULL').get(id) as AlumnoRow | undefined;
      return row ? toAlumno(row) : null;
    },
    async restaurar(id) {
      db.prepare('UPDATE alumnos SET eliminado_en = NULL, eliminado_por = NULL WHERE id = ?').run(id);
    },
    async eliminarDefinitivo(id) {
      // El WHERE exige papelera: nunca se borra físico algo que sigue vivo.
      db.prepare('DELETE FROM alumnos WHERE id = ? AND eliminado_en IS NOT NULL').run(id);
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
interface KrRow { id: string; okr_id: string; orden: number; texto: string; meta: string | null; tipo: string; valor_inicial: number | null; meta_30: number | null; meta_60: number | null; meta_90: number | null; unidad: string | null; direccion: string | null; vencimiento: string | null; cumplido_en: string | null; creado_en: string }
interface AccionRow { id: string; plan_id: string; okr_id: string | null; kr_id: string | null; fase: number; orden: number; texto: string; creado_en: string }
interface CambioFechaRow { id: string; plan_id: string; fecha_anterior: string; fecha_nueva: string; cambiado_por: string; cambiado_en: string; motivo: string | null }

const toKr = (k: KrRow): Kr => ({
  id: k.id, okrId: k.okr_id, orden: k.orden, texto: k.texto, meta: k.meta,
  tipo: k.tipo as Kr['tipo'], valorInicial: k.valor_inicial, meta30: k.meta_30,
  meta60: k.meta_60, meta90: k.meta_90, unidad: k.unidad,
  direccion: k.direccion as Kr['direccion'],
  vencimiento: k.vencimiento, cumplidoEn: k.cumplido_en, creadoEn: k.creado_en,
});

const toCambioFecha = (r: CambioFechaRow): CambioFechaPlan => ({
  id: r.id, planId: r.plan_id, fechaAnterior: r.fecha_anterior, fechaNueva: r.fecha_nueva,
  cambiadoPor: r.cambiado_por, cambiadoEn: r.cambiado_en, motivo: r.motivo,
});

const toPlan = (r: PlanRow): Plan => ({
  id: r.id, alumnoId: r.alumno_id, fechaInicio: r.fecha_inicio,
  etapa: r.etapa, objetivo90d: r.objetivo_90d, version: r.version, creadoEn: r.creado_en,
});

export function crearPlanesRepo(db: Database.Database): PlanesRepo {
  const armarCompleto = (p: PlanRow): PlanCompleto => {
    const okrs = (db.prepare('SELECT * FROM okrs WHERE plan_id = ? ORDER BY orden').all(p.id) as OkrRow[]).map(
      (o): Okr & { krs: Kr[] } => ({
        id: o.id, planId: o.plan_id, orden: o.orden, objetivo: o.objetivo, creadoEn: o.creado_en,
        krs: (db.prepare('SELECT * FROM krs WHERE okr_id = ? ORDER BY orden').all(o.id) as KrRow[]).map(toKr),
      }),
    );
    const acciones = (db.prepare('SELECT * FROM acciones WHERE plan_id = ? ORDER BY fase, orden').all(p.id) as AccionRow[]).map(
      (a): Accion => ({
        id: a.id, planId: a.plan_id, okrId: a.okr_id, krId: a.kr_id, fase: a.fase as Accion['fase'],
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
        db.prepare(
          `INSERT INTO krs (id, okr_id, orden, texto, meta, tipo, valor_inicial, meta_30, meta_60, meta_90, unidad, direccion, vencimiento, cumplido_en, creado_en)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          k.id, k.okrId, k.orden, k.texto, k.meta, k.tipo, k.valorInicial, k.meta30, k.meta60, k.meta90,
          k.unidad, k.direccion, k.vencimiento, k.cumplidoEn, k.creadoEn,
        );
      }
    }
    for (const a of pc.acciones) {
      db.prepare('INSERT INTO acciones (id, plan_id, okr_id, kr_id, fase, orden, texto, creado_en) VALUES (?,?,?,?,?,?,?,?)').run(
        a.id, a.planId, a.okrId, a.krId, a.fase, a.orden, a.texto, a.creadoEn,
      );
    }
  });

  // El cambio de fecha mueve fecha_inicio + vencimientos + historial en UNA
  // transacción: una fecha movida sin sus vencimientos dejaría un cronograma
  // desfasado imposible de detectar a ojo.
  const cambiarFechaTx = db.transaction((c: CambioFechaPlan, deltaDias: number): number => {
    db.prepare('UPDATE planes SET fecha_inicio = ? WHERE id = ?').run(c.fechaNueva, c.planId);
    const r = db.prepare(
      `UPDATE krs SET vencimiento = date(vencimiento, ? || ' days')
       WHERE vencimiento IS NOT NULL
         AND okr_id IN (SELECT id FROM okrs WHERE plan_id = ?)`,
    ).run(String(deltaDias), c.planId);
    db.prepare(
      `INSERT INTO plan_fecha_historial (id, plan_id, fecha_anterior, fecha_nueva, cambiado_por, cambiado_en, motivo)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(c.id, c.planId, c.fechaAnterior, c.fechaNueva, c.cambiadoPor, c.cambiadoEn, c.motivo);
    return r.changes;
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
    async cambiarFechaInicio(cambio) {
      const delta = diasEntre(cambio.fechaAnterior, cambio.fechaNueva);
      return cambiarFechaTx(cambio, delta);
    },
    async listarCambiosFecha(planId) {
      const rows = db
        .prepare('SELECT * FROM plan_fecha_historial WHERE plan_id = ? ORDER BY cambiado_en DESC')
        .all(planId) as CambioFechaRow[];
      return rows.map(toCambioFecha);
    },
    async buscarAccion(accionId) {
      const row = db.prepare(
        `SELECT a.*, p.alumno_id AS ctx_alumno FROM acciones a
         JOIN planes p ON p.id = a.plan_id WHERE a.id = ?`,
      ).get(accionId) as (AccionRow & { ctx_alumno: string }) | undefined;
      if (!row) return null;
      return {
        accion: {
          id: row.id, planId: row.plan_id, okrId: row.okr_id, krId: row.kr_id,
          fase: row.fase as Accion['fase'], orden: row.orden, texto: row.texto, creadoEn: row.creado_en,
        },
        planId: row.plan_id,
        alumnoId: row.ctx_alumno,
      };
    },
    async buscarKr(krId) {
      const row = db.prepare(
        `SELECT k.*, o.plan_id, p.alumno_id FROM krs k
         JOIN okrs o ON o.id = k.okr_id JOIN planes p ON p.id = o.plan_id
         WHERE k.id = ?`,
      ).get(krId) as (KrRow & { plan_id: string; alumno_id: string }) | undefined;
      return row ? { kr: toKr(row), planId: row.plan_id, alumnoId: row.alumno_id } : null;
    },
    async actualizarKr(krId, campos) {
      const set: string[] = [];
      const params: unknown[] = [];
      if (campos.cumplidoEn !== undefined) { set.push('cumplido_en = ?'); params.push(campos.cumplidoEn); }
      if (campos.vencimiento !== undefined) { set.push('vencimiento = ?'); params.push(campos.vencimiento); }
      if (set.length === 0) return;
      db.prepare(`UPDATE krs SET ${set.join(', ')} WHERE id = ?`).run(...params, krId);
    },
  };
}


// ───────────────────────── Seguimiento: tokens y checkins ─────────────────────────

interface SeguimientoRow { token: string; plan_id: string; expira_en: string; revocado_en: string | null; creado_en: string }
interface CheckinRow { id: string; accion_id: string; marcado: number; estado: string | null; nota: string | null; origen: string; usuario_id: string | null; creado_en: string }

const toSeguimiento = (r: SeguimientoRow): TokenSeguimiento => ({
  token: r.token, planId: r.plan_id, expiraEn: r.expira_en, revocadoEn: r.revocado_en, creadoEn: r.creado_en,
});
const toCheckin = (r: CheckinRow): Checkin => ({
  id: r.id, accionId: r.accion_id, marcado: r.marcado === 1,
  estado: r.estado as Checkin['estado'], nota: r.nota,
  origen: r.origen as Checkin['origen'], usuarioId: r.usuario_id, creadoEn: r.creado_en,
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

// ───────────────────────── Contactos ─────────────────────────

interface ContactoRow {
  id: string; alumno_id: string; consultor_id: string; canal: string;
  contactado_en: string; nota: string | null;
}

const toContacto = (r: ContactoRow): Contacto => ({
  id: r.id, alumnoId: r.alumno_id, consultorId: r.consultor_id, canal: r.canal,
  contactadoEn: r.contactado_en, nota: r.nota,
});

export function crearContactosRepo(db: Database.Database): ContactosRepo {
  return {
    async crear(c) {
      // Solo INSERT: el historial de seguimiento no se edita, como los checkins.
      db.prepare('INSERT INTO contactos (id, alumno_id, consultor_id, canal, contactado_en, nota) VALUES (?,?,?,?,?,?)').run(
        c.id, c.alumnoId, c.consultorId, c.canal, c.contactadoEn, c.nota,
      );
    },
    async ultimoDeAlumno(alumnoId) {
      const row = db
        .prepare('SELECT * FROM contactos WHERE alumno_id = ? ORDER BY contactado_en DESC LIMIT 1')
        .get(alumnoId) as ContactoRow | undefined;
      return row ? toContacto(row) : null;
    },
    async listarPorAlumno(alumnoId) {
      const rows = db
        .prepare('SELECT * FROM contactos WHERE alumno_id = ? ORDER BY contactado_en DESC')
        .all(alumnoId) as ContactoRow[];
      return rows.map(toContacto);
    },
  };
}

// ───────────────────────── Documentos del plan ─────────────────────────

interface DocumentoRow {
  id: string; plan_id: string; nombre_archivo: string; mime_type: string;
  tamano_bytes: number; subido_por: string; subido_en: string;
}

const toDocumento = (r: DocumentoRow): PlanDocumento => ({
  id: r.id, planId: r.plan_id, nombreArchivo: r.nombre_archivo, mimeType: r.mime_type,
  tamanoBytes: r.tamano_bytes, subidoPor: r.subido_por, subidoEn: r.subido_en,
});

/** Columnas SIN contenido: los listados no arrastran megabytes de BLOB. */
const COLS_DOCUMENTO = 'id, plan_id, nombre_archivo, mime_type, tamano_bytes, subido_por, subido_en';

export function crearMedicionesRepo(db: Database.Database): MedicionesRepo {
  return {
    async crear(m) {
      // Solo INSERT: una medición jamás pisa a la anterior (append-only).
      db.prepare('INSERT INTO mediciones (id, kr_id, valor, origen, usuario_id, cargado_en) VALUES (?,?,?,?,?,?)').run(
        m.id, m.krId, m.valor, m.origen, m.usuarioId, m.cargadoEn,
      );
    },
    async listarPorKr(krId) {
      const rows = db
        .prepare('SELECT * FROM mediciones WHERE kr_id = ? ORDER BY cargado_en DESC')
        .all(krId) as MedicionRow[];
      return rows.map(toMedicion);
    },
    async listarPorPlan(planId) {
      const rows = db
        .prepare(
          `SELECT m.* FROM mediciones m JOIN krs k ON k.id = m.kr_id
           JOIN okrs o ON o.id = k.okr_id WHERE o.plan_id = ? ORDER BY m.cargado_en DESC`,
        )
        .all(planId) as MedicionRow[];
      return rows.map(toMedicion);
    },
  };
}

interface MedicionRow { id: string; kr_id: string; valor: number; origen: string; usuario_id: string | null; cargado_en: string }

const toMedicion = (r: MedicionRow): Medicion => ({
  id: r.id, krId: r.kr_id, valor: r.valor, origen: r.origen as Medicion['origen'],
  usuarioId: r.usuario_id, cargadoEn: r.cargado_en,
});

export function crearDocumentosRepo(db: Database.Database): DocumentosRepo {
  return {
    async crear(doc, contenido) {
      db.prepare(
        `INSERT INTO plan_documentos (id, plan_id, nombre_archivo, mime_type, contenido, tamano_bytes, subido_por, subido_en)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(doc.id, doc.planId, doc.nombreArchivo, doc.mimeType, Buffer.from(contenido), doc.tamanoBytes, doc.subidoPor, doc.subidoEn);
    },
    async listarPorPlan(planId) {
      const rows = db
        .prepare(`SELECT ${COLS_DOCUMENTO} FROM plan_documentos WHERE plan_id = ? ORDER BY subido_en DESC`)
        .all(planId) as DocumentoRow[];
      return rows.map(toDocumento);
    },
    async obtener(id) {
      const row = db.prepare('SELECT * FROM plan_documentos WHERE id = ?').get(id) as
        | (DocumentoRow & { contenido: Buffer })
        | undefined;
      return row ? { doc: toDocumento(row), contenido: new Uint8Array(row.contenido) } : null;
    },
  };
}

export function crearCheckinsRepo(db: Database.Database): CheckinsRepo {
  return {
    async crear(c) {
      // Solo INSERT: los checkins no se editan ni se borran, a propósito.
      db.prepare('INSERT INTO checkins (id, accion_id, marcado, estado, nota, origen, usuario_id, creado_en) VALUES (?,?,?,?,?,?,?,?)').run(
        c.id, c.accionId, c.marcado ? 1 : 0, c.estado, c.nota, c.origen, c.usuarioId, c.creadoEn,
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
    async buscarCheckin(checkinId) {
      const row = db.prepare(
        `SELECT ch.*, a.plan_id AS ctx_plan, p.alumno_id AS ctx_alumno FROM checkins ch
         JOIN acciones a ON a.id = ch.accion_id
         JOIN planes p ON p.id = a.plan_id WHERE ch.id = ?`,
      ).get(checkinId) as (CheckinRow & { ctx_plan: string; ctx_alumno: string }) | undefined;
      if (!row) return null;
      return { checkin: toCheckin(row), planId: row.ctx_plan, alumnoId: row.ctx_alumno };
    },
  };
}

export function crearNotaResolucionesRepo(db: Database.Database): NotaResolucionesRepo {
  return {
    async crear(r) {
      // Solo INSERT: corregir una resolución es agregar otra (la última gana).
      db.prepare('INSERT INTO nota_resoluciones (id, checkin_id, estado, area, devolucion, usuario_id, creada_en) VALUES (?,?,?,?,?,?,?)').run(
        r.id, r.checkinId, r.estado, r.area, r.devolucion, r.usuarioId, r.creadaEn,
      );
    },
    async listarPorPlan(planId) {
      const rows = db
        .prepare(
          `SELECT nr.* FROM nota_resoluciones nr JOIN checkins ch ON ch.id = nr.checkin_id
           JOIN acciones a ON a.id = ch.accion_id WHERE a.plan_id = ? ORDER BY nr.creada_en DESC`,
        )
        .all(planId) as NotaResolucionRow[];
      return rows.map(toNotaResolucion);
    },
  };
}

interface NotaResolucionRow { id: string; checkin_id: string; estado: string; area: string | null; devolucion: string | null; usuario_id: string; creada_en: string }

const toNotaResolucion = (r: NotaResolucionRow): NotaResolucion => ({
  id: r.id, checkinId: r.checkin_id, estado: r.estado as NotaResolucion['estado'],
  area: r.area, devolucion: r.devolucion, usuarioId: r.usuario_id, creadaEn: r.creada_en,
});

export function crearBitacoraRepo(db: Database.Database): BitacoraRepo {
  return {
    async crear(e) {
      // Solo INSERT: la bitácora es historia y no se corrige, se amplía.
      db.prepare('INSERT INTO bitacora (id, alumno_id, texto, tipo_contacto, traba_actual, usuario_id, creada_en) VALUES (?,?,?,?,?,?,?)').run(
        e.id, e.alumnoId, e.texto, e.tipoContacto, e.trabaActual, e.usuarioId, e.creadaEn,
      );
    },
    async listarPorAlumno(alumnoId) {
      const rows = db.prepare('SELECT * FROM bitacora WHERE alumno_id = ? ORDER BY creada_en DESC').all(alumnoId) as BitacoraRow[];
      return rows.map(toBitacora);
    },
  };
}

interface BitacoraRow { id: string; alumno_id: string; texto: string; tipo_contacto: string; traba_actual: string | null; usuario_id: string; creada_en: string }

const toBitacora = (r: BitacoraRow): EntradaBitacora => ({
  id: r.id, alumnoId: r.alumno_id, texto: r.texto, tipoContacto: r.tipo_contacto,
  trabaActual: r.traba_actual, usuarioId: r.usuario_id, creadaEn: r.creada_en,
});
