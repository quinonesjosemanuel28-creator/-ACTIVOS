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
  obtener(idCierre: string): Cierre | null;
  listar(filtros?: FiltrosCierres): Cierre[];
  guardar(cierre: Cierre): void; // upsert
  eliminar(idCierre: string): void; // cascade borra sus pagos
  borrarDemo(): number; // borra solo filas sembradas (prefijo DEMO-); devuelve count
  vaciar(): number; // vacía toda la tabla; devuelve count
}

export interface PagosRepo {
  listarPorCierre(idCierre: string): Pago[];
  listarTodos(): Pago[];
  guardar(pago: Pago): void; // upsert
  eliminar(idPago: string): void;
  borrarDemo(): number;
  vaciar(): number;
}

export interface ReposCierres {
  cierres: CierresRepo;
  pagos: PagosRepo;
}
