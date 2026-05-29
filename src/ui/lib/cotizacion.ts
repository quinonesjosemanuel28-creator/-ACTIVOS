/**
 * Cálculo en vivo de la triada doble moneda para el formulario de pago.
 * Misma regla que el schema de aplicación: ARS + USD mandan y la cotización
 * se DERIVA; si falta uno y hay cotización, se completa. División por cero
 * o datos insuficientes → cotización null (la UI muestra "—").
 *
 * Función pura → testeable sin React.
 */
export interface TriadaMoneda {
  montoUsd?: number;
  montoArs?: number;
  cotizacion?: number;
}

const finito = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0;

export function derivarMonedas(input: TriadaMoneda): TriadaMoneda {
  const { montoUsd, montoArs, cotizacion } = input;
  if (finito(montoUsd) && finito(montoArs)) {
    return { montoUsd, montoArs, cotizacion: montoArs / montoUsd }; // fuente de verdad
  }
  if (finito(montoUsd) && finito(cotizacion)) {
    return { montoUsd, montoArs: montoUsd * cotizacion, cotizacion };
  }
  if (finito(montoArs) && finito(cotizacion)) {
    return { montoUsd: montoArs / cotizacion, montoArs, cotizacion };
  }
  return { montoUsd, montoArs, cotizacion: undefined };
}
