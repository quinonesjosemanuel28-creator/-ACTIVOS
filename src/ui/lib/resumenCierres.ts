/**
 * Resumen del período calculado en cliente a partir de las filas del
 * listado (modo "Todos los meses"). Para un mes puntual se usa el endpoint
 * resumen/:mes del backend (que incluye cohortes de meses previos).
 *
 * Función pura → testeable. División por cero → cotización null ("—").
 */
import type { FilaCierre } from './api';

export interface ResumenCalculado {
  totalCobradoUsd: number;
  totalCobradoArs: number;
  cotizacionPonderada: number | null;
  cantidadCierres: number;
  cantidadPagos: number;
}

export function resumenDesdeFilas(filas: readonly FilaCierre[]): ResumenCalculado {
  let totalCobradoUsd = 0;
  let totalCobradoArs = 0;
  let usdConArs = 0; // USD solo de pagos que tienen ARS (para la cotización)
  let cantidadPagos = 0;

  for (const fila of filas) {
    for (const p of fila.pagos) {
      totalCobradoUsd += p.montoUsd;
      cantidadPagos += 1;
      if (p.montoArs !== undefined && p.montoArs !== null) {
        totalCobradoArs += p.montoArs;
        usdConArs += p.montoUsd;
      }
    }
  }

  const cotizacionPonderada = usdConArs > 0 ? totalCobradoArs / usdConArs : null;
  return {
    totalCobradoUsd,
    totalCobradoArs,
    cotizacionPonderada,
    cantidadCierres: filas.length,
    cantidadPagos,
  };
}
