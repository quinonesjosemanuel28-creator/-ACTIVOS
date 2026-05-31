/**
 * CAPA 3 — DOMINIO · Módulo "Cierres y Clientes" · Tipos.
 *
 * Modelo canónico del negocio Academy: el cierre (venta/cliente) tiene
 * muchos pagos. El negocio cierra en USD pero cobra en ARS a la cotización
 * del día de cada pago; por eso `monto_ars` y `cotizacion` son de primer
 * nivel en cada pago (base futura para comisiones sobre ARS cobrado).
 *
 * TypeScript puro: cero dependencias de React, SQLite o HTTP.
 */
import type { UnidadNegocio } from '../types';

/** Programa del cierre (nomenclatura del módulo nuevo). */
export type ProgramaCierre = 'Cero a Gestor' | 'Empresario';

export type EstadoCierre = 'Activo' | 'No continúa';

export type TipoPago = 'Reserva/Seña' | 'Cuota' | 'Pago Completo';

export type MedioPago =
  | 'Transferencia Lemon'
  | 'Transferencia BBVA'
  | 'Transferencia MP'
  | 'CRYPTO'
  | 'Hotmart'
  | 'Dólares'
  | 'Otro';

/** CIERRES — la venta / cliente. Comprometido total en USD. */
export interface Cierre {
  idCierre: string;
  fechaCierre: string; // ISO date YYYY-MM-DD
  clienteNombre: string;
  clienteMail?: string;
  clienteTelefono?: string;
  programa: ProgramaCierre;
  ticketTotalUsd: number;
  closer?: string;
  setter?: string;
  funnel?: string;
  referido?: string;
  comentarios?: string;
  unidadNegocio: UnidadNegocio;
  estado: EstadoCierre;
  /** Si tiene texto, el cierre se muestra con badge "⚠ Revisar" (dato a completar). */
  revisar?: string;
  /**
   * Plan de cuotas (solo ventas nuevas). 1–4. Si falta, el cierre es legacy/
   * saldado y queda FUERA del sistema de cobranza/morosidad.
   */
  cantidadCuotas?: number;
  /** Monto de cada cuota en USD = ticketTotalUsd / cantidadCuotas. */
  montoCuotaUsd?: number;
  /** Vencimiento de la cuota 1. Si está, el calendario es mensual fijo. */
  fechaPrimeraCuota?: string;
}

/**
 * PAGOS — cada transacción de cobro. Doble moneda:
 * `montoUsd` es el equivalente comprometido y `montoArs` el dinero REAL
 * cobrado; `cotizacion = montoArs / montoUsd` es el dólar de ESE pago.
 * `montoArs`/`cotizacion` pueden faltar en datos migrados antiguos (→ "—").
 */
export interface Pago {
  idPago: string;
  idCierre: string;
  fechaPago: string; // ISO date YYYY-MM-DD
  horaPago?: string;
  montoUsd: number;
  montoArs?: number;
  cotizacion?: number;
  tipoPago: TipoPago;
  numeroCuota?: string; // "1/2", "2/3"
  medioPago: MedioPago;
  comprobanteUrl?: string;
  comentarios?: string;
  /** Closer que cobró ESTE pago. Si falta, hereda el closer del cierre. */
  closer?: string;
  /** Si true, este pago genera comisión de setting (2%). Manual, por pago. */
  aplicaSetting?: boolean;
  /** Setter que cobra el 2%. Si falta, hereda el setter del cierre. */
  setter?: string;
}

/** Estado de saldo de un cierre, para el badge del listado. */
export type EstadoSaldo = 'saldado' | 'parcial' | 'solo-seña' | 'sin-pagos';

/** Cierre con sus pagos asociados (agregado de lectura). */
export interface CierreConPagos {
  cierre: Cierre;
  pagos: Pago[];
}
