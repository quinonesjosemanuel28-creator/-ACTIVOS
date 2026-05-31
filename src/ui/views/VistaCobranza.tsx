/**
 * Sección "Cobranza": estados de las ventas nuevas con plan de cuotas
 * (Al día / Atrasado / Morosidad), saldo pendiente y proyección de cobranza.
 * Las cuotas pendientes son PROYECCIÓN, no cash (la REGLA CRÍTICA vive en el
 * dominio: cash/comisiones leen de pagos reales).
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCobranza } from '../hooks';
import { Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
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
};

export function VistaCobranza() {
  const { data, isLoading, error } = useCobranza();
  if (isLoading) return <Centro><Spinner className="h-8 w-8" /></Centro>;
  if (error) return <Centro><p className="text-signal-red">Error: {(error as Error).message}</p></Centro>;
  if (!data) return null;

  const { resumen, cierres, proyeccion } = data;

  return (
    <div>
      <SectionHeader
        titulo="Cobranza & Morosidad"
        descripcion="Ventas nuevas con plan de cuotas. Las cuotas pendientes son proyección, no cash."
      />

      {cierres.length === 0 ? (
        <div className="rounded-xl bg-navy-100 px-4 py-3 text-sm text-navy-600 dark:bg-navy-800 dark:text-navy-200">
          Todavía no hay ventas nuevas con plan de cuotas. Los cierres anteriores quedan saldados y fuera de cobranza.
          Cargá una venta con cuotas desde <b>Cierres y Clientes → Nuevo cierre</b>.
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function FilaCobranza({ c }: { c: CobranzaCierreView }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-t border-navy-100 hover:bg-navy-50 dark:border-navy-700 dark:hover:bg-navy-800/50" onClick={() => setAbierto((v) => !v)}>
        <td className={cn(TD, 'text-navy-400')}>{abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
        <td className={cn(TD, 'font-600 text-navy-900 dark:text-navy-50')}>{c.cliente}</td>
        <td className={cn(TD, 'whitespace-nowrap text-navy-500 dark:text-navy-300')}>{c.fechaCierre}</td>
        <td className={cn(TD, 'text-right tnum')}>{fmtUsd(c.totalUsd)}</td>
        <td className={cn(TD, 'text-right tnum text-navy-700 dark:text-navy-100')}>{fmtUsd(c.abonadoUsd)}</td>
        <td className={cn(TD, 'text-right tnum', c.saldoPendienteUsd > 0 ? 'text-signal-amber' : 'text-signal-green')}>{fmtUsd(c.saldoPendienteUsd)}</td>
        <td className={cn(TD, 'text-center')}>
          <Badge tone={TONO[c.estado]}>{c.estado}{c.estado === 'Morosidad' ? ` · ${c.diasAtraso}d` : ''}</Badge>
        </td>
      </tr>
      {abierto && (
        <tr className="bg-navy-50/60 dark:bg-navy-900/40">
          <td />
          <td colSpan={6} className="px-4 py-3">
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
                        {q.completa
                          ? <span className="text-signal-green">Completa</span>
                          : <span className="text-navy-500 dark:text-navy-300">Pendiente</span>}
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
