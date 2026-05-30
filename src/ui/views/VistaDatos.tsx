/**
 * Carga & Administración — alineada al modelo nuevo (enfoque A).
 * Las ventas/cobros se cargan en "Cierres y Clientes" (Nuevo cierre / Agregar
 * pago). Acá quedan: importador de cierres desde Excel, Egresos, Parámetros
 * y Cierre de mes (estos tres siguen alimentando el dashboard sin cambios).
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Lock, Unlock } from 'lucide-react';
import { api } from '../lib/api';
import { useDashboard, useParametros } from '../hooks';
import { useUI } from '../store';
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Select, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { ImportarDialog } from '../components/cierres/ImportarDialog';
import { CATEGORIAS_EGRESO } from '@domain/egresos/categorias';
import { fmtMes } from '../lib/format';

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function VistaDatos() {
  const { mes } = useUI();
  const { data: dash } = useDashboard();
  const invalidar = useInvalidar();
  const estado = dash?.estadoMes ?? 'Abierto';

  return (
    <div>
      <SectionHeader
        titulo="Carga & Administración"
        descripcion="Importá cierres, registrá egresos, ajustá parámetros y cerrá el mes."
      />
      <p className="mb-4 rounded-xl bg-navy-100 px-4 py-2 text-sm text-navy-600 dark:bg-navy-800 dark:text-navy-200">
        Las ventas y los pagos se cargan en <b>Cierres y Clientes</b> (botones “Nuevo cierre” y “Agregar pago”).
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ImportarCierresCard />
        <CierreCard mes={mes} estado={estado} onDone={invalidar} />
        <EgresoForm onDone={invalidar} />
        <ParametrosCard onDone={invalidar} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">{label}</span>
      {children}
    </label>
  );
}

function Mensaje({ m }: { m: { tipo: 'ok' | 'error'; texto: string } | null }) {
  if (!m) return null;
  return <p className={`mt-3 text-sm ${m.tipo === 'ok' ? 'text-signal-green' : 'text-signal-red'}`}>{m.texto}</p>;
}

// ───────────────────────── Importar cierres desde Excel ─────────────────────────
function ImportarCierresCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader><CardTitle>Importar cierres desde Excel</CardTitle></CardHeader>
      <CardBody>
        <p className="mb-3 text-sm text-navy-500 dark:text-navy-300">
          Cargá un <b>.xlsx</b> con hoja <b>PAGOS</b> (una fila por pago, agrupadas por <code>id_cierre</code>).
          Vista previa antes de guardar · no duplica al reimportar.
        </p>
        <Button variant="gold" onClick={() => setOpen(true)}>
          <FileSpreadsheet size={16} /> Importar cierres
        </Button>
        <ImportarDialog open={open} onClose={() => setOpen(false)} />
      </CardBody>
    </Card>
  );
}

// ───────────────────────── Cierre de mes ─────────────────────────
function CierreCard({ mes, estado, onDone }: { mes: string | null; estado: 'Abierto' | 'Cerrado'; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: () => (estado === 'Abierto' ? api.cerrarMes(mes!) : api.reabrirMes(mes!)),
    onSuccess: onDone,
  });
  return (
    <Card>
      <CardHeader><CardTitle>Cierre de mes</CardTitle></CardHeader>
      <CardBody>
        <p className="mb-3 text-sm text-navy-500 dark:text-navy-300">
          {mes ? fmtMes(mes) : '—'} está <strong>{estado}</strong>. Un mes cerrado bloquea ediciones (R6).
        </p>
        <Button variant={estado === 'Abierto' ? 'danger' : 'primary'} onClick={() => mut.mutate()} disabled={!mes || mut.isPending}>
          {estado === 'Abierto' ? <><Lock size={16} /> Cerrar mes</> : <><Unlock size={16} /> Reabrir mes</>}
        </Button>
      </CardBody>
    </Card>
  );
}

// ───────────────────────── Egreso ─────────────────────────
function EgresoForm({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const mut = useMutation({
    mutationFn: api.agregarEgreso,
    onSuccess: () => { setMsg({ tipo: 'ok', texto: 'Egreso agregado.' }); onDone(); },
    onError: (e: Error) => setMsg({ tipo: 'error', texto: e.message }),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mut.mutate({
      fecha: f.get('fecha'),
      categoria: f.get('categoria'),
      concepto: f.get('concepto') || undefined,
      montoUsd: Number(f.get('monto')),
    });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Nuevo egreso (rápido)</CardTitle></CardHeader>
      <CardBody>
        <p className="mb-3 text-sm text-navy-500 dark:text-navy-300">Para el historial completo, doble moneda y recurrentes, usá la sección <b>Egresos</b>.</p>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><Input type="date" name="fecha" required /></Field>
          <Field label="Categoría">
            <Select name="categoria">
              {CATEGORIAS_EGRESO.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Concepto"><Input name="concepto" placeholder="Opcional" /></Field>
          <Field label="Monto (USD)"><Input type="number" name="monto" min="1" step="any" required /></Field>
          <div className="flex items-end col-span-2"><Button type="submit" className="w-full" disabled={mut.isPending}>Agregar</Button></div>
        </form>
        <Mensaje m={msg} />
      </CardBody>
    </Card>
  );
}

// ───────────────────────── Parámetros ─────────────────────────
function ParametrosCard({ onDone }: { onDone: () => void }) {
  const { data, isLoading } = useParametros();
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const mut = useMutation({
    mutationFn: api.guardarParametros,
    onSuccess: () => { setMsg({ tipo: 'ok', texto: 'Parámetros guardados.' }); onDone(); },
    onError: (e: Error) => setMsg({ tipo: 'error', texto: e.message }),
  });
  if (isLoading || !data) return <Card><CardBody><Spinner /></CardBody></Card>;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mut.mutate({
      cajaInicialUsd: Number(f.get('caja')),
      costosFijosMensualesUsd: Number(f.get('costos')),
      metaCashCollectedUsd: Number(f.get('metaCash')),
      metaMargenOperativo: Number(f.get('metaMargen')) / 100,
      topeCacUsd: Number(f.get('topeCac')),
      metaTasaCierre: Number(f.get('metaCierre')) / 100,
      runwayMinimoMeses: Number(f.get('runwayMin')),
    });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Parámetros (centro de control)</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Caja inicial (USD)"><Input type="number" name="caja" step="any" defaultValue={data.cajaInicialUsd} /></Field>
          <Field label="Costos fijos/mes"><Input type="number" name="costos" step="any" defaultValue={data.costosFijosMensualesUsd} /></Field>
          <Field label="Meta cash (USD)"><Input type="number" name="metaCash" step="any" defaultValue={data.metaCashCollectedUsd} /></Field>
          <Field label="Meta margen op. (%)"><Input type="number" name="metaMargen" step="any" defaultValue={data.metaMargenOperativo * 100} /></Field>
          <Field label="Tope CAC (USD)"><Input type="number" name="topeCac" step="any" defaultValue={data.topeCacUsd} /></Field>
          <Field label="Meta tasa cierre (%)"><Input type="number" name="metaCierre" step="any" defaultValue={data.metaTasaCierre * 100} /></Field>
          <Field label="Runway mínimo (meses)"><Input type="number" name="runwayMin" step="any" defaultValue={data.runwayMinimoMeses} /></Field>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={mut.isPending}>Guardar</Button></div>
        </form>
        <Mensaje m={msg} />
      </CardBody>
    </Card>
  );
}
