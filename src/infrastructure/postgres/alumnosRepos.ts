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

export function crearAlumnosRepoPg(pool: Pool): AlumnosRepo {
  return {
    async obtener(id) {
      // eliminado_en IS NULL en la CONSULTA: una ficha en papelera no existe
      // para el módulo (ni ficha, ni token público, ni exportación).
      const r = await pool.query('SELECT * FROM alumnos WHERE id = $1 AND eliminado_en IS NULL', [id]);
      const row = r.rows[0] as AlumnoRow | undefined;
      return row ? toAlumno(row) : null;
    },
    async listar(filtros = {}) {
      const where: string[] = ['eliminado_en IS NULL'];
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
      if (filtros.estado) {
        params.push(filtros.estado);
        where.push(`estado = ${n()}`);
      }
      if (filtros.q) {
        params.push(`%${filtros.q.toLowerCase()}%`);
        where.push(`(LOWER(nombre) LIKE ${n()} OR LOWER(COALESCE(marca_comercial, id)) LIKE ${n()})`);
      }
      const sql = `SELECT * FROM alumnos WHERE ${where.join(' AND ')} ORDER BY nombre`;
      const r = await pool.query(sql, params);
      return (r.rows as AlumnoRow[]).map(toAlumno);
    },
    async guardar(a) {
      await pool.query(
        `INSERT INTO alumnos
          (id, consultor_id, nombre, edad, zona, whatsapp, marca_comercial, programa,
           canal_origen, moneda, activo, estado, estado_actualizado_en, telefono_pais,
           telefono_numero, ultimo_acceso_link, id_cierre_vinculado, eliminado_en, eliminado_por, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO UPDATE SET
           consultor_id=EXCLUDED.consultor_id, nombre=EXCLUDED.nombre, edad=EXCLUDED.edad,
           zona=EXCLUDED.zona, whatsapp=EXCLUDED.whatsapp, marca_comercial=EXCLUDED.marca_comercial,
           programa=EXCLUDED.programa, canal_origen=EXCLUDED.canal_origen, moneda=EXCLUDED.moneda,
           activo=EXCLUDED.activo, estado=EXCLUDED.estado, estado_actualizado_en=EXCLUDED.estado_actualizado_en,
           telefono_pais=EXCLUDED.telefono_pais, telefono_numero=EXCLUDED.telefono_numero,
           id_cierre_vinculado=EXCLUDED.id_cierre_vinculado`,
        [
          a.id, a.consultorId, a.nombre, a.edad, a.zona, a.whatsapp, a.marcaComercial, a.programa,
          a.canalOrigen, a.moneda, a.activo ? 1 : 0, a.estado, a.estadoActualizadoEn, a.telefonoPais,
          a.telefonoNumero, a.ultimoAccesoLink, a.idCierreVinculado, a.eliminadoEn, a.eliminadoPor, a.creadoEn,
        ],
      );
    },
    async registrarAccesoLink(id, ahoraIso) {
      // Canal propio, fuera del upsert de guardar(): la apertura del link
      // corre en paralelo a cualquier edición de la ficha y no debe pisarse.
      await pool.query('UPDATE alumnos SET ultimo_acceso_link = $1 WHERE id = $2', [ahoraIso, id]);
    },
    async eliminar(id, eliminadoEn, eliminadoPor) {
      await pool.query('UPDATE alumnos SET eliminado_en = $1, eliminado_por = $2 WHERE id = $3 AND eliminado_en IS NULL', [
        eliminadoEn, eliminadoPor, id,
      ]);
    },
    async listarEliminados() {
      const r = await pool.query('SELECT * FROM alumnos WHERE eliminado_en IS NOT NULL ORDER BY eliminado_en DESC');
      return (r.rows as AlumnoRow[]).map(toAlumno);
    },
    async obtenerEliminado(id) {
      const r = await pool.query('SELECT * FROM alumnos WHERE id = $1 AND eliminado_en IS NOT NULL', [id]);
      const row = r.rows[0] as AlumnoRow | undefined;
      return row ? toAlumno(row) : null;
    },
    async restaurar(id) {
      await pool.query('UPDATE alumnos SET eliminado_en = NULL, eliminado_por = NULL WHERE id = $1', [id]);
    },
    async eliminarDefinitivo(id) {
      // El WHERE exige papelera: nunca se borra físico algo que sigue vivo.
      await pool.query('DELETE FROM alumnos WHERE id = $1 AND eliminado_en IS NOT NULL', [id]);
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
    async actualizar(d) {
      // Corrección del consultor: SOLO respuestas, índice y el flag — la
      // identidad del envío no aparece en el SET (espejo del repo SQLite).
      const columnas = ['editado_por_consultor', 'indice_claridad', 'metricas_aplicables', 'metricas_respondidas', ...COLUMNAS_RESPUESTA];
      const set = columnas.map((c, i) => `${c} = $${i + 1}`);
      await pool.query(`UPDATE diagnosticos SET ${set.join(', ')} WHERE id = $${columnas.length + 1}`, [
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
      ]);
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

export function crearPlanesRepoPg(pool: Pool): PlanesRepo {
  const armarCompleto = async (p: PlanRow): Promise<PlanCompleto> => {
    const okrRows = (await pool.query('SELECT * FROM okrs WHERE plan_id = $1 ORDER BY orden', [p.id])).rows as OkrRow[];
    const okrs: (Okr & { krs: Kr[] })[] = [];
    for (const o of okrRows) {
      const krRows = (await pool.query('SELECT * FROM krs WHERE okr_id = $1 ORDER BY orden', [o.id])).rows as KrRow[];
      okrs.push({
        id: o.id, planId: o.plan_id, orden: o.orden, objetivo: o.objetivo, creadoEn: o.creado_en,
        krs: krRows.map(toKr),
      });
    }
    const accionRows = (await pool.query('SELECT * FROM acciones WHERE plan_id = $1 ORDER BY fase, orden', [p.id])).rows as AccionRow[];
    const acciones = accionRows.map((a): Accion => ({
      id: a.id, planId: a.plan_id, okrId: a.okr_id, krId: a.kr_id, fase: a.fase as Accion['fase'],
      orden: a.orden, texto: a.texto, creadoEn: a.creado_en,
    }));
    return { plan: toPlan(p), okrs, acciones };
  };

  return {
    async guardarCompleto(pc) {
      // Transacción explícita: o entra el agregado entero o no entra nada.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO planes (id, alumno_id, fecha_inicio, etapa, objetivo_90d, version, creado_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [pc.plan.id, pc.plan.alumnoId, pc.plan.fechaInicio, pc.plan.etapa, pc.plan.objetivo90d, pc.plan.version, pc.plan.creadoEn],
        );
        for (const o of pc.okrs) {
          await client.query('INSERT INTO okrs (id, plan_id, orden, objetivo, creado_en) VALUES ($1,$2,$3,$4,$5)',
            [o.id, o.planId, o.orden, o.objetivo, o.creadoEn]);
          for (const k of o.krs) {
            await client.query(
              `INSERT INTO krs (id, okr_id, orden, texto, meta, tipo, valor_inicial, meta_30, meta_60, meta_90, unidad, direccion, vencimiento, cumplido_en, creado_en)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [k.id, k.okrId, k.orden, k.texto, k.meta, k.tipo, k.valorInicial, k.meta30, k.meta60, k.meta90,
               k.unidad, k.direccion, k.vencimiento, k.cumplidoEn, k.creadoEn]);
          }
        }
        for (const a of pc.acciones) {
          await client.query('INSERT INTO acciones (id, plan_id, okr_id, kr_id, fase, orden, texto, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [a.id, a.planId, a.okrId, a.krId, a.fase, a.orden, a.texto, a.creadoEn]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async listarPorAlumno(alumnoId) {
      const rows = (await pool.query(
        'SELECT * FROM planes WHERE alumno_id = $1 ORDER BY fecha_inicio DESC, creado_en DESC', [alumnoId],
      )).rows as PlanRow[];
      const out: PlanCompleto[] = [];
      for (const r of rows) out.push(await armarCompleto(r));
      return out;
    },
    async obtener(planId) {
      const r = await pool.query('SELECT * FROM planes WHERE id = $1', [planId]);
      const row = r.rows[0] as PlanRow | undefined;
      return row ? armarCompleto(row) : null;
    },
    async cambiarFechaInicio(cambio) {
      // Fecha + vencimientos + historial en UNA transacción: una fecha movida
      // sin sus vencimientos dejaría un cronograma desfasado.
      const delta = diasEntre(cambio.fechaAnterior, cambio.fechaNueva);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE planes SET fecha_inicio = $1 WHERE id = $2', [cambio.fechaNueva, cambio.planId]);
        const r = await client.query(
          `UPDATE krs SET vencimiento = to_char(vencimiento::date + $1::int, 'YYYY-MM-DD')
           WHERE vencimiento IS NOT NULL
             AND okr_id IN (SELECT id FROM okrs WHERE plan_id = $2)`,
          [delta, cambio.planId],
        );
        await client.query(
          `INSERT INTO plan_fecha_historial (id, plan_id, fecha_anterior, fecha_nueva, cambiado_por, cambiado_en, motivo)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [cambio.id, cambio.planId, cambio.fechaAnterior, cambio.fechaNueva, cambio.cambiadoPor, cambio.cambiadoEn, cambio.motivo],
        );
        await client.query('COMMIT');
        return r.rowCount ?? 0;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async listarCambiosFecha(planId) {
      const r = await pool.query('SELECT * FROM plan_fecha_historial WHERE plan_id = $1 ORDER BY cambiado_en DESC', [planId]);
      return (r.rows as CambioFechaRow[]).map(toCambioFecha);
    },
    async buscarKr(krId) {
      const r = await pool.query(
        `SELECT k.*, o.plan_id, p.alumno_id FROM krs k
         JOIN okrs o ON o.id = k.okr_id JOIN planes p ON p.id = o.plan_id
         WHERE k.id = $1`,
        [krId],
      );
      const row = r.rows[0] as (KrRow & { plan_id: string; alumno_id: string }) | undefined;
      return row ? { kr: toKr(row), planId: row.plan_id, alumnoId: row.alumno_id } : null;
    },
    async actualizarKr(krId, campos) {
      const set: string[] = [];
      const params: unknown[] = [];
      if (campos.cumplidoEn !== undefined) { params.push(campos.cumplidoEn); set.push(`cumplido_en = $${params.length}`); }
      if (campos.vencimiento !== undefined) { params.push(campos.vencimiento); set.push(`vencimiento = $${params.length}`); }
      if (set.length === 0) return;
      params.push(krId);
      await pool.query(`UPDATE krs SET ${set.join(', ')} WHERE id = $${params.length}`, params);
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

export function crearSeguimientoRepoPg(pool: Pool): SeguimientoTokensRepo {
  return {
    async obtener(token) {
      const r = await pool.query('SELECT * FROM seguimiento_tokens WHERE token = $1', [token]);
      const row = r.rows[0] as SeguimientoRow | undefined;
      return row ? toSeguimiento(row) : null;
    },
    async vigenteDePlan(planId, ahoraIso) {
      const r = await pool.query(
        'SELECT * FROM seguimiento_tokens WHERE plan_id = $1 AND revocado_en IS NULL AND expira_en > $2 ORDER BY creado_en DESC LIMIT 1',
        [planId, ahoraIso],
      );
      const row = r.rows[0] as SeguimientoRow | undefined;
      return row ? toSeguimiento(row) : null;
    },
    async crear(t) {
      await pool.query('INSERT INTO seguimiento_tokens (token, plan_id, expira_en, revocado_en, creado_en) VALUES ($1,$2,$3,$4,$5)', [
        t.token, t.planId, t.expiraEn, t.revocadoEn, t.creadoEn,
      ]);
    },
    async revocarDePlan(planId, ahoraIso) {
      const r = await pool.query('UPDATE seguimiento_tokens SET revocado_en = $1 WHERE plan_id = $2 AND revocado_en IS NULL', [
        ahoraIso, planId,
      ]);
      return r.rowCount ?? 0;
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

export function crearContactosRepoPg(pool: Pool): ContactosRepo {
  return {
    async crear(c) {
      // Solo INSERT: el historial de seguimiento no se edita, como los checkins.
      await pool.query('INSERT INTO contactos (id, alumno_id, consultor_id, canal, contactado_en, nota) VALUES ($1,$2,$3,$4,$5,$6)', [
        c.id, c.alumnoId, c.consultorId, c.canal, c.contactadoEn, c.nota,
      ]);
    },
    async ultimoDeAlumno(alumnoId) {
      const r = await pool.query('SELECT * FROM contactos WHERE alumno_id = $1 ORDER BY contactado_en DESC LIMIT 1', [alumnoId]);
      const row = r.rows[0] as ContactoRow | undefined;
      return row ? toContacto(row) : null;
    },
    async listarPorAlumno(alumnoId) {
      const r = await pool.query('SELECT * FROM contactos WHERE alumno_id = $1 ORDER BY contactado_en DESC', [alumnoId]);
      return (r.rows as ContactoRow[]).map(toContacto);
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

/** Columnas SIN contenido: los listados no arrastran megabytes de BYTEA. */
const COLS_DOCUMENTO = 'id, plan_id, nombre_archivo, mime_type, tamano_bytes, subido_por, subido_en';

export function crearMedicionesRepoPg(pool: Pool): MedicionesRepo {
  return {
    async crear(m) {
      // Solo INSERT: una medición jamás pisa a la anterior (append-only).
      await pool.query('INSERT INTO mediciones (id, kr_id, valor, origen, usuario_id, cargado_en) VALUES ($1,$2,$3,$4,$5,$6)', [
        m.id, m.krId, m.valor, m.origen, m.usuarioId, m.cargadoEn,
      ]);
    },
    async listarPorKr(krId) {
      const r = await pool.query('SELECT * FROM mediciones WHERE kr_id = $1 ORDER BY cargado_en DESC', [krId]);
      return (r.rows as MedicionRow[]).map(toMedicion);
    },
    async listarPorPlan(planId) {
      const r = await pool.query(
        `SELECT m.* FROM mediciones m JOIN krs k ON k.id = m.kr_id
         JOIN okrs o ON o.id = k.okr_id WHERE o.plan_id = $1 ORDER BY m.cargado_en DESC`,
        [planId],
      );
      return (r.rows as MedicionRow[]).map(toMedicion);
    },
  };
}

interface MedicionRow { id: string; kr_id: string; valor: number; origen: string; usuario_id: string | null; cargado_en: string }

const toMedicion = (r: MedicionRow): Medicion => ({
  id: r.id, krId: r.kr_id, valor: r.valor, origen: r.origen as Medicion['origen'],
  usuarioId: r.usuario_id, cargadoEn: r.cargado_en,
});

export function crearDocumentosRepoPg(pool: Pool): DocumentosRepo {
  return {
    async crear(doc, contenido) {
      await pool.query(
        `INSERT INTO plan_documentos (id, plan_id, nombre_archivo, mime_type, contenido, tamano_bytes, subido_por, subido_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [doc.id, doc.planId, doc.nombreArchivo, doc.mimeType, Buffer.from(contenido), doc.tamanoBytes, doc.subidoPor, doc.subidoEn],
      );
    },
    async listarPorPlan(planId) {
      const r = await pool.query(`SELECT ${COLS_DOCUMENTO} FROM plan_documentos WHERE plan_id = $1 ORDER BY subido_en DESC`, [planId]);
      return (r.rows as DocumentoRow[]).map(toDocumento);
    },
    async obtener(id) {
      const r = await pool.query('SELECT * FROM plan_documentos WHERE id = $1', [id]);
      const row = r.rows[0] as (DocumentoRow & { contenido: Buffer }) | undefined;
      return row ? { doc: toDocumento(row), contenido: new Uint8Array(row.contenido) } : null;
    },
  };
}

export function crearCheckinsRepoPg(pool: Pool): CheckinsRepo {
  return {
    async crear(c) {
      // Solo INSERT: los checkins no se editan ni se borran, a propósito.
      await pool.query('INSERT INTO checkins (id, accion_id, marcado, estado, nota, origen, usuario_id, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        c.id, c.accionId, c.marcado ? 1 : 0, c.estado, c.nota, c.origen, c.usuarioId, c.creadoEn,
      ]);
    },
    async listarPorPlan(planId) {
      const r = await pool.query(
        `SELECT ch.* FROM checkins ch JOIN acciones a ON a.id = ch.accion_id
         WHERE a.plan_id = $1 ORDER BY ch.creado_en DESC`,
        [planId],
      );
      return (r.rows as CheckinRow[]).map(toCheckin);
    },
  };
}
