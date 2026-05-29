/** Tarjeta de KPI grande con variación M/M (flecha verde/roja). */
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { MetricaMM } from '@domain/dashboard';
import { Card } from './ui/primitives';
import { fmtPct } from '../lib/format';
import { cn } from '../lib/utils';

interface KpiCardProps {
  titulo: string;
  metrica: MetricaMM;
  formato: (v: number | null) => string;
  /** Si true, una variación negativa es buena (ej. CAC). Invierte colores. */
  inverso?: boolean;
  hint?: string;
}

export function KpiCard({ titulo, metrica, formato, inverso = false, hint }: KpiCardProps) {
  const { valor, variacion } = metrica;
  const positivo = variacion !== null && variacion > 0;
  const negativo = variacion !== null && variacion < 0;
  const bueno = inverso ? negativo : positivo;
  const malo = inverso ? positivo : negativo;

  return (
    <Card className="card-hover p-5 animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{titulo}</p>
        {variacion !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-600 tnum',
              bueno && 'bg-green-100 text-signal-green dark:bg-green-900/40 dark:text-green-300',
              malo && 'bg-red-100 text-signal-red dark:bg-red-900/40 dark:text-red-300',
              !bueno && !malo && 'bg-navy-100 text-navy-500',
            )}
          >
            {positivo ? <ArrowUpRight size={12} /> : negativo ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {fmtPct(Math.abs(variacion))}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-3xl font-700 text-navy-900 tnum dark:text-navy-50">
        {formato(valor)}
      </p>
      {hint && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
    </Card>
  );
}
