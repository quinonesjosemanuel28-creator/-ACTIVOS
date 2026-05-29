/** Tarjeta de alerta del semáforo (color por severidad + acción sugerida). */
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { Alerta, Severidad } from '@domain/alerts';
import { cn } from '../lib/utils';

const ESTILO: Record<Severidad, { borde: string; chip: string; icono: typeof CheckCircle2; texto: string }> = {
  ROJO: {
    borde: 'border-l-signal-red',
    chip: 'bg-red-100 text-signal-red dark:bg-red-900/40 dark:text-red-300',
    icono: XCircle,
    texto: 'Crítico',
  },
  AMARILLO: {
    borde: 'border-l-signal-amber',
    chip: 'bg-amber-100 text-signal-amber dark:bg-amber-900/40 dark:text-amber-300',
    icono: AlertTriangle,
    texto: 'Atención',
  },
  VERDE: {
    borde: 'border-l-signal-green',
    chip: 'bg-green-100 text-signal-green dark:bg-green-900/40 dark:text-green-300',
    icono: CheckCircle2,
    texto: 'OK',
  },
};

export function AlertCard({ alerta }: { alerta: Alerta }) {
  const e = ESTILO[alerta.severidad];
  const Icono = e.icono;
  return (
    <div className={cn('card card-hover border-l-4 p-4 animate-fade-up', e.borde)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icono size={18} className={cn(alerta.severidad === 'ROJO' && 'text-signal-red', alerta.severidad === 'AMARILLO' && 'text-signal-amber', alerta.severidad === 'VERDE' && 'text-signal-green')} />
          <h4 className="font-600 text-navy-900 dark:text-navy-50">{alerta.titulo}</h4>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-600', e.chip)}>{e.texto}</span>
      </div>
      <p className="mt-2 text-sm text-navy-600 dark:text-navy-200">{alerta.detalle}</p>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-navy-500 dark:text-navy-300">
        <span className="font-600 text-gold-500">→</span>
        {alerta.accionSugerida}
      </p>
    </div>
  );
}
