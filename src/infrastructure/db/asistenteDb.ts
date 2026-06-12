/**
 * CAPA 4 — INFRAESTRUCTURA · Asistente IA · Despacho por driver.
 *
 * Misma interfaz async para ambos motores; el SEGUNDO CANDADO de solo
 * lectura se preserva en cada implementación (conexión readonly en SQLite,
 * transacción READ ONLY en PostgreSQL).
 */
import { driverConfigurado } from './factory';
import type { TablaInfo } from '../../domain/asistente/esquema';
import * as sqlite from '../sqlite/asistenteDb';
import { extraerEsquemaPg, ejecutarSelectPg } from '../postgres/asistenteDb';
import type { ResultadoConsulta } from '../sqlite/asistenteDb';

export type { ResultadoConsulta };

export async function extraerEsquema(): Promise<TablaInfo[]> {
  return driverConfigurado() === 'postgres' ? extraerEsquemaPg() : sqlite.extraerEsquema();
}

export async function ejecutarSelect(sql: string): Promise<ResultadoConsulta> {
  return driverConfigurado() === 'postgres' ? ejecutarSelectPg(sql) : sqlite.ejecutarSelect(sql);
}
