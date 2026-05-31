/**
 * Funnel Comercial — datos reales y editables.
 * Agendas y Shows: carga manual (editable). Cerrados: derivado de los cierres
 * reales del mes (coincide con la sección Cierres). Tasas + valor por reunión
 * (USD/ARS) + cierres por programa + variación M/M.
 */
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Briefcase, GraduationCap, Lock, Pencil } from 'lucide-react';
import { useFunnel, useGuardarFunnel } from '../hooks';
import { useUI } from '../store';
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { fmtArs, fmtMes, fmtNum, fmtPct, fmtUsd } from '../lib/format';
import { cn } from '../lib/utils';

export function VistaFunnel() {
  const { mes } = useUI();
  const { data, isLoading } = useFunnel();
  const [editar, setEditar] = useState(false);

  if (isLoading || !data || !mes)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const max = Math.max(data.agendas, data.asistieron, data.cerrados, 1);
  const etapas = [
    { label: 'Agendas', valor: data.agendas, color: 'bg-navy-500', manual: true },
    { label: 'Asistieron (shows)', valor: data.asistieron, color: 'bg-teal-500', manual: true },
    { label: 'Cerrados', valor: data.cerrados, color: 'bg-gold-400', manual: false },
  ];

  return (
    <div>
      <SectionHeader
        titulo={`Funnel Comercial · ${fmtMes(mes)}`}
        descripcion="Agendas y shows se cargan a mano; Cerrados sale de los cierres reales del mes."
        accion={<Button variant="outline" onClick={() => setEditar(true)}><Pencil size={16} /> Editar agendas/shows</Button>}
      />

      {!data.cargaManual && (
        <div className="mb-4 rounded-xl border-l-4 border-l-signal-amber bg-amber-50 px-4 py-2.5 text-sm text-signal-amber dark:bg-amber-900/20">
          Agendas y shows sin cargar (en 0). Las tasas no se calculan hasta cargarlos. <b>Cerrados</b> ya muestra los cierres reales del mes.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Embudo */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Embudo del mes</CardTitle></CardHeader>
          <CardBody className="space-y-4 pt-2">
            {etapas.map((e) => (
              <div key={e.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-500 text-navy-600 dark:text-navy-200">
                    {e.label}
                    {!e.manual && <span className="inline-flex items-center gap-0.5 text-xs text-navy-400"><Lock size={11} /> auto</span>}
                  </span>
                  <span className="font-600 tnum text-navy-900 dark:text-navy-50">{fmtNum(e.valor)}</span>
                </div>
                <div className="h-8 overflow-hidden rounded-lg bg-navy-100 dark:bg-navy-700">
                  <div className={cn('h-full rounded-lg transition-all duration-500', e.color)} style={{ width: `${Math.max((e.valor / max) * 100, 3)}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs text-navy-400">“Cerrados” = cierres nuevos del mes (sección Cierres). No editable.</p>
          </CardBody>
        </Card>

        {/* Tasas con M/M */}
        <div className="grid grid-cols-1 gap-4">
          <TasaCard titulo="Tasa de Show" valor={data.tasaShow} variacion={data.varShow} detalle="Asistieron / Agendas" />
          <TasaCard titulo="Tasa de Cierre" valor={data.tasaCierre} variacion={data.varCierre} detalle="Cerrados / Asistieron" />
          <TasaCard titulo="Tasa Global" valor={data.tasaGlobal} variacion={data.varGlobal} detalle="Cerrados / Agendas" />
        </div>
      </div>

      {/* Métricas nuevas */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Valor titulo="Valor por agenda" usd={data.valorPorAgendaUsd} ars={data.valorPorAgendaArs} hint="cash nuevo / agendas" />
        <Valor titulo="Valor por show" usd={data.valorPorShowUsd} ars={data.valorPorShowArs} hint="cash nuevo / shows" />
        <Card className="p-4">
          <p className="text-xs font-600 uppercase tracking-wide text-navy-400">Cierres por programa</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-navy-50 px-3 py-2 dark:bg-navy-800">
              <div className="flex items-center gap-1.5 text-xs text-navy-500 dark:text-navy-300"><GraduationCap size={15} /> Cero a Gestor</div>
              <p className="font-display text-xl font-700 tnum text-navy-900 dark:text-navy-50">{fmtNum(data.cierresPorPrograma.ceroGestor)}</p>
            </div>
            <div className="rounded-xl bg-navy-50 px-3 py-2 dark:bg-navy-800">
              <div className="flex items-center gap-1.5 text-xs text-navy-500 dark:text-navy-300"><Briefcase size={15} /> Empresario</div>
              <p className="font-display text-xl font-700 tnum text-navy-900 dark:text-navy-50">{fmtNum(data.cierresPorPrograma.empresario)}</p>
            </div>
          </div>
        </Card>
      </div>

      {editar && <EditarFunnel mes={mes} agendas={data.agendas} asistieron={data.asistieron} onClose={() => setEditar(false)} />}
    </div>
  );
}

function TasaCard({ titulo, valor, variacion, detalle }: { titulo: string; valor: number | null; variacion: number | null; detalle: string }) {
  const sube = variacion !== null && variacion > 0;
  const baja = variacion !== null && variacion < 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{titulo}</p>
        {variacion !== null && (
          <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-600 tnum',
            sube && 'bg-green-100 text-signal-green dark:bg-green-900/40 dark:text-green-300',
            baja && 'bg-red-100 text-signal-red dark:bg-red-900/40 dark:text-red-300')}>
            {sube ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{fmtPct(Math.abs(variacion))}
          </span>
        )}
      </div>
      <p className="mt-1 font-display text-3xl font-700 tnum text-navy-900 dark:text-navy-50">{fmtPct(valor)}</p>
      <p className="mt-1 text-xs text-navy-400">{detalle}</p>
    </Card>
  );
}

function Valor({ titulo, usd, ars, hint }: { titulo: string; usd: number | null; ars: number | null; hint: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{titulo}</p>
      <p className="mt-1 font-display text-2xl font-700 tnum text-navy-900 dark:text-navy-50">{fmtUsd(usd)}</p>
      <p className="text-xs text-teal-600 tnum">{fmtArs(ars)}</p>
      <p className="mt-0.5 text-xs text-navy-400">{hint}</p>
    </Card>
  );
}

function EditarFunnel({ mes, agendas, asistieron, onClose }: { mes: string; agendas: number; asistieron: number; onClose: () => void }) {
  const guardar = useGuardarFunnel();
  const [a, setA] = useState(String(agendas));
  const [s, setS] = useState(String(asistieron));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <Card className="w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-display text-lg font-700 text-navy-900 dark:text-navy-50">Editar funnel · {fmtMes(mes)}</h3>
        <p className="mb-4 text-xs text-navy-400">Cerrados se calcula solo de los cierres reales; no se edita.</p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">Agendas</span>
            <Input type="number" min="0" value={a} onChange={(e) => setA(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">Asistieron (shows)</span>
            <Input type="number" min="0" value={s} onChange={(e) => setS(e.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
          <Button
            onClick={() => guardar.mutate({ mes, agendas: Number(a) || 0, asistieron: Number(s) || 0 }, { onSuccess: onClose })}
            disabled={guardar.isPending}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
