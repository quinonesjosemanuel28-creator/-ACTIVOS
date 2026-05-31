/** Hooks de server-state (TanStack Query) sobre el cliente API. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type FiltrosCierresUI, type FiltrosEgresosUI } from './lib/api';
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

export function useFunnel() {
  const { mes } = useUI();
  return useQuery({ queryKey: ['funnel', mes], queryFn: () => api.funnel(mes!), enabled: !!mes });
}
export function useGuardarFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { mes: string; canales: { canal: string; agendas: number; asistieron: number }[] }) =>
      api.guardarFunnel(v.mes, { canales: v.canales }),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['funnel'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]),
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

export function useGuardarParametros() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Record<string, number>) => api.guardarParametros(p),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['parametros'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]),
  });
}

// ───────────────────── Módulo "Cierres y Clientes" ─────────────────────

/** Listado completo sin filtros (también sirve para poblar opciones). */
export function useCierres() {
  return useQuery({ queryKey: ['cierres', 'todos'], queryFn: () => api.cierres() });
}

/** Listado filtrado (Fase 5). */
export function useCierresFiltrados(filtros: FiltrosCierresUI) {
  return useQuery({ queryKey: ['cierres', 'filtrados', filtros], queryFn: () => api.cierres(filtros) });
}

/** Resumen del mes (solo cuando hay un mes concreto seleccionado). */
export function useResumenCierres(mes: string | undefined, filtros: Omit<FiltrosCierresUI, 'mes'>) {
  return useQuery({
    queryKey: ['cierres', 'resumen', mes, filtros],
    queryFn: () => api.resumenCierres(mes!, filtros),
    enabled: !!mes && mes !== 'TODOS',
  });
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
export function useImportarCierres() {
  const inval = useInvalidarTodo();
  return useMutation({
    mutationFn: (payload: { cierres: unknown[]; pagos: unknown[] }) => api.importarCierresPagos(payload),
    onSuccess: inval,
  });
}
export function useQuitarRevisar() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (id: string) => api.quitarRevisar(id), onSuccess: inval });
}

// ───────────────────────── Módulo Egresos ─────────────────────────

export function useEgresos(filtros: FiltrosEgresosUI) {
  return useQuery({ queryKey: ['egresos', 'lista', filtros], queryFn: () => api.egresos(filtros) });
}
export function useResumenEgresos(mes: string, filtros: Omit<FiltrosEgresosUI, 'mes'>) {
  return useQuery({ queryKey: ['egresos', 'resumen', mes, filtros], queryFn: () => api.resumenEgresos(mes, filtros) });
}

/** Las mutaciones de egresos invalidan egresos Y el dashboard (que lee egresos). */
function useInvalidarEgresos() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['egresos'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: ['historico'] }),
    ]);
}
export function useCrearEgreso() {
  const inval = useInvalidarEgresos();
  return useMutation({ mutationFn: (e: unknown) => api.crearEgreso(e), onSuccess: inval });
}
export function useEditarEgreso() {
  const inval = useInvalidarEgresos();
  return useMutation({ mutationFn: (v: { id: string; data: unknown }) => api.editarEgreso(v.id, v.data), onSuccess: inval });
}
export function useEliminarEgreso() {
  const inval = useInvalidarEgresos();
  return useMutation({ mutationFn: (id: string) => api.eliminarEgreso(id), onSuccess: inval });
}

// ───────────────────────── Módulo Comisiones ─────────────────────────
export function useComisiones(mes: string | null) {
  return useQuery({ queryKey: ['comisiones', mes], queryFn: () => api.comisiones(mes!), enabled: !!mes });
}
export function useLiquidaciones() {
  return useQuery({ queryKey: ['comisiones', 'liquidaciones'], queryFn: () => api.liquidaciones() });
}
function useInvalidarComisiones() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['comisiones'] }),
      qc.invalidateQueries({ queryKey: ['egresos'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}
export function useLiquidarComisiones() {
  const inval = useInvalidarComisiones();
  return useMutation({
    mutationFn: (v: { mes: string; reemplazar?: boolean }) => api.liquidarComisiones(v.mes, v.reemplazar),
    onSuccess: inval,
  });
}
export function useAnularLiquidacion() {
  const inval = useInvalidarComisiones();
  return useMutation({ mutationFn: (mes: string) => api.anularLiquidacion(mes), onSuccess: inval });
}
export function useReiniciarCierres() {
  const inval = useInvalidarTodo();
  return useMutation({ mutationFn: (confirm: string) => api.reiniciarCierres(confirm), onSuccess: inval });
}
