/**
 * Pantalla "Cierres y Clientes" — Fase 4: listado + detalle + CRUD + reset.
 * Cargar/editar/eliminar recalcula el dashboard al instante (adaptador +
 * invalidación de queries). Filtros/buscador/resumen llegan en Fase 5.
 */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCierres } from '../hooks';
import { Button, Card, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { FilaCierre } from '../components/cierres/FilaCierre';
import { CierreFormDialog } from '../components/cierres/CierreFormDialog';
import { ZonaAdmin } from '../components/cierres/ZonaAdmin';

const TH = 'px-3 py-2.5 text-left text-xs font-600 uppercase tracking-wide text-navy-400';

export function VistaCierres() {
  const { data, isLoading, error } = useCierres();
  const [nuevo, setNuevo] = useState(false);

  if (isLoading)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  if (error)
    return <div className="flex min-h-[40vh] items-center justify-center"><p className="text-signal-red">Error: {(error as Error).message}</p></div>;

  const filas = data ?? [];

  return (
    <div>
      <SectionHeader
        titulo="Cierres y Clientes"
        descripcion="Cada venta y sus pagos, en USD y ARS. Cargar o editar mueve también los KPIs del dashboard."
        accion={<Button onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo cierre</Button>}
      />

      {filas.length === 0 ? (
        <div className="mx-auto mt-16 max-w-md text-center">
          <h3 className="font-display text-xl font-700 text-navy-900 dark:text-navy-50">Sin cierres todavía</h3>
          <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">
            Cargá tu primer cierre con el botón <b>Nuevo cierre</b>, o corré{' '}
            <code className="rounded bg-navy-100 px-1.5 py-0.5 dark:bg-navy-700">npm run seed</code> para datos demo.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH} aria-label="expandir" />
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Cliente</th>
                  <th className={TH}>Programa</th>
                  <th className={TH}>Closer</th>
                  <th className={TH}>Funnel</th>
                  <th className={`${TH} text-right`}>Ticket USD</th>
                  <th className={`${TH} text-right`}>Pagado USD</th>
                  <th className={`${TH} text-right`}>Pagado ARS</th>
                  <th className={`${TH} text-right`}>Pendiente USD</th>
                  <th className={`${TH} text-center`}>Estado</th>
                  <th className={`${TH} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <FilaCierre key={fila.cierre.idCierre} fila={fila} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ZonaAdmin />

      {nuevo && <CierreFormDialog open onClose={() => setNuevo(false)} />}
    </div>
  );
}
