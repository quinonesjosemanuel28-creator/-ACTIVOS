import { useEffect } from 'react';
import { useMeses } from './hooks';
import { useUI } from './store';
import { Sidebar, MobileNav } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Spinner } from './components/ui/primitives';
import { VistaEjecutiva } from './views/VistaEjecutiva';
import { VistaAlertas } from './views/VistaAlertas';
import { VistaCashFlow } from './views/VistaCashFlow';
import { VistaFunnel } from './views/VistaFunnel';
import { VistaHistorico } from './views/VistaHistorico';
import { VistaMarketing } from './views/VistaMarketing';
import { VistaProgramas } from './views/VistaProgramas';
import { VistaCierres } from './views/VistaCierres';
import { VistaEgresos } from './views/VistaEgresos';
import { VistaComisiones } from './views/VistaComisiones';
import { VistaDatos } from './views/VistaDatos';

export function App() {
  const { data, isLoading } = useMeses();
  const { mes, setMes, vista } = useUI();

  // El mes más reciente es el driver maestro por defecto.
  useEffect(() => {
    if (!mes && data?.actual) setMes(data.actual);
  }, [mes, data, setMes]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <MobileNav />
        <main className="flex-1 p-4 md:p-6">
          {isLoading ? (
            <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
          ) : !data?.meses.length ? (
            <SinDatos />
          ) : (
            <>
              {vista === 'ejecutiva' && <VistaEjecutiva />}
              {vista === 'alertas' && <VistaAlertas />}
              {vista === 'cashflow' && <VistaCashFlow />}
              {vista === 'funnel' && <VistaFunnel />}
              {vista === 'historico' && <VistaHistorico />}
              {vista === 'marketing' && <VistaMarketing />}
              {vista === 'programas' && <VistaProgramas />}
              {vista === 'cierres' && <VistaCierres />}
              {vista === 'egresos' && <VistaEgresos />}
              {vista === 'comisiones' && <VistaComisiones />}
              {vista === 'datos' && <VistaDatos />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SinDatos() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h2 className="font-display text-2xl font-700 text-navy-900 dark:text-navy-50">Sin datos todavía</h2>
      <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">
        Importá el tablero .xlsx desde <strong>Carga & Admin</strong> o corré <code className="rounded bg-navy-100 px-1.5 py-0.5">npm run seed</code> para cargar datos demo.
      </p>
    </div>
  );
}
