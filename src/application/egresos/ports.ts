/**
 * CAPA 2 — APLICACIÓN · Módulo Egresos · Puerto.
 * Interfaz CRUD que la infraestructura implementa. No toca el EgresosRepo
 * mínimo (listarPorMes/insertar) que ya usa el dashboard.
 */
import type { Egreso } from '../../domain/types';

export interface EgresosAdminRepo {
  obtener(id: string): Promise<Egreso | null>;
  listarTodos(): Promise<Egreso[]>;
  guardar(egreso: Egreso): Promise<void>; // upsert
  eliminar(id: string): Promise<void>;
}
