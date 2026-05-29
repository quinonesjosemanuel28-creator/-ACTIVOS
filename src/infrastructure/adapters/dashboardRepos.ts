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
import type { CierreMesRepo, CobrosRepo, Filtro, Repositorios, VentasRepo } from '../../application/ports';
import { crearRepositorios } from '../sqlite/repos';
import { crearReposCierres } from '../sqlite/cierresRepos';

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
    listarPorMes: (mes, filtro) => rc.cierres.listar({ mes, unidadNegocio: unidadDe(filtro) }).map(cierreToVenta),
    listarTodas: (filtro) => rc.cierres.listar({ unidadNegocio: unidadDe(filtro) }).map(cierreToVenta),
    insertar: NO_ESCRIBIR,
  };

  /** Proyecta pagos→Cobro resolviendo programa y mes del cierre origen. */
  const adaptarCobros = (filtro: Filtro | undefined, pred: (p: Pago) => boolean): Cobro[] => {
    const cierres = rc.cierres.listar({ unidadNegocio: unidadDe(filtro) });
    const info = new Map(cierres.map((c) => [c.idCierre, c]));
    return rc.pagos
      .listarTodos()
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
    mesesConDatos: () => {
      const meses = new Set<string>();
      rc.cierres.listar().forEach((c) => meses.add(mesDe(c.fechaCierre)));
      rc.pagos.listarTodos().forEach((p) => meses.add(mesDe(p.fechaPago)));
      legacy.egresos.listarTodos().forEach((e) => meses.add(e.mes));
      return [...meses].sort();
    },
  };

  return {
    ventas,
    cobros,
    egresos: legacy.egresos,
    funnel: legacy.funnel,
    parametros: legacy.parametros,
    cierre,
  };
}
