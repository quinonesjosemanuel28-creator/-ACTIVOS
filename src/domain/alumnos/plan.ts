/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · El plan de 90 días.
 *
 * Entidades de la fase 2 del módulo: el plan cargado desde el bloque JSON que
 * emite la skill (CONTRATO-PLAN.md), sus OKRs con KRs, y las acciones por fase
 * que son el checklist del alumno.
 *
 * Decisiones que este modelo fija (ver MODULO-ALUMNOS.md):
 *  - Seguimiento por FASES 30/60/90, no por semanas. Las fechas de cada fase
 *    se DERIVAN de fecha_inicio; no se guardan.
 *  - Cargar un plan nuevo no borra el anterior: el alumno acumula trimestres.
 *    El vigente es el de fecha_inicio más reciente.
 *  - Los tildes (checkins) son append-only: el estado de una acción es su
 *    último checkin, y la historia nunca se pierde.
 */

export interface Plan {
  id: string;
  alumnoId: string;
  /** YYYY-MM-DD. Arranque del trimestre; de acá se derivan las tres fases. */
  fechaInicio: string;
  /** Etapa evolutiva diagnosticada (texto libre de la skill). */
  etapa: string | null;
  /** Objetivo maestro del trimestre (sección 4 del plan). */
  objetivo90d: string | null;
  /** Versión del contrato con el que se cargó el bloque. */
  version: number;
  creadoEn: string;
}

export interface Kr {
  id: string;
  okrId: string;
  orden: number;
  texto: string;
  meta: string | null;
  /**
   * YYYY-MM-DD. El contrato de la skill no trae fechas: lo fija el consultor
   * en el panel. Al mover fecha_inicio, TODOS los vencimientos cargados se
   * desplazan por el mismo delta (el cronograma entero se corre, ticket 7).
   */
  vencimiento: string | null;
  /** No null = cumplido (lo marca el CONSULTOR; alimenta el semáforo de salud). */
  cumplidoEn: string | null;
  creadoEn: string;
}

export interface Okr {
  id: string;
  planId: string;
  orden: number;
  objetivo: string;
  creadoEn: string;
}

export type Fase = 1 | 2 | 3;

export interface Accion {
  id: string;
  planId: string;
  /** OKR al que aporta (para agrupar en el panel). Null = suelta. */
  okrId: string | null;
  /**
   * KR al que aporta (ticket 8): agrupa el checklist del ALUMNO bajo su KR —
   * la tarea con su para qué. Null = va bajo "Otras acciones".
   */
  krId: string | null;
  fase: Fase;
  orden: number;
  texto: string;
  creadoEn: string;
}

export interface Checkin {
  id: string;
  accionId: string;
  /** true = la marcó como hecha; false = la desmarcó. */
  marcado: boolean;
  origen: 'alumno' | 'consultor';
  creadoEn: string;
}

/** El agregado completo, como lo consumen el panel y (después) el link. */
export interface PlanCompleto {
  plan: Plan;
  okrs: (Okr & { krs: Kr[] })[];
  acciones: Accion[];
}

/**
 * Fase del plan que corresponde a una fecha. Puro: recibe el "hoy" para que
 * el borde de fase sea testeable.
 *
 *  - antes de fecha_inicio → 1 (el plan todavía no arrancó: se muestra la 1)
 *  - días 0–29 → 1 · días 30–59 → 2 · días 60+ → 3 (la 3 no "termina": pasado
 *    el día 90 sigue siendo la fase visible, con el plan vencido)
 */
export function faseActual(fechaInicio: string, hoyIso: string): Fase {
  const inicio = Date.parse(`${fechaInicio}T00:00:00Z`);
  const hoy = Date.parse(`${hoyIso.slice(0, 10)}T00:00:00Z`);
  const dias = Math.floor((hoy - inicio) / 86_400_000);
  if (dias < 30) return 1;
  if (dias < 60) return 2;
  return 3;
}

/**
 * ¿El trimestre ya terminó? (día 90 en adelante). La cabecera del link pasa a
 * "Plan finalizado"; las casillas SIGUEN marcables (ticket 8 — lo que se
 * completa tarde también es información para la llamada de cierre).
 */
export function planVencido(fechaInicio: string, hoyIso: string): boolean {
  const inicio = Date.parse(`${fechaInicio}T00:00:00Z`);
  const hoy = Date.parse(`${hoyIso.slice(0, 10)}T00:00:00Z`);
  return Math.floor((hoy - inicio) / 86_400_000) >= 90;
}

/**
 * Cierre estimado del trimestre: fecha_inicio + 90 días. DERIVADA, no se
 * guarda — misma decisión que las fechas de fase: una columna calculada se
 * desactualiza en cuanto la fecha de inicio se edita.
 */
export const DIAS_PLAN = 90;

export function fechaCierreEstimada(fechaInicio: string): string {
  return sumarDias(fechaInicio, DIAS_PLAN);
}

/** Suma días a una fecha YYYY-MM-DD (negativo resta). En UTC, sin sorpresas de huso. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Días entre dos fechas YYYY-MM-DD (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

// ───────────────────────── El documento del plan (ticket 7B) ─────────────────────────

/**
 * Metadatos del .pdf/.docx del plan. El CONTENIDO vive en la base (bytea/BLOB)
 * a propósito: el filesystem de Railway es efímero — un reinicio del
 * contenedor se lleva los archivos — y en la base el documento viaja con el
 * backup sin sumar infraestructura. A este volumen (decenas de docs de pocos
 * MB) rinde perfecto; si algún día son miles, se migra a object storage.
 *
 * Versionado simple: se acumulan por plan, el VIGENTE es el último subido.
 * Subir uno nuevo nunca pisa el anterior — las planificaciones se corrigen y
 * conviene poder ver qué cambió.
 */
export interface PlanDocumento {
  id: string;
  planId: string;
  nombreArchivo: string;
  mimeType: string;
  tamanoBytes: number;
  subidoPor: string;
  subidoEn: string;
}

/** Tipos permitidos: el plan sale de la skill como .docx y se comparte como .pdf. */
export const MIME_PDF = 'application/pdf';
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIMES_DOCUMENTO: readonly string[] = [MIME_PDF, MIME_DOCX] as const;

export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024; // 10 MB

export type MotivoDocumentoInvalido = 'tipo' | 'tamano' | 'vacio';

/** Validación pura del archivo (el borde real es el server, como siempre). */
export function validarDocumento(d: { mimeType: string; tamanoBytes: number }):
  | { valido: true }
  | { valido: false; motivo: MotivoDocumentoInvalido } {
  if (!MIMES_DOCUMENTO.includes(d.mimeType)) return { valido: false, motivo: 'tipo' };
  if (d.tamanoBytes <= 0) return { valido: false, motivo: 'vacio' };
  if (d.tamanoBytes > MAX_BYTES_DOCUMENTO) return { valido: false, motivo: 'tamano' };
  return { valido: true };
}

/**
 * Un cambio de fecha de inicio, auditado. La fecha es el origen del cálculo de
 * fase y salud: moverla sin rastro dejaría un semáforo imposible de explicar.
 */
export interface CambioFechaPlan {
  id: string;
  planId: string;
  fechaAnterior: string;
  fechaNueva: string;
  /** Usuario que la cambió (consultor asignado o ADMIN). */
  cambiadoPor: string;
  cambiadoEn: string;
  motivo: string | null;
}

// ───────────────────────── Link de seguimiento ─────────────────────────

/**
 * La credencial del alumno durante el trimestre. NO es el token del
 * diagnóstico: aquel es de un solo uso y 30 días; este es REUSABLE (vive en la
 * conversación de WhatsApp), dura la lectura del plan completo y es revocable.
 */
export interface TokenSeguimiento {
  token: string;
  planId: string;
  expiraEn: string;
  /** No null = el consultor lo dio de baja (link filtrado, reemplazado…). */
  revocadoEn: string | null;
  creadoEn: string;
}

/**
 * El link se puede LEER más allá del día 90 (la conversación de cierre repasa
 * el resumen final), por eso vive más que el plan: 90 días de trimestre + 30
 * de gracia. Los TILDES igual se bloquean desde el día 90 (planVencido).
 */
export const DIAS_VIGENCIA_LINK = 120;

export type MotivoSeguimientoInvalido = 'inexistente' | 'vencido' | 'revocado';

export function estadoTokenSeguimiento(
  t: TokenSeguimiento | null,
  ahoraIso: string,
): { valido: true } | { valido: false; motivo: MotivoSeguimientoInvalido } {
  if (!t) return { valido: false, motivo: 'inexistente' };
  if (t.revocadoEn !== null) return { valido: false, motivo: 'revocado' };
  if (t.expiraEn <= ahoraIso) return { valido: false, motivo: 'vencido' };
  return { valido: true };
}

// ───────────────────────── Estado del checklist ─────────────────────────

/**
 * Estado actual de cada acción a partir del historial append-only: gana el
 * checkin MÁS NUEVO de cada acción. Puro; los repos entregan los checkins y
 * acá se reduce, igual en el link del alumno y en el panel del consultor.
 */
export function estadoAcciones(checkins: readonly Checkin[]): Map<string, Checkin> {
  const ultimo = new Map<string, Checkin>();
  for (const c of checkins) {
    const previo = ultimo.get(c.accionId);
    if (!previo || c.creadoEn > previo.creadoEn) ultimo.set(c.accionId, c);
  }
  return ultimo;
}

/**
 * Última vez que el ALUMNO movió algo (la señal de ritmo del panel). Los
 * checkins del consultor no cuentan: miden otra cosa.
 */
export function ultimaActividadAlumno(checkins: readonly Checkin[]): string | null {
  let ultima: string | null = null;
  for (const c of checkins) {
    if (c.origen === 'alumno' && (ultima === null || c.creadoEn > ultima)) ultima = c.creadoEn;
  }
  return ultima;
}
