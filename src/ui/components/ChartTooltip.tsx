/** Tooltip rico y consistente para los gráficos Recharts. */
import type { TooltipProps } from 'recharts';
import { fmtMes, fmtUsd, fmtNum } from '../lib/format';

export const PALETA = {
  navy: '#152a63',
  gold: '#C9A227',
  teal: '#14b8a6',
  red: '#dc2626',
  green: '#16a34a',
  grid: '#e2e8f0',
};

export function RichTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const titulo = typeof label === 'string' && /^\d{4}-\d{2}$/.test(label) ? fmtMes(label) : String(label);
  return (
    <div className="rounded-xl border border-navy-100 bg-white/95 px-3 py-2 shadow-card backdrop-blur dark:border-navy-700 dark:bg-navy-800/95">
      <p className="mb-1 text-xs font-600 text-navy-500">{titulo}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-navy-600 dark:text-navy-200">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-600 tnum text-navy-900 dark:text-navy-50">
            {p.dataKey === 'cierres' ? fmtNum(p.value ?? 0) : fmtUsd(p.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}
