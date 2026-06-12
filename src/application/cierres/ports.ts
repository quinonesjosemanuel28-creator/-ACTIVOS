/**
 * CAPA 2 — APLICACIÓN · Módulo "Cierres y Clientes" · Puertos.
 *
 * La aplicación define qué necesita de la persistencia; la infraestructura
 * (CAPA 4) implementa estas interfaces (inversión de dependencias).
 */
import type { Cierre, Pago } from '../../domain/cierres/types';
import type { Mes } from '../../domain/types';

/** Filtros del listado de cierres. */
export interface FiltrosCierres {
  /** Mes del cierre (YYYY-MM) por fecha_cierre. */
  mes?: Mes;
  programa?: 'Cero a Gestor' | 'Empresario';
  closer?: string;
  estado?: 'Activo' | 'No continúa';
  /** Búsqueda libre en nombre o mail del cliente. */
  q?: string;
  unidadNegocio?: string;
}

export interface CierresRepo {
  obtener(idCierre: string): Promise<Cierre | null>;
  listar(filtros?: FiltrosCierres): Promise<Cierre[]>;
  guardar(cierre: Cierre): Promise<void>; // upsert
  eliminar(idCierre: string): Promise<void>; // cascade borra sus pagos
  borrarDemo(): Promise<number>; // borra solo filas sembradas (prefijo DEMO-); devuelve count
  vaciar(): Promise<number>; // vacía toda la tabla; devuelve count
}

export interface PagosRepo {
  listarPorCierre(idCierre: string): Promise<Pago[]>;
  listarTodos(): Promise<Pago[]>;
  guardar(pago: Pago): Promise<void>; // upsert
  eliminar(idPago: string): Promise<void>;
  borrarDemo(): Promise<number>;
  vaciar(): Promise<number>;
}

export interface ReposCierres {
  cierres: CierresRepo;
  pagos: PagosRepo;
}
