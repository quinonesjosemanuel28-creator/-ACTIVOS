/**
 * CAPA 3 — DOMINIO · Categorías de egresos (8 fijas) + clasificación.
 *
 * "Retiros de socios" es una categoría especial de DISTRIBUCIÓN (reparto de
 * utilidades), no un gasto operativo: debe poder excluirse del costo operativo.
 *
 * Comisiones es por ahora carga manual (la automatización desde cierres es
 * etapa 2, NO se implementa acá).
 */
import type { TipoEgreso } from '../types';

export const CATEGORIAS_EGRESO = [
  'Gastos fijos',
  'Sueldos',
  'Gastos variables',
  'Comisiones',
  'Marketing y publicidad',
  'Honorarios profesionales',
  'Infraestructura y tecnología',
  'Retiros de socios',
] as const;

export type CategoriaEgreso = (typeof CATEGORIAS_EGRESO)[number];

/** La categoría especial de distribución (no es costo operativo). */
export const CATEGORIA_DISTRIBUCION: CategoriaEgreso = 'Retiros de socios';

export function esCategoriaEgreso(v: string): v is CategoriaEgreso {
  return (CATEGORIAS_EGRESO as readonly string[]).includes(v);
}

/** ¿La categoría es distribución (reparto de utilidades), no gasto operativo? */
export function esDistribucion(categoria: string): boolean {
  return categoria === CATEGORIA_DISTRIBUCION;
}

/**
 * Tipo contable (Directo/Operativo/Extraordinario) derivado de la categoría.
 * Se mantiene "bajo el capó" para no romper el margen de contribución del
 * dashboard (que usa tipo === 'Directo').
 */
const TIPO_POR_CATEGORIA: Record<CategoriaEgreso, TipoEgreso> = {
  'Gastos fijos': 'Operativo',
  Sueldos: 'Operativo',
  'Gastos variables': 'Operativo',
  Comisiones: 'Directo',
  'Marketing y publicidad': 'Directo',
  'Honorarios profesionales': 'Operativo',
  'Infraestructura y tecnología': 'Operativo',
  'Retiros de socios': 'Extraordinario',
};

export function tipoPorCategoria(categoria: string): TipoEgreso {
  return esCategoriaEgreso(categoria) ? TIPO_POR_CATEGORIA[categoria] : 'Operativo';
}
