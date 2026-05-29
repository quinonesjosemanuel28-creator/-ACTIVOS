/** Marketing & Adquisición: CAC, ROAS y MER con gauges contra sus topes. */
import { useDashboard, useParametros } from '../hooks';
import { Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { Gauge } from '../components/Gauge';
import { fmtUsd } from '../lib/format';

export function VistaMarketing() {
  const { data, isLoading } = useDashboard();
  const { data: params } = useParametros();
  if (isLoading || !data || !params)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const s = data.snapshot;
  return (
    <div>
      <SectionHeader
        titulo="Marketing & Adquisición"
        descripcion="Eficiencia del gasto en adquisición vs sus objetivos."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>CAC</CardTitle></CardHeader>
          <CardBody>
            <Gauge valor={s.cac} referencia={params.topeCacUsd} menorEsMejor max={params.topeCacUsd * 2} etiqueta={(v) => fmtUsd(v)} />
            <p className="mt-2 text-center text-xs text-navy-400">Tope {fmtUsd(params.topeCacUsd)} · menor es mejor</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>ROAS</CardTitle></CardHeader>
          <CardBody>
            <Gauge valor={s.roas} referencia={3} max={8} etiqueta={(v) => (v === null ? '—' : `${v.toFixed(1)}x`)} />
            <p className="mt-2 text-center text-xs text-navy-400">Objetivo ≥ 3x · Cash / inversión</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>MER</CardTitle></CardHeader>
          <CardBody>
            <Gauge valor={s.mer} referencia={3} max={8} etiqueta={(v) => (v === null ? '—' : `${v.toFixed(1)}x`)} />
            <p className="mt-2 text-center text-xs text-navy-400">Objetivo ≥ 3x · Ventas / inversión</p>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardBody className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-4">
          <Dato label="Inversión Marketing" valor={fmtUsd(s.inversionMarketing)} />
          <Dato label="Cash Collected" valor={fmtUsd(s.cashCollected.valor)} />
          <Dato label="Ventas Nuevas" valor={fmtUsd(s.ventasNuevas.valor)} />
          <Dato label="Cierres" valor={String(s.cierres.valor ?? '—')} />
        </CardBody>
      </Card>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-navy-400">{label}</p>
      <p className="font-display text-lg font-600 text-navy-900 tnum dark:text-navy-50">{valor}</p>
    </div>
  );
}
