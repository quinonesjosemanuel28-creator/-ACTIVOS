/** Vista Ejecutiva (home): 6 KPIs grandes con variación M/M + resumen de alertas. */
import { useDashboard } from '../hooks';
import { useUI } from '../store';
import { KpiCard } from '../components/KpiCard';
import { Card, CardBody, CardHeader, CardTitle, Spinner, Button } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { fmtMes, fmtNum, fmtUsd } from '../lib/format';
import type { Severidad } from '@domain/alerts';

const COLOR: Record<Severidad, string> = {
  ROJO: 'bg-signal-red',
  AMARILLO: 'bg-signal-amber',
  VERDE: 'bg-signal-green',
};

export function VistaEjecutiva() {
  const { data, isLoading, error } = useDashboard();
  const { mes, setVista } = useUI();

  if (isLoading) return <Centro><Spinner className="h-8 w-8" /></Centro>;
  if (error) return <Centro><p className="text-signal-red">Error: {(error as Error).message}</p></Centro>;
  if (!data || !mes) return <Centro><p className="text-navy-400">Seleccioná un mes.</p></Centro>;

  const s = data.snapshot;
  const conteo = data.alertas.reduce(
    (acc, a) => ({ ...acc, [a.severidad]: acc[a.severidad] + 1 }),
    { ROJO: 0, AMARILLO: 0, VERDE: 0 } as Record<Severidad, number>,
  );

  return (
    <div>
      <SectionHeader
        titulo={`Vista Ejecutiva · ${fmtMes(mes)}`}
        descripcion="Las métricas críticas del mes, en tiempo real."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard titulo="Ventas Nuevas" metrica={s.ventasNuevas} formato={(v) => fmtUsd(v)} hint="Comprometido del mes" />
        <KpiCard titulo="Cash Collected" metrica={s.cashCollected} formato={(v) => fmtUsd(v)} hint="Dinero efectivo cobrado" />
        <KpiCard titulo="Caja Final" metrica={s.cajaFinal} formato={(v) => fmtUsd(v)} hint="Arrastre histórico" />
        <KpiCard titulo="Utilidad Operativa" metrica={s.utilidadOperativa} formato={(v) => fmtUsd(v)} hint="Cash − Egresos" />
        <KpiCard titulo="Cierres Nuevos" metrica={s.cierres} formato={(v) => fmtNum(v)} hint="Ventas del mes" />
        <KpiCard titulo="AOV Real" metrica={s.aovReal} formato={(v) => fmtUsd(v)} hint="Cash nuevo / cierres" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Pulso del mes</CardTitle></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Mini label="Margen Operativo" valor={s.margenOperativo} pct />
              <Mini label="Margen Contribución" valor={s.margenContribucion} pct />
              <Mini label="Runway" valor={s.runway} sufijo=" meses" decimales={1} />
              <Mini label="Cash Nuevo" valor={s.cashNuevo} usd />
              <Mini label="Cohortes" valor={s.cohortes} usd />
              <Mini label="Inversión Marketing" valor={s.inversionMarketing} usd />
            </div>
          </CardBody>
        </Card>

        <Card className="card-hover cursor-pointer" onClick={() => setVista('alertas')}>
          <CardHeader><CardTitle>Semáforo</CardTitle></CardHeader>
          <CardBody>
            <div className="space-y-3">
              {(['ROJO', 'AMARILLO', 'VERDE'] as Severidad[]).map((sev) => (
                <div key={sev} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-navy-600 dark:text-navy-200">
                    <span className={`h-3 w-3 rounded-full ${COLOR[sev]}`} />
                    {sev === 'ROJO' ? 'Críticas' : sev === 'AMARILLO' ? 'Atención' : 'OK'}
                  </span>
                  <span className="font-display text-xl font-700 tnum">{conteo[sev]}</span>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setVista('alertas')}>
              Ver alertas
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, valor, pct, usd, sufijo, decimales }: { label: string; valor: number | null; pct?: boolean; usd?: boolean; sufijo?: string; decimales?: number }) {
  const txt =
    valor === null
      ? '—'
      : usd
        ? fmtUsd(valor)
        : pct
          ? `${(valor * 100).toFixed(1)}%`
          : `${valor.toFixed(decimales ?? 0)}${sufijo ?? ''}`;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-navy-400">{label}</p>
      <p className="font-display text-lg font-600 text-navy-900 tnum dark:text-navy-50">{txt}</p>
    </div>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[40vh] items-center justify-center">{children}</div>;
}
