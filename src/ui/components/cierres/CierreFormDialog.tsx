/** Alta / edición de un cierre. */
import { useState, type FormEvent } from 'react';
import type { Cierre } from '@domain/cierres/types';
import { Dialog } from '../ui/Dialog';
import { Button, Input, Select } from '../ui/primitives';
import { useCrearCierre, useEditarCierre } from '../../hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  cierre?: Cierre; // si viene, es edición
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? 'col-span-2 block' : 'block'}>
      <span className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">{label}</span>
      {children}
    </label>
  );
}

export function CierreFormDialog({ open, onClose, cierre }: Props) {
  const esEdicion = !!cierre;
  const crear = useCrearCierre();
  const editar = useEditarCierre();
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState(cierre?.ticketTotalUsd != null ? String(cierre.ticketTotalUsd) : '');
  const [cuotas, setCuotas] = useState('1');
  const montoCuota = Number(ticket) > 0 && Number(cuotas) > 0 ? Number(ticket) / Number(cuotas) : null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const data = {
      fechaCierre: f.get('fechaCierre'),
      clienteNombre: f.get('clienteNombre'),
      clienteMail: (f.get('clienteMail') as string) || undefined,
      clienteTelefono: (f.get('clienteTelefono') as string) || undefined,
      programa: f.get('programa'),
      ticketTotalUsd: Number(f.get('ticketTotalUsd')),
      closer: (f.get('closer') as string) || undefined,
      setter: (f.get('setter') as string) || undefined,
      funnel: (f.get('funnel') as string) || undefined,
      referido: (f.get('referido') as string) || undefined,
      comentarios: (f.get('comentarios') as string) || undefined,
      estado: f.get('estado'),
      // Plan de cuotas: solo en alta de ventas nuevas (no en edición de legacy).
      cantidadCuotas: !esEdicion && f.get('cantidadCuotas') ? Number(f.get('cantidadCuotas')) : undefined,
    };
    const onOk = () => onClose();
    const onErr = (err: Error) => setError(err.message);
    if (esEdicion) editar.mutate({ id: cierre!.idCierre, data }, { onSuccess: onOk, onError: onErr });
    else crear.mutate(data, { onSuccess: onOk, onError: onErr });
  };

  const pend = crear.isPending || editar.isPending;

  return (
    <Dialog open={open} onClose={onClose} title={esEdicion ? 'Editar cierre' : 'Nuevo cierre'}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Fecha de cierre">
          <Input type="date" name="fechaCierre" defaultValue={cierre?.fechaCierre} required />
        </Field>
        <Field label="Programa">
          <Select name="programa" defaultValue={cierre?.programa ?? 'Empresario'}>
            <option>Empresario</option>
            <option>Cero a Gestor</option>
          </Select>
        </Field>
        <Field label="Cliente" full>
          <Input name="clienteNombre" defaultValue={cierre?.clienteNombre} placeholder="Nombre y apellido" required />
        </Field>
        <Field label="Mail"><Input type="email" name="clienteMail" defaultValue={cierre?.clienteMail} placeholder="Opcional" /></Field>
        <Field label="Teléfono"><Input name="clienteTelefono" defaultValue={cierre?.clienteTelefono} placeholder="Opcional" /></Field>
        <Field label="Ticket total (USD)">
          <Input type="number" name="ticketTotalUsd" min="1" step="any" value={ticket} onChange={(e) => setTicket(e.target.value)} required />
        </Field>
        <Field label="Estado">
          <Select name="estado" defaultValue={cierre?.estado ?? 'Activo'}>
            <option>Activo</option>
            <option>No continúa</option>
          </Select>
        </Field>
        {!esEdicion && (
          <>
            <Field label="Cantidad de cuotas (1–4)">
              <Select name="cantidadCuotas" value={cuotas} onChange={(e) => setCuotas(e.target.value)}>
                <option value="1">1 (pago único)</option>
                <option value="2">2 cuotas</option>
                <option value="3">3 cuotas</option>
                <option value="4">4 cuotas</option>
              </Select>
            </Field>
            <Field label="Monto por cuota (calculado)">
              <div className="flex h-10 items-center rounded-xl bg-navy-50 px-3 text-sm font-600 tnum text-navy-900 dark:bg-navy-800 dark:text-navy-50">
                {montoCuota !== null ? `$${(Math.round(montoCuota * 100) / 100).toLocaleString('es-AR')}` : '—'}
              </div>
            </Field>
          </>
        )}
        <Field label="Closer"><Input name="closer" defaultValue={cierre?.closer} placeholder="Opcional" /></Field>
        <Field label="Setter"><Input name="setter" defaultValue={cierre?.setter} placeholder="Opcional" /></Field>
        <Field label="Funnel"><Input name="funnel" defaultValue={cierre?.funnel} placeholder="Opcional" /></Field>
        <Field label="Referido"><Input name="referido" defaultValue={cierre?.referido} placeholder="Opcional" /></Field>
        <Field label="Comentarios" full>
          <Input name="comentarios" defaultValue={cierre?.comentarios} placeholder="Notas internas (opcional)" />
        </Field>

        {error && <p className="col-span-2 text-sm text-signal-red">{error}</p>}

        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pend}>Cancelar</Button>
          <Button type="submit" disabled={pend}>{pend ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear cierre'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
