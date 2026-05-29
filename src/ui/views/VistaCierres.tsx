/**
 * Pantalla "Cierres y Clientes" — Fase 5: filtros + buscador + resumen.
 * Listado con CRUD (Fase 4) y recálculo del dashboard en tiempo real.
 */
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useCierres, useCierresFiltrados, useMeses, useResumenCierres } from '../hooks';
import { Button, Card, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { FilaCierre } from '../components/cierres/FilaCierre';
import { CierreFormDialog } from '../components/cierres/CierreFormDialog';
import { ZonaAdmin } from '../components/cierres/ZonaAdmin';
import { FiltrosBar, FILTROS_INICIALES, type FiltrosState } from '../components/cierres/FiltrosBar';
import { ResumenCierres } from '../components/cierres/ResumenCierres';
import { useDebounce } from '../lib/useDebounce';
import { resumenDesdeFilas } from '../lib/resumenCierres';

const TH = 'px-3 py-2.5 text-left text-xs font-600 uppercase tracking-wide text-navy-400';

export function VistaCierres() {
  const [nuevo, setNuevo] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES);
  const qDebounced = useDebounce(filtros.q, 300);

  // Filtros que viajan a la API (q con debounce).
  const filtrosApi = useMemo(
    () => ({
      mes: filtros.mes,
      programa: filtros.programa,
      closer: filtros.closer,
      estado: filtros.estado,
      q: qDebounced,
    }),
    [filtros.mes, filtros.programa, filtros.closer, filtros.estado, qDebounced],
  );

  const { data: meses } = useMeses();
  const { data: todos } = useCierres(); // para poblar opciones de closer
  const { data: filas, isLoading, error } = useCierresFiltrados(filtrosApi);
  const sinMes = { programa: filtros.programa, closer: filtros.closer, estado: filtros.estado, q: qDebounced };
  const { data: resumenMes } = useResumenCierres(filtros.mes, sinMes);

  // Opciones de closer = closers efectivos (del cierre Y de los pagos), porque
  // un pago puede tener un closer propio que no es el closer de ningún cierre.
  const closers = useMemo(() => {
    const set = new Set<string>();
    (todos ?? []).forEach((f) => {
      if (f.cierre.closer) set.add(f.cierre.closer);
      f.pagos.forEach((p) => {
        if (p.closer) set.add(p.closer);
      });
    });
    return [...set].sort();
  }, [todos]);

  // Resumen: por mes → backend (incluye cohortes); "Todos" → cálculo en cliente.
  const resumen =
    filtros.mes === 'TODOS' ? resumenDesdeFilas(filas ?? []) : resumenMes;

  return (
    <div>
      <SectionHeader
        titulo="Cierres y Clientes"
        descripcion="Cada venta y sus pagos, en USD y ARS. Cargar o editar mueve también los KPIs del dashboard."
        accion={<Button onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo cierre</Button>}
      />

      <FiltrosBar filtros={filtros} onChange={setFiltros} meses={meses?.meses ?? []} closers={closers} />

      {resumen && (
        <ResumenCierres
          mes={filtros.mes}
          totalCobradoUsd={resumen.totalCobradoUsd}
          totalCobradoArs={resumen.totalCobradoArs}
          cotizacionPonderada={resumen.cotizacionPonderada}
          cantidadCierres={resumen.cantidadCierres}
          cantidadPagos={resumen.cantidadPagos}
        />
      )}

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
      ) : error ? (
        <p className="text-signal-red">Error: {(error as Error).message}</p>
      ) : (filas ?? []).length === 0 ? (
        <div className="mx-auto mt-12 max-w-md text-center">
          <h3 className="font-display text-xl font-700 text-navy-900 dark:text-navy-50">Sin resultados</h3>
          <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">
            Ningún cierre coincide con los filtros. Probá <b>Limpiar</b>, o cargá uno con <b>Nuevo cierre</b>.
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
                {(filas ?? []).map((fila) => (
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
