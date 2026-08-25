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
import { AlertTriangle, ArrowLeft, CalendarDays, Check, ClipboardPaste, Copy, Download, FileDown, GraduationCap, Link2, MessageCircle, Pencil, Plus, RotateCcw, Target, Trash2, UserRound, X } from 'lucide-react';
import type { Alumno, Diagnostico } from '@domain/alumnos/tipos';
import type { EstadoAccion, Kr, Medicion, PlanCompleto } from '@domain/alumnos/plan';
import type { EstadoKr } from '@domain/alumnos/medicion';
import { diasDelPlan, ESTADOS_ALUMNO, type AlertaInactividad, type EstadoAlumno } from '@domain/alumnos/panel';
import { calcularSaludPorAcciones, type SaludPorAcciones } from '@domain/alumnos/saludAcciones';
import { fechaCierreEstimada } from '@domain/alumnos/plan';
import { linkWhatsapp, mensajeSeguimiento } from '@domain/alumnos/telefono';
import { BLOQUES, PREGUNTA_POR_CAMPO } from '@domain/alumnos/formulario';
import { calcularClaridad, nivelClaridad, type NivelClaridad } from '@domain/alumnos/claridad';
import {
  useAlumno,
  useAvancePlan,
  useCambiarEstadoAlumno,
  useCambiarFechaInicio,
  useCargarMedicion,
  useCargarPlan,
  useContactos,
  useCorregirAccion,
  useCrearAlumno,
  useDiagnosticos,
  useDocumentosPlan,
  useEditarAlumno,
  useEditarDiagnostico,
  useEditarKr,
  useEliminarAlumno,
  useEliminarDefinitivo,
  useEmitirLink,
  useEmitirLinkSeguimiento,
  useExportarDiagnostico,
  usePanelAlumnos,
  usePapelera,
  usePlanes,
  usePreviaPlan,
  useRegistrarContacto,
  useRestaurarAlumno,
  useRevocarLinkSeguimiento,
  useSubirDocumento,
} from '../hooks';
import { usePuede } from '../store';
import { api, type AvancePlanUI, type FilaPanelUI, type PreviaPlanUI } from '../lib/api';
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

// ───────────────────── Presentación de estado y salud ─────────────────────

const ESTADO_LABEL: Record<EstadoAlumno, string> = {
  ACTIVO: 'Activo', PAUSADO: 'Pausado', FINALIZADO: 'Finalizado', ABANDONADO: 'Abandonado',
};

function EstadoBadge({ estado }: { estado: EstadoAlumno }) {
  return (
    <Badge tone={estado === 'ACTIVO' ? 'gold' : 'neutral'} className={estado === 'ACTIVO' ? '' : 'opacity-70'}>
      {ESTADO_LABEL[estado]}
    </Badge>
  );
}

const NEUTRO_LABEL = { sin_plan: 'sin plan', sin_acciones: 'sin acciones', primeros_dias: 'arrancando', estado: '—' } as const;

/** El semáforo. Neutro dice su motivo — un gris mudo no explica nada. */
function SaludBadge({ salud }: { salud: SaludPorAcciones }) {
  if (salud.salud === 'ROJO') return <Badge tone="red">Trabado</Badge>;
  if (salud.salud === 'NARANJA') return <Badge tone="amber">Atrasado</Badge>;
  if (salud.salud === 'VERDE') return <Badge tone="green">Al día</Badge>;
  return <Badge tone="neutral" className="opacity-70">{NEUTRO_LABEL[salud.motivo ?? 'estado']}</Badge>;
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

const hace = (iso: string) => {
  const d = diasDesde(iso);
  return d === 0 ? 'hoy' : `hace ${d} día${d === 1 ? '' : 's'}`;
};

/**
 * Última señal del alumno. Con la alerta activa, la celda grita — y el
 * último ACCESO al link (ticket 8) distingue el mensaje: "no abre" es
 * despegue del proceso; "abre y no marca" es un obstáculo concreto.
 */
function UltimaActividad({ iso, alerta, accesoLink, conPlan }: {
  iso: string | null;
  alerta?: AlertaInactividad;
  accesoLink?: string | null;
  conPlan?: boolean;
}) {
  const acceso = conPlan ? (
    <span className="block text-[11px] text-navy-400">
      {accesoLink ? `abrió el link ${hace(accesoLink)}` : 'nunca abrió el link'}
    </span>
  ) : null;
  if (alerta?.activa) {
    return (
      <span className="text-xs">
        <span className="flex items-center gap-1 font-600 text-signal-red">
          <AlertTriangle size={12} /> sin señales hace {alerta.diasSinSenal} días
        </span>
        {acceso}
      </span>
    );
  }
  return (
    <span className="text-xs text-navy-500 dark:text-navy-300">
      {iso ? hace(iso) : '—'}
      {acceso}
    </span>
  );
}

/**
 * El botón de WhatsApp (ticket 7C). Primero se REGISTRA el contacto (eso
 * apaga la alerta), recién después se abre el link — si el registro falla, el
 * link no se abre y el panel sigue gritando, que es lo correcto.
 */
function WhatsAppBtn({ alumno, krPendiente }: { alumno: Alumno; krPendiente: string | null }) {
  const registrar = useRegistrarContacto();
  if (!alumno.telefonoPais || !alumno.telefonoNumero) {
    return (
      <span className="text-xs text-navy-400" title={alumno.whatsapp ? `Sin normalizar: "${alumno.whatsapp}" — cargalo en la ficha` : 'Sin teléfono'}>
        {alumno.whatsapp ? 'revisar tel.' : '—'}
      </span>
    );
  }
  const url = linkWhatsapp(alumno.telefonoPais, alumno.telefonoNumero, mensajeSeguimiento(alumno.nombre, krPendiente));
  const contactar = async (e: React.MouseEvent) => {
    e.stopPropagation(); // no abrir la ficha al hacer clic en la fila
    await registrar.mutateAsync({ alumnoId: alumno.id });
    window.open(url, '_blank', 'noopener');
  };
  return (
    <button
      onClick={(e) => void contactar(e)}
      disabled={registrar.isPending}
      title={`Abrir WhatsApp (+${alumno.telefonoPais} ${alumno.telefonoNumero}). Queda registrado el contacto.`}
      className="inline-flex items-center gap-1 rounded-lg border border-signal-green/40 px-2 py-1 text-xs font-600 text-signal-green transition hover:bg-green-50 dark:hover:bg-green-900/20"
    >
      <MessageCircle size={13} /> WhatsApp
    </button>
  );
}

// ───────────────────── Cartera: el panel de control ─────────────────────

function ListaAlumnos({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [salud, setSalud] = useState('');
  const [soloTrabados, setSoloTrabados] = useState(false);
  const [consultor, setConsultor] = useState('');
  const [creando, setCreando] = useState(false);
  const [verPapelera, setVerPapelera] = useState(false);
  const puedeEliminar = usePuede('eliminar_alumnos');
  const { data: filas, isLoading } = usePanelAlumnos({
    q: q || undefined,
    estado: (estado || undefined) as EstadoAlumno | undefined,
    salud: (salud || undefined) as 'VERDE' | 'NARANJA' | 'ROJO' | 'NEUTRO' | undefined,
    trabados: soloTrabados || undefined,
    consultor: consultor || undefined,
  });

  // Opciones del filtro por cartera (ADMIN ve todas; para un consultor es la suya).
  const consultores = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filas ?? []) if (f.consultorNombre) m.set(f.alumno.consultorId, f.consultorNombre);
    return [...m.entries()];
  }, [filas]);

  // "Trabado" = necesita atención YA: alerta de inactividad o semáforo rojo.
  const trabados = filas?.filter((f) => f.alerta.activa || f.salud.salud === 'ROJO').length ?? 0;
  const naranjas = filas?.filter((f) => f.salud.salud === 'NARANJA').length ?? 0;

  if (verPapelera) return <Papelera onVolver={() => setVerPapelera(false)} />;

  return (
    <div className="space-y-5">
      <SectionHeader
        titulo="Alumnos"
        descripcion="El panel de la cartera: los trabados gritan arriba; los que van bien no hacen ruido."
        accion={
          <div className="flex items-center gap-2">
            {puedeEliminar && (
              <Button variant="ghost" onClick={() => setVerPapelera(true)}>
                <Trash2 size={14} /><span className="ml-1.5">Papelera</span>
              </Button>
            )}
            <Button onClick={() => setCreando((v) => !v)}>
              {creando ? <X size={16} /> : <Plus size={16} />}
              <span className="ml-1.5">{creando ? 'Cancelar' : 'Nuevo alumno'}</span>
            </Button>
          </div>
        }
      />

      {creando && <FormAlta onCreado={(id) => { setCreando(false); onAbrir(id); }} />}

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por nombre o marca…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS_ALUMNO.map((s) => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
        </Select>
        <Select value={salud} onChange={(e) => setSalud(e.target.value)}>
          <option value="">Toda la salud</option>
          <option value="ROJO">Trabados (rojo)</option>
          <option value="NARANJA">Atrasados (naranja)</option>
          <option value="VERDE">Al día (verde)</option>
          <option value="NEUTRO">Sin semáforo</option>
        </Select>
        {consultores.length > 1 && (
          <Select value={consultor} onChange={(e) => setConsultor(e.target.value)}>
            <option value="">Todas las carteras</option>
            {consultores.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </Select>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-navy-600 dark:text-navy-200">
          <input type="checkbox" className="accent-gold-500" checked={soloTrabados} onChange={(e) => setSoloTrabados(e.target.checked)} />
          Solo trabados
        </label>
        {(trabados > 0 || naranjas > 0) && (
          <span className="ml-auto text-xs font-600">
            {trabados > 0 && <span className="text-signal-red">{trabados} trabado{trabados === 1 ? '' : 's'}</span>}
            {trabados > 0 && naranjas > 0 && <span className="text-navy-400"> · </span>}
            {naranjas > 0 && <span className="text-gold-500">{naranjas} atrasado{naranjas === 1 ? '' : 's'}</span>}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !filas?.length ? (
        <Card className="p-8 text-center">
          <GraduationCap className="mx-auto mb-2 text-navy-300" size={32} />
          <p className="text-sm text-navy-500 dark:text-navy-300">
            {q || estado || salud ? 'Ningún alumno coincide con los filtros.' : 'Todavía no hay alumnos en tu cartera. Creá el primero y mandale su link de diagnóstico.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-400 dark:border-navy-700">
                <th className="px-4 py-3 font-600">Alumno</th>
                <th className="px-3 py-3 font-600">Estado</th>
                <th className="px-3 py-3 font-600">Fase</th>
                <th className="px-3 py-3 font-600">Salud</th>
                <th className="px-3 py-3 font-600">KRs</th>
                <th className="px-3 py-3 font-600">Última actividad</th>
                <th className="px-3 py-3 font-600">Teléfono</th>
                <th className="px-3 py-3 font-600">Consultor</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => <FilaPanel key={f.alumno.id} fila={f} onAbrir={onAbrir} />)}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function FilaPanel({ fila: f, onAbrir }: { fila: FilaPanelUI; onAbrir: (id: string) => void }) {
  return (
    <tr
      onClick={() => onAbrir(f.alumno.id)}
      className="cursor-pointer border-b border-navy-50 transition last:border-0 hover:bg-navy-50/60 dark:border-navy-800 dark:hover:bg-navy-800/40"
    >
      <td className="px-4 py-3">
        <p className="font-600 text-navy-900 dark:text-navy-50">{f.alumno.nombre}</p>
        <p className="text-xs text-navy-400">{f.alumno.programa}</p>
      </td>
      <td className="px-3 py-3"><EstadoBadge estado={f.alumno.estado} /></td>
      <td className="px-3 py-3">
        {f.plan
          ? <Badge tone="neutral">{f.plan.chip} · día {f.plan.dias + 1}</Badge>
          : <span className="text-xs text-navy-400">sin plan</span>}
      </td>
      <td className="px-3 py-3"><SaludBadge salud={f.salud} /></td>
      <td className="px-3 py-3 text-xs text-navy-500 dark:text-navy-300">
        {f.krs.totales > 0 ? `${f.krs.cumplidos}/${f.krs.totales}` : '—'}
      </td>
      <td className="px-3 py-3">
        <UltimaActividad iso={f.ultimaActividad} alerta={f.alerta} accesoLink={f.alumno.ultimoAccesoLink} conPlan={f.plan !== null} />
      </td>
      <td className="px-3 py-3"><WhatsAppBtn alumno={f.alumno} krPendiente={f.krPendiente} /></td>
      <td className="px-3 py-3 text-xs text-navy-500 dark:text-navy-300">{f.consultorNombre ?? '—'}</td>
    </tr>
  );
}

// ───────────────────── Papelera (solo ADMIN) ─────────────────────

function Papelera({ onVolver }: { onVolver: () => void }) {
  const { data: filas, isLoading } = usePapelera(true);
  const restaurar = useRestaurarAlumno();
  const purgar = useEliminarDefinitivo();
  const [purgando, setPurgando] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirmarPurga = async (id: string) => {
    setError(null);
    try {
      await purgar.mutateAsync({ id, confirmacion });
      setPurgando(null);
      setConfirmacion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar.');
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm font-600 text-navy-500 hover:text-navy-800 dark:text-navy-300">
        <ArrowLeft size={16} /> Alumnos
      </button>
      <SectionHeader
        titulo="Papelera"
        descripcion="Fichas eliminadas. Restaurar las devuelve intactas; el borrado definitivo arrastra diagnósticos, planes y seguimiento — y no tiene vuelta."
      />
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !filas?.length ? (
        <Card className="p-8 text-center">
          <Trash2 className="mx-auto mb-2 text-navy-300" size={32} />
          <p className="text-sm text-navy-500 dark:text-navy-300">La papelera está vacía.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filas.map(({ alumno, eliminadoPorNombre }) => (
            <Card key={alumno.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-600 text-navy-900 dark:text-navy-50">{alumno.nombre}</p>
                  <p className="text-xs text-navy-400">
                    {alumno.programa} · eliminado el {alumno.eliminadoEn?.slice(0, 10)}
                    {eliminadoPorNombre && <> por {eliminadoPorNombre}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void restaurar.mutateAsync(alumno.id)} disabled={restaurar.isPending}>
                    <RotateCcw size={14} /><span className="ml-1">Restaurar</span>
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="text-signal-red"
                    onClick={() => { setPurgando(purgando === alumno.id ? null : alumno.id); setConfirmacion(''); setError(null); }}
                  >
                    <Trash2 size={14} /><span className="ml-1">Eliminar definitivamente</span>
                  </Button>
                </div>
              </div>
              {purgando === alumno.id && (
                <div className="mt-3 space-y-2 rounded-xl border border-signal-red/40 bg-red-50 p-3 dark:bg-red-900/20">
                  <p className="text-xs text-navy-700 dark:text-navy-200">
                    Se borra TODO lo del alumno: diagnósticos, planes, checklist e historial. Para confirmar, escribí su nombre exacto: <strong>{alumno.nombre}</strong>
                  </p>
                  <div className="flex items-center gap-2">
                    <Input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder={alumno.nombre} className="max-w-xs" />
                    <Button
                      size="sm" className="bg-signal-red text-white hover:bg-red-700"
                      disabled={confirmacion.trim() !== alumno.nombre || purgar.isPending}
                      onClick={() => void confirmarPurga(alumno.id)}
                    >
                      Borrar sin vuelta
                    </Button>
                  </div>
                  {error && <p className="text-xs font-600 text-signal-red">{error}</p>}
                </div>
              )}
            </Card>
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
  const { data: planes } = usePlanes(id);
  const cambiarEstado = useCambiarEstadoAlumno();
  const eliminar = useEliminarAlumno();
  const puedeEliminar = usePuede('eliminar_alumnos');
  const [diagnosticoAbierto, setDiagnosticoAbierto] = useState<string | null>(null);

  if (isLoading || !alumno) {
    return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>;
  }

  const abierto = diagnosticos?.find((d) => d.id === diagnosticoAbierto) ?? null;
  const vigente = planes?.[0] ?? null;

  // El KR que pregunta el mensaje de WhatsApp: el pendiente de vencimiento
  // más cercano (misma regla que el panel). "Pendiente" es el cierre DERIVADO
  // (9B), del avance que la ficha ya pide — cumplido_en no se lee más acá.
  const { data: avanceFicha } = useAvancePlan(vigente?.plan.id ?? null);
  const krs = vigente?.okrs.flatMap((o) => o.krs) ?? [];
  const cumplidas = new Set((avanceFicha?.estadoKrs ?? []).filter((k) => k.cumplida).map((k) => k.krId));
  const pendientes = krs.filter((k) => !cumplidas.has(k.id));
  const krPendiente =
    (pendientes.filter((k) => k.vencimiento !== null).sort((a, b) => a.vencimiento!.localeCompare(b.vencimiento!))[0] ??
      pendientes[0])?.texto ?? null;

  const alPapelera = async () => {
    if (!window.confirm(`¿Mandar la ficha de ${alumno.nombre} a la papelera? Desaparece del panel; un ADMIN puede restaurarla.`)) return;
    await eliminar.mutateAsync(alumno.id);
    onVolver();
  };

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm font-600 text-navy-500 hover:text-navy-800 dark:text-navy-300">
        <ArrowLeft size={16} /> Alumnos
      </button>

      <SectionHeader
        titulo={alumno.nombre}
        descripcion={`${alumno.programa} · montos en ${alumno.moneda}`}
        accion={
          <div className="flex items-center gap-2">
            <WhatsAppBtn alumno={alumno} krPendiente={krPendiente} />
            <Select
              value={alumno.estado}
              onChange={(e) => void cambiarEstado.mutateAsync({ id: alumno.id, estado: e.target.value as EstadoAlumno })}
              disabled={cambiarEstado.isPending}
              title="Estado del alumno: gobierna el semáforo y las alertas"
            >
              {ESTADOS_ALUMNO.map((s) => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
            </Select>
            {puedeEliminar && (
              <Button variant="ghost" className="text-signal-red" onClick={() => void alPapelera()} disabled={eliminar.isPending} title="Mandar a la papelera (borrado lógico)">
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        }
      />

      {vigente && <BarraProgreso alumno={alumno} vigente={vigente} />}

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

      <HistorialContactos alumnoId={alumno.id} />
    </div>
  );
}

/** Contactos registrados (ticket 7C), colapsados: historia, no ruido. */
function HistorialContactos({ alumnoId }: { alumnoId: string }) {
  const { data: contactos } = useContactos(alumnoId);
  if (!contactos?.length) return null;
  return (
    <Card className="p-4">
      <details className="text-sm text-navy-600 dark:text-navy-200">
        <summary className="cursor-pointer font-600">Contactos registrados ({contactos.length})</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {contactos.map((c) => (
            <li key={c.id}>
              {c.contactadoEn.slice(0, 10)} · {c.canal.toLowerCase()}
              {c.nota && <span className="text-navy-400"> — {c.nota}</span>}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

// ───────────────────── Barra de progreso (ticket 7) ─────────────────────

/**
 * Fase, días, semáforo y fecha de inicio EDITABLE del plan vigente. El
 * semáforo se calcula acá con las mismas funciones del dominio que usa el
 * panel: una sola definición de "trabado".
 */
function BarraProgreso({ alumno, vigente }: { alumno: Alumno; vigente: PlanCompleto }) {
  const { data: avance } = useAvancePlan(vigente.plan.id);
  const cambiarFecha = useCambiarFechaInicio();
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(vigente.plan.fechaInicio);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hoy = new Date().toISOString();
  const krs = vigente.okrs.flatMap((o) => o.krs);
  // Ticket 9C · switch: la ficha calcula EL MISMO semáforo que el panel —
  // acciones ejecutadas contra la agenda—, sobre el avance que ya trajo.
  // Si mostrara otra cosa, el consultor vería dos colores del mismo alumno.
  const salud: SaludPorAcciones = calcularSaludPorAcciones(
    {
      estado: alumno.estado,
      fechaInicio: vigente.plan.fechaInicio,
      porFase: (avance?.fases ?? []).map((f) => ({
        fase: f.fase,
        totales: f.acciones.length,
        ejecutadas: f.acciones.filter((a) => a.estado === 'ejecutado').length,
      })),
    },
    hoy,
  );
  // El contador de KRs es el DERIVADO (9B): entregables por sus acciones,
  // métricas por valor. Contador de resultado, sin color.
  const totales = avance?.estadoKrs.length ?? 0;
  const cumplidos = avance?.estadoKrs.filter((k) => k.cumplida).length ?? 0;
  const dias = diasDelPlan(vigente.plan.fechaInicio, hoy);
  const conVencimiento = krs.filter((k) => k.vencimiento !== null).length;

  const confirmar = async () => {
    setError(null);
    try {
      await cambiarFecha.mutateAsync({ planId: vigente.plan.id, fechaNueva: fecha, motivo: motivo || undefined });
      setEditando(false);
      setMotivo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la fecha.');
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="neutral">{avance?.vencido ? 'Vencido' : `Fase ${avance?.faseActual ?? '…'}`}</Badge>
        <span className="text-sm text-navy-600 dark:text-navy-200">
          Día <strong>{dias + 1}</strong> de 90 · cierre estimado {fechaCierreEstimada(vigente.plan.fechaInicio)}
        </span>
        {avance && <SaludBadge salud={salud} />}
        {totales > 0 && <span className="text-xs text-navy-400">{cumplidos}/{totales} KRs cumplidos</span>}
        {/* Dos señales, dos mensajes (ticket 8): "no abre el link" = se
            despegó del proceso; "abre y no marca" = trabado en algo concreto. */}
        <span className="text-xs text-navy-400">
          Última marca: {avance?.ultimaActividad ? hace(avance.ultimaActividad) : 'nunca'} · Abrió el link:{' '}
          {alumno.ultimoAccesoLink ? hace(alumno.ultimoAccesoLink) : 'nunca'}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-navy-500 dark:text-navy-300">
          <CalendarDays size={14} /> Arrancó el {vigente.plan.fechaInicio}
          <Button variant="ghost" size="sm" onClick={() => { setEditando((v) => !v); setFecha(vigente.plan.fechaInicio); setError(null); }}>
            {editando ? <X size={12} /> : <Pencil size={12} />}
          </Button>
        </span>
      </div>

      {editando && (
        <div className="space-y-2 rounded-xl border border-navy-100 p-3 dark:border-navy-700">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="max-w-[11rem]" />
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="max-w-xs" />
            <Button size="sm" onClick={() => void confirmar()} disabled={cambiarFecha.isPending || fecha === vigente.plan.fechaInicio}>
              {cambiarFecha.isPending ? <Spinner className="h-4 w-4" /> : <Check size={14} />}
              <span className="ml-1">Mover la fecha</span>
            </Button>
          </div>
          <p className="text-xs text-navy-500 dark:text-navy-300">
            {conVencimiento > 0
              ? <>Se van a desplazar los vencimientos de <strong>{conVencimiento} KR{conVencimiento === 1 ? '' : 's'}</strong> por la misma cantidad de días. Queda registrado en el historial.</>
              : 'Ningún KR tiene vencimiento cargado todavía; solo se mueve la fecha (queda registrado).'}
          </p>
          {error && <p className="text-xs font-600 text-signal-red">{error}</p>}
        </div>
      )}

      {avance && avance.cambiosFecha.length > 0 && (
        <details className="text-xs text-navy-500 dark:text-navy-300">
          <summary className="cursor-pointer font-600">Historial de cambios de fecha ({avance.cambiosFecha.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {avance.cambiosFecha.map((c) => (
              <li key={c.id}>
                {c.cambiadoEn.slice(0, 10)}: {c.fechaAnterior} → {c.fechaNueva}
                {c.motivo && <span className="text-navy-400"> — {c.motivo}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
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
          <DocumentoPlan planId={vigente.plan.id} />
          <KrsDelPlan planId={vigente.plan.id} okrs={vigente.okrs} />
          <SeguimientoPlan planId={vigente.plan.id} />
        </div>
      )}
    </Card>
  );
}

/**
 * El documento del plan (ticket 7B): visor embebido del PDF vigente (el
 * .docx se descarga), subida de versiones nuevas — nunca pisan la anterior —
 * y las anteriores en una lista colapsada. El contenido vive en la base:
 * sobrevive a los reinicios del contenedor y viaja con el backup.
 */
function DocumentoPlan({ planId }: { planId: string }) {
  const { data: docs } = useDocumentosPlan(planId);
  const subir = useSubirDocumento();
  const [error, setError] = useState<string | null>(null);

  const vigenteDoc = docs?.[0] ?? null;
  const anteriores = docs?.slice(1) ?? [];

  const elegir = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const nombre = file.name.toLowerCase();
    if (!nombre.endsWith('.pdf') && !nombre.endsWith('.docx')) {
      setError('Solo se aceptan .pdf o .docx.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo pasa los 10 MB. Comprimí el PDF o subí una versión más liviana.');
      return;
    }
    try {
      await subir.mutateAsync({ planId, file });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento.');
    }
  };

  const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

  return (
    <div className="space-y-2 rounded-xl border border-navy-100 p-3 dark:border-navy-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-600 text-navy-900 dark:text-navy-50">Documento del plan</p>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-navy-200 px-3 py-1.5 text-sm font-600 text-navy-700 hover:bg-navy-50 dark:border-navy-600 dark:text-navy-200 dark:hover:bg-navy-800">
          {subir.isPending ? <Spinner className="h-4 w-4" /> : <FileDown size={14} />}
          {vigenteDoc ? 'Subir versión nueva' : 'Subir el .pdf o .docx'}
          <input
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            disabled={subir.isPending}
            onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
      </div>
      {error && <p className="text-xs font-600 text-signal-red">{error}</p>}

      {!vigenteDoc ? (
        <p className="text-xs text-navy-400">
          Todavía no se subió el documento. La versión que le mandás al alumno conviene tenerla acá: queda con la ficha y sobrevive a los reinicios del servidor.
        </p>
      ) : vigenteDoc.mimeType === 'application/pdf' ? (
        <>
          <iframe
            title={vigenteDoc.nombreArchivo}
            src={api.urlDocumento(vigenteDoc.id)}
            className="h-[28rem] w-full rounded-lg border border-navy-100 bg-white dark:border-navy-700"
          />
          <p className="text-xs text-navy-400">
            {vigenteDoc.nombreArchivo} · {kb(vigenteDoc.tamanoBytes)} · subido el {vigenteDoc.subidoEn.slice(0, 10)}
          </p>
        </>
      ) : (
        <a
          href={api.urlDocumento(vigenteDoc.id)}
          className="flex items-center gap-2 rounded-lg bg-navy-50 p-3 text-sm text-navy-800 hover:bg-navy-100 dark:bg-navy-800 dark:text-navy-100 dark:hover:bg-navy-700"
        >
          <Download size={16} />
          {vigenteDoc.nombreArchivo}
          <span className="text-xs text-navy-400">· {kb(vigenteDoc.tamanoBytes)} · subido el {vigenteDoc.subidoEn.slice(0, 10)} — descargar</span>
        </a>
      )}

      {anteriores.length > 0 && (
        <details className="text-xs text-navy-500 dark:text-navy-300">
          <summary className="cursor-pointer font-600">Versiones anteriores ({anteriores.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {anteriores.map((d) => (
              <li key={d.id}>
                <a href={api.urlDocumento(d.id)} className="underline hover:text-navy-800 dark:hover:text-navy-100">
                  {d.nombreArchivo}
                </a>{' '}
                · {kb(d.tamanoBytes)} · {d.subidoEn.slice(0, 10)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Los KRs del plan con su estado DERIVADO (ticket 9B): las entregables
 * cierran solas cuando todas sus acciones están ejecutadas; las métricas, por
 * valor contra la meta. No hay casilla de KR — la única superficie de marcado
 * es la acción. El tilde legado del ticket 7 se honra como cumplida.
 */
function KrsDelPlan({ planId, okrs }: { planId: string; okrs: PlanCompleto['okrs'] }) {
  const { data: avance } = useAvancePlan(planId);
  const estadoPorKr = new Map((avance?.estadoKrs ?? []).map((e) => [e.krId, e]));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {okrs.map((o) => (
        <div key={o.id} className="rounded-xl border border-navy-100 p-3 dark:border-navy-700">
          <p className="text-sm font-600 text-navy-900 dark:text-navy-50">{o.orden}. {o.objetivo}</p>
          <ul className="mt-1.5 space-y-2">
            {o.krs.map((k) => (
              <KrItem
                key={k.id}
                kr={k}
                estado={estadoPorKr.get(k.id) ?? null}
                mediciones={(avance?.mediciones ?? []).filter((m) => m.krId === k.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Un KR del tablero (ticket 9B): estado derivado, sin casilla. El vencimiento
 * sigue editable (se desplaza con la fecha de inicio); las métricas cargan su
 * valor acá. "Sin acciones vinculadas" = el plan la declara pero no la
 * ejecuta: se corrige agregando la acción, no tildando.
 */
function KrItem({ kr, estado, mediciones }: { kr: Kr; estado: EstadoKr | null; mediciones: Medicion[] }) {
  const editar = useEditarKr();
  const cargar = useCargarMedicion();
  const [valorNuevo, setValorNuevo] = useState('');
  const vencido = !estado?.cumplida && kr.vencimiento !== null && kr.vencimiento < new Date().toISOString().slice(0, 10);

  const cargarValor = async () => {
    const n = Number(valorNuevo.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    await cargar.mutateAsync({ krId: kr.id, valor: n });
    setValorNuevo('');
  };

  return (
    <li className="space-y-1 text-xs">
      <div className="flex items-start gap-2">
        <span className={`flex-1 ${estado?.cumplida ? 'text-navy-400 line-through' : 'text-navy-600 dark:text-navy-300'}`}>
          {kr.texto}{kr.meta && <span className="text-navy-400"> — {kr.meta}</span>}
        </span>
        <input
          type="date"
          className={`rounded border px-1 py-0.5 text-[11px] dark:bg-navy-800 ${vencido ? 'border-signal-red text-signal-red' : 'border-navy-200 text-navy-500 dark:border-navy-600 dark:text-navy-300'}`}
          value={kr.vencimiento ?? ''}
          disabled={editar.isPending}
          onChange={(e) => void editar.mutateAsync({ krId: kr.id, patch: { vencimiento: e.target.value || null } })}
          title="Vencimiento del KR (se desplaza si se mueve la fecha de inicio)"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
        {estado?.cumplida ? (
          <Badge tone="gold">
            ✓ Cumplida{estado.motivo === 'derivada' ? '' : estado.motivo === 'valor' ? ' (por valor)' : ' (tilde del consultor)'}
          </Badge>
        ) : estado?.tipo === 'metrica' ? null : estado?.sinAcciones ? (
          <Badge tone="amber">sin acciones vinculadas</Badge>
        ) : (
          <span className="text-navy-400">{estado ? `${estado.ejecutadas}/${estado.totalAcciones} acciones` : '…'}</span>
        )}
        {kr.tipo === 'metrica' && (
          <span className="flex flex-wrap items-center gap-1.5 text-navy-500 dark:text-navy-300">
            {estado?.valorActual !== null && estado?.valorActual !== undefined ? (
              <>
                {kr.valorInicial !== null && <span>{kr.valorInicial}{kr.unidad}</span>}
                {kr.valorInicial !== null && <span>→</span>}
                <span className="font-600 text-navy-800 dark:text-navy-100">{estado.valorActual}{kr.unidad}</span>
              </>
            ) : (
              <span className="text-navy-400">sin datos</span>
            )}
            {kr.meta90 !== null && <span>· meta {kr.meta90}{kr.unidad}</span>}
            <Input
              value={valorNuevo}
              onChange={(e) => setValorNuevo(e.target.value)}
              placeholder="valor"
              className="h-6 w-16 px-1.5 text-[11px]"
            />
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={cargar.isPending || valorNuevo.trim() === ''} onClick={() => void cargarValor()}>
              Cargar
            </Button>
          </span>
        )}
      </div>
      {kr.tipo === 'metrica' && mediciones.length > 0 && (
        <details className="pl-0.5 text-[11px] text-navy-400">
          <summary className="cursor-pointer">Serie ({mediciones.length})</summary>
          <ul className="mt-0.5 space-y-0.5">
            {mediciones.map((m) => (
              <li key={m.id}>
                {m.cargadoEn.slice(0, 10)}: <span className="text-navy-600 dark:text-navy-200">{m.valor}{kr.unidad}</span>
                {m.origen === 'alumno' ? ' · cargó el alumno' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/**
 * El tablero de seguimiento del consultor: estado por acción, % por fase, la
 * señal de ritmo ("última actividad") y la gestión del link del alumno. Lo
 * tildado es lo que el alumno DECLARA — se valida en la llamada.
 */
function SeguimientoPlan({ planId }: { planId: string }) {
  const { data: avance } = useAvancePlan(planId);
  const emitir = useEmitirLinkSeguimiento();
  const revocar = useRevocarLinkSeguimiento();
  const [copiado, setCopiado] = useState(false);

  if (!avance) return <div className="flex justify-center py-6"><Spinner className="h-5 w-5" /></div>;

  const urlLink = avance.link ? `${window.location.origin}/seguimiento/${avance.link.token}` : null;
  const diasSinActividad = avance.ultimaActividad
    ? Math.floor((Date.now() - Date.parse(avance.ultimaActividad)) / 86_400_000)
    : null;

  const copiar = async () => {
    if (!urlLink) return;
    await navigator.clipboard.writeText(urlLink);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 4000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-600 text-navy-900 dark:text-navy-50">Seguimiento</p>
          {avance.vencido ? (
            <Badge tone="neutral">trimestre terminado</Badge>
          ) : diasSinActividad === null ? (
            <Badge tone="neutral">el alumno todavía no tildó nada</Badge>
          ) : diasSinActividad >= 10 ? (
            <Badge tone="red">sin movimiento hace {diasSinActividad} días</Badge>
          ) : (
            <Badge tone="green">última actividad hace {diasSinActividad === 0 ? 'horas' : `${diasSinActividad} día(s)`}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!avance.link ? (
            <Button size="sm" variant="gold" onClick={() => void emitir.mutateAsync(planId)} disabled={emitir.isPending}>
              <Link2 size={14} /><span className="ml-1">Generar link del alumno</span>
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => void copiar()}>
                {copiado ? <Check size={14} className="text-signal-green" /> : <Copy size={14} />}
                <span className="ml-1">{copiado ? 'Copiado' : 'Copiar link para WhatsApp'}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Dar de baja este link (si se filtró). Después podés generar otro."
                onClick={() => { if (window.confirm('¿Dar de baja el link actual? El alumno va a necesitar el nuevo.')) void revocar.mutateAsync(planId); }}
              >
                <X size={14} /><span className="ml-1">Revocar</span>
              </Button>
            </>
          )}
        </div>
      </div>
      {urlLink && (
        <p className="break-all rounded-lg bg-navy-50 p-2 text-xs text-navy-600 dark:bg-navy-800 dark:text-navy-200">{urlLink}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {avance.fases.map((f) => (
          <div
            key={f.fase}
            className={`rounded-xl border p-3 ${f.fase === avance.faseActual && !avance.vencido ? 'border-gold-400' : 'border-navy-100 dark:border-navy-700'}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-600 uppercase tracking-wide text-navy-400">
                Fase {f.fase} · días {f.fase === 1 ? '1-30' : f.fase === 2 ? '31-60' : '61-90'}
              </p>
              <span className={`text-xs font-700 ${f.hechas === f.total && f.total > 0 ? 'text-signal-green' : 'text-navy-500 dark:text-navy-300'}`}>
                {f.hechas}/{f.total}
              </span>
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {f.acciones.map((a) => <AccionCorregible key={a.id} accion={a} />)}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-navy-400">
        Lo marcado es lo que el alumno declara — validalo en la llamada. Si algo figura distinto de la realidad,
        corregilo acá: queda registrado como tuyo y no cuenta como señal del alumno.
      </p>
    </div>
  );
}

const ETIQUETA_ESTADO: Record<EstadoAccion, string> = { pendiente: '· pendiente', en_curso: '· en curso', ejecutado: '· ejecutado' };

/**
 * Una acción del tablero, corregible por el consultor (ticket 9B): cambiar el
 * estado crea un checkin nuevo con origen consultor — auditado por la propia
 * tabla y SIN contar como señal del alumno (la alerta no se apaga).
 */
function AccionCorregible({ accion: a }: { accion: AvancePlanUI['fases'][number]['acciones'][number] }) {
  const corregir = useCorregirAccion();
  return (
    <li className="text-xs">
      <div className="flex items-center gap-1.5">
        <select
          className="rounded border border-navy-200 bg-white px-1 py-0.5 text-[11px] text-navy-600 dark:border-navy-600 dark:bg-navy-800 dark:text-navy-200"
          value={a.estado}
          disabled={corregir.isPending}
          onChange={(e) => void corregir.mutateAsync({ accionId: a.id, estado: e.target.value as EstadoAccion })}
          title="Corregir el estado (queda registrado como tuyo)"
        >
          <option value="pendiente">☐</option>
          <option value="en_curso">◐</option>
          <option value="ejecutado">☑</option>
        </select>
        <span className={a.estado === 'ejecutado' ? 'text-navy-400 line-through' : a.estado === 'en_curso' ? 'text-gold-500' : 'text-navy-700 dark:text-navy-200'}>
          {a.texto}
        </span>
        {a.estado === 'en_curso' && <span className="text-[10px] text-gold-500">{ETIQUETA_ESTADO.en_curso}</span>}
        {a.okrOrden !== null && <span className="text-navy-300">· OKR {a.okrOrden}</span>}
      </div>
      {a.nota && <p className="mt-0.5 pl-6 italic text-navy-400">“{a.nota}”</p>}
    </li>
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
    telefonoPais: alumno.telefonoPais ?? '',
    telefonoNumero: alumno.telefonoNumero ?? '',
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
          telefonoPais: form.telefonoPais.trim() || null,
          telefonoNumero: form.telefonoNumero.trim() || null,
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
          {dato('WhatsApp (texto libre)', alumno.whatsapp)}
          {dato('Teléfono normalizado', alumno.telefonoPais && alumno.telefonoNumero ? `+${alumno.telefonoPais} ${alumno.telefonoNumero}` : null)}
          {dato('Marca', alumno.marcaComercial)}
          {dato('Canal', alumno.canalOrigen)}
          {dato('Moneda', alumno.moneda)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {([['nombre', 'Nombre'], ['edad', 'Edad'], ['zona', 'Zona'], ['whatsapp', 'WhatsApp (texto libre)'], ['marcaComercial', 'Marca'], ['telefonoPais', 'Cód. país (sin +, ej. 54)'], ['telefonoNumero', 'Número (solo dígitos, con área)']] as const).map(([k, etiqueta]) => (
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
