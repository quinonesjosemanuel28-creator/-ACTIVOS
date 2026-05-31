/** Gauge semicircular SVG para métricas de marketing contra su meta/tope. */
import { cumpleObjetivo } from '@domain/marketing/objetivos';
import { cn } from '../lib/utils';

interface GaugeProps {
  valor: number | null;
  /** Valor de referencia (tope para CAC, objetivo para ROAS/MER). */
  referencia: number;
  /** Si true, estar por DEBAJO de la referencia es bueno (ej. CAC). */
  menorEsMejor?: boolean;
  /** Máximo del arco para escalar. */
  max: number;
  etiqueta: (v: number | null) => string;
}

export function Gauge({ valor, referencia, menorEsMejor = false, max, etiqueta }: GaugeProps) {
  const pct = valor === null ? 0 : Math.min(Math.max(valor / max, 0), 1);
  const angulo = -90 + pct * 180;
  const cumple = cumpleObjetivo(valor, referencia, menorEsMejor);
  const color = valor === null ? '#94a3b8' : cumple ? '#16a34a' : '#dc2626';

  // Arco de fondo (semicírculo r=80, centro 100,100)
  const arco = (frac: number) => {
    const a = Math.PI * (1 - frac);
    return { x: 100 + 80 * Math.cos(a), y: 100 - 80 * Math.sin(a) };
  };
  const fin = arco(pct);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[220px]">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" strokeWidth="14" strokeLinecap="round" />
        {valor !== null && pct > 0 && (
          <path
            d={`M 20 100 A 80 80 0 ${pct > 0.5 ? 1 : 0} 1 ${fin.x.toFixed(2)} ${fin.y.toFixed(2)}`}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
        )}
        {/* Marcador de referencia */}
        <line
          x1="100"
          y1="100"
          x2={100 + 88 * Math.cos((Math.PI * (1 - Math.min(referencia / max, 1))))}
          y2={100 - 88 * Math.sin((Math.PI * (1 - Math.min(referencia / max, 1))))}
          stroke="#0a1628"
          strokeWidth="2"
          strokeDasharray="2 2"
        />
        {/* Aguja */}
        <g transform={`rotate(${angulo} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="32" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="5" fill={color} />
      </svg>
      <p className={cn('font-display text-2xl font-700 tnum -mt-2', valor === null && 'text-navy-400')} style={{ color: valor !== null ? color : undefined }}>
        {etiqueta(valor)}
      </p>
    </div>
  );
}
