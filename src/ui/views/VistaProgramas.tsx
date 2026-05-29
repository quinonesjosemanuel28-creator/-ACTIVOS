/** Análisis Empresario vs Gestor (R8): comparativa lado a lado. */
import { useComparar } from '../hooks';
import { Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { fmtNum, fmtPct, fmtUsd } from '../lib/format';
import type { DashboardSnapshot } from '@domain/dashboard';
import { cn } from '../lib/utils';

interface Fila {
  label: string;
  get: (s: DashboardSnapshot) => string;
  mejor?: (s: DashboardSnapshot) => number | null;
}

const FILAS: Fila[] = [
  { label: 'Cash Collected', get: (s) => fmtUsd(s.cashCollected.valor), mejor: (s) => s.cashCollected.valor },
  { label: 'Ventas Nuevas', get: (s) => fmtUsd(s.ventasNuevas.valor), mejor: (s) => s.ventasNuevas.valor },
  { label: 'Cierres', get: (s) => fmtNum(s.cierres.valor), mejor: (s) => s.cierres.valor },
  { label: 'AOV Real', get: (s) => fmtUsd(s.aovReal.valor), mejor: (s) => s.aovReal.valor },
  { label: 'Margen Contribución', get: (s) => fmtPct(s.margenContribucion), mejor: (s) => s.margenContribucion },
  { label: 'Cash Nuevo', get: (s) => fmtUsd(s.cashNuevo), mejor: (s) => s.cashNuevo },
  { label: 'Cohortes', get: (s) => fmtUsd(s.cohortes) },
  { label: 'Morosidad cohorte', get: (s) => fmtUsd(s.morosidadCohorte) },
];

export function VistaProgramas() {
  const { data, isLoading } = useComparar();
  if (isLoading || !data)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const { empresario, gestor } = data;
  return (
    <div>
      <SectionHeader
        titulo="Empresario vs Gestor"
        descripcion="Análisis separado de margen, cohorte y adquisición por programa (R8)."
      />
      <Card>
        <CardHeader><CardTitle>Comparativa del mes</CardTitle></CardHeader>
        <CardBody className="pt-2">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-x-2">
            <div />
            <div className="pb-2 text-center text-sm font-600 text-navy-700 dark:text-navy-100">Empresario</div>
            <div className="pb-2 text-center text-sm font-600 text-navy-700 dark:text-navy-100">Gestor</div>
            {FILAS.map((f, i) => {
              const ve = f.mejor?.(empresario) ?? null;
              const vg = f.mejor?.(gestor) ?? null;
              const empMejor = ve !== null && vg !== null && ve > vg;
              const gesMejor = ve !== null && vg !== null && vg > ve;
              return (
                <div key={f.label} className={cn('contents', i % 2 === 0 && '')}>
                  <div className="border-t border-navy-100 py-2.5 text-sm text-navy-500 dark:border-navy-700 dark:text-navy-300">{f.label}</div>
                  <div className={cn('border-t border-navy-100 py-2.5 text-center font-600 tnum dark:border-navy-700', empMejor ? 'text-signal-green' : 'text-navy-900 dark:text-navy-50')}>{f.get(empresario)}</div>
                  <div className={cn('border-t border-navy-100 py-2.5 text-center font-600 tnum dark:border-navy-700', gesMejor ? 'text-signal-green' : 'text-navy-900 dark:text-navy-50')}>{f.get(gestor)}</div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
