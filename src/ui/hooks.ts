/** Hooks de server-state (TanStack Query) sobre el cliente API. */
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { useUI } from './store';

export function useMeses() {
  return useQuery({ queryKey: ['meses'], queryFn: api.meses });
}

export function useDashboard() {
  const { mes, programa, unidad } = useUI();
  return useQuery({
    queryKey: ['dashboard', mes, programa, unidad],
    queryFn: () => api.dashboard(mes!, { programa, unidad }),
    enabled: !!mes,
  });
}

export function useHistorico() {
  const { unidad } = useUI();
  return useQuery({ queryKey: ['historico', unidad], queryFn: () => api.historico(unidad) });
}

export function useComparar() {
  const { mes, unidad } = useUI();
  return useQuery({
    queryKey: ['comparar', mes, unidad],
    queryFn: () => api.comparar(mes!, unidad),
    enabled: !!mes,
  });
}

export function useParametros() {
  return useQuery({ queryKey: ['parametros'], queryFn: api.parametros });
}

// ───────────────────── Módulo "Cierres y Clientes" ─────────────────────
// Fase 3: listado completo (sin filtros). Los filtros/buscador llegan en Fase 5.
export function useCierres() {
  return useQuery({ queryKey: ['cierres'], queryFn: () => api.cierres() });
}
