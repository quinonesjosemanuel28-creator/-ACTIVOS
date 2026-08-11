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
  guardar(diagnostico: Diagnostico): Promise<void>;
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

export interface ReposAlumnos {
  alumnos: AlumnosRepo;
  diagnosticos: DiagnosticosRepo;
  tokens: TokensRepo;
  historial: HistorialRepo;
}
