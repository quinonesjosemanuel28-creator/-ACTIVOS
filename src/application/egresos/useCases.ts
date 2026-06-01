/**
 * CAPA 2 — APLICACIÓN · Módulo Egresos · Casos de uso.
 * Orquesta dominio + repo. El `tipo` (Directo/Operativo/Extraordinario) se
 * deriva de la categoría (bajo el capó, para el margen del dashboard).
 */
import * as em from '../../domain/egresos/metrics';
import { tipoPorCategoria } from '../../domain/egresos/categorias';
import type { Egreso, Mes } from '../../domain/types';
import type { EgresosAdminRepo } from './ports';
import { egresoInputSchema } from './schemas';

export interface FiltrosEgresos {
  mes?: string; // 'TODOS' | YYYY-MM
  categoria?: string; // 'TODOS' | categoría
  tipo?: string; // 'TODOS' | 'recurrente' | 'puntual'
  moneda?: string; // 'TODOS' | 'USD' | 'ARS'
  q?: string;
}

let seq = 0;
const nuevoId = () => `EG-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function aEgreso(input: ReturnType<typeof egresoInputSchema.parse>): Egreso {
  const mes = input.fecha.slice(0, 7);
  return {
    idEgreso: input.idEgreso ?? nuevoId(),
    fecha: input.fecha,
    mes,
    tipo: tipoPorCategoria(input.categoria),
    categoria: input.categoria,
    concepto: input.concepto,
    montoUsd: input.montoUsd!,
    montoArs: input.montoArs,
    cotizacion: input.cotizacion,
    recurrente: input.recurrente,
    medioPago: input.medioPago,
    comentarios: input.comentarios,
    unidadNegocio: 'ACADEMY',
  };
}

export function crearEgreso(repo: EgresosAdminRepo, input: unknown): Egreso {
  const e = aEgreso(egresoInputSchema.parse(input));
  repo.guardar(e);
  return e;
}

export function editarEgreso(repo: EgresosAdminRepo, id: string, input: unknown): Egreso {
  if (!repo.obtener(id)) throw new Error(`No existe el egreso ${id}.`);
  const e = aEgreso({ ...(egresoInputSchema.parse(input)), idEgreso: id });
  repo.guardar(e);
  return e;
}

export function eliminarEgreso(repo: EgresosAdminRepo, id: string): void {
  if (!repo.obtener(id)) throw new Error(`No existe el egreso ${id}.`);
  repo.eliminar(id);
}

/** Aplica el mes (con proyección de recurrentes) + filtros no-mensuales. */
function aplicarFiltros(egresos: Egreso[], filtros: FiltrosEgresos): Egreso[] {
  let base = egresos;
  if (filtros.mes && filtros.mes !== 'TODOS') base = em.egresosDelMes(base, filtros.mes);
  if (filtros.categoria && filtros.categoria !== 'TODOS') base = base.filter((e) => e.categoria === filtros.categoria);
  if (filtros.tipo === 'recurrente') base = base.filter((e) => e.recurrente);
  else if (filtros.tipo === 'puntual') base = base.filter((e) => !e.recurrente);
  if (filtros.moneda === 'ARS') base = base.filter((e) => e.montoArs !== undefined && e.montoArs !== null);
  if (filtros.q) {
    const q = filtros.q.toLowerCase();
    base = base.filter((e) => (e.concepto ?? '').toLowerCase().includes(q) || e.categoria.toLowerCase().includes(q));
  }
  return base;
}

export function listarEgresos(repo: EgresosAdminRepo, filtros: FiltrosEgresos = {}): Egreso[] {
  return aplicarFiltros(repo.listarTodos(), filtros);
}

/**
 * Resumen del período: total USD/ARS, cotización ponderada, desglose por
 * categoría y separación operativo vs retiros. Toma el mes (proyectado) y
 * respeta q/tipo/moneda, pero NO la categoría (el desglose muestra todas).
 */
export function resumenEgresos(repo: EgresosAdminRepo, mes: Mes | 'TODOS', filtros: FiltrosEgresos = {}): em.ResumenEgresos {
  const set = aplicarFiltros(repo.listarTodos(), { ...filtros, mes, categoria: 'TODOS' });
  return em.resumenEgresos(set);
}
