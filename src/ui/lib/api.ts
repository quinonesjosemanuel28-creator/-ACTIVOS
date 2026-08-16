/**
 * Cliente HTTP tipado (CAPA 1). Solo conoce el dominio puro (tipos) y la
 * API REST. Nunca importa infraestructura.
 */
import type { DashboardSnapshot } from '@domain/dashboard';
import type { Alerta } from '@domain/alerts';
import type { EstadoMes, Mes, Parametros, Programa } from '@domain/types';
import type { Cierre, EstadoSaldo, Pago } from '@domain/cierres/types';
import type { Egreso } from '@domain/types';
import type { ResumenEgresos } from '@domain/egresos/metrics';
import type { ComisionesDelMes } from '@domain/comisiones/calculo';
import type { Accion, Rol, UsuarioPublico } from '@domain/auth/permisos';
import type { Alumno, Diagnostico, TokenDiagnostico } from '@domain/alumnos/tipos';
import type { CambioFechaPlan, Fase, Kr, PlanCompleto, PlanDocumento, TokenSeguimiento } from '@domain/alumnos/plan';
import { MIME_DOCX, MIME_PDF } from '@domain/alumnos/plan';
import type { ChipFase, EstadoAlumno, Salud, SaludCalculada } from '@domain/alumnos/panel';

// ───────────────────── Auth / sesión ─────────────────────

export interface SesionActual {
  usuario: UsuarioPublico;
  acciones: Accion[];
}

export interface RegistroLiquidacion {
  mes: string;
  fechaLiquidacion: string;
  totalArs: number;
  totalUsd: number;
  cotizacion?: number;
  idEgreso: string;
}
export interface EstadoComisiones extends ComisionesDelMes {
  liquidado: boolean;
  liquidacion: RegistroLiquidacion | null;
}

export interface FiltrosEgresosUI {
  mes?: string;
  categoria?: string;
  tipo?: string;
  moneda?: string;
  q?: string;
}

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
  egresosOperativos: number;
  egresosTotales: number;
  netoOperativo: number;
  netoTotal: number;
}

export type NivelSemaforo = 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'negro';
export interface CuotaDerivada {
  numero: number;
  montoUsd: number;
  abonadoUsd: number;
  completa: boolean;
  fechaCompletada?: string;
  vencimiento: string;
  vencimientoEstimado: boolean;
  nivel: NivelSemaforo | null;
}
export interface CobranzaCierreView {
  idCierre: string;
  cliente: string;
  fechaCierre: string;
  totalUsd: number;
  abonadoUsd: number;
  saldoPendienteUsd: number;
  cuotas: CuotaDerivada[];
  estado: 'Saldado' | 'Al día' | 'Atrasado' | 'Morosidad' | 'Inactivo';
  diasAtraso: number;
  nivel: NivelSemaforo | null;
  inactivo: boolean;
}
export interface RespuestaAsistente {
  disponible: boolean;
  ok: boolean;
  respuesta: string;
  sql?: string;
  columnas?: string[];
  filas?: unknown[][];
}

export interface CobranzaView {
  hoy: string;
  cierres: CobranzaCierreView[];
  listaNegra: CobranzaCierreView[];
  inactivos: CobranzaCierreView[];
  resumen: {
    alDia: number; atrasado: number; morosidad: number; saldoPendienteUsd: number; morosidadUsd: number;
    semaforo: { verde: number; amarillo: number; naranja: number; rojo: number; negro: number };
  };
  proyeccion: { mes: string; montoUsd: number }[];
}

export interface FunnelView {
  mes: Mes;
  agendas: number;
  asistieron: number;
  cerrados: number;
  cargaManual: boolean;
  porCanal: { canal: string; agendas: number; asistieron: number; tasaShow: number | null }[];
  tasaShow: number | null;
  tasaCierre: number | null;
  tasaGlobal: number | null;
  varShow: number | null;
  varCierre: number | null;
  varGlobal: number | null;
  cashNuevoUsd: number;
  cashNuevoArs: number;
  valorPorAgendaUsd: number | null;
  valorPorAgendaArs: number | null;
  valorPorShowUsd: number | null;
  valorPorShowArs: number | null;
  cierresPorPrograma: { empresario: number; ceroGestor: number };
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
  cashNuevoUsd: number;
  cohortesUsd: number;
  cashNuevoArs: number;
  cohortesArs: number;
  cierresPorPrograma: { empresario: number; ceroGestor: number };
}

export interface FiltrosCierresUI {
  mes?: string;
  programa?: string;
  closer?: string;
  estado?: string;
  q?: string;
  unidad?: string;
}

/** Error HTTP con status (la UI distingue 401 = sin sesión de otros). */
export class ErrorHttp extends Error {
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorHttp';
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ErrorHttp(res.status, body.error ?? `Error ${res.status}`);
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
  // Auth / sesión
  login: (email: string, password: string) =>
    req<SesionActual & { expiraEn: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  sesion: () => req<SesionActual>('/auth/yo'),
  cambiarPassword: (passwordActual: string, passwordNueva: string) =>
    req('/auth/password', { method: 'POST', body: JSON.stringify({ passwordActual, passwordNueva }) }),

  // Usuarios (solo ADMIN)
  usuarios: () => req<UsuarioPublico[]>('/usuarios'),
  crearUsuario: (u: { email: string; nombre: string; rol: Rol }) =>
    req<{ usuario: UsuarioPublico; passwordTemporal?: string }>('/usuarios', { method: 'POST', body: JSON.stringify(u) }),
  cambiarRol: (id: string, rol: Rol) =>
    req<UsuarioPublico>(`/usuarios/${id}/rol`, { method: 'PUT', body: JSON.stringify({ rol }) }),
  darDeBaja: (id: string) => req<UsuarioPublico>(`/usuarios/${id}`, { method: 'DELETE' }),
  reactivarUsuario: (id: string) => req<UsuarioPublico>(`/usuarios/${id}/reactivar`, { method: 'POST' }),
  resetearPassword: (id: string) =>
    req<{ passwordTemporal: string }>(`/usuarios/${id}/reset-password`, { method: 'POST' }),

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
  funnel: (mes: Mes) => req<FunnelView>(`/funnel/${mes}`),
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

  // Egresos
  egresos: (f: FiltrosEgresosUI = {}) =>
    req<Egreso[]>(`/egresos${qs({ mes: f.mes, categoria: f.categoria, tipo: f.tipo, moneda: f.moneda, q: f.q })}`),
  resumenEgresos: (mes: string, f: Omit<FiltrosEgresosUI, 'mes'> = {}) =>
    req<ResumenEgresos>(`/egresos/resumen/${mes}${qs({ categoria: f.categoria, tipo: f.tipo, moneda: f.moneda, q: f.q })}`),
  crearEgreso: (e: unknown) => req<Egreso>('/egresos', { method: 'POST', body: JSON.stringify(e) }),
  editarEgreso: (id: string, e: unknown) => req<Egreso>(`/egresos/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  eliminarEgreso: (id: string) => req(`/egresos/${id}`, { method: 'DELETE' }),

  // Comisiones
  comisiones: (mes: string) => req<EstadoComisiones>(`/comisiones/${mes}`),
  liquidaciones: () => req<RegistroLiquidacion[]>('/comisiones/liquidaciones'),
  liquidarComisiones: (mes: string, reemplazar = false) =>
    req<{ mes: string; totalArs: number; totalUsd: number; idEgreso: string; reemplazado: boolean }>(
      `/comisiones/liquidar/${mes}`,
      { method: 'POST', body: JSON.stringify({ reemplazar }) },
    ),
  anularLiquidacion: (mes: string) => req(`/comisiones/liquidar/${mes}`, { method: 'DELETE' }),

  // Asistente IA
  asistenteEstado: () => req<{ disponible: boolean }>('/asistente/estado'),
  asistentePreguntar: (pregunta: string) =>
    req<RespuestaAsistente>('/asistente', { method: 'POST', body: JSON.stringify({ pregunta }) }),

  // Cobranza
  cobranza: () => req<CobranzaView>('/cobranza'),
  marcarInactivo: (id: string) => req(`/cierres/${id}/inactivar`, { method: 'POST' }),
  reactivar: (id: string) => req(`/cierres/${id}/inactivar`, { method: 'DELETE' }),
  borrarDatosDemo: () => req<{ cierresBorrados: number; pagosBorrados: number }>('/cierres-demo', { method: 'DELETE' }),
  reiniciarCierres: (confirm: string) =>
    req<{ cierresBorrados: number; pagosBorrados: number }>('/cierres-reset', { method: 'POST', body: JSON.stringify({ confirm }) }),

  // Módulo de alumnos (el ámbito por fila lo aplica el server; acá no se filtra nada)
  alumnos: (q?: string) => req<Alumno[]>(`/alumnos${qs({ q })}`),
  // Panel de control (ticket 7): la cartera con fase, salud y orden por riesgo.
  panelAlumnos: (f: FiltrosPanelUI = {}) =>
    req<FilaPanelUI[]>(`/alumnos/panel${qs({ q: f.q, estado: f.estado, salud: f.salud, consultor: f.consultor })}`),
  cambiarEstadoAlumno: (id: string, estado: EstadoAlumno) =>
    req<Alumno>(`/alumnos/${id}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) }),
  eliminarAlumno: (id: string) => req(`/alumnos/${id}`, { method: 'DELETE' }),
  papelera: () => req<FilaPapeleraUI[]>('/alumnos/papelera'),
  restaurarAlumno: (id: string) => req<Alumno>(`/alumnos/${id}/restaurar`, { method: 'POST' }),
  eliminarAlumnoDefinitivo: (id: string, confirmacion: string) =>
    req(`/alumnos/${id}/definitivo`, { method: 'DELETE', body: JSON.stringify({ confirmacion }) }),
  cambiarFechaInicio: (planId: string, fechaNueva: string, motivo?: string) =>
    req<{ fechaAnterior: string; fechaNueva: string; deltaDias: number; krsDesplazados: number }>(
      `/planes/${planId}/fecha-inicio`,
      { method: 'PUT', body: JSON.stringify({ fechaNueva, motivo }) },
    ),
  editarKr: (krId: string, patch: { cumplido?: boolean; vencimiento?: string | null }) =>
    req<Kr>(`/krs/${krId}`, { method: 'PUT', body: JSON.stringify(patch) }),

  // El documento del plan (ticket 7B): el binario viaja crudo, el nombre en la query.
  documentosPlan: (planId: string) => req<PlanDocumento[]>(`/planes/${planId}/documentos`),
  subirDocumento: async (planId: string, file: File): Promise<PlanDocumento> => {
    const mime = file.name.toLowerCase().endsWith('.pdf') ? MIME_PDF : MIME_DOCX;
    const res = await fetch(`/api/planes/${planId}/documentos?nombre=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': mime },
      body: await file.arrayBuffer(),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ErrorHttp(res.status, body.error ?? `Error ${res.status}`);
    }
    return res.json() as Promise<PlanDocumento>;
  },
  /** URL del contenido (visor embebido / descarga). La sesión viaja en la cookie. */
  urlDocumento: (id: string) => `/api/documentos/${id}`,
  alumno: (id: string) => req<Alumno>(`/alumnos/${id}`),
  crearAlumno: (a: unknown) => req<Alumno>('/alumnos', { method: 'POST', body: JSON.stringify(a) }),
  editarAlumno: (id: string, a: unknown) => req<Alumno>(`/alumnos/${id}`, { method: 'PUT', body: JSON.stringify(a) }),
  emitirLinkDiagnostico: (alumnoId: string) =>
    req<TokenDiagnostico>(`/alumnos/${alumnoId}/token`, { method: 'POST' }),
  diagnosticos: (alumnoId: string) => req<Diagnostico[]>(`/alumnos/${alumnoId}/diagnosticos`),
  editarDiagnostico: (id: string, patch: unknown) =>
    req<Diagnostico>(`/diagnosticos/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  exportarDiagnostico: (id: string) =>
    req<{ nombreArchivo: string; contenido: string }>(`/diagnosticos/${id}/exportacion`),

  // Plan de 90 días (el bloque JSON de la skill; ver CONTRATO-PLAN.md)
  previaPlan: (alumnoId: string, bloque: string) =>
    req<PreviaPlanUI>(`/alumnos/${alumnoId}/plan/previa`, { method: 'POST', body: JSON.stringify({ bloque }) }),
  cargarPlan: (alumnoId: string, bloque: string, fechaInicio?: string) =>
    req<PlanCompleto>(`/alumnos/${alumnoId}/plan`, { method: 'POST', body: JSON.stringify({ bloque, fechaInicio }) }),
  planes: (alumnoId: string) => req<PlanCompleto[]>(`/alumnos/${alumnoId}/planes`),
  avancePlan: (planId: string) => req<AvancePlanUI>(`/planes/${planId}/avance`),
  emitirLinkSeguimiento: (planId: string) =>
    req<{ token: TokenSeguimiento; nuevo: boolean }>(`/planes/${planId}/link`, { method: 'POST' }),
  revocarLinkSeguimiento: (planId: string) =>
    req<{ revocados: number }>(`/planes/${planId}/link`, { method: 'DELETE' }),
};

/** El tablero de avance del plan (lo tildado es lo que el alumno DECLARA). */
export interface AvancePlanUI {
  planId: string;
  fechaInicio: string;
  faseActual: Fase;
  vencido: boolean;
  ultimaActividad: string | null;
  fases: {
    fase: Fase;
    total: number;
    hechas: number;
    acciones: { id: string; texto: string; fase: Fase; hecha: boolean; okrOrden: number | null; ultimoCambio: string | null }[];
  }[];
  link: { token: string; expiraEn: string } | null;
  cambiosFecha: CambioFechaPlan[];
}

// ───── Panel de control (ticket 7) ─────

export interface FiltrosPanelUI {
  q?: string;
  estado?: EstadoAlumno;
  salud?: Salud | 'NEUTRO';
  consultor?: string;
}

/** Fila del panel (espeja FilaPanel del caso de uso). */
export interface FilaPanelUI {
  alumno: Alumno;
  consultorNombre: string | null;
  plan: { id: string; fechaInicio: string; fechaCierreEstimada: string; dias: number; chip: ChipFase } | null;
  krs: { totales: number; cumplidos: number };
  salud: SaludCalculada;
  ultimaActividad: string | null;
  riesgo: number;
}

export interface FilaPapeleraUI {
  alumno: Alumno;
  eliminadoPorNombre: string | null;
}

/** Lo que devuelve la previa: el bloque validado + lo que hay que mirar antes de confirmar. */
export interface PreviaPlanUI {
  bloque: {
    version: number;
    alumno: string;
    fecha_inicio: string;
    etapa?: string | null;
    objetivo_90d?: string | null;
    okrs: { orden: number; objetivo: string; krs: { texto: string; meta?: string | null }[] }[];
    fases: { fase: 1 | 2 | 3; titulo?: string | null; acciones: { texto: string; okr?: number }[] }[];
  };
  advertencias: string[];
}
