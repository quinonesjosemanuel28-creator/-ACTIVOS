/** Alta / edición de un pago, con cálculo de cotización en vivo (doble moneda). */
import { useMemo, useState, type FormEvent } from 'react';
import type { Pago } from '@domain/cierres/types';
import { Dialog } from '../ui/Dialog';
import { Button, Input, Select } from '../ui/primitives';
import { useAgregarPago, useEditarPago } from '../../hooks';
import { derivarMonedas } from '../../lib/cotizacion';
import { fmtArs, fmtNum, fmtUsd } from '../../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  idCierre: string;
  cliente?: string;
  /** Closer de la venta: default del campo cuando el pago no tiene closer propio. */
  closerCierre?: string;
  pago?: Pago; // si viene, es edición
}

const MEDIOS = ['Transferencia Lemon', 'Transferencia BBVA', 'Transferencia MP', 'CRYPTO', 'Hotmart', 'Dólares', 'Otro'];

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? 'col-span-2 block' : 'block'}>
      <span className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">{label}</span>
      {children}
    </label>
  );
}

const numOrUndef = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

export function PagoFormDialog({ open, onClose, idCierre, cliente, closerCierre, pago }: Props) {
  const esEdicion = !!pago;
  const agregar = useAgregarPago();
  const editar = useEditarPago();
  const [error, setError] = useState<string | null>(null);

  const [usd, setUsd] = useState(pago?.montoUsd != null ? String(pago.montoUsd) : '');
  const [ars, setArs] = useState(pago?.montoArs != null ? String(pago.montoArs) : '');
  const [cotiz, setCotiz] = useState(pago?.cotizacion != null ? String(Math.round(pago.cotizacion)) : '');

  // Cálculo en vivo (ARS + USD mandan; si no, deriva con la cotización).
  const derivado = useMemo(
    () => derivarMonedas({ montoUsd: numOrUndef(usd), montoArs: numOrUndef(ars), cotizacion: numOrUndef(cotiz) }),
    [usd, ars, cotiz],
  );

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const data = {
      idCierre,
      fechaPago: f.get('fechaPago'),
      horaPago: (f.get('horaPago') as string) || undefined,
      montoUsd: numOrUndef(usd),
      montoArs: numOrUndef(ars),
      cotizacion: numOrUndef(cotiz),
      tipoPago: f.get('tipoPago'),
      numeroCuota: (f.get('numeroCuota') as string) || undefined,
      medioPago: f.get('medioPago'),
      closer: (f.get('closer') as string) || undefined,
      comprobanteUrl: (f.get('comprobanteUrl') as string) || undefined,
      comentarios: (f.get('comentarios') as string) || undefined,
    };
    const onOk = () => onClose();
    const onErr = (err: Error) => setError(err.message);
    if (esEdicion) editar.mutate({ id: pago!.idPago, data }, { onSuccess: onOk, onError: onErr });
    else agregar.mutate(data, { onSuccess: onOk, onError: onErr });
  };

  const pend = agregar.isPending || editar.isPending;

  return (
    <Dialog open={open} onClose={onClose} title={esEdicion ? 'Editar pago' : `Agregar pago${cliente ? ` · ${cliente}` : ''}`}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Fecha de pago"><Input type="date" name="fechaPago" defaultValue={pago?.fechaPago} required /></Field>
        <Field label="Hora (opcional)"><Input type="time" name="horaPago" defaultValue={pago?.horaPago} /></Field>

        <Field label="Monto USD"><Input type="number" min="0" step="any" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="0" /></Field>
        <Field label="Monto ARS (real cobrado)"><Input type="number" min="0" step="any" value={ars} onChange={(e) => setArs(e.target.value)} placeholder="0" /></Field>

        <Field label="Cotización (opcional)" full>
          <Input type="number" min="0" step="any" value={cotiz} onChange={(e) => setCotiz(e.target.value)} placeholder="Se calcula sola con USD + ARS" />
        </Field>

        {/* Preview en vivo de la triada resuelta */}
        <div className="col-span-2 rounded-xl bg-navy-50 px-3 py-2 text-sm dark:bg-navy-800">
          <span className="text-navy-500 dark:text-navy-300">Se guardará: </span>
          <span className="font-600 text-navy-900 dark:text-navy-50">{fmtUsd(derivado.montoUsd ?? null)}</span>
          <span className="text-navy-400"> · </span>
          <span className="font-600 text-teal-600">{fmtArs(derivado.montoArs ?? null)}</span>
          <span className="text-navy-400"> · cotización </span>
          <span className="font-600 text-navy-900 dark:text-navy-50">{derivado.cotizacion ? fmtNum(Math.round(derivado.cotizacion)) : '—'}</span>
        </div>

        <Field label="Tipo de pago">
          <Select name="tipoPago" defaultValue={pago?.tipoPago ?? 'Reserva/Seña'}>
            <option>Reserva/Seña</option>
            <option>Cuota</option>
            <option>Pago Completo</option>
          </Select>
        </Field>
        <Field label="N° de cuota (opcional)"><Input name="numeroCuota" defaultValue={pago?.numeroCuota} placeholder="1/2, 2/3…" /></Field>
        <Field label="Closer (quién cobró este pago)">
          <Input name="closer" defaultValue={pago?.closer ?? closerCierre} placeholder={closerCierre ? `${closerCierre} (del cierre)` : 'Closer'} />
        </Field>
        <Field label="Medio de pago">
          <Select name="medioPago" defaultValue={pago?.medioPago ?? 'Transferencia Lemon'}>
            {MEDIOS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Comprobante (URL, opcional)"><Input name="comprobanteUrl" defaultValue={pago?.comprobanteUrl} placeholder="https://…" /></Field>
        <Field label="Comentarios (opcional)" full><Input name="comentarios" defaultValue={pago?.comentarios} /></Field>

        {error && <p className="col-span-2 text-sm text-signal-red">{error}</p>}

        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pend}>Cancelar</Button>
          <Button type="submit" disabled={pend}>{pend ? 'Guardando…' : esEdicion ? 'Guardar pago' : 'Agregar pago'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
