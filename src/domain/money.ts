/**
 * CAPA 3 — DOMINIO · Utilidades numéricas seguras.
 *
 * Manejo de división por cero (regla de gobierno): si el denominador es 0,
 * la métrica devuelve `null` y la UI muestra "—".
 * Cero tolerancia a NaN/Infinity, igual que el Excel exige cero #REF!.
 */

/**
 * División segura. Devuelve `null` cuando el denominador es 0 o cuando
 * cualquiera de los operandos no es finito.
 */
export function safeDiv(numerador: number, denominador: number): number | null {
  if (!Number.isFinite(numerador) || !Number.isFinite(denominador)) return null;
  if (denominador === 0) return null;
  const r = numerador / denominador;
  return Number.isFinite(r) ? r : null;
}

/** Suma robusta de un campo numérico de una colección. */
export function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => {
    const v = pick(item);
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Redondeo a 2 decimales evitando errores de coma flotante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Variación mes a mes (M/M) como fracción. null si el período previo es 0. */
export function variacionMM(actual: number, previo: number): number | null {
  return safeDiv(actual - previo, Math.abs(previo));
}
