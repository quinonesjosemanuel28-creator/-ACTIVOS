/** Funnel Comercial: embudo Agendas → Asistieron → Cerrados con tasas. */
import { useDashboard } from '../hooks';
import { Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { fmtNum, fmtPct } from '../lib/format';
import { cn } from '../lib/utils';

export function VistaFunnel() {
  const { data, isLoading } = useDashboard();
  if (isLoading || !data)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const { funnel, tasaShow, tasaCierre } = data.snapshot;
  const max = Math.max(funnel.agendas, 1);
  const etapas = [
    { label: 'Agendas', valor: funnel.agendas, color: 'bg-navy-500' },
    { label: 'Asistieron', valor: funnel.asistieron, color: 'bg-teal-500' },
    { label: 'Cerrados', valor: funnel.cerrados, color: 'bg-gold-400' },
  ];

  return (
    <div>
      <SectionHeader titulo="Funnel Comercial" descripcion="Del agendamiento al cierre, con tasas de conversión." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Embudo del mes</CardTitle></CardHeader>
          <CardBody className="space-y-4 pt-2">
            {etapas.map((e) => {
              const ancho = Math.max((e.valor / max) * 100, 6);
              return (
                <div key={e.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-500 text-navy-600 dark:text-navy-200">{e.label}</span>
                    <span className="font-600 tnum text-navy-900 dark:text-navy-50">{fmtNum(e.valor)}</span>
                  </div>
                  <div className="h-8 overflow-hidden rounded-lg bg-navy-100 dark:bg-navy-700">
                    <div
                      className={cn('h-full rounded-lg transition-all duration-500', e.color)}
                      style={{ width: `${ancho}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
        <div className="grid grid-cols-1 gap-4">
          <TasaCard titulo="Tasa de Show" valor={tasaShow} detalle="Asistieron / Agendas" />
          <TasaCard titulo="Tasa de Cierre" valor={tasaCierre} detalle="Cerrados / Asistieron" />
        </div>
      </div>
    </div>
  );
}

function TasaCard({ titulo, valor, detalle }: { titulo: string; valor: number | null; detalle: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{titulo}</p>
      <p className="mt-1 font-display text-4xl font-700 text-navy-900 tnum dark:text-navy-50">{fmtPct(valor)}</p>
      <p className="mt-1 text-xs text-navy-400">{detalle}</p>
    </Card>
  );
}
