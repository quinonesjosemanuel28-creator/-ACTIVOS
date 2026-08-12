/**
 * CAPA 2 — APLICACIÓN · Módulo de alumnos · Puertos.
 *
 * La aplicación declara qué necesita de la persistencia; la infraestructura
 * implementa (SQLite y PostgreSQL, espejados).
 *
 * `FiltrosAlumnos.consultorId` es el punto donde aterriza el ámbito por fila
 * del ticket 2: lo llena el caso de uso con `titularSegunAlcance`, y termina
 * siendo un WHERE en la consulta. Es la diferencia entre un permiso de verdad y
 * un botón escondido.
 */
import type { Alumno, Diagnostico, TokenDiagnostico } from '../../domain/alumnos/tipos';
import type { Checkin, PlanCompleto, TokenSeguimiento } from '../../domain/alumnos/plan';

export interface FiltrosAlumnos {
  /**
   * Titular de las filas. Con ámbito acotado lo FUERZA el caso de uso; el
   * cliente no lo elige. Ver `titularSegunAlcance` en el dominio de auth.
   */
  consultorId?: string;
  activo?: boolean;
  /** Búsqueda libre por nombre o marca comercial. */
  q?: string;
}

export interface AlumnosRepo {
  obtener(id: string): Promise<Alumno | null>;
  listar(filtros?: FiltrosAlumnos): Promise<Alumno[]>;
  guardar(alumno: Alumno): Promise<void>; // upsert
}

export interface DiagnosticosRepo {
  obtener(id: string): Promise<Diagnostico | null>;
  /** Todos los envíos del alumno, del más nuevo al más viejo. Nunca se pisan. */
  listarPorAlumno(alumnoId: string): Promise<Diagnostico[]>;
  /** INSERT puro: un envío jamás pisa a otro. */
  guardar(diagnostico: Diagnostico): Promise<void>;
  /**
   * Corrección del consultor sobre una fila EXISTENTE: respuestas, índice y el
   * flag editado_por_consultor. No toca fecha, origen, alumno ni la foto de
   * programa/moneda — la identidad del envío es intocable.
   */
  actualizar(diagnostico: Diagnostico): Promise<void>;
}

export interface TokensRepo {
  obtener(token: string): Promise<TokenDiagnostico | null>;
  crear(token: TokenDiagnostico): Promise<void>;
  /** Consumo del token: un solo uso, y queda apuntando al diagnóstico que generó. */
  marcarUsado(token: string, usadoEn: string, diagnosticoId: string): Promise<void>;
  /** Da de baja los tokens sin usar del alumno (reenviar link invalida el anterior). */
  invalidarPendientes(alumnoId: string, ahoraIso: string): Promise<number>;
}

/** Tramos de asignación alumno ↔ consultor. `hasta = null` = tramo vigente. */
export interface TramoHistorial {
  id: string;
  alumnoId: string;
  consultorId: string;
  desde: string;
  hasta: string | null;
  creadoEn: string;
}

export interface HistorialRepo {
  listarPorAlumno(alumnoId: string): Promise<TramoHistorial[]>;
  abrirTramo(tramo: TramoHistorial): Promise<void>;
  /** Cierra el tramo vigente del alumno (al reasignarlo a otro consultor). */
  cerrarTramoVigente(alumnoId: string, hasta: string): Promise<void>;
}

export interface PlanesRepo {
  /**
   * Guarda el agregado ENTERO en una transacción: plan + okrs + krs +
   * acciones. O entra todo o no entra nada — un plan a medias en la base es
   * peor que ninguno.
   */
  guardarCompleto(pc: PlanCompleto): Promise<void>;
  /** Planes del alumno con todo adentro, del más nuevo al más viejo por fecha_inicio. */
  listarPorAlumno(alumnoId: string): Promise<PlanCompleto[]>;
  obtener(planId: string): Promise<PlanCompleto | null>;
}

export interface SeguimientoTokensRepo {
  obtener(token: string): Promise<TokenSeguimiento | null>;
  /** El token vivo del plan (sin revocar, sin vencer), si hay. */
  vigenteDePlan(planId: string, ahoraIso: string): Promise<TokenSeguimiento | null>;
  crear(t: TokenSeguimiento): Promise<void>;
  /** Da de baja los tokens vivos del plan. Devuelve cuántos revocó. */
  revocarDePlan(planId: string, ahoraIso: string): Promise<number>;
}

export interface CheckinsRepo {
  /** APPEND-ONLY: no hay update ni delete de checkins, a propósito. */
  crear(c: Checkin): Promise<void>;
  /** Todos los checkins de las acciones del plan. */
  listarPorPlan(planId: string): Promise<Checkin[]>;
}

export interface ReposAlumnos {
  alumnos: AlumnosRepo;
  diagnosticos: DiagnosticosRepo;
  tokens: TokensRepo;
  historial: HistorialRepo;
  planes: PlanesRepo;
  seguimiento: SeguimientoTokensRepo;
  checkins: CheckinsRepo;
}
