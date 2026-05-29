/** Carga de datos, importación de Excel, cierre de mes y parámetros. */
import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Unlock, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useDashboard, useParametros } from '../hooks';
import { useUI } from '../store';
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Select, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { fmtMes } from '../lib/format';

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function VistaDatos() {
  const { mes, programa } = useUI();
  const { data: dash } = useDashboard();
  const invalidar = useInvalidar();
  const estado = dash?.estadoMes ?? 'Abierto';

  return (
    <div>
      <SectionHeader titulo="Carga & Administración" descripcion="Cargá movimientos, importá el tablero y cerrá el mes." />
      {programa !== 'TODOS' && (
        <p className="mb-4 rounded-xl bg-gold-100 px-4 py-2 text-sm text-gold-700">
          Filtro de programa activo ({programa}). Las altas se guardan igual; quitá el filtro para ver todo.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ImportarCard onDone={invalidar} />
        <CierreCard mes={mes} estado={estado} onDone={invalidar} />
        <VentaForm onDone={invalidar} />
        <CobroForm onDone={invalidar} />
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
  return (
    <p className={`mt-3 text-sm ${m.tipo === 'ok' ? 'text-signal-green' : 'text-signal-red'}`}>{m.texto}</p>
  );
}

// ───────────────────────── Importar Excel ─────────────────────────
function ImportarCard({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const mut = useMutation({
    mutationFn: (f: File) => api.importarExcel(f),
    onSuccess: (r: any) => {
      setMsg({ tipo: 'ok', texto: `Importado: ${r.ventas} ventas, ${r.cobros} cobros, ${r.egresos} egresos.` });
      onDone();
    },
    onError: (e: Error) => setMsg({ tipo: 'error', texto: e.message }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Importar tablero (.xlsx)</CardTitle></CardHeader>
      <CardBody>
        <p className="mb-3 text-sm text-navy-500 dark:text-navy-300">
          Migra Ventas/Cobros/Egresos/Parámetros del Excel actual. Idempotente.
        </p>
        <input
          ref={ref}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && mut.mutate(e.target.files[0])}
        />
        <Button variant="gold" onClick={() => ref.current?.click()} disabled={mut.isPending}>
          {mut.isPending ? <Spinner /> : <Upload size={16} />} Elegir archivo
        </Button>
        <Mensaje m={msg} />
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

// ───────────────────────── Venta ─────────────────────────
function VentaForm({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const mut = useMutation({
    mutationFn: api.agregarVenta,
    onSuccess: () => { setMsg({ tipo: 'ok', texto: 'Venta agregada.' }); onDone(); },
    onError: (e: Error) => setMsg({ tipo: 'error', texto: e.message }),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mut.mutate({
      fechaVenta: f.get('fecha'),
      programa: f.get('programa'),
      cliente: f.get('cliente') || undefined,
      closer: f.get('closer') || undefined,
      ticketTotalUsd: Number(f.get('ticket')),
    });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Nueva venta</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><Input type="date" name="fecha" required /></Field>
          <Field label="Programa">
            <Select name="programa"><option>Empresario</option><option>Gestor</option></Select>
          </Field>
          <Field label="Cliente"><Input name="cliente" placeholder="Opcional" /></Field>
          <Field label="Closer"><Input name="closer" placeholder="Opcional" /></Field>
          <Field label="Ticket (USD)"><Input type="number" name="ticket" min="1" step="any" required /></Field>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={mut.isPending}>Agregar</Button></div>
        </form>
        <Mensaje m={msg} />
      </CardBody>
    </Card>
  );
}

// ───────────────────────── Cobro ─────────────────────────
function CobroForm({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const mut = useMutation({
    mutationFn: api.agregarCobro,
    onSuccess: () => { setMsg({ tipo: 'ok', texto: 'Cobro agregado.' }); onDone(); },
    onError: (e: Error) => setMsg({ tipo: 'error', texto: e.message }),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mut.mutate({
      fechaCobro: f.get('fecha'),
      mesOriginalVenta: f.get('mesOrigen'),
      montoUsd: Number(f.get('monto')),
      programa: f.get('programa'),
      idVentaOrigen: f.get('idVenta') || undefined,
    });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Nuevo cobro</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Fecha cobro"><Input type="date" name="fecha" required /></Field>
          <Field label="Mes venta origen"><Input name="mesOrigen" placeholder="YYYY-MM" pattern="\d{4}-\d{2}" required /></Field>
          <Field label="Monto (USD)"><Input type="number" name="monto" min="1" step="any" required /></Field>
          <Field label="Programa">
            <Select name="programa"><option>Empresario</option><option>Gestor</option></Select>
          </Field>
          <Field label="ID venta (opc.)"><Input name="idVenta" placeholder="Opcional" /></Field>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={mut.isPending}>Agregar</Button></div>
        </form>
        <Mensaje m={msg} />
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
      tipo: f.get('tipo'),
      categoria: f.get('categoria'),
      concepto: f.get('concepto') || undefined,
      montoUsd: Number(f.get('monto')),
    });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Nuevo egreso</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><Input type="date" name="fecha" required /></Field>
          <Field label="Tipo">
            <Select name="tipo"><option>Directo</option><option>Operativo</option><option>Extraordinario</option></Select>
          </Field>
          <Field label="Categoría"><Input name="categoria" placeholder="Marketing, Estructura…" required /></Field>
          <Field label="Concepto"><Input name="concepto" placeholder="Opcional" /></Field>
          <Field label="Monto (USD)"><Input type="number" name="monto" min="1" step="any" required /></Field>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={mut.isPending}>Agregar</Button></div>
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
