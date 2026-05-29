/**
 * Cliente HTTP tipado (CAPA 1). Solo conoce el dominio puro (tipos) y la
 * API REST. Nunca importa infraestructura.
 */
import type { DashboardSnapshot } from '@domain/dashboard';
import type { Alerta } from '@domain/alerts';
import type { EstadoMes, Mes, Parametros, Programa } from '@domain/types';

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
};
