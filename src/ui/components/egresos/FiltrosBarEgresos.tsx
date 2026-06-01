/** Filtros del historial de egresos: mes, categoría, moneda, tipo, buscador. */
import { Search, X } from 'lucide-react';
import { CATEGORIAS_EGRESO } from '@domain/egresos/categorias';
import { Button, Input, Select } from '../ui/primitives';
import { fmtMes } from '../../lib/format';

export interface FiltrosEgresosState {
  mes: string; // 'TODOS' | YYYY-MM
  categoria: string; // 'TODOS' | categoría
  moneda: string; // 'TODOS' | 'USD' | 'ARS'
  tipo: string; // 'TODOS' | 'recurrente' | 'puntual'
  q: string;
}

export const FILTROS_EGRESOS_INICIALES: FiltrosEgresosState = {
  mes: 'TODOS',
  categoria: 'TODOS',
  moneda: 'TODOS',
  tipo: 'TODOS',
  q: '',
};

interface Props {
  filtros: FiltrosEgresosState;
  onChange: (f: FiltrosEgresosState) => void;
  meses: string[];
}

export function FiltrosBarEgresos({ filtros, onChange, meses }: Props) {
  const set = (patch: Partial<FiltrosEgresosState>) => onChange({ ...filtros, ...patch });
  const hay =
    filtros.mes !== 'TODOS' || filtros.categoria !== 'TODOS' || filtros.moneda !== 'TODOS' || filtros.tipo !== 'TODOS' || filtros.q.trim() !== '';

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <Campo label="Mes">
        <Select value={filtros.mes} onChange={(e) => set({ mes: e.target.value })}>
          <option value="TODOS">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}
        </Select>
      </Campo>
      <Campo label="Categoría">
        <Select value={filtros.categoria} onChange={(e) => set({ categoria: e.target.value })}>
          <option value="TODOS">Todas</option>
          {CATEGORIAS_EGRESO.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Campo>
      <Campo label="Moneda">
        <Select value={filtros.moneda} onChange={(e) => set({ moneda: e.target.value })}>
          <option value="TODOS">USD y ARS</option>
          <option value="USD">Con USD</option>
          <option value="ARS">Con ARS</option>
        </Select>
      </Campo>
      <Campo label="Tipo">
        <Select value={filtros.tipo} onChange={(e) => set({ tipo: e.target.value })}>
          <option value="TODOS">Todos</option>
          <option value="recurrente">Recurrentes</option>
          <option value="puntual">Puntuales</option>
        </Select>
      </Campo>
      <Campo label="Buscar concepto">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
          <Input value={filtros.q} onChange={(e) => set({ q: e.target.value })} placeholder="Concepto…" className="w-52 pl-8" />
        </div>
      </Campo>
      {hay && (
        <Button variant="ghost" size="sm" onClick={() => onChange(FILTROS_EGRESOS_INICIALES)}><X size={15} /> Limpiar</Button>
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
