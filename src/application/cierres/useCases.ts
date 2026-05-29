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
import { cierreInputSchema, pagoInputSchema, resetConfirmSchema } from './schemas';

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
}

/**
 * Resumen del período para la barra superior del listado: total cobrado
 * USD/ARS de los pagos del mes (respetando los filtros aplicados a los
 * cierres) y la cotización promedio ponderada.
 */
export function resumenDelMes(repos: ReposCierres, mes: Mes, filtros?: FiltrosCierres): ResumenMes {
  const cierres = repos.cierres.listar({ ...filtros, mes: undefined });
  const idsVisibles = new Set(cierres.map((c) => c.idCierre));
  const pagosVisibles = repos.pagos.listarTodos().filter((p) => idsVisibles.has(p.idCierre));
  const pagosMes = cm.pagosDelMes(pagosVisibles, mes);
  return {
    mes,
    totalCobradoUsd: cm.cashCollectedUsd(pagosMes, mes),
    totalCobradoArs: cm.cashCollectedArs(pagosMes, mes),
    cotizacionPonderada: cm.cotizacionPonderada(pagosMes),
    cantidadCierres: cm.cierresNuevos(cierres, mes),
    cantidadPagos: pagosMes.length,
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
