/** Resumen del período de egresos: totales, operativo vs retiros, desglose. */
import type { ResumenEgresos as Resumen } from '@domain/egresos/metrics';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/primitives';
import { fmtArs, fmtNum, fmtPct, fmtUsd } from '../../lib/format';
import { cn } from '../../lib/utils';

export function ResumenEgresos({ resumen }: { resumen: Resumen }) {
  const max = Math.max(...resumen.porCategoria.map((l) => l.usd), 1);
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 lg:col-span-1">
        <Stat label="Total egresos USD" valor={fmtUsd(resumen.totalUsd)} />
        <Stat label="Total egresos ARS" valor={fmtArs(resumen.totalArs)} acento />
        <Stat label="Costo operativo USD" valor={fmtUsd(resumen.costoOperativoUsd)} hint="categorías 1–7" />
        <Stat label="Retiros de socios USD" valor={fmtUsd(resumen.distribucionUsd)} hint="distribución, no operativo" rojo />
        <div className="col-span-2">
          <Stat
            label="Cotización ponderada"
            valor={resumen.cotizacionPonderada ? fmtNum(Math.round(resumen.cotizacionPonderada)) : '—'}
            hint="Σ ARS / Σ USD"
          />
        </div>
      </div>

      {/* Desglose por categoría */}
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>¿Dónde se va la plata? · por categoría</CardTitle></CardHeader>
        <CardBody className="space-y-2 pt-2">
          {resumen.porCategoria.length === 0 ? (
            <p className="text-sm text-navy-400">Sin egresos en el período.</p>
          ) : (
            resumen.porCategoria.map((l) => (
              <div key={l.categoria}>
                <div className="mb-0.5 flex items-center justify-between text-sm">
                  <span className={cn('font-500', l.esDistribucion ? 'text-signal-red' : 'text-navy-700 dark:text-navy-100')}>
                    {l.categoria}{l.esDistribucion && ' · distribución'}
                  </span>
                  <span className="tnum text-navy-600 dark:text-navy-200">
                    {fmtUsd(l.usd)} <span className="text-navy-400">({fmtPct(l.pctUsd)})</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-navy-100 dark:bg-navy-700">
                  <div
                    className={cn('h-full rounded-full', l.esDistribucion ? 'bg-signal-red' : 'bg-gold-400')}
                    style={{ width: `${Math.max((l.usd / max) * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, valor, hint, acento, rojo }: { label: string; valor: string; hint?: string; acento?: boolean; rojo?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{label}</p>
      <p className={cn('mt-1 font-display text-xl font-700 tnum', acento ? 'text-teal-600' : rojo ? 'text-signal-red' : 'text-navy-900 dark:text-navy-50')}>
        {valor}
      </p>
      {hint && <p className="mt-0.5 text-xs text-navy-400">{hint}</p>}
    </Card>
  );
}
