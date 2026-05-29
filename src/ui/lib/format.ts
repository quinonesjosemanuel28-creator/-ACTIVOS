/**
 * Formateadores de presentación. Regla de gobierno: cualquier métrica
 * `null` (división por cero) se muestra como "—", nunca NaN.
 */
const EM_DASH = '—';

const usdFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdFmtCents = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export function fmtUsd(n: number | null | undefined, cents = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EM_DASH;
  return (cents ? usdFmtCents : usdFmt).format(n);
}

const arsFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** Pesos argentinos (dinero real cobrado). */
export function fmtArs(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EM_DASH;
  return arsFmt.format(n);
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EM_DASH;
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EM_DASH;
  return new Intl.NumberFormat('es-AR').format(n);
}

export function fmtMeses(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EM_DASH;
  return `${n.toFixed(1)} m`;
}

const MES_LABEL = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** "2026-03" → "Mar 2026". */
export function fmtMes(mes: string): string {
  const [y, m] = mes.split('-');
  const idx = Number(m) - 1;
  const label = MES_LABEL[idx] ?? m;
  return `${label!.charAt(0).toUpperCase()}${label!.slice(1)} ${y}`;
}

/** "2026-03" → "Mar" (corto para ejes de gráficos). */
export function fmtMesCorto(mes: string): string {
  const [, m] = mes.split('-');
  const idx = Number(m) - 1;
  const label = MES_LABEL[idx] ?? m;
  return `${label!.charAt(0).toUpperCase()}${label!.slice(1)}`;
}
