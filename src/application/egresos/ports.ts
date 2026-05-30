/**
 * CAPA 2 — APLICACIÓN · Módulo Egresos · Puerto.
 * Interfaz CRUD que la infraestructura implementa. No toca el EgresosRepo
 * mínimo (listarPorMes/insertar) que ya usa el dashboard.
 */
import type { Egreso } from '../../domain/types';

export interface EgresosAdminRepo {
  obtener(id: string): Egreso | null;
  listarTodos(): Egreso[];
  guardar(egreso: Egreso): void; // upsert
  eliminar(id: string): void;
}
