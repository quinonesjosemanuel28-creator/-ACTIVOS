/** Hooks de server-state (TanStack Query) sobre el cliente API. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * Tras cualquier CRUD de cierres/pagos invalida el listado Y las queries del
 * dashboard (que ahora leen cierres vía adaptador), de modo que los 6 KPIs,
 * alertas, histórico, etc. recalculen en tiempo real.
 */
function useInvalidarTodo() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['cierres'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: ['historico'] }),
      qc.invalidateQueries({ queryKey: ['comparar'] }),
      qc.invalidateQueries({ queryKey: ['meses'] }),
    ]);
}

export function useCrearCierre() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (c: unknown) => api.crearCierre(c), onSuccess: inval });
}
export function useEditarCierre() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (v: { id: string; data: unknown }) => api.editarCierre(v.id, v.data), onSuccess: inval });
}
export function useEliminarCierre() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (id: string) => api.eliminarCierre(id), onSuccess: inval });
}
export function useAgregarPago() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (p: unknown) => api.agregarPago(p), onSuccess: inval });
}
export function useEditarPago() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (v: { id: string; data: unknown }) => api.editarPago(v.id, v.data), onSuccess: inval });
}
export function useEliminarPago() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (id: string) => api.eliminarPago(id), onSuccess: inval });
}
export function useBorrarDemo() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: () => api.borrarDatosDemo(), onSuccess: inval });
}
export function useReiniciarCierres() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (confirm: string) => api.reiniciarCierres(confirm), onSuccess: inval });
}
