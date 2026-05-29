/** Panel de Alertas: el semáforo como tarjetas ordenadas por severidad. */
import { useDashboard } from '../hooks';
import { AlertCard } from '../components/AlertCard';
import { Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';

export function VistaAlertas() {
  const { data, isLoading } = useDashboard();
  if (isLoading || !data)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  return (
    <div>
      <SectionHeader titulo="Panel de Alertas" descripcion="Semáforo automático · las críticas primero." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.alertas.map((a) => (
          <AlertCard key={a.id} alerta={a} />
        ))}
      </div>
    </div>
  );
}
