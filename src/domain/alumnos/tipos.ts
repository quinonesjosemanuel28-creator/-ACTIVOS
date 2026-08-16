/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Entidades y catálogo de campos.
 *
 * Los nombres de los campos de respuesta son CONTRATO con la skill
 * `plan-okr-90-dias`, que consume el diagnóstico exportado fuera de la app.
 * Renombrar uno acá sin renombrarlo allá rompe la generación del plan. Por eso
 * viven en una lista única (`CAMPOS_RESPUESTA`) de la que se derivan el SQL de
 * los dos motores y el esquema Zod: un solo lugar donde tocarlos, y ningún
 * lugar donde puedan quedar desalineados en silencio.
 *
 * Convención de nombres: el sobre va en camelCase como el resto del repo
 * (`alumnoId`, `indiceClaridad`), pero las RESPUESTAS conservan el snake_case
 * del formulario tal cual — son el contrato, y traducirlas de ida y vuelta solo
 * agregaría un lugar más donde equivocarse.
 */

// ───────────────────────── Alumno (bloque 0 del formulario) ─────────────────────────

import type { EstadoAlumno } from './panel';

export interface Alumno {
  id: string;
  /** Consultor asignado. De acá sale TODO filtro de ámbito por fila. */
  consultorId: string;
  nombre: string;
  edad: number | null;
  zona: string | null;
  whatsapp: string | null;
  marcaComercial: string | null;
  programa: string;
  canalOrigen: string | null;
  /**
   * Moneda de todos los montos de sus diagnósticos (ISO 4217). Sin ella, un
   * promedio de cohorte suma pesos con colones.
   */
  moneda: string;
  activo: boolean;
  /** Ciclo de vida en la consultoría (ticket 7). Gobierna semáforo y alertas. */
  estado: EstadoAlumno;
  estadoActualizadoEn: string | null;
  /**
   * Teléfono normalizado (ticket 7C): código de país sin '+' y número solo
   * dígitos. El `whatsapp` libre de arriba queda como estaba (lo escribió el
   * alumno); ESTOS dos campos son los que arman el link de wa.me.
   */
  telefonoPais: string | null;
  telefonoNumero: string | null;
  /** Vínculo suelto con el contable. Sin FK a propósito: no es navegable. */
  idCierreVinculado: string | null;
  /**
   * Borrado LÓGICO (ticket 7). No null = está en la papelera: desaparece de
   * todo listado, conteo y exportación; solo ADMIN la ve y puede restaurar.
   */
  eliminadoEn: string | null;
  eliminadoPor: string | null;
  creadoEn: string;
}

// ───────────────────────── Diagnóstico ─────────────────────────

export type OrigenDiagnostico = 'alumno' | 'consultor';

/**
 * Respuestas del formulario, con los nombres del contrato. Laxo a propósito:
 * el tipado fuerte de cada campo lo pone Zod en el borde (CAPA 2), que es
 * donde entra el dato crudo del alumno.
 */
export interface RespuestasDiagnostico {
  [campo: string]: string | number | boolean | null | undefined;
}

export interface Diagnostico {
  id: string;
  alumnoId: string;
  fecha: string;
  /** Quién lo cargó. Un diagnóstico editado en la llamada no es uno del alumno. */
  origen: OrigenDiagnostico;
  editadoPorConsultor: boolean;
  /**
   * `programa` y `moneda` se FOTOGRAFÍAN acá al enviar. La ficha del alumno es
   * editable (replanificación, cambio de país); sin la foto, un diagnóstico
   * viejo se releería con la moneda nueva y los números mentirían.
   */
  programa: string;
  moneda: string;
  indiceClaridad: number | null;
  metricasAplicables: number;
  metricasRespondidas: number;
  respuestas: RespuestasDiagnostico;
  creadoEn: string;
}

// ───────────────────────── Registro de contacto (ticket 7C) ─────────────────────────

/**
 * Un contacto del consultor con el alumno, registrado ANTES de abrir el link
 * de WhatsApp. Es lo que apaga la alerta de inactividad: "ya le escribí ayer,
 * no me lo sigas gritando". El canal es opción de negocio (hoy solo
 * WhatsApp), se valida en Zod — sin CHECK, como programa o moneda.
 */
export interface Contacto {
  id: string;
  alumnoId: string;
  consultorId: string;
  canal: string;
  contactadoEn: string;
  nota: string | null;
}

// ───────────────────────── Token del formulario público ─────────────────────────

export interface TokenDiagnostico {
  token: string;
  alumnoId: string;
  expiraEn: string;
  /** Fecha de uso. No null = ya se consumió: un token es de UN SOLO uso. */
  usadoEn: string | null;
  /** Diagnóstico que generó al canjearse. */
  diagnosticoId: string | null;
  creadoEn: string;
}

/** Días que vive un link de diagnóstico antes de vencer. */
export const DIAS_VIGENCIA_TOKEN = 30;

/** Por qué un token no sirve. El server traduce a respuesta HTTP. */
export type MotivoTokenInvalido = 'inexistente' | 'vencido' | 'usado';

/**
 * Valida un token contra el reloj. Puro: recibe el "ahora" en vez de leerlo,
 * para que el vencimiento sea testeable sin esperar 30 días.
 */
export function estadoToken(
  token: TokenDiagnostico | null,
  ahoraIso: string,
): { valido: true } | { valido: false; motivo: MotivoTokenInvalido } {
  if (!token) return { valido: false, motivo: 'inexistente' };
  if (token.usadoEn !== null) return { valido: false, motivo: 'usado' };
  if (token.expiraEn <= ahoraIso) return { valido: false, motivo: 'vencido' };
  return { valido: true };
}

// ───────────────────────── Catálogo de campos de respuesta ─────────────────────────

/**
 * Las 45 respuestas que viven en `diagnosticos`, en orden de formulario
 * (bloques 1 a 8). Las 7 del bloque 0 no están acá: son la ficha del alumno.
 * 45 + 7 = las 52 preguntas de la especificación.
 */
export const CAMPOS_RESPUESTA = [
  // Bloque 1 — Diagnóstico general
  'antiguedad_meses',
  'tipo_dedicacion',
  'objetivo_6m',
  'vision_negocio',
  'bloqueo_principal',
  // Bloque 2 — Capital y rentabilidad
  'capital_colocado',
  'origen_capital',
  'costo_capital_mensual',
  'capital_disponible',
  'recupero_mensual',
  'separacion_dinero',
  'ganancia_mensual',
  'retiro_mensual',
  'gastos_operativos',
  // Bloque 3 — Clientes y cartera
  'clientes_activos',
  'clientes_nuevos_mes',
  'ticket_promedio',
  'estructura_plazos',
  'plazo_promedio_meses',
  'perfil_cliente',
  'recurrencia',
  // Bloque 4 — Precio y condiciones
  'tasa_declarada',
  'ejemplo_total_100k',
  'punitorio',
  'tasa_competencia',
  // Bloque 5 — Aprobación y riesgo
  'documentacion_solicitada',
  'firma_documentacion',
  'porcentaje_documentado',
  'criterio_monto',
  'criterios_aprobacion',
  'herramienta_consulta',
  'politica_garantias',
  // Bloque 6 — Cobranza y mora
  'mora_clientes',
  'monto_en_mora',
  'proceso_cobranza',
  'descripcion_cobranza',
  'dificultad_cobranza',
  // Bloque 7 — Procesos, ventas y escala
  'sistema_registro',
  'canales_captacion',
  'equipo',
  'situacion_fiscal',
  'unidad_ventas',
  'prioridad_declarada',
  // Bloque 8 — Proyección
  // Las tres metas a 90 días son INTENCIONES, no mediciones: no llevan casilla
  // y quedan FUERA del índice de claridad (que mide cuánto sabe el alumno de su
  // negocio hoy, sobre 19 métricas duras). Meterlas ahí cambiaría el
  // denominador y el índice dejaría de ser comparable contra el de los 90 días,
  // que es la métrica de resultado del programa.
  'meta_clientes_90d',
  'meta_capital_90d',
  'meta_ganancia_90d',
  'vision_12m',
  'freno_percibido',
] as const;

export type CampoRespuesta = (typeof CAMPOS_RESPUESTA)[number];

/**
 * Multi-selección. Se guardan como JSON dentro de una columna TEXT, no como
 * JSONB: el espejo SQLite/PostgreSQL exige el mismo tipo de columna en los dos
 * motores, y SQLite no tiene JSONB.
 */
export const CAMPOS_MULTI: readonly CampoRespuesta[] = [
  'perfil_cliente',
  'documentacion_solicitada',
  'sistema_registro',
  'canales_captacion',
  'prioridad_declarada',
] as const;

export function esCampoMulti(campo: string): boolean {
  return (CAMPOS_MULTI as readonly string[]).includes(campo);
}
