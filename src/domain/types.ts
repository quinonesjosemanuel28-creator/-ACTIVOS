/**
 * CAPA 3 — DOMINIO · Tipos del núcleo financiero.
 *
 * TypeScript puro: cero dependencias de React, SQLite o HTTP.
 * Estos tipos son el contrato compartido entre todas las capas.
 *
 * Regla R1: Ventas, Cobros y Caja son lentes distintos del negocio.
 * Por eso son tres entidades separadas y nunca se mezclan en el código.
 */

/** Programa formativo. R8: análisis siempre separable por programa. */
export type Programa = 'Empresario' | 'Gestor';

/** Unidad de negocio del holding. Multi-unidad desde día 1. */
export type UnidadNegocio = 'ACADEMY' | 'LEGAL' | 'TECNOLOGIA';

/** Clasificación del árbol de cuentas de egresos. */
export type TipoEgreso = 'Directo' | 'Operativo' | 'Extraordinario';

/** Mes en formato YYYY-MM (driver maestro, igual que PARAMETROS!B5). */
export type Mes = string;

/** Estado del ciclo de un mes. R6: un mes cerrado se bloquea de edición. */
export type EstadoMes = 'Abierto' | 'Cerrado';

/** VENTAS — una fila por cierre comercial (comprometido, no cobrado). */
export interface Venta {
  idVenta: string;
  fechaVenta: string; // ISO date
  mesVenta: Mes;
  cliente?: string;
  programa: Programa;
  closer?: string;
  setter?: string;
  funnel?: string;
  ticketTotalUsd: number;
  unidadNegocio: UnidadNegocio;
  estado: string;
}

/** COBROS — una fila por cobro efectivo (clave para cohortes). */
export interface Cobro {
  idCobro: string;
  idVentaOrigen?: string;
  fechaCobro: string; // ISO date
  mesCobro: Mes;
  /** Mes de la venta que originó el cobro. Distingue cash nuevo vs cohorte. */
  mesOriginalVenta: Mes;
  montoUsd: number;
  programa: Programa;
  unidadNegocio: UnidadNegocio;
}

/** EGRESOS — árbol de cuentas (Directo / Operativo / Extraordinario). */
export interface Egreso {
  idEgreso: string;
  fecha: string; // ISO date
  mes: Mes;
  tipo: TipoEgreso;
  categoria: string; // Marketing | Herramientas | Comisiones | Estructura | ...
  concepto?: string;
  montoUsd: number;
  programa?: Programa;
  unidadNegocio: UnidadNegocio;
  // Campos del módulo Egresos (opcionales → compatibles con filas previas):
  montoArs?: number;
  cotizacion?: number;
  /** RECURRENTE (se repite cada mes) vs PUNTUAL (pago único). */
  recurrente?: boolean;
  medioPago?: string;
  comentarios?: string;
}

/** Parámetros / centro de control (metas, caja inicial, costos fijos). */
export interface Parametros {
  cajaInicialUsd: number;
  costosFijosMensualesUsd: number;
  metaCashCollectedUsd: number;
  metaMargenOperativo: number; // fracción, ej. 0.25
  topeCacUsd: number; // ej. 350
  metaTasaCierre: number; // fracción, ej. 0.20
  runwayMinimoMeses: number; // ej. 3
}

/** Datos crudos de un mes, ya filtrados (e.g. por unidad/programa). */
export interface DatosMes {
  mes: Mes;
  ventas: Venta[];
  cobros: Cobro[];
  egresos: Egreso[];
}

/** Embudo comercial del mes. */
export interface FunnelMes {
  agendas: number;
  asistieron: number;
  cerrados: number;
}
