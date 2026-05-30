/** Alta / edición de un egreso (doble moneda en vivo, categoría, recurrente). */
import { useMemo, useState, type FormEvent } from 'react';
import type { Egreso } from '@domain/types';
import { CATEGORIAS_EGRESO } from '@domain/egresos/categorias';
import { Dialog } from '../ui/Dialog';
import { Button, Input, Select } from '../ui/primitives';
import { useCrearEgreso, useEditarEgreso } from '../../hooks';
import { derivarMonedas } from '../../lib/cotizacion';
import { fmtArs, fmtNum, fmtUsd } from '../../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  egreso?: Egreso; // si viene, es edición
}

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

export function EgresoFormDialog({ open, onClose, egreso }: Props) {
  const esEdicion = !!egreso;
  const crear = useCrearEgreso();
  const editar = useEditarEgreso();
  const [error, setError] = useState<string | null>(null);
  const [usd, setUsd] = useState(egreso?.montoUsd != null ? String(egreso.montoUsd) : '');
  const [ars, setArs] = useState(egreso?.montoArs != null ? String(egreso.montoArs) : '');
  const [cotiz, setCotiz] = useState(egreso?.cotizacion != null ? String(Math.round(egreso.cotizacion)) : '');

  const derivado = useMemo(
    () => derivarMonedas({ montoUsd: numOrUndef(usd), montoArs: numOrUndef(ars), cotizacion: numOrUndef(cotiz) }),
    [usd, ars, cotiz],
  );

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const data = {
      fecha: f.get('fecha'),
      categoria: f.get('categoria'),
      concepto: (f.get('concepto') as string) || undefined,
      montoUsd: numOrUndef(usd),
      montoArs: numOrUndef(ars),
      cotizacion: numOrUndef(cotiz),
      recurrente: f.get('recurrente') === 'on',
      medioPago: (f.get('medioPago') as string) || undefined,
      comentarios: (f.get('comentarios') as string) || undefined,
    };
    const onOk = () => onClose();
    const onErr = (err: Error) => setError(err.message);
    if (esEdicion) editar.mutate({ id: egreso!.idEgreso, data }, { onSuccess: onOk, onError: onErr });
    else crear.mutate(data, { onSuccess: onOk, onError: onErr });
  };

  const pend = crear.isPending || editar.isPending;

  return (
    <Dialog open={open} onClose={onClose} title={esEdicion ? 'Editar egreso' : 'Nuevo egreso'}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><Input type="date" name="fecha" defaultValue={egreso?.fecha} required /></Field>
        <Field label="Categoría">
          <Select name="categoria" defaultValue={egreso?.categoria ?? CATEGORIAS_EGRESO[0]}>
            {CATEGORIAS_EGRESO.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Concepto / descripción" full>
          <Input name="concepto" defaultValue={egreso?.concepto} placeholder="Ej. Pauta IG, alquiler oficina…" />
        </Field>

        <Field label="Monto USD"><Input type="number" min="0" step="any" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="0" /></Field>
        <Field label="Monto ARS"><Input type="number" min="0" step="any" value={ars} onChange={(e) => setArs(e.target.value)} placeholder="0" /></Field>
        <Field label="Cotización (opcional)" full>
          <Input type="number" min="0" step="any" value={cotiz} onChange={(e) => setCotiz(e.target.value)} placeholder="Se calcula sola con USD + ARS" />
        </Field>

        <div className="col-span-2 rounded-xl bg-navy-50 px-3 py-2 text-sm dark:bg-navy-800">
          <span className="text-navy-500 dark:text-navy-300">Se guardará: </span>
          <span className="font-600 text-navy-900 dark:text-navy-50">{fmtUsd(derivado.montoUsd ?? null)}</span>
          <span className="text-navy-400"> · </span>
          <span className="font-600 text-teal-600">{fmtArs(derivado.montoArs ?? null)}</span>
          <span className="text-navy-400"> · cotización </span>
          <span className="font-600 text-navy-900 dark:text-navy-50">{derivado.cotizacion ? fmtNum(Math.round(derivado.cotizacion)) : '—'}</span>
        </div>

        <Field label="Tipo">
          <Select name="recurrente" defaultValue={egreso?.recurrente ? 'on' : ''}>
            <option value="">Puntual (pago único)</option>
            <option value="on">Recurrente (cada mes)</option>
          </Select>
        </Field>
        <Field label="Medio de pago (opcional)"><Input name="medioPago" defaultValue={egreso?.medioPago} placeholder="Transferencia, tarjeta…" /></Field>
        <Field label="Comentarios (opcional)" full><Input name="comentarios" defaultValue={egreso?.comentarios} /></Field>

        {error && <p className="col-span-2 text-sm text-signal-red">{error}</p>}

        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pend}>Cancelar</Button>
          <Button type="submit" disabled={pend}>{pend ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Registrar egreso'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
