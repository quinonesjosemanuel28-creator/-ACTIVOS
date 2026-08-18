/**
 * El checklist del alumno (segunda ruta pública de la SPA): abre por el link
 * de WhatsApp, sin cuenta, y marca lo que fue completando.
 *
 * Ticket 8 — la vista ORIENTA, no alarma. Regla dura: acá no hay semáforo,
 * ni rojo, ni "trabado", ni porcentajes de atraso. El bloque "Esta semana"
 * (3 acciones) le dice por dónde empezar; el resto queda abajo como
 * panorama. Aterriza abierta la fase con la acción más urgente.
 *
 * Ticket 9D — un solo gesto por elemento: el CÍRCULO marca ejecutado (un
 * toque, como siempre); el TEXTO abre el detalle, donde viven los tres
 * estados y la nota. Tres estados, dos tratamientos visuales: ejecutado
 * tachado con check, en curso dorado suave con etiqueta, pendiente sin
 * tratamiento — si cada estado tuviera color propio, 30 acciones serían un
 * semáforo. "Tus números" muestra las métricas sin juicio: si mejoró lo
 * dice, si no, el número solo.
 *
 * La marca es optimista: se pinta ya y se confirma contra el server con un
 * "Guardado ✓" visible; si falla, vuelve atrás y avisa. Nunca queda una
 * casilla marcada sin confirmación del servidor.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown } from 'lucide-react';
import {
  accionesAMedias,
  agruparPorKr,
  CUPO_ESTA_SEMANA,
  deudaVencida,
  faseAAbrir,
  seleccionarEstaSemana,
} from '@domain/alumnos/vistaAlumno';
import { progresoMetrica } from '@domain/alumnos/medicion';
import {
  seguimientoApi,
  ErrorFormulario,
  type AccionSeguimientoUI,
  type EstadoAccionUI,
  type MetricaSeguimientoUI,
  type SeguimientoAbiertoUI,
  type MotivoToken,
} from '../lib/formularioApi';
import { Card, Spinner } from '../components/ui/primitives';

const MENSAJE_TERMINAL: Record<string, { titulo: string; detalle: string }> = {
  inexistente: { titulo: 'Este link no es válido', detalle: 'Revisá que lo hayas copiado completo, o pedile el link a tu consultor.' },
  vencido: { titulo: 'Este link venció', detalle: 'Pedile el nuevo a tu consultor.' },
  revocado: { titulo: 'Este link fue dado de baja', detalle: 'Tu consultor generó uno nuevo — pedíselo por WhatsApp.' },
};

const RANGO_FASE: Record<1 | 2 | 3, string> = { 1: 'días 1-30', 2: 'días 31-60', 3: 'días 61-90' };

/** Las fases con lo que la selección de dominio necesita: en curso explícito. */
const conEnCurso = (fases: SeguimientoAbiertoUI['fases']) =>
  fases.map((f) => ({ fase: f.fase, acciones: f.acciones.map((a) => ({ ...a, enCurso: a.estado === 'en_curso' })) }));

/** Números sin ruido: enteros pelados, decimales con coma y hasta 2 cifras. */
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

export function VistaSeguimiento({ token }: { token: string }) {
  const [datos, setDatos] = useState<SeguimientoAbiertoUI | null>(null);
  const [terminal, setTerminal] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorTilde, setErrorTilde] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const timerGuardado = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Fases desplegadas (arranca la de la acción más urgente; el alumno abre otras). */
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  /**
   * El bloque "Esta semana" se elige UNA vez al abrir y queda fijo: si se
   * recalculara con cada marca, la acción marcada desaparecería del bloque y
   * entraría otra — y el "empezá por estas tres" se volvería una cinta sin fin.
   */
  const [idsEstaSemana, setIdsEstaSemana] = useState<string[]>([]);
  /** El detalle abierto (9D): tocar el TEXTO llega acá; el círculo no. */
  const [detalle, setDetalle] = useState<AccionSeguimientoUI | null>(null);

  useEffect(() => {
    seguimientoApi
      .abrir(token)
      .then((d) => {
        setDatos(d);
        setAbiertas(new Set([faseAAbrir(d.fases, d.faseActual)]));
        setIdsEstaSemana(seleccionarEstaSemana(conEnCurso(d.fases), d.faseActual).map((a) => a.id));
      })
      .catch((err) => setTerminal(err instanceof ErrorFormulario && err.motivo ? err.motivo : 'inexistente'))
      .finally(() => setCargando(false));
  }, [token]);

  const confirmarGuardado = () => {
    setGuardado(true);
    if (timerGuardado.current) clearTimeout(timerGuardado.current);
    timerGuardado.current = setTimeout(() => setGuardado(false), 1500);
  };

  const pintarEstado = (accionId: string, estado: EstadoAccionUI) =>
    setDatos((d) =>
      d && {
        ...d,
        fases: d.fases.map((f) => ({
          ...f,
          acciones: f.acciones.map((a) => (a.id === accionId ? { ...a, estado, hecha: estado === 'ejecutado' } : a)),
        })),
      },
    );

  const fallo = (err: unknown) => {
    if (err instanceof ErrorFormulario && err.motivo) setTerminal(err.motivo as MotivoToken);
    else setErrorTilde('No se pudo guardar, probá de nuevo.');
  };

  /** El círculo: binario, un toque. Pasado el día 90 SIGUE marcable (ticket 8). */
  const tildar = async (accion: AccionSeguimientoUI, hecha: boolean) => {
    if (!datos) return;
    setErrorTilde(null);
    const previo = accion.estado;
    // Optimista: se pinta ya, se confirma después. El "Guardado ✓" recién
    // aparece con el OK del server — esa es la confirmación de verdad.
    pintarEstado(accion.id, hecha ? 'ejecutado' : 'pendiente');
    try {
      await seguimientoApi.marcar(token, accion.id, hecha);
      confirmarGuardado();
    } catch (err) {
      pintarEstado(accion.id, previo); // vuelta atrás: nunca queda marcada sin confirmación
      fallo(err);
    }
  };

  /** El detalle (9D): estado explícito + nota. Cada guardado es una fila nueva. */
  const guardarDetalle = async (accion: AccionSeguimientoUI, estado: EstadoAccionUI, nota: string) => {
    if (!datos) return;
    setErrorTilde(null);
    const previo = accion.estado;
    pintarEstado(accion.id, estado);
    setDetalle(null);
    try {
      await seguimientoApi.marcarEstado(token, accion.id, estado, nota);
      confirmarGuardado();
    } catch (err) {
      pintarEstado(accion.id, previo);
      fallo(err);
    }
  };

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }
  if (terminal || !datos) {
    const m = MENSAJE_TERMINAL[terminal ?? 'inexistente'] ?? MENSAJE_TERMINAL.inexistente!;
    return (
      <div className="mx-auto mt-24 max-w-md px-4 text-center">
        <AlertTriangle className="mx-auto mb-3 text-gold-400" size={36} />
        <h1 className="font-display text-xl font-700 text-navy-900 dark:text-navy-50">{m.titulo}</h1>
        <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">{m.detalle}</p>
      </div>
    );
  }

  const todas = datos.fases.flatMap((f) => f.acciones);
  const total = todas.length;
  const hechas = todas.filter((a) => a.hecha).length;
  const deuda = deudaVencida(datos.fases, datos.faseActual);
  const estaSemana = idsEstaSemana
    .map((id) => todas.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);
  const pendientesEstaSemana = estaSemana.some((a) => !a.hecha);
  // El aviso de "a medias" (9D): vivo, no congelado — cerrar acciones lo apaga.
  const aMedias = accionesAMedias(conEnCurso(datos.fases));

  return (
    <div className="min-h-screen bg-navy-50 pb-16 dark:bg-navy-950">
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-8">
        <header>
          <p className="text-xs font-600 uppercase tracking-wide text-gold-500">+Activos Academy · Plan de 90 días</p>
          <h1 className="mt-1 font-display text-2xl font-700 text-navy-900 dark:text-navy-50">Hola, {datos.alumno} 👋</h1>
          <p className="mt-1 text-sm text-navy-600 dark:text-navy-300">
            {datos.vencido
              ? 'El trimestre terminó. Repasá con tu consultor cómo te fue — y lo que completes ahora también cuenta.'
              : 'Acá seguís tu plan de 90 días. Marcá lo que vas cumpliendo y tu consultor te acompaña donde te trabes.'}
          </p>
          {/* Día del plan, sin que el alumno haga la cuenta. Barra fina y
              neutra: mide TIEMPO, nunca se pone roja. */}
          <p className="mt-3 text-sm font-600 text-navy-800 dark:text-navy-100">
            {datos.vencido ? `Plan finalizado · día 90 de 90` : `Día ${datos.dia} de 90 · te quedan ${datos.restantes}`}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800">
            <div className="h-full rounded-full bg-gold-400" style={{ width: `${Math.round((datos.dia / 90) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-navy-400">{hechas} de {total} acciones completadas</p>
        </header>

        {/* ── El plan sin acciones todavía: nada de casillas vacías ni bloques rotos ── */}
        {total === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-navy-600 dark:text-navy-300">Tu consultor está preparando tu plan. Volvé a entrar en unos días.</p>
          </Card>
        ) : (
        <>

        {datos.pausado && (
          <Card className="p-3">
            <p className="text-sm text-navy-700 dark:text-navy-200">
              Tu plan está en pausa. Hablá con tu consultor para retomarlo.
            </p>
          </Card>
        )}

        {/* ── El desfase, dicho sin castigar: fondo suave, nunca rojo, sin
               porcentajes. Solo aparece si hay deuda de fases vencidas. ── */}
        {!datos.vencido && deuda.length > 0 && (
          <Card className="border-gold-400/40 bg-gold-400/5 p-3">
            <p className="text-sm text-navy-700 dark:text-navy-200">
              El calendario va por la Fase {datos.faseActual}, pero te{' '}
              {deuda.reduce((n, d) => n + d.pendientes, 0) === 1
                ? `quedó 1 acción de la Fase ${deuda[0]!.fase}. Se recupera`
                : `quedaron ${deuda.reduce((n, d) => n + d.pendientes, 0)} acciones de ${
                    deuda.length === 1 ? `la Fase ${deuda[0]!.fase}` : `las Fases ${deuda.map((d) => d.fase).join(' y ')}`
                  }. Se recuperan`}
              : arrancá por las de acá abajo.
            </p>
          </Card>
        )}

        {/* ── Esta semana: 3 acciones, lo empezado primero (9D) ── */}
        {!datos.vencido && estaSemana.length > 0 && pendientesEstaSemana && (
          <Card className="border-gold-400/60 p-4">
            <p className="font-display text-base font-700 text-navy-900 dark:text-navy-50">Esta semana</p>
            <p className="mt-0.5 text-sm text-navy-600 dark:text-navy-300">
              {aMedias > CUPO_ESTA_SEMANA
                // Describe, no reprocha. Sin rojo: es el mismo tono de siempre.
                ? `Tenés ${aMedias} acciones a medias. Cerrá algunas antes de arrancar otra.`
                : deuda.length > 0
                  ? estaSemana.length === 1 ? 'Empezá por esta:' : estaSemana.length === 2 ? 'Empezá por estas dos:' : 'Empezá por estas tres:'
                  : <>Vas al día. Lo que sigue en la Fase {datos.faseActual}:</>}
            </p>
            <div className="mt-2 space-y-1">
              {estaSemana.map((a) => (
                <CasillaAccion key={a.id} accion={a} onTildar={tildar} onDetalle={setDetalle} />
              ))}
            </div>
          </Card>
        )}

        {/* ── Tus números (9D): las métricas con valor, sin juicio ── */}
        {datos.metricas.length > 0 && (
          <TusNumeros token={token} metricas={datos.metricas} onCargada={(krId, valor) => {
            setDatos((d) => d && { ...d, metricas: d.metricas.map((m) => (m.krId === krId ? { ...m, valorActual: valor } : m)) });
            confirmarGuardado();
          }} onError={fallo} />
        )}

        {datos.fases.map((f) => {
          const abierta = abiertas.has(f.fase);
          const hechasFase = f.acciones.filter((a) => a.hecha).length;
          const esActual = f.fase === datos.faseActual && !datos.vencido;
          return (
            <Card key={f.fase} className="overflow-hidden p-0">
              <button
                className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setAbiertas((s) => { const n = new Set(s); if (n.has(f.fase)) n.delete(f.fase); else n.add(f.fase); return n; })}
              >
                <span className="text-sm font-600 text-navy-900 dark:text-navy-50">
                  Fase {f.fase} · {RANGO_FASE[f.fase]}
                  {esActual && <span className="ml-2 rounded-full bg-gold-400/20 px-2 py-0.5 text-xs font-600 text-gold-500">estás acá</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-navy-400">
                  {hechasFase}/{f.acciones.length}
                  <ChevronDown size={16} className={`transition ${abierta ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {abierta && (
                <div className="space-y-2 border-t border-navy-100 px-4 py-3 dark:border-navy-700">
                  {/* Las acciones bajo su KR: la tarea con su para qué. El KR
                      es subtítulo, no casilla — el alumno marca acciones. */}
                  {agruparPorKr(f.acciones, datos.krs).map((grupo, _gi, grupos) => {
                    const hechasGrupo = grupo.acciones.filter((a) => a.hecha).length;
                    const soloSueltas = grupos.length === 1 && grupo.kr === null;
                    return (
                      <div key={grupo.kr?.id ?? 'otras'}>
                        {!soloSueltas && (
                          <p className="flex items-baseline justify-between gap-2 px-2 pb-0.5 text-xs text-navy-400">
                            <span>{grupo.kr ? `KR — ${grupo.kr.texto}` : 'Otras acciones'}</span>
                            <span className="shrink-0">{hechasGrupo}/{grupo.acciones.length}</span>
                          </p>
                        )}
                        <div className="space-y-1">
                          {grupo.acciones.map((a) => (
                            <CasillaAccion key={a.id} accion={a} onTildar={tildar} onDetalle={setDetalle} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}

        {errorTilde && <p className="text-center text-sm font-600 text-navy-700 dark:text-navy-200">{errorTilde}</p>}

        {/* ── Bloque de cierre: todas cumplidas (sin bloque "Esta semana") ── */}
        {hechas === total && (
          <div className="pt-2 text-center">
            <CheckCircle2 className="mx-auto mb-1 text-gold-400" size={28} />
            <p className="text-sm font-600 text-navy-800 dark:text-navy-100">
              Completaste las {total} acciones del plan. Contáselo a tu consultor.
            </p>
          </div>
        )}

        </>
        )}

        <p className="pt-2 text-center text-xs text-navy-400">Guardá este link: es tuyo y dura todo el trimestre.</p>
      </div>

      {/* El detalle de la acción (9D): estado explícito y nota, sin promesas
          de respuesta — el canal de consultas es del ticket 10, completo. */}
      {detalle && (
        <DetalleAccion
          accion={detalle}
          onGuardar={guardarDetalle}
          onCerrar={() => setDetalle(null)}
        />
      )}

      {/* La confirmación de guardado: visible ~1,5 s tras el OK del server. */}
      {guardado && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-navy-900 px-4 py-2 text-sm font-600 text-gold-400 shadow-lg dark:bg-navy-50 dark:text-navy-900">
          <span className="flex items-center gap-1.5"><Check size={15} /> Guardado</span>
        </div>
      )}
    </div>
  );
}

/**
 * Una fila del checklist, compartida por "Esta semana" y las fases. Un solo
 * gesto por elemento (9D §8.2): el CÍRCULO marca ejecutado — un toque, área
 * táctil propia de 44px —; el TEXTO abre el detalle. Tres estados, dos
 * tratamientos: ejecutado tachado con check; en curso dorado suave con su
 * etiqueta; pendiente sin tratamiento. Siempre marcable: ni el día 90 ni la
 * pausa la congelan.
 */
function CasillaAccion({
  accion: a,
  onTildar,
  onDetalle,
}: {
  accion: AccionSeguimientoUI;
  onTildar: (accion: AccionSeguimientoUI, hecha: boolean) => Promise<void>;
  onDetalle: (accion: AccionSeguimientoUI) => void;
}) {
  const enCurso = a.estado === 'en_curso';
  return (
    <div className="flex items-center rounded-lg transition hover:bg-navy-50 dark:hover:bg-navy-800">
      <button
        type="button"
        aria-label={a.hecha ? `Desmarcar «${a.texto}»` : `Marcar «${a.texto}» como hecha`}
        className="flex h-11 w-11 shrink-0 items-center justify-center"
        onClick={() => void onTildar(a, !a.hecha)}
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
            a.hecha
              ? 'border-gold-400 bg-gold-400 text-navy-900'
              : enCurso
                ? 'border-gold-400'
                : 'border-navy-300 dark:border-navy-600'
          }`}
        >
          {a.hecha && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
      <button
        type="button"
        className="min-h-[44px] flex-1 py-2 pr-2 text-left"
        onClick={() => onDetalle(a)}
      >
        <span className={`text-sm ${a.hecha ? 'text-navy-400 line-through' : 'text-navy-800 dark:text-navy-100'}`}>
          {a.texto}
        </span>
        {enCurso && !a.hecha && (
          <span className="mt-0.5 block text-xs font-600 text-gold-500">En curso</span>
        )}
      </button>
    </div>
  );
}

const OPCIONES_ESTADO: { valor: EstadoAccionUI; etiqueta: string }[] = [
  { valor: 'pendiente', etiqueta: 'Pendiente' },
  { valor: 'en_curso', etiqueta: 'En curso' },
  { valor: 'ejecutado', etiqueta: 'Ejecutado' },
];

/** El detalle: selector de estado + nota opcional. Cada guardado es una fila nueva. */
function DetalleAccion({
  accion,
  onGuardar,
  onCerrar,
}: {
  accion: AccionSeguimientoUI;
  onGuardar: (accion: AccionSeguimientoUI, estado: EstadoAccionUI, nota: string) => Promise<void>;
  onCerrar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoAccionUI>(accion.estado);
  const [nota, setNota] = useState('');
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy-950/40" onClick={onCerrar}>
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-4 pb-6 shadow-xl dark:bg-navy-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-600 text-navy-900 dark:text-navy-50">{accion.texto}</p>
        <div className="mt-3 flex gap-2">
          {OPCIONES_ESTADO.map((o) => (
            <button
              key={o.valor}
              type="button"
              className={`min-h-[44px] flex-1 rounded-lg border px-2 text-sm font-600 transition ${
                estado === o.valor
                  ? 'border-gold-400 bg-gold-400/15 text-navy-900 dark:text-navy-50'
                  : 'border-navy-200 text-navy-600 dark:border-navy-700 dark:text-navy-300'
              }`}
              onClick={() => setEstado(o.valor)}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 w-full rounded-lg border border-navy-200 bg-transparent p-2 text-sm text-navy-800 placeholder:text-navy-400 dark:border-navy-700 dark:text-navy-100"
          rows={2}
          placeholder="¿Qué pasó con esta acción? (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-lg bg-gold-400 text-sm font-700 text-navy-900 transition hover:bg-gold-500"
            onClick={() => void onGuardar(accion, estado, nota)}
          >
            Guardar
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-lg border border-navy-200 px-4 text-sm font-600 text-navy-600 dark:border-navy-700 dark:text-navy-300"
            onClick={onCerrar}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Tus números" (9D §8.6): inicial → actual → meta, y si el valor se movió
 * en la dirección correcta, lo dice — si no, el número solo, sin comentario.
 * Nunca rojo, nunca "no llegaste". El alumno carga el valor del mes acá: es
 * un dato que necesita para su negocio, no un reporte que le pedimos.
 */
function TusNumeros({
  token,
  metricas,
  onCargada,
  onError,
}: {
  token: string;
  metricas: MetricaSeguimientoUI[];
  onCargada: (krId: string, valor: number) => void;
  onError: (err: unknown) => void;
}) {
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = async (m: MetricaSeguimientoUI) => {
    const crudo = (borradores[m.krId] ?? '').replace(',', '.').trim();
    const valor = Number(crudo);
    if (crudo === '' || !Number.isFinite(valor)) return;
    setGuardando(m.krId);
    try {
      await seguimientoApi.cargarMedicion(token, m.krId, valor);
      onCargada(m.krId, valor);
      setBorradores((b) => ({ ...b, [m.krId]: '' }));
    } catch (err) {
      onError(err);
    } finally {
      setGuardando(null);
    }
  };

  const conUnidad = (v: number, unidad: string) => (unidad === '%' ? `${fmt(v)} %` : `${fmt(v)} ${unidad}`);

  return (
    <Card className="p-4">
      <p className="font-display text-base font-700 text-navy-900 dark:text-navy-50">Tus números</p>
      <div className="mt-2 space-y-4">
        {metricas.map((m) => {
          const p = progresoMetrica(m.direccion, m.valorInicial, m.valorActual);
          const palabra = m.unidad === '%' ? (p.delta === 1 ? 'punto' : 'puntos') : m.unidad;
          return (
            <div key={m.krId}>
              <p className="text-sm font-600 text-navy-800 dark:text-navy-100">{m.texto}</p>
              <p className="mt-0.5 text-sm text-navy-600 dark:text-navy-300">
                {conUnidad(m.valorInicial, m.unidad)}
                <span className="mx-1.5 text-navy-400">→</span>
                <span className="font-700 text-navy-900 dark:text-navy-50">{conUnidad(m.valorActual, m.unidad)}</span>
                <span className="mx-1.5 text-navy-400">→</span>
                meta {conUnidad(m.meta90, m.unidad)}
              </p>
              {/* Solo si mejoró; si no, el número solo — sin comentario. */}
              {p.mejoro && p.delta > 0 && (
                <p className="mt-0.5 text-xs font-600 text-gold-500">
                  {m.direccion === 'baja' ? 'bajó' : 'subió'} {fmt(p.delta)} {palabra} desde que arrancaste
                </p>
              )}
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  className="min-h-[40px] w-28 rounded-lg border border-navy-200 bg-transparent px-2 text-sm text-navy-800 placeholder:text-navy-400 dark:border-navy-700 dark:text-navy-100"
                  placeholder="Valor de hoy"
                  value={borradores[m.krId] ?? ''}
                  onChange={(e) => setBorradores((b) => ({ ...b, [m.krId]: e.target.value }))}
                />
                <button
                  type="button"
                  disabled={guardando === m.krId}
                  className="min-h-[40px] rounded-lg border border-gold-400 px-3 text-sm font-600 text-gold-500 transition hover:bg-gold-400/10 disabled:opacity-50"
                  onClick={() => void cargar(m)}
                >
                  Actualizar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
