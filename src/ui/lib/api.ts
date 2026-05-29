/**
 * Cliente HTTP tipado (CAPA 1). Solo conoce el dominio puro (tipos) y la
 * API REST. Nunca importa infraestructura.
 */
import type { DashboardSnapshot } from '@domain/dashboard';
import type { Alerta } from '@domain/alerts';
import type { EstadoMes, Mes, Parametros, Programa } from '@domain/types';
import type { Cierre, EstadoSaldo, Pago } from '@domain/cierres/types';

export interface DashboardResult {
  snapshot: DashboardSnapshot;
  alertas: Alerta[];
  estadoMes: EstadoMes;
  programa: 'TODOS' | Programa;
}

export interface PuntoHistorico {
  mes: Mes;
  cashCollected: number;
  cashNuevo: number;
  cohortes: number;
  utilidad: number;
  cajaFinal: number;
  cierres: number;
}

export interface MesesResponse {
  meses: Mes[];
  actual: Mes | null;
}

export interface CompararResponse {
  empresario: DashboardSnapshot;
  gestor: DashboardSnapshot;
}

// ───────────────────── Módulo "Cierres y Clientes" ─────────────────────

/** Fila del listado: cierre + pagos + métricas derivadas (espeja FilaCierre). */
export interface FilaCierre {
  cierre: Cierre;
  pagos: Pago[];
  pagadoUsd: number;
  pagadoArs: number;
  pendienteUsd: number;
  estadoSaldo: EstadoSaldo;
}

export interface ResumenCierres {
  mes: Mes;
  totalCobradoUsd: number;
  totalCobradoArs: number;
  cotizacionPonderada: number | null;
  cantidadCierres: number;
  cantidadPagos: number;
}

export interface FiltrosCierresUI {
  mes?: string;
  programa?: string;
  closer?: string;
  estado?: string;
  q?: string;
  unidad?: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== 'TODOS') sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  meses: () => req<MesesResponse>('/meses'),
  dashboard: (mes: Mes, opts: { programa?: string; unidad?: string } = {}) =>
    req<DashboardResult>(`/dashboard/${mes}${qs({ programa: opts.programa, unidad: opts.unidad })}`),
  historico: (unidad?: string) => req<PuntoHistorico[]>(`/historico${qs({ unidad })}`),
  comparar: (mes: Mes, unidad?: string) => req<CompararResponse>(`/comparar/${mes}${qs({ unidad })}`),
  parametros: () => req<Parametros>('/parametros'),
  guardarParametros: (p: Partial<Parametros>) =>
    req('/parametros', { method: 'PUT', body: JSON.stringify(p) }),
  agregarVenta: (v: unknown) => req('/ventas', { method: 'POST', body: JSON.stringify(v) }),
  agregarCobro: (c: unknown) => req('/cobros', { method: 'POST', body: JSON.stringify(c) }),
  agregarEgreso: (e: unknown) => req('/egresos', { method: 'POST', body: JSON.stringify(e) }),
  guardarFunnel: (mes: Mes, f: unknown) =>
    req(`/funnel/${mes}`, { method: 'PUT', body: JSON.stringify(f) }),
  cerrarMes: (mes: Mes) => req(`/cierre/${mes}`, { method: 'POST' }),
  reabrirMes: (mes: Mes) => req(`/cierre/${mes}`, { method: 'DELETE' }),
  importarExcel: async (file: File) => {
    const res = await fetch('/api/importar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: await file.arrayBuffer(),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Error al importar');
    return res.json();
  },

  // Cierres y Clientes
  cierres: (f: FiltrosCierresUI = {}) =>
    req<FilaCierre[]>(`/cierres${qs({ mes: f.mes, programa: f.programa, closer: f.closer, estado: f.estado, q: f.q, unidad: f.unidad })}`),
  resumenCierres: (mes: Mes, f: Omit<FiltrosCierresUI, 'mes'> = {}) =>
    req<ResumenCierres>(`/cierres/resumen/${mes}${qs({ programa: f.programa, closer: f.closer, estado: f.estado, q: f.q, unidad: f.unidad })}`),
  crearCierre: (c: unknown) => req<Cierre>('/cierres', { method: 'POST', body: JSON.stringify(c) }),
  editarCierre: (id: string, c: unknown) => req<Cierre>(`/cierres/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  eliminarCierre: (id: string) => req(`/cierres/${id}`, { method: 'DELETE' }),
  agregarPago: (p: unknown) => req<Pago>('/pagos', { method: 'POST', body: JSON.stringify(p) }),
  editarPago: (id: string, p: unknown) => req<Pago>(`/pagos/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  eliminarPago: (id: string) => req(`/pagos/${id}`, { method: 'DELETE' }),
  importarCierresPagos: (payload: { cierres: unknown[]; pagos: unknown[] }) =>
    req<{ cierres: number; pagos: number }>('/cierres/importar', { method: 'POST', body: JSON.stringify(payload) }),
  quitarRevisar: (id: string) => req(`/cierres/${id}/revisar`, { method: 'DELETE' }),
  borrarDatosDemo: () => req<{ cierresBorrados: number; pagosBorrados: number }>('/cierres-demo', { method: 'DELETE' }),
  reiniciarCierres: (confirm: string) =>
    req<{ cierresBorrados: number; pagosBorrados: number }>('/cierres-reset', { method: 'POST', body: JSON.stringify({ confirm }) }),
};
