/**
 * Pantalla "Cierres y Clientes" — Fase 3: listado + detalle expandible.
 * Solo lectura. Formularios CRUD (Fase 4) y filtros/resumen (Fase 5) luego.
 */
import { useCierres } from '../hooks';
import { Card, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { FilaCierre } from '../components/cierres/FilaCierre';

const TH = 'px-3 py-2.5 text-left text-xs font-600 uppercase tracking-wide text-navy-400';

export function VistaCierres() {
  const { data, isLoading, error } = useCierres();

  if (isLoading)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  if (error)
    return <div className="flex min-h-[40vh] items-center justify-center"><p className="text-signal-red">Error: {(error as Error).message}</p></div>;

  const filas = data ?? [];

  return (
    <div>
      <SectionHeader
        titulo="Cierres y Clientes"
        descripcion="Cada venta y sus pagos. El negocio cierra en USD y cobra en ARS — ves ambas monedas. Tocá una fila para ver sus pagos."
      />

      {filas.length === 0 ? (
        <div className="mx-auto mt-16 max-w-md text-center">
          <h3 className="font-display text-xl font-700 text-navy-900 dark:text-navy-50">Sin cierres todavía</h3>
          <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">
            Corré <code className="rounded bg-navy-100 px-1.5 py-0.5 dark:bg-navy-700">npm run seed</code> para ver datos demo, o cargá uno desde Carga & Admin (Fase 4).
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
    </div>
  );
}
