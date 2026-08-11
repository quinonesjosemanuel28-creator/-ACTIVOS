/** Estado de UI (Zustand): mes, filtros, tema, vista y sesión (usuario+permisos). */
import { create } from 'zustand';
import type { Programa, UnidadNegocio } from '@domain/types';
import type { Accion, UsuarioPublico } from '@domain/auth/permisos';

export type Vista =
  | 'ejecutiva'
  | 'alertas'
  | 'cashflow'
  | 'funnel'
  | 'historico'
  | 'marketing'
  | 'programas'
  | 'cierres'
  | 'cobranza'
  | 'egresos'
  | 'comisiones'
  | 'asistente'
  | 'alumnos'
  | 'datos'
  | 'usuarios';

/** Acción mínima que exige cada vista (espeja la matriz del dominio). */
export const ACCION_POR_VISTA: Record<Vista, Accion> = {
  ejecutiva: 'ver',
  alertas: 'ver',
  cashflow: 'ver',
  funnel: 'ver',
  historico: 'ver',
  marketing: 'ver',
  programas: 'ver',
  cierres: 'ver',
  cobranza: 'ver',
  egresos: 'ver',
  comisiones: 'ver',
  asistente: 'ver',
  alumnos: 'ver_alumnos', // módulo de alumnos: CONSULTOR y ADMIN, nadie más
  datos: 'importar', // Carga & Admin: importar/resetear → solo ADMIN
  usuarios: 'gestionar_usuarios', // solo ADMIN
};

export type FiltroPrograma = 'TODOS' | Programa;
export type FiltroUnidad = UnidadNegocio | 'CONSOLIDADO';

interface UIState {
  mes: string | null;
  programa: FiltroPrograma;
  unidad: FiltroUnidad;
  vista: Vista;
  tema: 'light' | 'dark';
  /** Sesión actual (null = sin login). La setea App al resolver /auth/yo. */
  usuario: UsuarioPublico | null;
  acciones: Accion[];
  setMes: (mes: string) => void;
  setPrograma: (p: FiltroPrograma) => void;
  setUnidad: (u: FiltroUnidad) => void;
  setVista: (v: Vista) => void;
  toggleTema: () => void;
  setSesion: (usuario: UsuarioPublico | null, acciones: Accion[]) => void;
}

export const useUI = create<UIState>((set) => ({
  mes: null,
  programa: 'TODOS',
  unidad: 'ACADEMY',
  vista: 'ejecutiva',
  tema: 'light',
  usuario: null,
  acciones: [],
  setMes: (mes) => set({ mes }),
  setPrograma: (programa) => set({ programa }),
  setUnidad: (unidad) => set({ unidad }),
  setVista: (vista) => set({ vista }),
  toggleTema: () =>
    set((s) => {
      const tema = s.tema === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', tema === 'dark');
      return { tema };
    }),
  setSesion: (usuario, acciones) =>
    set((s) => ({
      usuario,
      acciones,
      // Si la vista activa quedó prohibida para el rol, vuelve a la ejecutiva.
      vista: usuario && !acciones.includes(ACCION_POR_VISTA[s.vista]) ? 'ejecutiva' : s.vista,
    })),
}));

/**
 * ¿El usuario logueado puede esta acción? Sin sesión cargada (tests de render
 * estático) devuelve true: el candado REAL está en la API, esto es cosmético.
 */
export function puedeUI(state: Pick<UIState, 'usuario' | 'acciones'>, accion: Accion): boolean {
  if (!state.usuario) return true;
  return state.acciones.includes(accion);
}

/** Hook de conveniencia para gatear botones/vistas por acción. */
export function usePuede(accion: Accion): boolean {
  return useUI((s) => puedeUI(s, accion));
}
