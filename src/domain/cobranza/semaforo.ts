/**
 * CAPA 3 — DOMINIO · Semáforo de cobranza (puro, testeado).
 *
 * Estado por cuota según los días respecto al vencimiento (atraso = hoy −
 * vencimiento, en días; positivo = vencido):
 *   - verde   "Próximo a vencer": faltan 1–5 días (atraso −5..−1)
 *   - amarillo "Recién vencido":  día 0 (vence hoy) a día 3 de atraso
 *   - naranja "Atrasado":         día 4 a día 8 de atraso
 *   - rojo    "Moroso":           día 9 de atraso en adelante
 *   - null    sin alerta:         faltan más de 5 días (al día)
 * Solo cuotas PENDIENTES entran al semáforo.
 * El color del cierre = el PEOR color entre sus cuotas pendientes.
 */
export type NivelSemaforo = 'verde' | 'amarillo' | 'naranja' | 'rojo';

/** Días entre dos fechas ISO (hasta − desde), en días enteros UTC. */
export function diasEntre(desdeIso: string, hastaIso: string): number {
  const a = new Date(`${desdeIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${hastaIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Nivel del semáforo dado el atraso en días (positivo = vencido). */
export function nivelPorAtraso(atrasoDias: number): NivelSemaforo | null {
  if (atrasoDias >= 9) return 'rojo';
  if (atrasoDias >= 4) return 'naranja'; // 4..8
  if (atrasoDias >= 0) return 'amarillo'; // 0..3 (día 0 = vencido)
  if (atrasoDias >= -5) return 'verde'; // -5..-1 (faltan 1..5 días)
  return null; // a más de 5 días de vencer
}

/** Nivel de una cuota a una fecha de referencia. null si está completa o al día. */
export function nivelCuota(vencimiento: string, completa: boolean, hoy: string): NivelSemaforo | null {
  if (completa) return null;
  return nivelPorAtraso(diasEntre(vencimiento, hoy));
}

const PESO: Record<NivelSemaforo, number> = { rojo: 4, naranja: 3, amarillo: 2, verde: 1 };

/** Peor nivel (más severo) de un conjunto; null si ninguno tiene alerta. */
export function peorNivel(niveles: readonly (NivelSemaforo | null)[]): NivelSemaforo | null {
  let peor: NivelSemaforo | null = null;
  for (const n of niveles) {
    if (n && (peor === null || PESO[n] > PESO[peor])) peor = n;
  }
  return peor;
}
