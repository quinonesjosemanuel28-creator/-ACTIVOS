/** Hooks de server-state (TanStack Query) sobre el cliente API. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErrorHttp, type FiltrosCierresUI, type FiltrosEgresosUI, type SesionActual } from './lib/api';
import { useUI } from './store';
import type { Rol } from '@domain/auth/permisos';

// ───────────────────────── Auth / sesión ─────────────────────────

/** Sesión actual: null = sin login (401), undefined = cargando. */
export function useSesion() {
  return useQuery<SesionActual | null>({
    queryKey: ['sesion'],
    queryFn: async () => {
      try {
        return await api.sesion();
      } catch (err) {
        if (err instanceof ErrorHttp && err.status === 401) return null; // sin sesión: pantalla de login
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; password: string }) => api.login(v.email, v.password),
    // El login cambia QUIÉN mira: se refresca todo el server-state.
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      qc.setQueryData(['sesion'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sesion' });
    },
  });
}

export function useCambiarPassword() {
  return useMutation({
    mutationFn: (v: { passwordActual: string; passwordNueva: string }) =>
      api.cambiarPassword(v.passwordActual, v.passwordNueva),
  });
}

// ───────────────────────── Usuarios (ADMIN) ─────────────────────────

export function useUsuarios() {
  return useQuery({ queryKey: ['usuarios'], queryFn: api.usuarios });
}
export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (u: { email: string; nombre: string; rol: Rol }) => api.crearUsuario(u),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}
export function useCambiarRol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; rol: Rol }) => api.cambiarRol(v.id, v.rol),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}
export function useBajaUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reactivar: boolean }) => (v.reactivar ? api.reactivarUsuario(v.id) : api.darDeBaja(v.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}
export function useResetearPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.resetearPassword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

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

export function useCobranza() {
  return useQuery({ queryKey: ['cobranza'], queryFn: () => api.cobranza() });
}

// ───────────────────────── Asistente IA ─────────────────────────
export function useAsistenteEstado() {
  return useQuery({ queryKey: ['asistente', 'estado'], queryFn: () => api.asistenteEstado() });
}
export function usePreguntarAsistente() {
  return useMutation({ mutationFn: (pregunta: string) => api.asistentePreguntar(pregunta) });
}
export function useMarcarInactivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; inactivo: boolean }) => (v.inactivo ? api.marcarInactivo(v.id) : api.reactivar(v.id)),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['cobranza'] }),
      qc.invalidateQueries({ queryKey: ['cierres'] }),
    ]),
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

// ───────────────────────── Módulo de alumnos ─────────────────────────
// El ámbito por fila (mi cartera vs todas) lo resuelve el SERVER con la
// sesión: estos hooks no filtran nada, muestran lo que la API devuelva.
export function useAlumnos(q?: string) {
  return useQuery({ queryKey: ['alumnos', 'lista', q ?? ''], queryFn: () => api.alumnos(q) });
}
/** El panel de control (ticket 7): cartera con fase, salud y orden por riesgo. */
export function usePanelAlumnos(filtros: import('./lib/api').FiltrosPanelUI) {
  return useQuery({ queryKey: ['alumnos', 'panel', filtros], queryFn: () => api.panelAlumnos(filtros) });
}
export function useAlumno(id: string | null) {
  return useQuery({ queryKey: ['alumnos', 'ficha', id], queryFn: () => api.alumno(id!), enabled: !!id });
}
export function useDiagnosticos(alumnoId: string | null) {
  return useQuery({
    queryKey: ['alumnos', 'diagnosticos', alumnoId],
    queryFn: () => api.diagnosticos(alumnoId!),
    enabled: !!alumnoId,
  });
}
function useInvalidarAlumnos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['alumnos'] });
}
export function useCrearAlumno() {
  const inval = useInvalidarAlumnos();
  return useMutation({ mutationFn: (a: unknown) => api.crearAlumno(a), onSuccess: inval });
}
export function useEditarAlumno() {
  const inval = useInvalidarAlumnos();
  return useMutation({ mutationFn: (v: { id: string; data: unknown }) => api.editarAlumno(v.id, v.data), onSuccess: inval });
}
export function useEmitirLink() {
  return useMutation({ mutationFn: (alumnoId: string) => api.emitirLinkDiagnostico(alumnoId) });
}
export function useEditarDiagnostico() {
  const inval = useInvalidarAlumnos();
  return useMutation({ mutationFn: (v: { id: string; patch: unknown }) => api.editarDiagnostico(v.id, v.patch), onSuccess: inval });
}

/** Exportación del diagnóstico para la skill del plan (copiar / descargar). */
export function useExportarDiagnostico() {
  return useMutation({ mutationFn: (id: string) => api.exportarDiagnostico(id) });
}

/** Plan de 90 días: previa (valida sin guardar), carga y listado. */
export function usePlanes(alumnoId: string | null) {
  return useQuery({
    queryKey: ['alumnos', 'planes', alumnoId],
    queryFn: () => api.planes(alumnoId!),
    enabled: !!alumnoId,
  });
}
export function usePreviaPlan() {
  return useMutation({ mutationFn: (v: { alumnoId: string; bloque: string }) => api.previaPlan(v.alumnoId, v.bloque) });
}
export function useCargarPlan() {
  const inval = useInvalidarAlumnos();
  return useMutation({
    mutationFn: (v: { alumnoId: string; bloque: string; fechaInicio?: string }) =>
      api.cargarPlan(v.alumnoId, v.bloque, v.fechaInicio),
    onSuccess: inval,
  });
}

/** Avance del plan + gestión del link de seguimiento. */
export function useAvancePlan(planId: string | null) {
  return useQuery({
    queryKey: ['alumnos', 'avance', planId],
    queryFn: () => api.avancePlan(planId!),
    enabled: !!planId,
  });
}
export function useEmitirLinkSeguimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.emitirLinkSeguimiento(planId),
    onSuccess: (_r, planId) => qc.invalidateQueries({ queryKey: ['alumnos', 'avance', planId] }),
  });
}
export function useRevocarLinkSeguimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.revocarLinkSeguimiento(planId),
    onSuccess: (_r, planId) => qc.invalidateQueries({ queryKey: ['alumnos', 'avance', planId] }),
  });
}

// ───── Panel de control (ticket 7): estado, fecha, KRs y papelera ─────

export function useCambiarEstadoAlumno() {
  const inval = useInvalidarAlumnos();
  return useMutation({
    mutationFn: (v: { id: string; estado: import('@domain/alumnos/panel').EstadoAlumno }) =>
      api.cambiarEstadoAlumno(v.id, v.estado),
    onSuccess: inval,
  });
}
export function useCambiarFechaInicio() {
  const inval = useInvalidarAlumnos();
  return useMutation({
    mutationFn: (v: { planId: string; fechaNueva: string; motivo?: string }) =>
      api.cambiarFechaInicio(v.planId, v.fechaNueva, v.motivo),
    onSuccess: inval,
  });
}
export function useEditarKr() {
  const inval = useInvalidarAlumnos();
  return useMutation({
    mutationFn: (v: { krId: string; patch: { cumplido?: boolean; vencimiento?: string | null } }) =>
      api.editarKr(v.krId, v.patch),
    onSuccess: inval,
  });
}
export function useEliminarAlumno() {
  const inval = useInvalidarAlumnos();
  return useMutation({ mutationFn: (id: string) => api.eliminarAlumno(id), onSuccess: inval });
}
export function usePapelera(habilitada: boolean) {
  return useQuery({ queryKey: ['alumnos', 'papelera'], queryFn: () => api.papelera(), enabled: habilitada });
}
export function useRestaurarAlumno() {
  const inval = useInvalidarAlumnos();
  return useMutation({ mutationFn: (id: string) => api.restaurarAlumno(id), onSuccess: inval });
}
export function useEliminarDefinitivo() {
  const inval = useInvalidarAlumnos();
  return useMutation({
    mutationFn: (v: { id: string; confirmacion: string }) => api.eliminarAlumnoDefinitivo(v.id, v.confirmacion),
    onSuccess: inval,
  });
}
