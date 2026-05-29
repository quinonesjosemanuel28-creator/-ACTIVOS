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
