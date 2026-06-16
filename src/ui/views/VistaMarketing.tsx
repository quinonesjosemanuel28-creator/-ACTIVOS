/** Marketing & Adquisición: CAC, ROAS y MER con gauges contra objetivos editables. */
import { useState, type FormEvent } from 'react';
import { Target } from 'lucide-react';
import { useDashboard, useParametros, useGuardarParametros } from '../hooks';
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Spinner } from '../components/ui/primitives';
import { usePuede } from '../store';
import { SectionHeader } from '../components/SectionHeader';
import { Gauge } from '../components/Gauge';
import { Dialog } from '../components/ui/Dialog';
import { fmtUsd } from '../lib/format';

export function VistaMarketing() {
  const { data, isLoading } = useDashboard();
  const { data: params } = useParametros();
  const [editar, setEditar] = useState(false);
  const puedeEditar = usePuede('editar'); // hook: SIEMPRE antes de cualquier return (rules of hooks)

  if (isLoading || !data || !params)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const s = data.snapshot;
  return (
    <div>
      <SectionHeader
        titulo="Marketing & Adquisición"
        descripcion="Eficiencia del gasto en adquisición vs tus objetivos."
        accion={puedeEditar ? <Button variant="outline" onClick={() => setEditar(true)}><Target size={16} /> Editar objetivos</Button> : undefined}
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
            <Gauge valor={s.roas} referencia={params.objetivoRoas} max={Math.max(params.objetivoRoas * 2.5, 8)} etiqueta={(v) => (v === null ? '—' : `${v.toFixed(1)}x`)} />
            <p className="mt-2 text-center text-xs text-navy-400">Objetivo ≥ {params.objetivoRoas}x · Cash / inversión</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>MER</CardTitle></CardHeader>
          <CardBody>
            <Gauge valor={s.mer} referencia={params.objetivoMer} max={Math.max(params.objetivoMer * 2.5, 8)} etiqueta={(v) => (v === null ? '—' : `${v.toFixed(1)}x`)} />
            <p className="mt-2 text-center text-xs text-navy-400">Objetivo ≥ {params.objetivoMer}x · Ventas / inversión</p>
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

      {editar && (
        <EditarObjetivos
          topeCacUsd={params.topeCacUsd}
          objetivoRoas={params.objetivoRoas}
          objetivoMer={params.objetivoMer}
          onClose={() => setEditar(false)}
        />
      )}
    </div>
  );
}

function EditarObjetivos({ topeCacUsd, objetivoRoas, objetivoMer, onClose }: { topeCacUsd: number; objetivoRoas: number; objetivoMer: number; onClose: () => void }) {
  const guardar = useGuardarParametros();
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    guardar.mutate(
      { topeCacUsd: Number(f.get('cac')), objetivoRoas: Number(f.get('roas')), objetivoMer: Number(f.get('mer')) },
      { onSuccess: onClose, onError: (err: Error) => setError(err.message) },
    );
  };
  return (
    <Dialog open onClose={onClose} title="Editar objetivos de Marketing">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-navy-500 dark:text-navy-300">Los gauges (verde/rojo) usan estos objetivos. No cambian el cálculo de CAC/ROAS/MER, solo las metas.</p>
        <Field label="Tope de CAC (USD) — menor es mejor"><Input type="number" name="cac" min="0" step="any" defaultValue={topeCacUsd} required /></Field>
        <Field label="Objetivo de ROAS (x) — mayor es mejor"><Input type="number" name="roas" min="0" step="any" defaultValue={objetivoRoas} required /></Field>
        <Field label="Objetivo de MER (x) — mayor es mejor"><Input type="number" name="mer" min="0" step="any" defaultValue={objetivoMer} required /></Field>
        {error && <p className="text-sm text-signal-red">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
          <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar objetivos'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">{label}</span>
      {children}
    </label>
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
