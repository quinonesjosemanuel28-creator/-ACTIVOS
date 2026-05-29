/** Barra de filtros del listado de cierres: mes, programa, closer, estado, buscador. */
import { Search, X } from 'lucide-react';
import { Button, Input, Select } from '../ui/primitives';
import { fmtMes } from '../../lib/format';

export interface FiltrosState {
  mes: string; // 'TODOS' o YYYY-MM
  programa: string; // 'TODOS' | 'Empresario' | 'Cero a Gestor'
  closer: string; // 'TODOS' | nombre
  estado: string; // 'TODOS' | 'Activo' | 'No continúa'
  q: string;
}

export const FILTROS_INICIALES: FiltrosState = {
  mes: 'TODOS',
  programa: 'TODOS',
  closer: 'TODOS',
  estado: 'TODOS',
  q: '',
};

interface Props {
  filtros: FiltrosState;
  onChange: (f: FiltrosState) => void;
  meses: string[];
  closers: string[];
}

export function FiltrosBar({ filtros, onChange, meses, closers }: Props) {
  const set = (patch: Partial<FiltrosState>) => onChange({ ...filtros, ...patch });
  const hayFiltros =
    filtros.mes !== 'TODOS' ||
    filtros.programa !== 'TODOS' ||
    filtros.closer !== 'TODOS' ||
    filtros.estado !== 'TODOS' ||
    filtros.q.trim() !== '';

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <Campo label="Mes">
        <Select value={filtros.mes} onChange={(e) => set({ mes: e.target.value })}>
          <option value="TODOS">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}
        </Select>
      </Campo>
      <Campo label="Programa">
        <Select value={filtros.programa} onChange={(e) => set({ programa: e.target.value })}>
          <option value="TODOS">Todos</option>
          <option value="Empresario">Empresario</option>
          <option value="Cero a Gestor">Cero a Gestor</option>
        </Select>
      </Campo>
      <Campo label="Closer">
        <Select value={filtros.closer} onChange={(e) => set({ closer: e.target.value })}>
          <option value="TODOS">Todos</option>
          {closers.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Campo>
      <Campo label="Estado">
        <Select value={filtros.estado} onChange={(e) => set({ estado: e.target.value })}>
          <option value="TODOS">Todos</option>
          <option value="Activo">Activo</option>
          <option value="No continúa">No continúa</option>
        </Select>
      </Campo>
      <Campo label="Buscar cliente">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
          <Input
            value={filtros.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Nombre o mail…"
            className="w-56 pl-8"
          />
        </div>
      </Campo>
      {hayFiltros && (
        <Button variant="ghost" size="sm" onClick={() => onChange(FILTROS_INICIALES)} title="Limpiar filtros">
          <X size={15} /> Limpiar
        </Button>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">{label}</span>
      {children}
    </label>
  );
}
