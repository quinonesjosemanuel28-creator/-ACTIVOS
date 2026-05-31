/**
 * CAPA 2 — APLICACIÓN · Módulo Funnel.
 *
 * Compone la vista del funnel: agendas/shows (carga manual desde funnelRepo)
 * + cerrados DERIVADO de los cierres reales del mes (coincide con la sección
 * Cierres) + tasas + valor por agenda/show (cash nuevo) + cierres por programa
 * + comparación M/M. No inventa: si agendas/shows = 0, las tasas son null.
 */
import { cashNuevoArs, cashNuevoUsd, cierresNuevos } from '../../domain/cierres/metrics';
import * as fm from '../../domain/funnel/metrics';
import { variacionMM } from '../../domain/money';
import type { Mes } from '../../domain/types';
import type { FunnelRepo } from '../ports';
import type { ReposCierres } from '../cierres/ports';
import { funnelInputSchema } from '../schemas';

function mesAnterior(mes: Mes): Mes {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface FunnelView {
  mes: Mes;
  agendas: number;
  asistieron: number;
  cerrados: number; // derivado de cierres reales del mes
  cargaManual: boolean; // false si agendas y shows están en 0 (sin cargar)
  tasaShow: number | null;
  tasaCierre: number | null;
  tasaGlobal: number | null;
  // variación M/M de cada tasa (null si no hay mes anterior comparable)
  varShow: number | null;
  varCierre: number | null;
  varGlobal: number | null;
  // valor por reunión (cash nuevo del mes / agendas, / shows)
  cashNuevoUsd: number;
  cashNuevoArs: number;
  valorPorAgendaUsd: number | null;
  valorPorAgendaArs: number | null;
  valorPorShowUsd: number | null;
  valorPorShowArs: number | null;
  cierresPorPrograma: { empresario: number; ceroGestor: number };
}

function cerradosDelMes(reposCierres: ReposCierres, mes: Mes): number {
  return cierresNuevos(reposCierres.cierres.listar(), mes);
}

export function obtenerFunnel(reposCierres: ReposCierres, funnelRepo: FunnelRepo, mes: Mes): FunnelView {
  const manual = funnelRepo.obtener(mes);
  const cierres = reposCierres.cierres.listar();
  const pagos = reposCierres.pagos.listarTodos();

  const f = { agendas: manual.agendas, asistieron: manual.asistieron, cerrados: cierresNuevos(cierres, mes) };
  const cnUsd = cashNuevoUsd(cierres, pagos, mes);
  const cnArs = cashNuevoArs(cierres, pagos, mes);

  // Mes anterior para M/M.
  const prevMes = mesAnterior(mes);
  const prevManual = funnelRepo.obtener(prevMes);
  const prev = { agendas: prevManual.agendas, asistieron: prevManual.asistieron, cerrados: cierresNuevos(cierres, prevMes) };
  const mm = (actual: number | null, previo: number | null) =>
    actual === null || previo === null ? null : variacionMM(actual, previo);

  const cierresMes = cierres.filter((c) => c.fechaCierre.slice(0, 7) === mes);

  return {
    mes,
    agendas: f.agendas,
    asistieron: f.asistieron,
    cerrados: f.cerrados,
    cargaManual: fm.tieneCargaManual(f),
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

/** Guarda solo agendas/shows (carga manual). Cerrados nunca se guarda. */
export function guardarFunnelManual(funnelRepo: FunnelRepo, mes: Mes, input: unknown): void {
  const f = funnelInputSchema.parse(input);
  funnelRepo.guardar(mes, { agendas: f.agendas, asistieron: f.asistieron, cerrados: 0 });
}

/** Cantidad de cierres nuevos reales del mes (la que debe igualar "cerrados"). */
export function cerradosReales(reposCierres: ReposCierres, mes: Mes): number {
  return cerradosDelMes(reposCierres, mes);
}
