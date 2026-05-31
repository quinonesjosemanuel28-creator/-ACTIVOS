/**
 * CAPA 2 — APLICACIÓN · Módulo "Cierres y Clientes" · Casos de uso.
 *
 * Orquestan el dominio doble moneda + los repositorios. Sin reglas de
 * negocio propias: las fórmulas viven en src/domain/cierres/metrics.ts.
 */
import * as cm from '../../domain/cierres/metrics';
import type { Cierre, CierreConPagos, EstadoSaldo, Pago } from '../../domain/cierres/types';
import type { Mes } from '../../domain/types';
import type { FiltrosCierres, ReposCierres } from './ports';
import { cierreInputSchema, importPayloadSchema, pagoInputSchema, resetConfirmSchema } from './schemas';

// ───────────────────────── Lectura ─────────────────────────

/** Fila del listado: el cierre + sus pagos + métricas derivadas. */
export interface FilaCierre {
  cierre: Cierre;
  pagos: Pago[];
  pagadoUsd: number;
  pagadoArs: number;
  pendienteUsd: number;
  estadoSaldo: EstadoSaldo;
}

export function listarCierresConPagos(repos: ReposCierres, filtros?: FiltrosCierres): FilaCierre[] {
  const cierres = repos.cierres.listar(filtros);
  const todos = repos.pagos.listarTodos();
  return cierres.map((cierre) => {
    const pagos = todos.filter((p) => p.idCierre === cierre.idCierre);
    return {
      cierre,
      pagos,
      pagadoUsd: cm.totalPagadoUsd(cierre.idCierre, pagos),
      pagadoArs: cm.totalPagadoArs(cierre.idCierre, pagos),
      pendienteUsd: cm.pendienteUsd(cierre, pagos),
      estadoSaldo: cm.estadoSaldo(cierre, pagos),
    };
  });
}

export interface ResumenMes {
  mes: Mes;
  totalCobradoUsd: number;
  totalCobradoArs: number;
  cotizacionPonderada: number | null;
  cantidadCierres: number;
  cantidadPagos: number;
  // Desglose del cash (misma definición que la Vista Ejecutiva: un pago es
  // "nuevo" si su cierre cerró en el mismo mes; si no, es cohorte).
  cashNuevoUsd: number;
  cohortesUsd: number;
  cashNuevoArs: number;
  cohortesArs: number;
  // Cierres nuevos del período por programa.
  cierresPorPrograma: { empresario: number; ceroGestor: number };
}

/**
 * Resumen del período (barra superior del listado). PAGO-CÉNTRICO: suma los
 * pagos del mes atribuyéndolos por el closer DEL PAGO (efectivo = pago.closer
 * ?? cierre.closer). Regla de negocio: quien cobra se lleva el crédito.
 *
 * - programa/estado/q filtran a nivel cierre (el cierre del pago debe matchear).
 * - closer filtra a nivel pago (efectivo), no por el closer del cierre. Por eso
 *   un cobro de Ayrton sobre un cierre cuya venta cerró Julian suma a Ayrton.
 * - Sin filtro de closer, el total del mes es el cash real del mes (cohortes
 *   incluidos) y coincide con el total sin filtrar.
 */
export function resumenDelMes(repos: ReposCierres, mes: Mes, filtros?: FiltrosCierres): ResumenMes {
  // Cierres que matchean los filtros de cierre (programa/estado/q), sin filtro de mes.
  const cierresMatch = repos.cierres.listar({
    programa: filtros?.programa,
    estado: filtros?.estado,
    q: filtros?.q,
    unidadNegocio: filtros?.unidadNegocio,
  });
  const cierrePorId = new Map(cierresMatch.map((c) => [c.idCierre, c]));

  const closerFiltro = filtros?.closer;
  const pagosMes = cm.pagosDelMes(repos.pagos.listarTodos(), mes).filter((p) => {
    const cierre = cierrePorId.get(p.idCierre);
    if (!cierre) return false; // el cierre no matchea programa/estado/q
    if (closerFiltro && cm.closerEfectivo(p, cierre) !== closerFiltro) return false;
    return true;
  });

  // Cierres ÚNICOS NUEVOS del mes (DISTINCT id_cierre con fecha_cierre en el
  // mes) entre los pagos contados. Los cobros de cohorte (cuotas de cierres de
  // meses anteriores) suman a `pagos` pero NO a `cierres` → casi siempre M < N.
  // Un cierre con varias cuotas el mismo mes cuenta 1 cierre / N pagos.
  const idsCierresMes = new Set<string>();
  for (const p of pagosMes) {
    const cierre = cierrePorId.get(p.idCierre);
    if (cierre && cierre.fechaCierre.slice(0, 7) === mes) idsCierresMes.add(cierre.idCierre);
  }
  const sumUsd = pagosMes.reduce((a, p) => a + p.montoUsd, 0);
  const conArs = pagosMes.filter((p) => p.montoArs !== undefined && p.montoArs !== null);
  const sumArs = conArs.reduce((a, p) => a + (p.montoArs ?? 0), 0);
  const usdConArs = conArs.reduce((a, p) => a + p.montoUsd, 0);

  // Cash nuevo vs cohortes: clasifica cada pago por el mes de su cierre (misma
  // definición que la Vista Ejecutiva). cashNuevoUsd + cohortesUsd = total.
  let cashNuevoUsd = 0, cohortesUsd = 0, cashNuevoArs = 0, cohortesArs = 0;
  for (const p of pagosMes) {
    const cierre = cierrePorId.get(p.idCierre);
    const esNuevo = !!cierre && cierre.fechaCierre.slice(0, 7) === mes;
    if (esNuevo) { cashNuevoUsd += p.montoUsd; cashNuevoArs += p.montoArs ?? 0; }
    else { cohortesUsd += p.montoUsd; cohortesArs += p.montoArs ?? 0; }
  }

  // Cierres nuevos del período por programa (respeta los filtros del listado).
  const cierresDelMes = repos.cierres.listar({
    mes,
    programa: filtros?.programa,
    closer: filtros?.closer,
    estado: filtros?.estado,
    q: filtros?.q,
    unidadNegocio: filtros?.unidadNegocio,
  });
  const cierresPorPrograma = {
    empresario: cierresDelMes.filter((c) => c.programa === 'Empresario').length,
    ceroGestor: cierresDelMes.filter((c) => c.programa === 'Cero a Gestor').length,
  };

  return {
    mes,
    totalCobradoUsd: sumUsd,
    totalCobradoArs: sumArs,
    cotizacionPonderada: usdConArs > 0 ? sumArs / usdConArs : null,
    cantidadCierres: idsCierresMes.size,
    cantidadPagos: pagosMes.length,
    cashNuevoUsd,
    cohortesUsd,
    cashNuevoArs,
    cohortesArs,
    cierresPorPrograma,
  };
}

export function obtenerCierre(repos: ReposCierres, id: string): CierreConPagos | null {
  const cierre = repos.cierres.obtener(id);
  if (!cierre) return null;
  return { cierre, pagos: repos.pagos.listarPorCierre(id) };
}

// ───────────────────────── CRUD Cierres ─────────────────────────

let secuencia = 0;
const nuevoId = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}-${(secuencia++).toString(36)}`;

export function crearCierre(repos: ReposCierres, input: unknown): Cierre {
  const c = cierreInputSchema.parse(input);
  const cierre: Cierre = {
    idCierre: c.idCierre ?? nuevoId('CL'),
    fechaCierre: c.fechaCierre,
    clienteNombre: c.clienteNombre,
    clienteMail: c.clienteMail,
    clienteTelefono: c.clienteTelefono,
    programa: c.programa,
    ticketTotalUsd: c.ticketTotalUsd,
    closer: c.closer,
    setter: c.setter,
    funnel: c.funnel,
    referido: c.referido,
    comentarios: c.comentarios,
    unidadNegocio: c.unidadNegocio,
    estado: c.estado,
    revisar: c.revisar,
    cantidadCuotas: c.cantidadCuotas,
    // Cuotas del mismo monto = total / cantidad (solo si hay plan).
    montoCuotaUsd: c.cantidadCuotas ? Math.round((c.ticketTotalUsd / c.cantidadCuotas) * 100) / 100 : undefined,
    // Vencimiento de la cuota 1 (default: fecha del cierre); habilita el
    // calendario mensual fijo del semáforo.
    fechaPrimeraCuota: c.cantidadCuotas ? (c.fechaPrimeraCuota ?? c.fechaCierre) : undefined,
  };
  repos.cierres.guardar(cierre);
  return cierre;
}

export function editarCierre(repos: ReposCierres, id: string, input: unknown): Cierre {
  if (!repos.cierres.obtener(id)) throw new Error(`No existe el cierre ${id}.`);
  const c = cierreInputSchema.parse(input);
  return crearCierre(repos, { ...c, idCierre: id });
}

export function eliminarCierre(repos: ReposCierres, id: string): void {
  if (!repos.cierres.obtener(id)) throw new Error(`No existe el cierre ${id}.`);
  repos.cierres.eliminar(id); // ON DELETE CASCADE borra sus pagos
}

// ───────────────────────── CRUD Pagos ─────────────────────────

export function agregarPago(repos: ReposCierres, input: unknown): Pago {
  const p = pagoInputSchema.parse(input);
  if (!repos.cierres.obtener(p.idCierre)) throw new Error(`No existe el cierre ${p.idCierre}.`);
  const pago: Pago = {
    idPago: p.idPago ?? nuevoId('PG'),
    idCierre: p.idCierre,
    fechaPago: p.fechaPago,
    horaPago: p.horaPago,
    montoUsd: p.montoUsd!,
    montoArs: p.montoArs,
    cotizacion: p.cotizacion,
    tipoPago: p.tipoPago,
    numeroCuota: p.numeroCuota,
    medioPago: p.medioPago,
    comprobanteUrl: p.comprobanteUrl,
    comentarios: p.comentarios,
    closer: p.closer, // closer del pago (si falta, hereda el del cierre al calcular)
    aplicaSetting: p.aplicaSetting,
    setter: p.setter,
  };
  repos.pagos.guardar(pago);
  return pago;
}

export function editarPago(repos: ReposCierres, id: string, input: unknown): Pago {
  const existentes = repos.pagos.listarTodos().find((x) => x.idPago === id);
  if (!existentes) throw new Error(`No existe el pago ${id}.`);
  return agregarPago(repos, { ...(input as object), idPago: id });
}

export function eliminarPago(repos: ReposCierres, id: string): void {
  repos.pagos.eliminar(id);
}

// ───────────────────────── Reseteo seguro ─────────────────────────

export interface ResultadoReset {
  cierresBorrados: number;
  pagosBorrados: number;
}

/** Borra SOLO los datos de demostración (prefijo DEMO-). No toca lo real. */
export function borrarDatosDemo(repos: ReposCierres): ResultadoReset {
  const pagosBorrados = repos.pagos.borrarDemo();
  const cierresBorrados = repos.cierres.borrarDemo();
  return { cierresBorrados, pagosBorrados };
}

/**
 * Reinicia a cero: vacía cierres y pagos. Exige `confirm === "BORRAR"`
 * también en el backend (defensa en profundidad, además de la doble
 * confirmación de la UI).
 */
export function reiniciarCierresYPagos(repos: ReposCierres, input: unknown): ResultadoReset {
  resetConfirmSchema.parse(input);
  const pagosBorrados = repos.pagos.vaciar();
  const cierresBorrados = repos.cierres.vaciar();
  return { cierresBorrados, pagosBorrados };
}

// ───────────────────────── Importación de Excel ─────────────────────────

export interface ImportarResult {
  cierres: number;
  pagos: number;
}

/**
 * Persiste un payload de importación ya estructurado por el cliente
 * (construirImportacion). Revalida en el borde con Zod, hace upsert en una
 * transacción (idempotente por los IDs deterministas) y NO borra nada.
 */
export function importarCierresPagos(repos: ReposCierres, input: unknown): ImportarResult {
  const { cierres, pagos } = importPayloadSchema.parse(input);
  for (const c of cierres) {
    repos.cierres.guardar({
      idCierre: c.idCierre,
      fechaCierre: c.fechaCierre,
      clienteNombre: c.clienteNombre,
      clienteMail: c.clienteMail,
      programa: c.programa,
      ticketTotalUsd: c.ticketTotalUsd,
      closer: c.closer,
      funnel: c.funnel,
      unidadNegocio: c.unidadNegocio,
      estado: c.estado,
      revisar: c.revisar,
      cantidadCuotas: c.cantidadCuotas,
      montoCuotaUsd: c.montoCuotaUsd,
      fechaPrimeraCuota: c.fechaPrimeraCuota,
    });
  }
  for (const p of pagos) {
    repos.pagos.guardar({
      idPago: p.idPago,
      idCierre: p.idCierre,
      fechaPago: p.fechaPago,
      montoUsd: p.montoUsd,
      montoArs: p.montoArs,
      cotizacion: p.cotizacion,
      tipoPago: p.tipoPago,
      numeroCuota: p.numeroCuota,
      medioPago: p.medioPago,
      comentarios: p.comentarios,
      closer: p.closer,
    });
  }
  return { cierres: cierres.length, pagos: pagos.length };
}

/** Quita el flag "a revisar" de un cierre (dato ya completado). */
export function quitarRevisar(repos: ReposCierres, id: string): void {
  const cierre = repos.cierres.obtener(id);
  if (!cierre) throw new Error(`No existe el cierre ${id}.`);
  repos.cierres.guardar({ ...cierre, revisar: undefined });
}
