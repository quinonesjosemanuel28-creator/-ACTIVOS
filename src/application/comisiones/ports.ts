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
  obtener(mes: string): RegistroLiquidacion | null;
  listar(): RegistroLiquidacion[];
  guardar(registro: RegistroLiquidacion): void;
  eliminar(mes: string): void;
}
