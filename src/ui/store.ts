/** Estado de UI (Zustand): mes seleccionado, programa, unidad, tema, vista. */
import { create } from 'zustand';
import type { Programa, UnidadNegocio } from '@domain/types';

export type Vista =
  | 'ejecutiva'
  | 'alertas'
  | 'cashflow'
  | 'funnel'
  | 'historico'
  | 'marketing'
  | 'programas'
  | 'cierres'
  | 'datos';

export type FiltroPrograma = 'TODOS' | Programa;
export type FiltroUnidad = UnidadNegocio | 'CONSOLIDADO';

interface UIState {
  mes: string | null;
  programa: FiltroPrograma;
  unidad: FiltroUnidad;
  vista: Vista;
  tema: 'light' | 'dark';
  setMes: (mes: string) => void;
  setPrograma: (p: FiltroPrograma) => void;
  setUnidad: (u: FiltroUnidad) => void;
  setVista: (v: Vista) => void;
  toggleTema: () => void;
}

export const useUI = create<UIState>((set) => ({
  mes: null,
  programa: 'TODOS',
  unidad: 'ACADEMY',
  vista: 'ejecutiva',
  tema: 'light',
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
}));
