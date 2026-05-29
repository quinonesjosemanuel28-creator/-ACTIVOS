/** Fila del listado de cierres, con detalle expandible de pagos y acciones CRUD. */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { FilaCierre as Fila } from '../../lib/api';
import type { Pago } from '@domain/cierres/types';
import { fmtArs, fmtMes, fmtNum, fmtUsd } from '../../lib/format';
import { cn } from '../../lib/utils';
import { BadgeSaldo } from './BadgeSaldo';
import { CierreFormDialog } from './CierreFormDialog';
import { PagoFormDialog } from './PagoFormDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { useEliminarCierre, useEliminarPago } from '../../hooks';

const TD = 'px-3 py-2.5 align-middle';
const iconBtn =
  'rounded-lg p-1.5 text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-700 dark:hover:bg-navy-700';

export function FilaCierre({ fila }: { fila: Fila }) {
  const { cierre, pagos } = fila;
  const [abierto, setAbierto] = useState(false);
  const [editarCierre, setEditarCierre] = useState(false);
  const [borrarCierre, setBorrarCierre] = useState(false);
  const [nuevoPago, setNuevoPago] = useState(false);
  const [pagoEditar, setPagoEditar] = useState<Pago | null>(null);
  const [pagoBorrar, setPagoBorrar] = useState<Pago | null>(null);

  const elimCierre = useEliminarCierre();
  const elimPago = useEliminarPago();

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <>
      <tr
        className="cursor-pointer border-t border-navy-100 transition-colors hover:bg-navy-50 dark:border-navy-700 dark:hover:bg-navy-800/50"
        onClick={() => setAbierto((v) => !v)}
      >
        <td className={cn(TD, 'text-navy-400')}>{abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
        <td className={cn(TD, 'whitespace-nowrap text-navy-500 dark:text-navy-300')}>{cierre.fechaCierre}</td>
        <td className={TD}>
          <div className="font-600 text-navy-900 dark:text-navy-50">{cierre.clienteNombre}</div>
          {cierre.clienteMail && <div className="text-xs text-navy-400">{cierre.clienteMail}</div>}
        </td>
        <td className={cn(TD, 'whitespace-nowrap text-navy-600 dark:text-navy-200')}>{cierre.programa}</td>
        <td className={cn(TD, 'text-navy-600 dark:text-navy-200')}>{cierre.closer ?? '—'}</td>
        <td className={cn(TD, 'text-navy-600 dark:text-navy-200')}>{cierre.funnel ?? '—'}</td>
        <td className={cn(TD, 'text-right font-600 tnum text-navy-900 dark:text-navy-50')}>{fmtUsd(cierre.ticketTotalUsd)}</td>
        <td className={cn(TD, 'text-right tnum text-navy-700 dark:text-navy-100')}>{fmtUsd(fila.pagadoUsd)}</td>
        <td className={cn(TD, 'text-right tnum text-teal-600')}>{fmtArs(fila.pagadoArs)}</td>
        <td className={cn(TD, 'text-right tnum', fila.pendienteUsd > 0 ? 'text-signal-amber' : 'text-signal-green')}>
          {fmtUsd(fila.pendienteUsd)}
        </td>
        <td className={cn(TD, 'text-center')}><BadgeSaldo estado={fila.estadoSaldo} /></td>
        <td className={cn(TD, 'whitespace-nowrap text-right')}>
          <button className={iconBtn} title="Editar cierre" onClick={stop(() => setEditarCierre(true))}><Pencil size={15} /></button>
          <button className={cn(iconBtn, 'hover:text-signal-red')} title="Eliminar cierre" onClick={stop(() => setBorrarCierre(true))}><Trash2 size={15} /></button>
        </td>
      </tr>

      {abierto && (
        <tr className="bg-navy-50/60 dark:bg-navy-900/40">
          <td />
          <td colSpan={11} className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-600 uppercase tracking-wide text-navy-400">Pagos del cierre</h4>
              <button
                className="inline-flex items-center gap-1 rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-600 text-white hover:bg-navy-700 dark:bg-gold-400 dark:text-navy-900"
                onClick={() => setNuevoPago(true)}
              >
                <Plus size={14} /> Agregar pago
              </button>
            </div>
            {pagos.length === 0 ? (
              <p className="text-sm text-navy-400">Este cierre todavía no tiene pagos cargados.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-navy-100 dark:border-navy-700">
                <table className="w-full text-sm">
                  <thead className="bg-navy-100/70 text-xs uppercase tracking-wide text-navy-500 dark:bg-navy-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-600">Fecha</th>
                      <th className="px-3 py-2 text-right font-600">USD</th>
                      <th className="px-3 py-2 text-right font-600">ARS</th>
                      <th className="px-3 py-2 text-right font-600">Cotización</th>
                      <th className="px-3 py-2 text-left font-600">Tipo</th>
                      <th className="px-3 py-2 text-left font-600">Cuota</th>
                      <th className="px-3 py-2 text-left font-600">Medio</th>
                      <th className="px-3 py-2 text-right font-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => (
                      <tr key={p.idPago} className="border-t border-navy-100 dark:border-navy-700">
                        <td className="px-3 py-2 whitespace-nowrap text-navy-500 dark:text-navy-300">{p.fechaPago}</td>
                        <td className="px-3 py-2 text-right tnum text-navy-900 dark:text-navy-50">{fmtUsd(p.montoUsd)}</td>
                        <td className="px-3 py-2 text-right tnum text-teal-600">{fmtArs(p.montoArs)}</td>
                        <td className="px-3 py-2 text-right tnum text-navy-500 dark:text-navy-300">{p.cotizacion ? fmtNum(Math.round(p.cotizacion)) : '—'}</td>
                        <td className="px-3 py-2 text-navy-600 dark:text-navy-200">{p.tipoPago}</td>
                        <td className="px-3 py-2 text-navy-500 dark:text-navy-300">{p.numeroCuota ?? '—'}</td>
                        <td className="px-3 py-2 text-navy-600 dark:text-navy-200">{p.medioPago}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <button className={iconBtn} title="Editar pago" onClick={() => setPagoEditar(p)}><Pencil size={14} /></button>
                          <button className={cn(iconBtn, 'hover:text-signal-red')} title="Eliminar pago" onClick={() => setPagoBorrar(p)}><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(cierre.setter || cierre.referido || cierre.comentarios || cierre.clienteTelefono) && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-navy-500 dark:text-navy-300">
                {cierre.setter && <span><b>Setter:</b> {cierre.setter}</span>}
                {cierre.clienteTelefono && <span><b>Tel:</b> {cierre.clienteTelefono}</span>}
                {cierre.referido && <span><b>Referido:</b> {cierre.referido}</span>}
                {cierre.comentarios && <span><b>Notas:</b> {cierre.comentarios}</span>}
                <span><b>Cierre del mes:</b> {fmtMes(cierre.fechaCierre.slice(0, 7))}</span>
              </div>
            )}
          </td>
        </tr>
      )}

      {/* Diálogos */}
      {editarCierre && <CierreFormDialog open onClose={() => setEditarCierre(false)} cierre={cierre} />}
      {nuevoPago && <PagoFormDialog open onClose={() => setNuevoPago(false)} idCierre={cierre.idCierre} cliente={cierre.clienteNombre} />}
      {pagoEditar && <PagoFormDialog open onClose={() => setPagoEditar(null)} idCierre={cierre.idCierre} cliente={cierre.clienteNombre} pago={pagoEditar} />}

      <ConfirmDialog
        open={borrarCierre}
        onClose={() => setBorrarCierre(false)}
        title="Eliminar cierre"
        mensaje={<>Vas a eliminar el cierre de <b>{cierre.clienteNombre}</b> y <b>todos sus pagos</b>. Esta acción no se puede deshacer.</>}
        textoConfirmar="Eliminar"
        loading={elimCierre.isPending}
        onConfirm={() => elimCierre.mutate(cierre.idCierre, { onSuccess: () => setBorrarCierre(false) })}
      />
      <ConfirmDialog
        open={!!pagoBorrar}
        onClose={() => setPagoBorrar(null)}
        title="Eliminar pago"
        mensaje={<>Vas a eliminar el pago de <b>{fmtUsd(pagoBorrar?.montoUsd ?? 0)}</b> del {pagoBorrar?.fechaPago}. ¿Continuar?</>}
        textoConfirmar="Eliminar"
        loading={elimPago.isPending}
        onConfirm={() => pagoBorrar && elimPago.mutate(pagoBorrar.idPago, { onSuccess: () => setPagoBorrar(null) })}
      />
    </>
  );
}
