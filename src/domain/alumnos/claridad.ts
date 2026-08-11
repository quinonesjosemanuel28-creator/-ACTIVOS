/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Índice de claridad (puro, testeado).
 *
 * Mide qué porcentaje de las métricas DURAS del diagnóstico el alumno contestó
 * con un dato, sobre las que le aplican:
 *
 *     indice_claridad = (respondidas / aplicables) × 100
 *
 * No mide cuánto gana el alumno: mide cuánto SABE de su propio negocio. Le
 * dice al consultor, antes de la llamada, si va a una consultoría de estrategia
 * o a una de ordenamiento básico. Repetido a los 90 días, la diferencia entre
 * los dos índices es la prueba más limpia de que el alumno se profesionalizó.
 *
 * Dos decisiones que NO son arbitrarias:
 *
 *  - **Las que no aplican no van en el denominador.** Si el capital es propio,
 *    no saber cuánto cuesta el capital de terceros no es falta de claridad: es
 *    una pregunta que no le corresponde. Meterla bajaría el índice de gente que
 *    sí mide.
 *  - **Sin ninguna respondida el índice es `null`, nunca `0`.** Cero significa
 *    "midió y le dio cero", que es otra cosa. Un formulario vacío no es un
 *    alumno con claridad cero: es un alumno del que todavía no sabemos nada.
 */

/**
 * Las 19 métricas duras: las únicas preguntas del formulario que llevan la
 * casilla "No lo tengo claro". Incluye las 3 de texto del bloque 4
 * (`tasa_declarada`, `punitorio`, `tasa_competencia`): la respuesta es texto,
 * pero el dato es duro igual — o lo sabe o no lo sabe.
 *
 * El orden es el del formulario (bloques 2 → 6): así el listado de faltantes
 * le sale al consultor en el mismo orden en que va a preguntarlas.
 */
export type MetricaClaridad =
  // Bloque 2 — Capital y rentabilidad
  | 'capital_colocado'
  | 'costo_capital_mensual'
  | 'capital_disponible'
  | 'recupero_mensual'
  | 'ganancia_mensual'
  | 'retiro_mensual'
  | 'gastos_operativos'
  // Bloque 3 — Clientes y cartera
  | 'clientes_activos'
  | 'clientes_nuevos_mes'
  | 'ticket_promedio'
  | 'plazo_promedio_meses'
  | 'recurrencia'
  // Bloque 4 — Precio y condiciones
  | 'tasa_declarada'
  | 'ejemplo_total_100k'
  | 'punitorio'
  | 'tasa_competencia'
  // Bloque 5 — Aprobación y riesgo
  | 'porcentaje_documentado'
  // Bloque 6 — Cobranza y mora
  | 'mora_clientes'
  | 'monto_en_mora';

export const METRICAS_CLARIDAD: readonly MetricaClaridad[] = [
  'capital_colocado',
  'costo_capital_mensual',
  'capital_disponible',
  'recupero_mensual',
  'ganancia_mensual',
  'retiro_mensual',
  'gastos_operativos',
  'clientes_activos',
  'clientes_nuevos_mes',
  'ticket_promedio',
  'plazo_promedio_meses',
  'recurrencia',
  'tasa_declarada',
  'ejemplo_total_100k',
  'punitorio',
  'tasa_competencia',
  'porcentaje_documentado',
  'mora_clientes',
  'monto_en_mora',
] as const;

/**
 * Lo que el cálculo necesita leer del diagnóstico: el valor de cada métrica,
 * su par `_sin_dato`, y las dos respuestas de opción que condicionan
 * aplicabilidad. Deliberadamente laxo — el tipo completo de las 52 preguntas
 * vive en la capa de aplicación (Zod); el dominio no debería tener que
 * conocerlo entero para contar 19 casilleros.
 */
export interface RespuestasClaridad {
  readonly [campo: string]: unknown;
}

/** Sufijo del par booleano de cada métrica. Contrato con la skill: no renombrar. */
export const SUFIJO_SIN_DATO = '_sin_dato';

/**
 * Reglas de aplicabilidad. Una métrica que no aplica sale del denominador y
 * NO cuenta como faltante.
 *
 * Son las dos preguntas del formulario redactadas como condicionales ("si
 * trabajás con capital de terceros…", "si firmás…"). El resto le aplica a todo
 * el mundo.
 */
const NO_APLICA_SI: Partial<Record<MetricaClaridad, (r: RespuestasClaridad) => boolean>> = {
  // 2.3 — sin capital de terceros no hay costo de capital que conocer.
  costo_capital_mensual: (r) => r.origen_capital === 'Propio',
  // 5.3 — quien presta de palabra no documenta ninguna operación.
  porcentaje_documentado: (r) => r.firma_documentacion === 'No, presto de palabra',
};

/** ¿Esta métrica le corresponde al alumno, según lo que ya respondió? */
export function aplica(metrica: MetricaClaridad, respuestas: RespuestasClaridad): boolean {
  const excluye = NO_APLICA_SI[metrica];
  return excluye ? !excluye(respuestas) : true;
}

/**
 * ¿La métrica está respondida CON UN DATO?
 *
 * Marcar la casilla la deja sin responder aunque haya quedado un valor cargado:
 * el alumno declaró que no lo sabe y esa declaración manda. Y un texto en
 * blanco (o solo espacios) no es una respuesta.
 */
export function respondida(metrica: MetricaClaridad, respuestas: RespuestasClaridad): boolean {
  if (respuestas[`${metrica}${SUFIJO_SIN_DATO}`] === true) return false;
  const valor = respuestas[metrica];
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  if (typeof valor === 'number') return Number.isFinite(valor);
  return false;
}

export interface ResultadoClaridad {
  /**
   * Entero 0–100, o `null` cuando no hay nada que promediar: ninguna métrica
   * respondida, o ninguna aplicable. Nunca `0` por formulario vacío.
   */
  indice: number | null;
  /** Denominador: métricas que le corresponden a este alumno. */
  aplicables: number;
  /** Numerador: de esas, cuántas contestó con un dato. */
  respondidas: number;
  /**
   * Las aplicables que quedaron sin dato, en orden de formulario. Es el listado
   * que ve el consultor en la ficha y el que arma la sección 12 del plan de 90
   * días ("información pendiente para afinar el plan").
   */
  faltantes: MetricaClaridad[];
}

/**
 * Calcula el índice de claridad de un diagnóstico. Se corre al enviar el
 * formulario y el resultado se guarda en la fila (los tres campos), para que la
 * ficha no tenga que recalcularlo ni dependa de la versión del código que la
 * lea: un diagnóstico viejo conserva el índice con el que se lo leyó siempre.
 */
export function calcularClaridad(respuestas: RespuestasClaridad): ResultadoClaridad {
  const aplicables = METRICAS_CLARIDAD.filter((m) => aplica(m, respuestas));
  const faltantes = aplicables.filter((m) => !respondida(m, respuestas));
  const respondidas = aplicables.length - faltantes.length;

  return {
    indice: aplicables.length === 0 || respondidas === 0 ? null : Math.round((respondidas / aplicables.length) * 100),
    aplicables: aplicables.length,
    respondidas,
    faltantes,
  };
}

/** Escala de lectura para el consultor (qué consultoría dar). */
export type NivelClaridad = 'no_mide' | 'parcial' | 'conoce' | 'tablero';

/**
 * Traduce el índice a la escala del documento. `null` (sin datos) no es un
 * nivel: no se puede leer lo que no se midió.
 */
export function nivelClaridad(indice: number | null): NivelClaridad | null {
  if (indice === null) return null;
  if (indice <= 30) return 'no_mide';
  if (indice <= 60) return 'parcial';
  if (indice <= 85) return 'conoce';
  return 'tablero';
}
