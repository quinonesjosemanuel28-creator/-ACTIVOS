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
import type { Alumno, Contacto, Diagnostico, TokenDiagnostico } from '../../domain/alumnos/tipos';
import type { CambioFechaPlan, Checkin, Kr, PlanCompleto, PlanDocumento, TokenSeguimiento } from '../../domain/alumnos/plan';
import type { EstadoAlumno } from '../../domain/alumnos/panel';

export interface FiltrosAlumnos {
  /**
   * Titular de las filas. Con ámbito acotado lo FUERZA el caso de uso; el
   * cliente no lo elige. Ver `titularSegunAlcance` en el dominio de auth.
   */
  consultorId?: string;
  activo?: boolean;
  estado?: EstadoAlumno;
  /** Búsqueda libre por nombre o marca comercial. */
  q?: string;
}

/**
 * REGLA del ticket 7: obtener/listar NUNCA devuelven eliminados. El borrado
 * lógico se filtra en la CONSULTA (eliminado_en IS NULL), no en la interfaz —
 * así ningún listado, conteo ni exportación se olvida del filtro. La papelera
 * tiene sus propios métodos, que solo ven eliminados.
 */
export interface AlumnosRepo {
  obtener(id: string): Promise<Alumno | null>;
  listar(filtros?: FiltrosAlumnos): Promise<Alumno[]>;
  guardar(alumno: Alumno): Promise<void>; // upsert
  /**
   * Última APERTURA del link de seguimiento (ticket 8). Canal propio, fuera
   * del upsert: corre en paralelo a cualquier edición de la ficha.
   */
  registrarAccesoLink(id: string, ahoraIso: string): Promise<void>;
  /** Borrado LÓGICO: manda la ficha a la papelera. */
  eliminar(id: string, eliminadoEn: string, eliminadoPor: string): Promise<void>;
  // ── Papelera (solo ADMIN llega acá por ruta) ──
  listarEliminados(): Promise<Alumno[]>;
  obtenerEliminado(id: string): Promise<Alumno | null>;
  restaurar(id: string): Promise<void>;
  /** Borrado FÍSICO, con cascada por FK. Solo actúa sobre filas ya en papelera. */
  eliminarDefinitivo(id: string): Promise<void>;
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
  /**
   * Cambio de fecha de inicio (ticket 7), TRANSACCIONAL: mueve la fecha,
   * desplaza los vencimientos cargados de los KRs por el delta entre fechas y
   * deja el rastro en plan_fecha_historial — o todo o nada. Devuelve cuántos
   * KRs se desplazaron.
   */
  cambiarFechaInicio(cambio: CambioFechaPlan): Promise<number>;
  listarCambiosFecha(planId: string): Promise<CambioFechaPlan[]>;
  /** KR con su contexto (plan y alumno), para bajar el ámbito hasta la fila. */
  buscarKr(krId: string): Promise<{ kr: Kr; planId: string; alumnoId: string } | null>;
  /** Cumplimiento y/o vencimiento de un KR. `undefined` = no tocar ese campo. */
  actualizarKr(krId: string, campos: { cumplidoEn?: string | null; vencimiento?: string | null }): Promise<void>;
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

/**
 * Documentos del plan (ticket 7B). Los LISTADOS devuelven solo metadatos: el
 * contenido (hasta 10 MB por doc) viaja únicamente cuando se pide UN
 * documento. Sin update ni delete: las versiones se acumulan, el vigente es
 * el último subido.
 */
export interface DocumentosRepo {
  crear(doc: PlanDocumento, contenido: Uint8Array): Promise<void>;
  /** Metadatos, del más nuevo al más viejo (el primero es el vigente). */
  listarPorPlan(planId: string): Promise<PlanDocumento[]>;
  obtener(id: string): Promise<{ doc: PlanDocumento; contenido: Uint8Array } | null>;
}

/**
 * Registro de contacto (ticket 7C). APPEND-ONLY como los checkins: la
 * historia de seguimiento no se edita ni se borra.
 */
export interface ContactosRepo {
  crear(c: Contacto): Promise<void>;
  /** El contacto más reciente del alumno (el que apaga la alerta). */
  ultimoDeAlumno(alumnoId: string): Promise<Contacto | null>;
  /** Historial completo, del más nuevo al más viejo. */
  listarPorAlumno(alumnoId: string): Promise<Contacto[]>;
}

export interface ReposAlumnos {
  alumnos: AlumnosRepo;
  diagnosticos: DiagnosticosRepo;
  tokens: TokensRepo;
  historial: HistorialRepo;
  planes: PlanesRepo;
  seguimiento: SeguimientoTokensRepo;
  checkins: CheckinsRepo;
  documentos: DocumentosRepo;
  contactos: ContactosRepo;
}
