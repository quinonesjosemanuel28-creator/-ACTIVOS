/**
 * CAPA 4 — INFRAESTRUCTURA · Adaptador "Cierres y Clientes" → Dashboard.
 *
 * Approach A (fuente canónica + adaptador): cierres/pagos son la verdad.
 * Este adaptador los expone con la forma `Venta`/`Cobro` que esperan las
 * fórmulas del dominio legacy, de modo que TODO el dashboard (KPIs,
 * alertas, histórico, funnel, marketing, R8) lea cierres/pagos sin cambiar
 * una sola fórmula. Egresos, funnel, parámetros y cierre_mes siguen del
 * repositorio legacy (el modelo de cierres no los incluye).
 *
 * Mapeos clave:
 *  - programa 'Cero a Gestor' → 'Gestor' (la métrica legacy distingue
 *    Empresario/Gestor).
 *  - Cobro.mesOriginalVenta = mes del cierre origen, para que Cash Nuevo
 *    vs Cohortes siga calculándose igual (R2).
 *  - montoUsd del pago alimenta el cash en USD (los KPIs quedan en USD;
 *    el ARS vive en el módulo Cierres y Clientes).
 */
import type Database from 'better-sqlite3';
import type { Cierre, Pago } from '../../domain/cierres/types';
import type { Cobro, Programa, Venta } from '../../domain/types';
import type { CierreMesRepo, CobrosRepo, Filtro, FunnelRepo, Repositorios, VentasRepo } from '../../application/ports';
import { crearRepositorios } from '../sqlite/repos';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearFunnelCanalRepo } from '../sqlite/funnelCanalRepos';

const mesDe = (fechaIso: string): string => fechaIso.slice(0, 7);

/** El programa del módulo nuevo se proyecta al del dominio legacy. */
export const programaLegacy = (p: Cierre['programa']): Programa =>
  p === 'Cero a Gestor' ? 'Gestor' : 'Empresario';

export function cierreToVenta(c: Cierre): Venta {
  return {
    idVenta: c.idCierre,
    fechaVenta: c.fechaCierre,
    mesVenta: mesDe(c.fechaCierre),
    cliente: c.clienteNombre,
    programa: programaLegacy(c.programa),
    closer: c.closer,
    setter: c.setter,
    funnel: c.funnel,
    ticketTotalUsd: c.ticketTotalUsd,
    unidadNegocio: c.unidadNegocio,
    estado: c.estado,
  };
}

export function pagoToCobro(p: Pago, mesCierre: string, programa: Programa, unidad: Venta['unidadNegocio']): Cobro {
  return {
    idCobro: p.idPago,
    idVentaOrigen: p.idCierre,
    fechaCobro: p.fechaPago,
    mesCobro: mesDe(p.fechaPago),
    mesOriginalVenta: mesCierre,
    montoUsd: p.montoUsd,
    programa,
    unidadNegocio: unidad,
  };
}

const NO_ESCRIBIR = () => {
  throw new Error('Las ventas/cobros se cargan en el módulo "Cierres y Clientes".');
};

/**
 * Repositorios que el dashboard usa para LEER. ventas/cobros vienen de
 * cierres/pagos; el resto, del repo legacy.
 */
export function crearRepositoriosDashboard(db: Database.Database): Repositorios {
  const legacy = crearRepositorios(db);
  const rc = crearReposCierres(db);

  const unidadDe = (f?: Filtro) =>
    f?.unidadNegocio && f.unidadNegocio !== 'CONSOLIDADO' ? f.unidadNegocio : undefined;

  const ventas: VentasRepo = {
    listarPorMes: async (mes, filtro) =>
      (await rc.cierres.listar({ mes, unidadNegocio: unidadDe(filtro) })).map(cierreToVenta),
    listarTodas: async (filtro) =>
      (await rc.cierres.listar({ unidadNegocio: unidadDe(filtro) })).map(cierreToVenta),
    insertar: NO_ESCRIBIR,
  };

  /** Proyecta pagos→Cobro resolviendo programa y mes del cierre origen. */
  const adaptarCobros = async (filtro: Filtro | undefined, pred: (p: Pago) => boolean): Promise<Cobro[]> => {
    const cierres = await rc.cierres.listar({ unidadNegocio: unidadDe(filtro) });
    const info = new Map(cierres.map((c) => [c.idCierre, c]));
    return (await rc.pagos.listarTodos())
      .filter((p) => info.has(p.idCierre) && pred(p))
      .map((p) => {
        const c = info.get(p.idCierre)!;
        return pagoToCobro(p, mesDe(c.fechaCierre), programaLegacy(c.programa), c.unidadNegocio);
      });
  };

  const cobros: CobrosRepo = {
    listarPorMes: (mes, filtro) => adaptarCobros(filtro, (p) => mesDe(p.fechaPago) === mes),
    listarTodos: (filtro) => adaptarCobros(filtro, () => true),
    insertar: NO_ESCRIBIR,
  };

  // El ciclo de cierre de mes (R6) sigue en cierre_mes (legacy); solo se
  // amplían los meses con datos para incluir cierres/pagos.
  const cierre: CierreMesRepo = {
    estado: (mes) => legacy.cierre.estado(mes),
    cerrar: (mes) => legacy.cierre.cerrar(mes),
    reabrir: (mes) => legacy.cierre.reabrir(mes),
    mesesConDatos: async () => {
      const meses = new Set<string>();
      (await rc.cierres.listar()).forEach((c) => meses.add(mesDe(c.fechaCierre)));
      (await rc.pagos.listarTodos()).forEach((p) => meses.add(mesDe(p.fechaPago)));
      (await legacy.egresos.listarTodos()).forEach((e) => meses.add(e.mes));
      return [...meses].sort();
    },
  };

  // Funnel: agendas/shows = suma de canales (funnel_canal), con fallback a los
  // totales legacy ("Sin especificar"); `cerrados` se DERIVA de los cierres
  // reales del mes → coincide con la sección Cierres y corrige el dashboard.
  const canalRepo = crearFunnelCanalRepo(db);
  const funnel: FunnelRepo = {
    obtener: async (mes, filtro) => {
      const filas = await canalRepo.listarPorMes(mes);
      const base = filas.length
        ? { agendas: filas.reduce((a, f) => a + f.agendas, 0), asistieron: filas.reduce((a, f) => a + f.asistieron, 0) }
        : await legacy.funnel.obtener(mes, filtro);
      const cerrados = (await rc.cierres.listar({ mes, unidadNegocio: unidadDe(filtro) })).length;
      return { agendas: base.agendas, asistieron: base.asistieron, cerrados };
    },
    guardar: (mes, f, filtro) => legacy.funnel.guardar(mes, f, filtro),
  };

  return {
    ventas,
    cobros,
    egresos: legacy.egresos,
    funnel,
    parametros: legacy.parametros,
    cierre,
  };
}
