/**
 * CAPA 2 — APLICACIÓN · Puertos (interfaces).
 *
 * Inversión de dependencias: la aplicación define QUÉ necesita de la
 * persistencia; la infraestructura (CAPA 4) implementa estas interfaces.
 * Así el dominio/aplicación nunca dependen de SQLite directamente.
 */
import type {
  Cobro,
  Egreso,
  EstadoMes,
  FunnelMes,
  Mes,
  Parametros,
  UnidadNegocio,
  Venta,
} from '../domain/types';

/** Filtro común para las consultas (multi-unidad desde día 1). */
export interface Filtro {
  unidadNegocio?: UnidadNegocio | 'CONSOLIDADO';
}

export interface VentasRepo {
  listarPorMes(mes: Mes, filtro?: Filtro): Venta[];
  listarTodas(filtro?: Filtro): Venta[];
  insertar(venta: Venta): void;
}

export interface CobrosRepo {
  listarPorMes(mes: Mes, filtro?: Filtro): Cobro[];
  listarTodos(filtro?: Filtro): Cobro[];
  insertar(cobro: Cobro): void;
}

export interface EgresosRepo {
  listarPorMes(mes: Mes, filtro?: Filtro): Egreso[];
  listarTodos(filtro?: Filtro): Egreso[];
  insertar(egreso: Egreso): void;
}

export interface FunnelRepo {
  obtener(mes: Mes, filtro?: Filtro): FunnelMes;
  guardar(mes: Mes, funnel: FunnelMes, filtro?: Filtro): void;
}

export interface ParametrosRepo {
  obtener(): Parametros;
  guardar(parametros: Partial<Parametros>): void;
}

export interface CierreMesRepo {
  estado(mes: Mes): EstadoMes;
  cerrar(mes: Mes): void;
  reabrir(mes: Mes): void;
  mesesConDatos(): Mes[];
}

/** Conjunto de repositorios que necesita la capa de aplicación. */
export interface Repositorios {
  ventas: VentasRepo;
  cobros: CobrosRepo;
  egresos: EgresosRepo;
  funnel: FunnelRepo;
  parametros: ParametrosRepo;
  cierre: CierreMesRepo;
}
