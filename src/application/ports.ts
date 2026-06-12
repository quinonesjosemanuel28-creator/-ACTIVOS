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
  listarPorMes(mes: Mes, filtro?: Filtro): Promise<Venta[]>;
  listarTodas(filtro?: Filtro): Promise<Venta[]>;
  insertar(venta: Venta): Promise<void>;
}

export interface CobrosRepo {
  listarPorMes(mes: Mes, filtro?: Filtro): Promise<Cobro[]>;
  listarTodos(filtro?: Filtro): Promise<Cobro[]>;
  insertar(cobro: Cobro): Promise<void>;
}

export interface EgresosRepo {
  listarPorMes(mes: Mes, filtro?: Filtro): Promise<Egreso[]>;
  listarTodos(filtro?: Filtro): Promise<Egreso[]>;
  insertar(egreso: Egreso): Promise<void>;
}

export interface FunnelRepo {
  obtener(mes: Mes, filtro?: Filtro): Promise<FunnelMes>;
  guardar(mes: Mes, funnel: FunnelMes, filtro?: Filtro): Promise<void>;
}

export interface ParametrosRepo {
  obtener(): Promise<Parametros>;
  guardar(parametros: Partial<Parametros>): Promise<void>;
}

export interface CierreMesRepo {
  estado(mes: Mes): Promise<EstadoMes>;
  cerrar(mes: Mes): Promise<void>;
  reabrir(mes: Mes): Promise<void>;
  mesesConDatos(): Promise<Mes[]>;
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
