import { useEffect, useLayoutEffect } from 'react';
import { accionesDe } from '@domain/auth/permisos';
import { useMeses, useSesion } from './hooks';
import { useUI, ACCION_POR_VISTA } from './store';
import { Sidebar, MobileNav } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Spinner } from './components/ui/primitives';
import { VistaLogin } from './views/VistaLogin';
import { VistaEjecutiva } from './views/VistaEjecutiva';
import { VistaAlertas } from './views/VistaAlertas';
import { VistaCashFlow } from './views/VistaCashFlow';
import { VistaFunnel } from './views/VistaFunnel';
import { VistaHistorico } from './views/VistaHistorico';
import { VistaMarketing } from './views/VistaMarketing';
import { VistaProgramas } from './views/VistaProgramas';
import { VistaCierres } from './views/VistaCierres';
import { VistaCobranza } from './views/VistaCobranza';
import { VistaEgresos } from './views/VistaEgresos';
import { VistaAsistente } from './views/VistaAsistente';
import { VistaComisiones } from './views/VistaComisiones';
import { VistaDatos } from './views/VistaDatos';
import { VistaUsuarios } from './views/VistaUsuarios';

export function App() {
  const sesion = useSesion();

  // Publica la sesión (usuario + acciones) en el store ANTES de pintar, para
  // que el gating por rol no muestre nada de más ni un solo frame.
  const setSesion = useUI((s) => s.setSesion);
  useLayoutEffect(() => {
    if (sesion.data === undefined) return; // cargando
    if (sesion.data === null) setSesion(null, []);
    else setSesion(sesion.data.usuario, accionesDe(sesion.data.usuario.rol));
  }, [sesion.data, setSesion]);

  if (sesion.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>
    );
  }
  // Sin sesión (401) → solo existe el login.
  if (!sesion.data) return <VistaLogin />;

  return <Dashboard />;
}

/** El dashboard completo: solo se monta con sesión válida. */
function Dashboard() {
  const { data, isLoading } = useMeses();
  const { mes, setMes, vista, acciones } = useUI();

  // El mes más reciente es el driver maestro por defecto.
  useEffect(() => {
    if (!mes && data?.actual) setMes(data.actual);
  }, [mes, data, setMes]);

  // Cinturón extra: si la vista activa no está permitida para el rol, no se
  // renderiza (el server igualmente respondería 401/403).
  const vistaPermitida = acciones.includes(ACCION_POR_VISTA[vista]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <MobileNav />
        <main className="flex-1 p-4 md:p-6">
          {isLoading ? (
            <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
          ) : !data?.meses.length && vista !== 'datos' && vista !== 'usuarios' ? (
            <SinDatos />
          ) : !vistaPermitida ? (
            <VistaEjecutiva />
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
              {vista === 'cobranza' && <VistaCobranza />}
              {vista === 'egresos' && <VistaEgresos />}
              {vista === 'comisiones' && <VistaComisiones />}
              {vista === 'asistente' && <VistaAsistente />}
              {vista === 'datos' && <VistaDatos />}
              {vista === 'usuarios' && <VistaUsuarios />}
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
