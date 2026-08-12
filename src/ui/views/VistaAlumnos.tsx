/**
 * Panel del consultor (ticket 4): cartera, alta de alumno, link de
 * diagnóstico, y la ficha con diagnósticos + índice de claridad + faltantes +
 * corrección durante la llamada.
 *
 * El ámbito por fila lo aplica el SERVER con la sesión: esta vista muestra lo
 * que la API devuelva (el consultor recibe su cartera; ADMIN, todas) y no
 * filtra nada por su cuenta. La corrección reusa el MISMO render del
 * formulario público (Campo + BLOQUES): una sola definición de las preguntas.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ClipboardPaste, Copy, Download, FileDown, GraduationCap, Link2, Pencil, Plus, Target, UserRound, X } from 'lucide-react';
import type { Alumno, Diagnostico } from '@domain/alumnos/tipos';
import { BLOQUES, PREGUNTA_POR_CAMPO } from '@domain/alumnos/formulario';
import { calcularClaridad, nivelClaridad, type NivelClaridad } from '@domain/alumnos/claridad';
import {
  useAlumno,
  useAlumnos,
  useCargarPlan,
  useCrearAlumno,
  useDiagnosticos,
  useEditarAlumno,
  useEditarDiagnostico,
  useEmitirLink,
  useExportarDiagnostico,
  usePlanes,
  usePreviaPlan,
} from '../hooks';
import type { PreviaPlanUI } from '../lib/api';
import { Textarea } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { Badge, Button, Card, Input, Select, Spinner } from '../components/ui/primitives';
import { Campo, estadoDesdeRespuestas, type SinDato, type Valores } from './VistaFormulario';

const PROGRAMAS = ['De Cero a Gestor Financiero', 'Prestamista a Empresario', 'Prestamista a Empresario Elite'];

// ───────────────────── Índice de claridad: presentación ─────────────────────

const NIVEL: Record<NivelClaridad, { texto: string; clase: string }> = {
  no_mide: { texto: 'No mide su negocio', clase: 'text-signal-red' },
  parcial: { texto: 'Mide parcialmente', clase: 'text-gold-500' },
  conoce: { texto: 'Conoce su negocio', clase: 'text-signal-green' },
  tablero: { texto: 'Opera con tablero', clase: 'text-signal-green' },
};

function IndiceBadge({ indice }: { indice: number | null }) {
  if (indice === null) return <Badge className="bg-navy-100 text-navy-500">sin datos</Badge>;
  const nivel = NIVEL[nivelClaridad(indice)!];
  return <span className={`font-display text-sm font-700 ${nivel.clase}`}>{indice}%</span>;
}

/**
 * Faltantes de un diagnóstico, en orden de formulario y con el texto de cada
 * pregunta: es el guion de la llamada. Recalculado del dominio (misma función
 * que fijó el índice guardado).
 */
export function faltantesDe(d: Pick<Diagnostico, 'respuestas'>): string[] {
  return calcularClaridad(d.respuestas).faltantes.map((m) => PREGUNTA_POR_CAMPO.get(m)?.label ?? m);
}

// ───────────────────── Corrección: patch con solo lo cambiado ─────────────────────

/**
 * Diferencia entre el estado editado y el original, en el formato del PUT.
 * Solo viajan los campos TOCADOS: lo demás ni aparece (el server no lo toca).
 * Pura y exportada para testearla sin montar nada.
 */
export function armarPatch(
  original: { valores: Valores; sinDato: SinDato },
  editado: { valores: Valores; sinDato: SinDato },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const p of BLOQUES.flatMap((b) => b.preguntas)) {
    const antes = original.valores[p.campo];
    const ahora = editado.valores[p.campo];
    const cambio = JSON.stringify(antes ?? null) !== JSON.stringify(ahora ?? null);
    if (cambio) {
      switch (p.tipo) {
        case 'numero':
        case 'moneda':
        case 'porcentaje': {
          const s = typeof ahora === 'string' ? ahora.trim().replace(',', '.') : '';
          if (s === '') patch[p.campo] = null;
          else if (Number.isFinite(Number(s))) patch[p.campo] = Number(s);
          break; // no parseable: no se toca
        }
        case 'multi':
          patch[p.campo] = Array.isArray(ahora) && ahora.length > 0 ? ahora : null;
          break;
        default: {
          const s = typeof ahora === 'string' ? ahora.trim() : '';
          patch[p.campo] = s === '' ? null : s;
        }
      }
    }
    if (p.nlc && (original.sinDato[p.campo] === true) !== (editado.sinDato[p.campo] === true)) {
      patch[`${p.campo}_sin_dato`] = editado.sinDato[p.campo] === true;
    }
  }
  return patch;
}

// ───────────────────── Vista principal ─────────────────────

export function VistaAlumnos() {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (abierto) return <FichaAlumno id={abierto} onVolver={() => setAbierto(null)} />;
  return <ListaAlumnos onAbrir={setAbierto} />;
}

// ───────────────────── Cartera + alta ─────────────────────

function ListaAlumnos({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [creando, setCreando] = useState(false);
  const { data: alumnos, isLoading } = useAlumnos(q || undefined);

  return (
    <div className="space-y-5">
      <SectionHeader
        titulo="Alumnos"
        descripcion="Tu cartera de consultoría 1 a 1. El diagnóstico de cada alumno llega por su link."
        accion={
          <Button onClick={() => setCreando((v) => !v)}>
            {creando ? <X size={16} /> : <Plus size={16} />}
            <span className="ml-1.5">{creando ? 'Cancelar' : 'Nuevo alumno'}</span>
          </Button>
        }
      />

      {creando && <FormAlta onCreado={(id) => { setCreando(false); onAbrir(id); }} />}

      <Input placeholder="Buscar por nombre o marca…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !alumnos?.length ? (
        <Card className="p-8 text-center">
          <GraduationCap className="mx-auto mb-2 text-navy-300" size={32} />
          <p className="text-sm text-navy-500 dark:text-navy-300">
            {q ? 'Ningún alumno coincide con la búsqueda.' : 'Todavía no hay alumnos en tu cartera. Creá el primero y mandale su link de diagnóstico.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {alumnos.map((a) => (
            <button key={a.id} onClick={() => onAbrir(a.id)} className="text-left">
              <Card className="h-full p-4 transition hover:border-gold-400">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-700 text-navy-900 dark:text-navy-50">{a.nombre}</p>
                  {!a.activo && <Badge className="bg-navy-100 text-navy-500">inactivo</Badge>}
                </div>
                <p className="mt-1 text-xs text-navy-500 dark:text-navy-300">{a.programa}</p>
                <p className="mt-0.5 text-xs text-navy-400">{[a.zona, a.moneda].filter(Boolean).join(' · ')}</p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormAlta({ onCreado }: { onCreado: (id: string) => void }) {
  const crear = useCrearAlumno();
  const [nombre, setNombre] = useState('');
  const [programa, setPrograma] = useState(PROGRAMAS[1]!);
  const [moneda, setMoneda] = useState('ARS');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const alta = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const alumno = await crear.mutateAsync({ nombre, programa, moneda, whatsapp: whatsapp || undefined });
      onCreado(alumno.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el alumno.');
    }
  };

  return (
    <Card className="p-4">
      <form onSubmit={(e) => void alta(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Nombre y apellido *</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Programa</label>
          <Select value={programa} onChange={(e) => setPrograma(e.target.value)} className="w-full">
            {PROGRAMAS.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Moneda (ISO)</label>
          <Input value={moneda} onChange={(e) => setMoneda(e.target.value.toUpperCase())} maxLength={3} />
        </div>
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">WhatsApp</label>
          <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Lo puede completar el alumno" />
        </div>
        <div className="flex items-end lg:col-span-2">
          <Button type="submit" disabled={crear.isPending}>
            {crear.isPending ? <Spinner className="h-4 w-4" /> : <Plus size={16} />}
            <span className="ml-1.5">Crear alumno</span>
          </Button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-signal-red">{error}</p>}
    </Card>
  );
}

// ───────────────────── Ficha del alumno ─────────────────────

function FichaAlumno({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { data: alumno, isLoading } = useAlumno(id);
  const { data: diagnosticos } = useDiagnosticos(id);
  const [diagnosticoAbierto, setDiagnosticoAbierto] = useState<string | null>(null);

  if (isLoading || !alumno) {
    return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>;
  }

  const abierto = diagnosticos?.find((d) => d.id === diagnosticoAbierto) ?? null;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm font-600 text-navy-500 hover:text-navy-800 dark:text-navy-300">
        <ArrowLeft size={16} /> Alumnos
      </button>

      <SectionHeader titulo={alumno.nombre} descripcion={`${alumno.programa} · montos en ${alumno.moneda}`} />

      <div className="grid gap-4 lg:grid-cols-3">
        <DatosFicha alumno={alumno} />
        <LinkDiagnostico alumno={alumno} />
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-display text-lg font-700 text-navy-900 dark:text-navy-50">Diagnósticos</h3>
        {!diagnosticos?.length ? (
          <p className="text-sm text-navy-500 dark:text-navy-300">
            Todavía no llegó ninguno. Generá el link y mandáselo por WhatsApp: cuando lo complete aparece acá.
          </p>
        ) : (
          <div className="space-y-2">
            {diagnosticos.map((d) => (
              <button
                key={d.id}
                onClick={() => setDiagnosticoAbierto(diagnosticoAbierto === d.id ? null : d.id)}
                className="flex w-full items-center justify-between rounded-xl border border-navy-100 px-4 py-3 text-left transition hover:border-gold-400 dark:border-navy-700"
              >
                <div>
                  <p className="text-sm font-600 text-navy-900 dark:text-navy-50">{d.fecha.slice(0, 10)}</p>
                  <p className="text-xs text-navy-400">
                    {d.origen === 'alumno' ? 'Enviado por el alumno' : 'Cargado por el consultor'}
                    {d.editadoPorConsultor && ' · corregido en consultoría'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-navy-400">{d.metricasRespondidas}/{d.metricasAplicables} métricas</span>
                  <IndiceBadge indice={d.indiceClaridad} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {abierto && <DetalleDiagnostico key={abierto.id} diagnostico={abierto} moneda={abierto.moneda} />}

      <PlanAlumno alumnoId={alumno.id} />
    </div>
  );
}

// ───────────────────── Plan de 90 días ─────────────────────

/**
 * El plan cargado desde el bloque de la skill, y el flujo de carga en dos
 * pasos: pegar → previa con advertencias → confirmar. La previa es donde el
 * consultor ve qué parte del bloque NO entra al panel (claves fuera del
 * contrato) antes de confirmar.
 */
function PlanAlumno({ alumnoId }: { alumnoId: string }) {
  const { data: planes } = usePlanes(alumnoId);
  const previa = usePreviaPlan();
  const cargar = useCargarPlan();

  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState('');
  const [vistaPrevia, setVistaPrevia] = useState<PreviaPlanUI | null>(null);
  const [fechaInicio, setFechaInicio] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validar = async () => {
    setError(null);
    try {
      const p = await previa.mutateAsync({ alumnoId, bloque: texto });
      setVistaPrevia(p);
      setFechaInicio(p.bloque.fecha_inicio);
    } catch (err) {
      setVistaPrevia(null);
      setError(err instanceof Error ? err.message : 'No se pudo validar el bloque.');
    }
  };

  const confirmar = async () => {
    setError(null);
    try {
      await cargar.mutateAsync({ alumnoId, bloque: texto, fechaInicio: fechaInicio || undefined });
      setPegando(false);
      setTexto('');
      setVistaPrevia(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el plan.');
    }
  };

  const vigente = planes?.[0];

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-700 text-navy-900 dark:text-navy-50">
          <Target size={18} /> Plan de 90 días
        </h3>
        <Button variant={vigente ? 'ghost' : 'gold'} onClick={() => { setPegando((v) => !v); setVistaPrevia(null); setError(null); }}>
          {pegando ? <X size={14} /> : <ClipboardPaste size={14} />}
          <span className="ml-1">{pegando ? 'Cancelar' : vigente ? 'Cargar otro plan' : 'Cargar plan'}</span>
        </Button>
      </div>

      {pegando && (
        <div className="space-y-3">
          <p className="text-xs text-navy-400">
            Pegá el bloque JSON que emitió la skill junto al documento del plan. Primero se valida; nada se guarda hasta que confirmes.
          </p>
          <Textarea
            className="min-h-[10rem] font-mono text-xs"
            placeholder='{"version": 1, "alumno": "…", …}'
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setVistaPrevia(null); }}
          />
          {!vistaPrevia && (
            <Button onClick={() => void validar()} disabled={previa.isPending || texto.trim() === ''}>
              {previa.isPending ? <Spinner className="h-4 w-4" /> : <Check size={16} />}
              <span className="ml-1.5">Validar bloque</span>
            </Button>
          )}

          {vistaPrevia && (
            <div className="space-y-3 rounded-xl border border-navy-100 p-4 dark:border-navy-700">
              <p className="text-sm font-600 text-navy-900 dark:text-navy-50">
                {vistaPrevia.bloque.alumno} · {vistaPrevia.bloque.okrs.length} OKRs ·{' '}
                {vistaPrevia.bloque.fases.map((f) => f.acciones.length).join('/')} acciones por fase
              </p>
              {vistaPrevia.bloque.objetivo_90d && (
                <p className="text-xs text-navy-500 dark:text-navy-300">{vistaPrevia.bloque.objetivo_90d}</p>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs font-600 text-navy-500 dark:text-navy-300">Arranca el</label>
                <Input type="date" className="max-w-[11rem]" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </div>
              {vistaPrevia.advertencias.length > 0 && (
                <div className="rounded-lg border border-gold-400 bg-gold-400/10 p-3">
                  <p className="text-xs font-600 uppercase tracking-wide text-gold-500">Antes de confirmar, mirá esto</p>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-navy-800 dark:text-navy-100">
                    {vistaPrevia.advertencias.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}
              <Button className="w-full" onClick={() => void confirmar()} disabled={cargar.isPending}>
                {cargar.isPending ? <Spinner className="h-4 w-4" /> : <Check size={16} />}
                <span className="ml-1.5">Confirmar y cargar el plan</span>
              </Button>
            </div>
          )}
          {error && <p className="text-sm font-600 text-signal-red">{error}</p>}
        </div>
      )}

      {!pegando && !vigente && (
        <p className="text-sm text-navy-500 dark:text-navy-300">
          Todavía no hay plan. Exportá el diagnóstico, generá el plan con la skill y pegá acá el bloque JSON.
        </p>
      )}

      {vigente && !pegando && (
        <div className="space-y-4">
          <p className="text-xs text-navy-400">
            Arrancó el {vigente.plan.fechaInicio}
            {vigente.plan.etapa && <> · etapa: {vigente.plan.etapa}</>}
            {planes!.length > 1 && <> · {planes!.length - 1} plan(es) anterior(es)</>}
          </p>
          {vigente.plan.objetivo90d && (
            <p className="rounded-lg bg-navy-50 p-3 text-sm text-navy-800 dark:bg-navy-800 dark:text-navy-100">
              {vigente.plan.objetivo90d}
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {vigente.okrs.map((o) => (
              <div key={o.id} className="rounded-xl border border-navy-100 p-3 dark:border-navy-700">
                <p className="text-sm font-600 text-navy-900 dark:text-navy-50">{o.orden}. {o.objetivo}</p>
                <ul className="mt-1.5 space-y-1">
                  {o.krs.map((k) => (
                    <li key={k.id} className="text-xs text-navy-600 dark:text-navy-300">
                      • {k.texto}{k.meta && <span className="text-navy-400"> — {k.meta}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([1, 2, 3] as const).map((fase) => (
              <div key={fase} className="rounded-xl border border-navy-100 p-3 dark:border-navy-700">
                <p className="text-xs font-600 uppercase tracking-wide text-navy-400">
                  Fase {fase} · días {fase === 1 ? '1-30' : fase === 2 ? '31-60' : '61-90'}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {vigente.acciones.filter((a) => a.fase === fase).map((a) => (
                    <li key={a.id} className="text-xs text-navy-700 dark:text-navy-200">☐ {a.texto}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-navy-400">
            El link de seguimiento del alumno llega en la próxima fase — por ahora el checklist se ve solo acá.
          </p>
        </div>
      )}
    </Card>
  );
}

function DatosFicha({ alumno }: { alumno: Alumno }) {
  const editar = useEditarAlumno();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    nombre: alumno.nombre,
    zona: alumno.zona ?? '',
    whatsapp: alumno.whatsapp ?? '',
    marcaComercial: alumno.marcaComercial ?? '',
    edad: alumno.edad ? String(alumno.edad) : '',
  });
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    try {
      await editar.mutateAsync({
        id: alumno.id,
        data: {
          nombre: form.nombre,
          zona: form.zona || null,
          whatsapp: form.whatsapp || null,
          marcaComercial: form.marcaComercial || null,
          edad: form.edad ? Number(form.edad) : null,
        },
      });
      setEditando(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  };

  const dato = (etiqueta: string, valor: string | number | null) => (
    <div>
      <p className="text-xs text-navy-400">{etiqueta}</p>
      <p className="text-sm text-navy-800 dark:text-navy-100">{valor ?? '—'}</p>
    </div>
  );

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-700 text-navy-900 dark:text-navy-50">
          <UserRound size={18} /> Ficha
        </h3>
        <Button variant="ghost" onClick={() => setEditando((v) => !v)}>
          {editando ? <X size={14} /> : <Pencil size={14} />}
          <span className="ml-1">{editando ? 'Cancelar' : 'Editar'}</span>
        </Button>
      </div>
      {!editando ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {dato('Edad', alumno.edad)}
          {dato('Zona', alumno.zona)}
          {dato('WhatsApp', alumno.whatsapp)}
          {dato('Marca', alumno.marcaComercial)}
          {dato('Canal', alumno.canalOrigen)}
          {dato('Moneda', alumno.moneda)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {([['nombre', 'Nombre'], ['edad', 'Edad'], ['zona', 'Zona'], ['whatsapp', 'WhatsApp'], ['marcaComercial', 'Marca']] as const).map(([k, etiqueta]) => (
            <div key={k}>
              <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">{etiqueta}</label>
              <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <div className="flex items-end">
            <Button onClick={() => void guardar()} disabled={editar.isPending}>
              {editar.isPending ? <Spinner className="h-4 w-4" /> : <Check size={16} />}
              <span className="ml-1.5">Guardar</span>
            </Button>
          </div>
          {error && <p className="text-sm text-signal-red sm:col-span-2">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function LinkDiagnostico({ alumno }: { alumno: Alumno }) {
  const emitir = useEmitirLink();
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const generar = async () => {
    const t = await emitir.mutateAsync(alumno.id);
    setLink(`${window.location.origin}/formulario/${t.token}`);
    setCopiado(false);
  };

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiado(true);
  };

  return (
    <Card className="p-5">
      <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-700 text-navy-900 dark:text-navy-50">
        <Link2 size={18} /> Link de diagnóstico
      </h3>
      <p className="text-xs text-navy-400">
        Un solo uso, vence a los 30 días. Generar uno nuevo invalida el anterior.
      </p>
      <Button className="mt-3 w-full" onClick={() => void generar()} disabled={emitir.isPending}>
        {emitir.isPending ? <Spinner className="h-4 w-4" /> : <Link2 size={16} />}
        <span className="ml-1.5">{link ? 'Generar link nuevo' : 'Generar link'}</span>
      </Button>
      {link && (
        <div className="mt-3 space-y-2">
          <p className="break-all rounded-lg bg-navy-50 p-2 text-xs text-navy-600 dark:bg-navy-800 dark:text-navy-200">{link}</p>
          <Button variant="ghost" className="w-full" onClick={() => void copiar()}>
            {copiado ? <Check size={14} className="text-signal-green" /> : <Copy size={14} />}
            <span className="ml-1.5">{copiado ? 'Copiado' : 'Copiar para WhatsApp'}</span>
          </Button>
        </div>
      )}
    </Card>
  );
}

// ───────────────────── Detalle del diagnóstico ─────────────────────

/**
 * Exportación para la skill del plan de 90 días. Dos salidas del mismo texto:
 * copiar (para pegar en Claude, que es el camino normal) y descargar el .md
 * (para adjuntarlo o guardarlo). La generación del plan vive fuera de la app.
 */
function ExportarParaPlan({ diagnosticoId }: { diagnosticoId: string }) {
  const exportar = useExportarDiagnostico();
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState(false);

  const copiar = async () => {
    setError(false);
    try {
      const { contenido } = await exportar.mutateAsync(diagnosticoId);
      await navigator.clipboard.writeText(contenido);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 4000);
    } catch {
      setError(true);
    }
  };

  const descargar = async () => {
    setError(false);
    try {
      const { contenido, nombreArchivo } = await exportar.mutateAsync(diagnosticoId);
      const url = URL.createObjectURL(new Blob([contenido], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="gold" onClick={() => void copiar()} disabled={exportar.isPending} title="Copiar el diagnóstico para pegarlo en Claude">
        {copiado ? <Check size={14} /> : <FileDown size={14} />}
        <span className="ml-1">{copiado ? 'Copiado' : 'Exportar para el plan'}</span>
      </Button>
      <Button variant="ghost" size="icon" onClick={() => void descargar()} disabled={exportar.isPending} title="Descargar como .md">
        <Download size={14} />
      </Button>
      {error && <span className="text-xs text-signal-red">No se pudo exportar.</span>}
    </div>
  );
}

function DetalleDiagnostico({ diagnostico: d, moneda }: { diagnostico: Diagnostico; moneda: string }) {
  const guardar = useEditarDiagnostico();
  const original = useMemo(() => estadoDesdeRespuestas(d.respuestas), [d.respuestas]);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [valores, setValores] = useState<Valores>(original.valores);
  const [sinDato, setSinDato] = useState<SinDato>(original.sinDato);
  const [error, setError] = useState<string | null>(null);

  const faltantes = faltantesDe(d);
  const nivel = d.indiceClaridad !== null ? NIVEL[nivelClaridad(d.indiceClaridad)!] : null;

  const confirmar = async () => {
    setError(null);
    const patch = armarPatch(original, { valores, sinDato });
    if (Object.keys(patch).length === 0) {
      setCorrigiendo(false);
      return;
    }
    try {
      await guardar.mutateAsync({ id: d.id, patch });
      setCorrigiendo(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la corrección.');
    }
  };

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-700 text-navy-900 dark:text-navy-50">
            Diagnóstico del {d.fecha.slice(0, 10)}
          </h3>
          <p className="mt-0.5 text-sm">
            <span className="font-display text-2xl font-700 text-navy-900 dark:text-navy-50">
              {d.indiceClaridad === null ? '—' : `${d.indiceClaridad}%`}
            </span>
            {nivel && <span className={`ml-2 font-600 ${nivel.clase}`}>{nivel.texto}</span>}
            <span className="ml-2 text-xs text-navy-400">({d.metricasRespondidas}/{d.metricasAplicables} métricas con dato)</span>
          </p>
        </div>
        <div className="flex gap-2">
          <ExportarParaPlan diagnosticoId={d.id} />
          <Button variant="ghost" onClick={() => { setCorrigiendo((v) => !v); setValores(original.valores); setSinDato(original.sinDato); setError(null); }}>
            {corrigiendo ? <X size={14} /> : <Pencil size={14} />}
            <span className="ml-1">{corrigiendo ? 'Descartar' : 'Corregir respuestas'}</span>
          </Button>
        </div>
      </div>

      {faltantes.length > 0 && !corrigiendo && (
        <div className="rounded-xl border border-gold-400 bg-gold-400/10 p-3">
          <p className="text-xs font-600 uppercase tracking-wide text-gold-500">Para sacar en la llamada</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-navy-800 dark:text-navy-100">
            {faltantes.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      {!corrigiendo ? (
        <div className="space-y-4">
          {BLOQUES.map((b, i) => (
            <div key={b.titulo}>
              <p className="mb-2 text-xs font-600 uppercase tracking-wide text-navy-400">{i + 1} · {b.titulo}</p>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {b.preguntas.map((p) => {
                  const v = d.respuestas[p.campo];
                  const marcado = d.respuestas[`${p.campo}_sin_dato`] === true;
                  let texto: string;
                  if (marcado) texto = '';
                  else if (v === null || v === undefined || v === '') texto = '—';
                  else if (p.tipo === 'multi' && typeof v === 'string') {
                    try { texto = (JSON.parse(v) as string[]).join(', '); } catch { texto = String(v); }
                  } else texto = String(v);
                  return (
                    <div key={p.campo} className="text-sm">
                      <p className="text-xs text-navy-400">{p.label}</p>
                      {marcado
                        ? <Badge className="mt-0.5 bg-gold-400/20 text-gold-500">no lo tiene claro</Badge>
                        : <p className="text-navy-800 dark:text-navy-100">{texto}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-navy-400">
            La corrección ajusta ESTE diagnóstico y queda registrada como tuya. El índice se recalcula solo.
          </p>
          {BLOQUES.map((b, i) => (
            <div key={b.titulo} className="space-y-4">
              <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{i + 1} · {b.titulo}</p>
              {b.preguntas.map((p) => (
                <Campo
                  key={p.campo}
                  pregunta={p}
                  moneda={moneda}
                  valor={valores[p.campo]}
                  marcadoSinDato={sinDato[p.campo] === true}
                  onValor={(v) => setValores((s) => ({ ...s, [p.campo]: v }))}
                  onSinDato={(m) => setSinDato((s) => ({ ...s, [p.campo]: m }))}
                />
              ))}
            </div>
          ))}
          {error && <p className="text-sm font-600 text-signal-red">{error}</p>}
          <Button className="w-full" onClick={() => void confirmar()} disabled={guardar.isPending}>
            {guardar.isPending ? <Spinner className="h-4 w-4" /> : <Check size={16} />}
            <span className="ml-1.5">Guardar corrección</span>
          </Button>
        </div>
      )}
    </Card>
  );
}
