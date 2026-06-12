/**
 * Sección "Egresos": registrar, ver, editar y eliminar gastos, con historial,
 * filtros y resumen por categoría (operativo vs retiros de socios). Doble
 * moneda. Espejo de "Cierres y Clientes". Recurrentes proyectados por mes.
 */
import { useMemo, useState } from 'react';
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import type { Egreso } from '@domain/types';
import { esDistribucion } from '@domain/egresos/categorias';
import { useEgresos, useMeses, useResumenEgresos, useEliminarEgreso } from '../hooks';
import { Button, Card, Spinner, Badge } from '../components/ui/primitives';
import { usePuede } from '../store';
import { SectionHeader } from '../components/SectionHeader';
import { ResumenEgresos } from '../components/egresos/ResumenEgresos';
import { EgresoFormDialog } from '../components/egresos/EgresoFormDialog';
import { FiltrosBarEgresos, FILTROS_EGRESOS_INICIALES, type FiltrosEgresosState } from '../components/egresos/FiltrosBarEgresos';
import { ConfirmDialog } from '../components/cierres/ConfirmDialog';
import { useDebounce } from '../lib/useDebounce';
import { resumenEgresos as calcResumen } from '@domain/egresos/metrics';
import { fmtArs, fmtUsd } from '../lib/format';
import { cn } from '../lib/utils';

const TH = 'px-3 py-2.5 text-left text-xs font-600 uppercase tracking-wide text-navy-400';
const TD = 'px-3 py-2.5 align-middle';
const iconBtn = 'rounded-lg p-1.5 text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-700 dark:hover:bg-navy-700';

export function VistaEgresos() {
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Egreso | null>(null);
  const [borrar, setBorrar] = useState<Egreso | null>(null);
  const [filtros, setFiltros] = useState<FiltrosEgresosState>(FILTROS_EGRESOS_INICIALES);
  const qDebounced = useDebounce(filtros.q, 300);

  const filtrosApi = useMemo(
    () => ({ mes: filtros.mes, categoria: filtros.categoria, moneda: filtros.moneda, tipo: filtros.tipo, q: qDebounced }),
    [filtros.mes, filtros.categoria, filtros.moneda, filtros.tipo, qDebounced],
  );

  const { data: meses } = useMeses();
  const { data: egresos, isLoading, error } = useEgresos(filtrosApi);
  const sinMes = { categoria: filtros.categoria, moneda: filtros.moneda, tipo: filtros.tipo, q: qDebounced };
  const { data: resumenMes } = useResumenEgresos(filtros.mes, sinMes);
  const elim = useEliminarEgreso();
  const puedeEditar = usePuede('editar');

  // Resumen: por mes → backend; "Todos" → cálculo en cliente sobre la lista.
  const resumen = filtros.mes === 'TODOS' ? calcResumen(egresos ?? []) : resumenMes;

  return (
    <div>
      <SectionHeader
        titulo="Egresos"
        descripcion="Todos los gastos del negocio, en USD y ARS. Operativo vs retiros de socios, recurrentes y puntuales."
        accion={puedeEditar ? <Button onClick={() => setNuevo(true)}><Plus size={16} /> Registrar egreso</Button> : undefined}
      />

      <FiltrosBarEgresos filtros={filtros} onChange={setFiltros} meses={meses?.meses ?? []} />

      {resumen && <ResumenEgresos resumen={resumen} />}

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
      ) : error ? (
        <p className="text-signal-red">Error: {(error as Error).message}</p>
      ) : (egresos ?? []).length === 0 ? (
        <div className="mx-auto mt-12 max-w-md text-center">
          <h3 className="font-display text-xl font-700 text-navy-900 dark:text-navy-50">Sin egresos</h3>
          <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">
            Registrá uno con <b>Registrar egreso</b>, o ajustá los filtros.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Concepto</th>
                  <th className={TH}>Categoría</th>
                  <th className={TH}>Tipo</th>
                  <th className={`${TH} text-right`}>USD</th>
                  <th className={`${TH} text-right`}>ARS</th>
                  <th className={`${TH} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(egresos ?? []).map((e) => (
                  <tr key={e.idEgreso} className="border-t border-navy-100 hover:bg-navy-50 dark:border-navy-700 dark:hover:bg-navy-800/50">
                    <td className={cn(TD, 'whitespace-nowrap text-navy-500 dark:text-navy-300')}>{e.fecha}</td>
                    <td className={cn(TD, 'text-navy-900 dark:text-navy-50')}>{e.concepto ?? '—'}</td>
                    <td className={TD}>
                      <Badge tone={esDistribucion(e.categoria) ? 'red' : 'gold'}>{e.categoria}</Badge>
                    </td>
                    <td className={cn(TD, 'text-navy-600 dark:text-navy-200')}>
                      {e.recurrente ? <span className="inline-flex items-center gap-1 text-teal-600"><Repeat size={13} /> Recurrente</span> : 'Puntual'}
                    </td>
                    <td className={cn(TD, 'text-right font-600 tnum text-navy-900 dark:text-navy-50')}>{fmtUsd(e.montoUsd)}</td>
                    <td className={cn(TD, 'text-right tnum text-teal-600')}>{fmtArs(e.montoArs)}</td>
                    <td className={cn(TD, 'whitespace-nowrap text-right')}>
                      {puedeEditar && (
                        <>
                          <button className={iconBtn} title="Editar" onClick={() => setEditar(e)}><Pencil size={15} /></button>
                          <button className={cn(iconBtn, 'hover:text-signal-red')} title="Eliminar" onClick={() => setBorrar(e)}><Trash2 size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nuevo && <EgresoFormDialog open onClose={() => setNuevo(false)} />}
      {editar && <EgresoFormDialog open onClose={() => setEditar(null)} egreso={editar} />}
      <ConfirmDialog
        open={!!borrar}
        onClose={() => setBorrar(null)}
        title="Eliminar egreso"
        mensaje={<>Vas a eliminar <b>{borrar?.concepto ?? borrar?.categoria}</b> ({fmtUsd(borrar?.montoUsd ?? 0)}). ¿Continuar?</>}
        textoConfirmar="Eliminar"
        loading={elim.isPending}
        onConfirm={() => borrar && elim.mutate(borrar.idEgreso, { onSuccess: () => setBorrar(null) })}
      />
    </div>
  );
}
