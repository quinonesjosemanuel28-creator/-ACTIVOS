/** Fixtures compartidos para los tests del dominio. */
import type { Cobro, DatosMes, Egreso, Venta } from '../types';

export function venta(p: Partial<Venta> = {}): Venta {
  return {
    idVenta: p.idVenta ?? 'v1',
    fechaVenta: p.fechaVenta ?? '2026-01-10',
    mesVenta: p.mesVenta ?? '2026-01',
    cliente: p.cliente ?? 'Cliente',
    programa: p.programa ?? 'Empresario',
    closer: p.closer ?? 'Ana',
    setter: p.setter,
    funnel: p.funnel,
    ticketTotalUsd: p.ticketTotalUsd ?? 1000,
    unidadNegocio: p.unidadNegocio ?? 'ACADEMY',
    estado: p.estado ?? 'Activo',
  };
}

export function cobro(p: Partial<Cobro> = {}): Cobro {
  return {
    idCobro: p.idCobro ?? 'c1',
    idVentaOrigen: p.idVentaOrigen ?? 'v1',
    fechaCobro: p.fechaCobro ?? '2026-01-15',
    mesCobro: p.mesCobro ?? '2026-01',
    mesOriginalVenta: p.mesOriginalVenta ?? '2026-01',
    montoUsd: p.montoUsd ?? 500,
    programa: p.programa ?? 'Empresario',
    unidadNegocio: p.unidadNegocio ?? 'ACADEMY',
  };
}

export function egreso(p: Partial<Egreso> = {}): Egreso {
  return {
    idEgreso: p.idEgreso ?? 'e1',
    fecha: p.fecha ?? '2026-01-05',
    mes: p.mes ?? '2026-01',
    tipo: p.tipo ?? 'Operativo',
    categoria: p.categoria ?? 'Estructura',
    concepto: p.concepto ?? 'gasto',
    montoUsd: p.montoUsd ?? 100,
    programa: p.programa,
    unidadNegocio: p.unidadNegocio ?? 'ACADEMY',
  };
}

export function datosMes(p: Partial<DatosMes> = {}): DatosMes {
  return {
    mes: p.mes ?? '2026-01',
    ventas: p.ventas ?? [],
    cobros: p.cobros ?? [],
    egresos: p.egresos ?? [],
  };
}
