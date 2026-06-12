/** CAPA 2 — APLICACIÓN · Módulo Funnel · Puerto del desglose por canal. */
export interface CanalFila {
  canal: string;
  agendas: number;
  asistieron: number;
}

export interface FunnelCanalRepo {
  listarPorMes(mes: string): Promise<CanalFila[]>;
  /** Upsert de las filas de canal de un mes. */
  guardarMes(mes: string, filas: CanalFila[]): Promise<void>;
  vaciar(): Promise<number>;
}
