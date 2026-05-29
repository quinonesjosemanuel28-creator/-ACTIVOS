/** Fila del listado de cierres, con detalle expandible de sus pagos. */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FilaCierre as Fila } from '../../lib/api';
import { fmtArs, fmtMes, fmtNum, fmtUsd } from '../../lib/format';
import { cn } from '../../lib/utils';
import { BadgeSaldo } from './BadgeSaldo';

const TD = 'px-3 py-2.5 align-middle';

export function FilaCierre({ fila }: { fila: Fila }) {
  const [abierto, setAbierto] = useState(false);
  const { cierre, pagos } = fila;

  return (
    <>
      <tr
        className="cursor-pointer border-t border-navy-100 transition-colors hover:bg-navy-50 dark:border-navy-700 dark:hover:bg-navy-800/50"
        onClick={() => setAbierto((v) => !v)}
      >
        <td className={cn(TD, 'text-navy-400')}>
          {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </td>
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
      </tr>

      {abierto && (
        <tr className="bg-navy-50/60 dark:bg-navy-900/40">
          <td />
          <td colSpan={10} className="px-4 py-3">
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
    </>
  );
}
