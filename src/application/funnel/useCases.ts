/**
 * CAPA 2 — APLICACIÓN · Módulo Funnel.
 *
 * Agendas y shows se cargan por CANAL (Webinar/TikTok/Instagram orgánico);
 * el total del mes = suma de canales. Cerrados se deriva de los cierres reales
 * (no se desglosa por canal). Tasas + valor por reunión + cierres por programa
 * + M/M. No inventa: si no hay carga, todo en 0 y tasas null.
 */
import { cashNuevoArs, cashNuevoUsd, cierresNuevos } from '../../domain/cierres/metrics';
import * as fm from '../../domain/funnel/metrics';
import { CANALES_FUNNEL, CANAL_SIN_ESPECIFICAR } from '../../domain/funnel/canales';
import { variacionMM } from '../../domain/money';
import { z } from 'zod';
import type { Mes } from '../../domain/types';
import type { FunnelRepo } from '../ports';
import type { ReposCierres } from '../cierres/ports';
import type { CanalFila, FunnelCanalRepo } from './ports';

function mesAnterior(mes: Mes): Mes {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const totalDeCanales = (filas: readonly CanalFila[]) => ({
  agendas: filas.reduce((a, f) => a + f.agendas, 0),
  asistieron: filas.reduce((a, f) => a + f.asistieron, 0),
});

/**
 * Filas de canal del mes. Si no hay carga por canal pero la tabla legacy tiene
 * totales (datos previos sin canal), se exponen como "Sin especificar" (sin
 * inventar atribución) hasta que se recarguen por canal.
 */
function canalesDelMes(canalRepo: FunnelCanalRepo, legacy: FunnelRepo, mes: Mes): CanalFila[] {
  const filas = canalRepo.listarPorMes(mes);
  if (filas.length > 0) return filas;
  const t = legacy.obtener(mes);
  if (t.agendas > 0 || t.asistieron > 0) {
    return [{ canal: CANAL_SIN_ESPECIFICAR, agendas: t.agendas, asistieron: t.asistieron }];
  }
  return [];
}

export interface CanalView extends CanalFila {
  tasaShow: number | null;
}

export interface FunnelView {
  mes: Mes;
  agendas: number;
  asistieron: number;
  cerrados: number;
  cargaManual: boolean;
  porCanal: CanalView[];
  tasaShow: number | null;
  tasaCierre: number | null;
  tasaGlobal: number | null;
  varShow: number | null;
  varCierre: number | null;
  varGlobal: number | null;
  cashNuevoUsd: number;
  cashNuevoArs: number;
  valorPorAgendaUsd: number | null;
  valorPorAgendaArs: number | null;
  valorPorShowUsd: number | null;
  valorPorShowArs: number | null;
  cierresPorPrograma: { empresario: number; ceroGestor: number };
}

export function obtenerFunnel(
  reposCierres: ReposCierres,
  canalRepo: FunnelCanalRepo,
  legacy: FunnelRepo,
  mes: Mes,
): FunnelView {
  const cierres = reposCierres.cierres.listar();
  const pagos = reposCierres.pagos.listarTodos();

  const filasCanal = canalesDelMes(canalRepo, legacy, mes);
  const tot = totalDeCanales(filasCanal);
  const f = { agendas: tot.agendas, asistieron: tot.asistieron, cerrados: cierresNuevos(cierres, mes) };

  // Lista por canal: los 3 fijos (en 0 si faltan) + cualquier extra presente
  // (p. ej. "Sin especificar" migrado).
  const porCanal: CanalView[] = [];
  const vistos = new Set<string>();
  for (const canal of CANALES_FUNNEL) {
    const fila = filasCanal.find((c) => c.canal === canal) ?? { canal, agendas: 0, asistieron: 0 };
    vistos.add(canal);
    porCanal.push({ ...fila, tasaShow: fm.tasaShowDe(fila.agendas, fila.asistieron) });
  }
  for (const fila of filasCanal) {
    if (!vistos.has(fila.canal)) porCanal.push({ ...fila, tasaShow: fm.tasaShowDe(fila.agendas, fila.asistieron) });
  }

  const cnUsd = cashNuevoUsd(cierres, pagos, mes);
  const cnArs = cashNuevoArs(cierres, pagos, mes);

  // M/M (totales del mes anterior).
  const prevMes = mesAnterior(mes);
  const prevTot = totalDeCanales(canalesDelMes(canalRepo, legacy, prevMes));
  const prev = { agendas: prevTot.agendas, asistieron: prevTot.asistieron, cerrados: cierresNuevos(cierres, prevMes) };
  const mm = (a: number | null, p: number | null) => (a === null || p === null ? null : variacionMM(a, p));

  const cierresMes = cierres.filter((c) => c.fechaCierre.slice(0, 7) === mes);

  return {
    mes,
    agendas: f.agendas,
    asistieron: f.asistieron,
    cerrados: f.cerrados,
    cargaManual: fm.tieneCargaManual(f),
    porCanal,
    tasaShow: fm.tasaShow(f),
    tasaCierre: fm.tasaCierre(f),
    tasaGlobal: fm.tasaGlobal(f),
    varShow: mm(fm.tasaShow(f), fm.tasaShow(prev)),
    varCierre: mm(fm.tasaCierre(f), fm.tasaCierre(prev)),
    varGlobal: mm(fm.tasaGlobal(f), fm.tasaGlobal(prev)),
    cashNuevoUsd: cnUsd,
    cashNuevoArs: cnArs,
    valorPorAgendaUsd: fm.valorPorAgenda(cnUsd, f.agendas),
    valorPorAgendaArs: fm.valorPorAgenda(cnArs, f.agendas),
    valorPorShowUsd: fm.valorPorShow(cnUsd, f.asistieron),
    valorPorShowArs: fm.valorPorShow(cnArs, f.asistieron),
    cierresPorPrograma: {
      empresario: cierresMes.filter((c) => c.programa === 'Empresario').length,
      ceroGestor: cierresMes.filter((c) => c.programa === 'Cero a Gestor').length,
    },
  };
}

const canalInputSchema = z.object({
  canales: z.array(
    z.object({
      canal: z.enum(CANALES_FUNNEL),
      agendas: z.number().int().nonnegative(),
      asistieron: z.number().int().nonnegative(),
    }),
  ),
});

/** Guarda las agendas/shows por canal del mes. Cerrados nunca se guarda. */
export function guardarFunnelCanales(canalRepo: FunnelCanalRepo, mes: Mes, input: unknown): void {
  const { canales } = canalInputSchema.parse(input);
  canalRepo.guardarMes(mes, canales);
}

/** Total agendas/shows del mes desde canales (con fallback legacy). Para el adaptador. */
export function totalFunnelDelMes(canalRepo: FunnelCanalRepo, legacy: FunnelRepo, mes: Mes) {
  return totalDeCanales(canalesDelMes(canalRepo, legacy, mes));
}

/** Cantidad de cierres nuevos reales del mes (debe igualar "cerrados"). */
export function cerradosReales(reposCierres: ReposCierres, mes: Mes): number {
  return cierresNuevos(reposCierres.cierres.listar(), mes);
}
