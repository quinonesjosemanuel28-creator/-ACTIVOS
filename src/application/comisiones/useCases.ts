/**
 * CAPA 2 — APLICACIÓN · Módulo Comisiones · Casos de uso.
 *
 * - obtenerComisiones: deriva del dominio (siempre al día, no se guarda).
 * - liquidarComisiones: registra UNA vez como egreso categoría "Comisiones"
 *   con id determinista COMI-<mes> (anti-duplicado). Re-liquidar requiere
 *   `reemplazar:true` (reemplaza, no suma); sin él, bloquea con aviso.
 */
import { comisionesDelMes, type ComisionesDelMes } from '../../domain/comisiones/calculo';
import { cotizacionPonderada } from '../../domain/cierres/metrics';
import { tipoPorCategoria } from '../../domain/egresos/categorias';
import type { Egreso, Mes } from '../../domain/types';
import type { ReposCierres } from '../cierres/ports';
import type { EgresosAdminRepo } from '../egresos/ports';
import type { LiquidacionRepo, RegistroLiquidacion } from './ports';

const CATEGORIA_COMISIONES = 'Comisiones';
const idEgresoDe = (mes: Mes) => `COMI-${mes}`;
const ultimoDia = (mes: Mes) => `${mes}-28`;

export async function obtenerComisiones(repos: ReposCierres, mes: Mes): Promise<ComisionesDelMes> {
  return comisionesDelMes(await repos.cierres.listar(), await repos.pagos.listarTodos(), mes);
}

export interface EstadoComisiones extends ComisionesDelMes {
  liquidado: boolean;
  liquidacion: RegistroLiquidacion | null;
}

/** Comisiones del mes + estado de liquidación (para la vista). */
export async function obtenerEstado(repos: ReposCierres, liq: LiquidacionRepo, mes: Mes): Promise<EstadoComisiones> {
  const comisiones = await obtenerComisiones(repos, mes);
  const liquidacion = await liq.obtener(mes);
  return { ...comisiones, liquidado: !!liquidacion, liquidacion };
}

export function listarLiquidaciones(liq: LiquidacionRepo): Promise<RegistroLiquidacion[]> {
  return liq.listar();
}

export interface ResultadoLiquidacion {
  mes: Mes;
  totalArs: number;
  totalUsd: number;
  idEgreso: string;
  reemplazado: boolean;
}

/**
 * Liquida las comisiones del mes como egreso "Comisiones". Protección
 * anti-duplicado: id determinista COMI-<mes> (upsert) + registro de estado.
 * Si el mes ya está liquidado y no se pide `reemplazar`, lanza error con aviso.
 */
export async function liquidarComisiones(
  repos: ReposCierres,
  egresosRepo: EgresosAdminRepo,
  liq: LiquidacionRepo,
  mes: Mes,
  opciones: { reemplazar?: boolean } = {},
): Promise<ResultadoLiquidacion> {
  const previa = await liq.obtener(mes);
  if (previa && !opciones.reemplazar) {
    throw new Error(
      `El mes ${mes} ya fue liquidado el ${previa.fechaLiquidacion} por ARS ${Math.round(previa.totalArs)}. ` +
        `Para rehacerlo, confirmá "Re-liquidar" (reemplaza, no suma).`,
    );
  }

  const comisiones = await obtenerComisiones(repos, mes);
  const totalArs = comisiones.totalArs;
  // USD por cotización ponderada del mes (de los pagos cobrados).
  const cotiz = cotizacionPonderada((await repos.pagos.listarTodos()).filter((p) => p.fechaPago.slice(0, 7) === mes));
  const totalUsd = cotiz && cotiz > 0 ? totalArs / cotiz : 0;

  const idEgreso = idEgresoDe(mes);
  const egreso: Egreso = {
    idEgreso, // determinista → INSERT OR REPLACE nunca duplica
    fecha: ultimoDia(mes),
    mes,
    tipo: tipoPorCategoria(CATEGORIA_COMISIONES), // 'Directo'
    categoria: CATEGORIA_COMISIONES,
    concepto: `Liquidación comisiones ${mes}`,
    montoUsd: totalUsd,
    montoArs: totalArs,
    cotizacion: cotiz ?? undefined,
    recurrente: false,
    unidadNegocio: 'ACADEMY',
  };
  await egresosRepo.guardar(egreso);

  await liq.guardar({
    mes,
    fechaLiquidacion: new Date().toISOString().slice(0, 10),
    totalArs,
    totalUsd,
    cotizacion: cotiz ?? undefined,
    idEgreso,
  });

  return { mes, totalArs, totalUsd, idEgreso, reemplazado: !!previa };
}

/** Anula la liquidación de un mes: borra el egreso COMI-<mes> y el registro. */
export async function anularLiquidacion(egresosRepo: EgresosAdminRepo, liq: LiquidacionRepo, mes: Mes): Promise<void> {
  await egresosRepo.eliminar(idEgresoDe(mes));
  await liq.eliminar(mes);
}
