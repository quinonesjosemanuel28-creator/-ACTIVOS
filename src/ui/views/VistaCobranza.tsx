/**
 * Sección "Cobranza": estados de las ventas nuevas con plan de cuotas
 * (Al día / Atrasado / Morosidad), saldo pendiente y proyección de cobranza.
 * Las cuotas pendientes son PROYECCIÓN, no cash (la REGLA CRÍTICA vive en el
 * dominio: cash/comisiones leen de pagos reales).
 */
import { useState } from 'react';
import { Ban, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useCobranza, useMarcarInactivo } from '../hooks';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import type { CobranzaCierreView } from '../lib/api';
import { fmtMes, fmtUsd } from '../lib/format';
import { cn } from '../lib/utils';

const TH = 'px-3 py-2.5 text-left text-xs font-600 uppercase tracking-wide text-navy-400';
const TD = 'px-3 py-2.5 align-middle';

const TONO: Record<CobranzaCierreView['estado'], 'green' | 'amber' | 'red' | 'neutral'> = {
  'Al día': 'green',
  Atrasado: 'amber',
  Morosidad: 'red',
  Saldado: 'neutral',
  Inactivo: 'neutral',
};

const COLOR_NIVEL: Record<string, string> = {
  verde: 'bg-signal-green',
  amarillo: 'bg-yellow-400',
  naranja: 'bg-orange-500',
  rojo: 'bg-signal-red',
  negro: 'bg-navy-950 dark:bg-black',
  none: 'bg-navy-200 dark:bg-navy-600',
};
const ETIQUETA_NIVEL: Record<string, string> = {
  verde: 'Próximo a vencer',
  amarillo: 'Recién vencido',
  naranja: 'Atrasado',
  rojo: 'Moroso',
  negro: 'Lista negra',
  none: 'Sin alerta',
};

export function VistaCobranza() {
  const { data, isLoading, error } = useCobranza();
  if (isLoading) return <Centro><Spinner className="h-8 w-8" /></Centro>;
  if (error) return <Centro><p className="text-signal-red">Error: {(error as Error).message}</p></Centro>;
  if (!data) return null;

  const { resumen, cierres, listaNegra, inactivos, proyeccion } = data;

  return (
    <div>
      <SectionHeader
        titulo="Cobranza & Morosidad"
        descripcion="Ventas nuevas con plan de cuotas. Las cuotas pendientes son proyección, no cash."
      />

      {cierres.length === 0 && inactivos.length === 0 ? (
        <div className="rounded-xl bg-navy-100 px-4 py-3 text-sm text-navy-600 dark:bg-navy-800 dark:text-navy-200">
          Todavía no hay ventas nuevas con plan de cuotas. Los cierres anteriores quedan saldados y fuera de cobranza.
          Cargá una venta con cuotas desde <b>Cierres y Clientes → Nuevo cierre</b>.
        </div>
      ) : (
        <>
          {/* Semáforo de cobranza (cantidad de cierres por color) */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Semaforo color="bg-signal-green" label="Próximo a vencer" sub="faltan ≤5 días" n={resumen.semaforo.verde} />
            <Semaforo color="bg-yellow-400" label="Recién vencido" sub="día 0 a 3" n={resumen.semaforo.amarillo} />
            <Semaforo color="bg-orange-500" label="Atrasado" sub="día 4 a 8" n={resumen.semaforo.naranja} />
            <Semaforo color="bg-signal-red" label="Moroso" sub="día 9 a 60" n={resumen.semaforo.rojo} />
            <Semaforo color="bg-navy-950 dark:bg-black" label="Lista negra" sub="día 61+" n={resumen.semaforo.negro} />
          </div>

          {/* Resumen de estados */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Al día" valor={String(resumen.alDia)} tono="green" />
            <Stat label="Atrasados" valor={String(resumen.atrasado)} tono="amber" />
            <Stat label="En morosidad" valor={String(resumen.morosidad)} tono="red" hint={fmtUsd(resumen.morosidadUsd)} />
            <Stat label="Saldo pendiente total" valor={fmtUsd(resumen.saldoPendienteUsd)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Listado */}
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader><CardTitle>Ventas con cuotas</CardTitle></CardHeader>
              <CardBody className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={TH} aria-label="expandir" />
                        <th className={TH}>Cliente</th>
                        <th className={TH}>Cierre</th>
                        <th className={`${TH} text-right`}>Total</th>
                        <th className={`${TH} text-right`}>Pagado</th>
                        <th className={`${TH} text-right`}>Pendiente</th>
                        <th className={`${TH} text-center`}>Estado</th>
                        <th className={`${TH} text-right`}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cierres.map((c) => <FilaCobranza key={c.idCierre} c={c} />)}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            {/* Proyección de cobranza */}
            <Card>
              <CardHeader><CardTitle>Proyección de cobranza</CardTitle></CardHeader>
              <CardBody>
                <p className="mb-3 text-xs text-navy-400">Monto pendiente por mes de vencimiento. Es proyección, no cash cobrado.</p>
                {proyeccion.length === 0 ? (
                  <p className="text-sm text-navy-400">Sin cuotas pendientes.</p>
                ) : (
                  <div className="space-y-2">
                    {proyeccion.map((p) => (
                      <div key={p.mes} className="flex items-center justify-between text-sm">
                        <span className="text-navy-600 dark:text-navy-200">{fmtMes(p.mes)}</span>
                        <span className="font-600 tnum text-navy-900 dark:text-navy-50">{fmtUsd(p.montoUsd)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Lista negra: clientes con cuota a +60 días */}
          {listaNegra.length > 0 && (
            <Card className="mt-4 overflow-hidden border-navy-300 dark:border-navy-600">
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-navy-950 dark:bg-black" /> Lista negra ({listaNegra.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardBody className="px-0 pb-0">
                <p className="px-4 pb-2 text-xs text-navy-400">Cuotas con más de 60 días de atraso. Revisar para marcar Inactivo si el cliente no continúa.</p>
                <table className="w-full text-sm">
                  <tbody>
                    {listaNegra.map((c) => <FilaCobranza key={c.idCierre} c={c} />)}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}

          {/* Inactivos: facturación consolidada (fuera de cobranza) */}
          {inactivos.length > 0 && (
            <Card className="mt-4 overflow-hidden">
              <CardHeader><CardTitle>Inactivos ({inactivos.length}) · facturación consolidada</CardTitle></CardHeader>
              <CardBody className="px-0 pb-0">
                <p className="px-4 pb-2 text-xs text-navy-400">Marcados manualmente. El ticket quedó ajustado a lo pagado; fuera de morosidad y proyección. Reversible.</p>
                <table className="w-full text-sm">
                  <tbody>
                    {inactivos.map((c) => <FilaCobranza key={c.idCierre} c={c} />)}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function FilaCobranza({ c }: { c: CobranzaCierreView }) {
  const [abierto, setAbierto] = useState(false);
  const inactivar = useMarcarInactivo();
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <>
      <tr className="cursor-pointer border-t border-navy-100 hover:bg-navy-50 dark:border-navy-700 dark:hover:bg-navy-800/50" onClick={() => setAbierto((v) => !v)}>
        <td className={cn(TD, 'text-navy-400')}>{abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
        <td className={cn(TD, 'font-600 text-navy-900 dark:text-navy-50')}>
          <span className="inline-flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', COLOR_NIVEL[c.nivel ?? 'none'])} title={ETIQUETA_NIVEL[c.nivel ?? 'none']} />
            {c.cliente}
          </span>
        </td>
        <td className={cn(TD, 'whitespace-nowrap text-navy-500 dark:text-navy-300')}>{c.fechaCierre}</td>
        <td className={cn(TD, 'text-right tnum')}>{fmtUsd(c.totalUsd)}</td>
        <td className={cn(TD, 'text-right tnum text-navy-700 dark:text-navy-100')}>{fmtUsd(c.abonadoUsd)}</td>
        <td className={cn(TD, 'text-right tnum', c.saldoPendienteUsd > 0 ? 'text-signal-amber' : 'text-signal-green')}>{fmtUsd(c.saldoPendienteUsd)}</td>
        <td className={cn(TD, 'text-center')}>
          {c.inactivo
            ? <Badge tone="neutral">Inactivo</Badge>
            : <Badge tone={TONO[c.estado]}>{c.estado}{c.estado === 'Morosidad' ? ` · ${c.diasAtraso}d` : ''}</Badge>}
        </td>
        <td className={cn(TD, 'text-right')}>
          {c.inactivo ? (
            <Button variant="ghost" size="sm" title="Reactivar" disabled={inactivar.isPending}
              onClick={stop(() => inactivar.mutate({ id: c.idCierre, inactivo: false }))}>
              <RotateCcw size={14} /> Reactivar
            </Button>
          ) : (
            <Button variant="ghost" size="sm" title="Marcar como Inactivo" disabled={inactivar.isPending}
              onClick={stop(() => { if (confirm(`Marcar a ${c.cliente} como Inactivo? El ticket se ajusta a lo pagado (${fmtUsd(c.abonadoUsd)}) y sale de cobranza. Es reversible.`)) inactivar.mutate({ id: c.idCierre, inactivo: true }); })}>
              <Ban size={14} /> Inactivar
            </Button>
          )}
        </td>
      </tr>
      {abierto && (
        <tr className="bg-navy-50/60 dark:bg-navy-900/40">
          <td />
          <td colSpan={7} className="px-4 py-3">
            <div className="overflow-hidden rounded-xl border border-navy-100 dark:border-navy-700">
              <table className="w-full text-xs">
                <thead className="bg-navy-100/70 text-navy-500 dark:bg-navy-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-600">Cuota</th>
                    <th className="px-3 py-2 text-right font-600">Monto</th>
                    <th className="px-3 py-2 text-right font-600">Abonado</th>
                    <th className="px-3 py-2 text-left font-600">Vencimiento</th>
                    <th className="px-3 py-2 text-left font-600">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {c.cuotas.map((q) => (
                    <tr key={q.numero} className="border-t border-navy-100 dark:border-navy-700">
                      <td className="px-3 py-1.5">#{q.numero}</td>
                      <td className="px-3 py-1.5 text-right tnum">{fmtUsd(q.montoUsd)}</td>
                      <td className="px-3 py-1.5 text-right tnum">{fmtUsd(q.abonadoUsd)}</td>
                      <td className="px-3 py-1.5">
                        {q.vencimiento}
                        {q.vencimientoEstimado && <span className="ml-1 text-navy-400">(est.)</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {q.completa ? (
                          <span className="text-signal-green">Completa</span>
                        ) : q.nivel ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full', COLOR_NIVEL[q.nivel])} />
                            {ETIQUETA_NIVEL[q.nivel]}
                          </span>
                        ) : (
                          <span className="text-navy-500 dark:text-navy-300">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Semaforo({ color, label, sub, n }: { color: string; label: string; sub: string; n: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className={cn('h-3 w-3 rounded-full', color)} />
        <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{label}</p>
      </div>
      <p className="mt-1 font-display text-2xl font-700 tnum text-navy-900 dark:text-navy-50">{n}</p>
      <p className="text-xs text-navy-400">{sub}</p>
    </Card>
  );
}

function Stat({ label, valor, tono, hint }: { label: string; valor: string; tono?: 'green' | 'amber' | 'red'; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-700 tnum',
        tono === 'green' && 'text-signal-green', tono === 'amber' && 'text-signal-amber', tono === 'red' && 'text-signal-red',
        !tono && 'text-navy-900 dark:text-navy-50')}>{valor}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-400">{hint}</p>}
    </Card>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[40vh] items-center justify-center">{children}</div>;
}
