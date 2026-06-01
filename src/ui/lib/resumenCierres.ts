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
  cashNuevoUsd: number;
  cohortesUsd: number;
  cashNuevoArs: number;
  cohortesArs: number;
  cierresPorPrograma: { empresario: number; ceroGestor: number };
}

export function resumenDesdeFilas(filas: readonly FilaCierre[]): ResumenCalculado {
  let totalCobradoUsd = 0;
  let totalCobradoArs = 0;
  let usdConArs = 0; // USD solo de pagos que tienen ARS (para la cotización)
  let cantidadPagos = 0;
  let cashNuevoUsd = 0;
  let cohortesUsd = 0;
  let cashNuevoArs = 0;
  let cohortesArs = 0;
  let empresario = 0;
  let ceroGestor = 0;

  for (const fila of filas) {
    const mesCierre = fila.cierre.fechaCierre.slice(0, 7);
    if (fila.cierre.programa === 'Empresario') empresario += 1;
    else if (fila.cierre.programa === 'Cero a Gestor') ceroGestor += 1;

    for (const p of fila.pagos) {
      totalCobradoUsd += p.montoUsd;
      cantidadPagos += 1;
      const ars = p.montoArs ?? 0;
      if (p.montoArs !== undefined && p.montoArs !== null) {
        totalCobradoArs += p.montoArs;
        usdConArs += p.montoUsd;
      }
      // Nuevo si el pago cae en el mismo mes que cerró su cierre; si no, cohorte.
      const esNuevo = p.fechaPago.slice(0, 7) === mesCierre;
      if (esNuevo) { cashNuevoUsd += p.montoUsd; cashNuevoArs += ars; }
      else { cohortesUsd += p.montoUsd; cohortesArs += ars; }
    }
  }

  const cotizacionPonderada = usdConArs > 0 ? totalCobradoArs / usdConArs : null;
  return {
    totalCobradoUsd,
    totalCobradoArs,
    cotizacionPonderada,
    cantidadCierres: filas.length,
    cantidadPagos,
    cashNuevoUsd,
    cohortesUsd,
    cashNuevoArs,
    cohortesArs,
    cierresPorPrograma: { empresario, ceroGestor },
  };
}
