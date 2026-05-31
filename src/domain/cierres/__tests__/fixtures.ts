/** Fixtures del módulo Cierres y Clientes. */
import type { Cierre, Pago } from '../types';

export function cierre(p: Partial<Cierre> = {}): Cierre {
  return {
    idCierre: p.idCierre ?? 'CL1',
    fechaCierre: p.fechaCierre ?? '2026-03-05',
    clienteNombre: p.clienteNombre ?? 'Cliente Demo',
    clienteMail: p.clienteMail,
    clienteTelefono: p.clienteTelefono,
    programa: p.programa ?? 'Empresario',
    ticketTotalUsd: p.ticketTotalUsd ?? 3000,
    closer: p.closer ?? 'Ana',
    setter: p.setter ?? 'Diego',
    funnel: p.funnel ?? 'IG Ads',
    referido: p.referido,
    comentarios: p.comentarios,
    unidadNegocio: p.unidadNegocio ?? 'ACADEMY',
    estado: p.estado ?? 'Activo',
    revisar: p.revisar,
    cantidadCuotas: p.cantidadCuotas,
    montoCuotaUsd: p.montoCuotaUsd,
  };
}

export function pago(p: Partial<Pago> = {}): Pago {
  return {
    idPago: p.idPago ?? 'PG1',
    idCierre: p.idCierre ?? 'CL1',
    fechaPago: p.fechaPago ?? '2026-03-10',
    horaPago: p.horaPago,
    montoUsd: p.montoUsd ?? 1000,
    montoArs: p.montoArs,
    cotizacion: p.cotizacion,
    tipoPago: p.tipoPago ?? 'Cuota',
    numeroCuota: p.numeroCuota,
    medioPago: p.medioPago ?? 'Transferencia Lemon',
    comprobanteUrl: p.comprobanteUrl,
    comentarios: p.comentarios,
    closer: p.closer,
    aplicaSetting: p.aplicaSetting,
    setter: p.setter,
  };
}
