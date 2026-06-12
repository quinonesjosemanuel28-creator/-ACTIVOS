/** CAPA 2 — APLICACIÓN · Módulo Comisiones · Puerto de liquidaciones. */
export interface RegistroLiquidacion {
  mes: string;
  fechaLiquidacion: string;
  totalArs: number;
  totalUsd: number;
  cotizacion?: number;
  idEgreso: string;
}

export interface LiquidacionRepo {
  obtener(mes: string): Promise<RegistroLiquidacion | null>;
  listar(): Promise<RegistroLiquidacion[]>;
  guardar(registro: RegistroLiquidacion): Promise<void>;
  eliminar(mes: string): Promise<void>;
}
