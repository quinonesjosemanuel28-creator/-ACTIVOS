/**
 * CAPA 3 — DOMINIO · Marketing · Decisión de cumplimiento de objetivo.
 *
 * Puro y testeable. El gauge pinta verde si cumple el objetivo (editable),
 * rojo si no. No calcula CAC/ROAS/MER (eso sale de los datos reales): solo
 * compara el valor real contra la referencia (objetivo del usuario).
 */
export function cumpleObjetivo(
  valor: number | null,
  referencia: number,
  menorEsMejor = false,
): boolean {
  if (valor === null || !Number.isFinite(valor)) return false;
  return menorEsMejor ? valor <= referencia : valor >= referencia;
}
