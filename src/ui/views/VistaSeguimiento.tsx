/**
 * El checklist del alumno (segunda ruta pública de la SPA): abre por el link
 * de WhatsApp, sin cuenta, y tilda lo que fue completando.
 *
 * Ticket 8 — la vista ORIENTA, no alarma. Regla dura: acá no hay semáforo,
 * ni rojo, ni "trabado", ni porcentajes de atraso. El bloque "Esta semana"
 * (3 acciones, la deuda primero) le dice por dónde empezar; el resto queda
 * abajo como panorama. Aterriza abierta la fase con la acción más urgente.
 *
 * El tilde es optimista: se pinta ya y se confirma contra el server con un
 * "Guardado ✓" visible; si falla, vuelve atrás y avisa. Nunca queda una
 * casilla marcada sin confirmación del servidor.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown } from 'lucide-react';
import { seleccionarEstaSemana, deudaVencida, faseAAbrir } from '@domain/alumnos/vistaAlumno';
import { seguimientoApi, ErrorFormulario, type SeguimientoAbiertoUI, type MotivoToken } from '../lib/formularioApi';
import { Card, Spinner } from '../components/ui/primitives';

const MENSAJE_TERMINAL: Record<string, { titulo: string; detalle: string }> = {
  inexistente: { titulo: 'Este link no es válido', detalle: 'Revisá que lo hayas copiado completo, o pedile el link a tu consultor.' },
  vencido: { titulo: 'Este link venció', detalle: 'Pedile el nuevo a tu consultor.' },
  revocado: { titulo: 'Este link fue dado de baja', detalle: 'Tu consultor generó uno nuevo — pedíselo por WhatsApp.' },
};

const RANGO_FASE: Record<1 | 2 | 3, string> = { 1: 'días 1-30', 2: 'días 31-60', 3: 'días 61-90' };

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
   * recalculara con cada tilde, la acción marcada desaparecería del bloque y
   * entraría otra — y el "empezá por estas tres" se volvería una cinta sin fin.
   */
  const [idsEstaSemana, setIdsEstaSemana] = useState<string[]>([]);

  useEffect(() => {
    seguimientoApi
      .abrir(token)
      .then((d) => {
        setDatos(d);
        setAbiertas(new Set([faseAAbrir(d.fases, d.faseActual)]));
        setIdsEstaSemana(seleccionarEstaSemana(d.fases, d.faseActual).map((a) => a.id));
      })
      .catch((err) => setTerminal(err instanceof ErrorFormulario && err.motivo ? err.motivo : 'inexistente'))
      .finally(() => setCargando(false));
  }, [token]);

  const tildar = async (accionId: string, hecha: boolean) => {
    if (!datos || datos.vencido) return;
    setErrorTilde(null);
    // Optimista: se pinta ya, se confirma después. El "Guardado ✓" recién
    // aparece con el OK del server — esa es la confirmación de verdad.
    const pintar = (valor: boolean) =>
      setDatos((d) =>
        d && {
          ...d,
          fases: d.fases.map((f) => ({
            ...f,
            acciones: f.acciones.map((a) => (a.id === accionId ? { ...a, hecha: valor } : a)),
          })),
        },
      );
    pintar(hecha);
    try {
      await seguimientoApi.marcar(token, accionId, hecha);
      setGuardado(true);
      if (timerGuardado.current) clearTimeout(timerGuardado.current);
      timerGuardado.current = setTimeout(() => setGuardado(false), 1500);
    } catch (err) {
      pintar(!hecha); // vuelta atrás: nunca queda marcada sin confirmación
      if (err instanceof ErrorFormulario && err.motivo) setTerminal(err.motivo as MotivoToken);
      else setErrorTilde('No se pudo guardar, probá de nuevo.');
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

  return (
    <div className="min-h-screen bg-navy-50 pb-16 dark:bg-navy-950">
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-8">
        <header>
          <p className="text-xs font-600 uppercase tracking-wide text-gold-500">+Activos Academy · Plan de 90 días</p>
          <h1 className="mt-1 font-display text-2xl font-700 text-navy-900 dark:text-navy-50">Hola, {datos.alumno} 👋</h1>
          <p className="mt-1 text-sm text-navy-600 dark:text-navy-300">
            {datos.vencido
              ? 'El trimestre terminó. Este es tu resumen final — repasalo con tu consultor.'
              : 'Marcá lo que ya hiciste: tu consultor lo ve al instante.'}
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

        {datos.vencido && (
          <Card className="border-gold-400 bg-gold-400/10 p-3">
            <p className="text-sm text-navy-800 dark:text-navy-100">
              El checklist quedó congelado el día 90. Lo que quedó sin tildar es material para la llamada de cierre.
            </p>
          </Card>
        )}

        {/* ── Esta semana: exactamente 3, la deuda primero, casillas funcionales ── */}
        {!datos.vencido && estaSemana.length > 0 && pendientesEstaSemana && (
          <Card className="border-gold-400/60 p-4">
            <p className="font-display text-base font-700 text-navy-900 dark:text-navy-50">Esta semana</p>
            <p className="mt-0.5 text-sm text-navy-600 dark:text-navy-300">
              {deuda.length > 0 ? (
                <>
                  {(() => {
                    const totalDeuda = deuda.reduce((n, d) => n + d.pendientes, 0);
                    const fases = deuda.length === 1 ? `la Fase ${deuda[0]!.fase}` : `las Fases ${deuda.map((d) => d.fase).join(' y ')}`;
                    const arranque = estaSemana.length === 1 ? 'Empezá por esta:' : estaSemana.length === 2 ? 'Empezá por estas dos:' : 'Empezá por estas tres:';
                    return `Venís con ${totalDeuda} ${totalDeuda === 1 ? 'acción' : 'acciones'} de ${fases} pendiente${totalDeuda === 1 ? '' : 's'}. ${arranque}`;
                  })()}
                </>
              ) : (
                <>Vas al día. Lo que sigue en la Fase {datos.faseActual}:</>
              )}
            </p>
            <div className="mt-2 space-y-1">
              {estaSemana.map((a) => (
                <CasillaAccion key={a.id} accion={a} deshabilitada={datos.vencido} onTildar={tildar} />
              ))}
            </div>
          </Card>
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
                <div className="space-y-1 border-t border-navy-100 px-4 py-3 dark:border-navy-700">
                  {f.acciones.map((a) => (
                    <CasillaAccion key={a.id} accion={a} deshabilitada={datos.vencido} onTildar={tildar} />
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        {errorTilde && <p className="text-center text-sm font-600 text-navy-700 dark:text-navy-200">{errorTilde}</p>}

        {hechas === total && total > 0 && !datos.vencido && (
          <div className="pt-2 text-center">
            <CheckCircle2 className="mx-auto mb-1 text-gold-400" size={28} />
            <p className="text-sm font-600 text-navy-800 dark:text-navy-100">¡Plan completo! Contáselo a tu consultor.</p>
          </div>
        )}

        <p className="pt-2 text-center text-xs text-navy-400">Guardá este link: es tuyo y dura todo el trimestre.</p>
      </div>

      {/* La confirmación de guardado: visible ~1,5 s tras el OK del server. */}
      {guardado && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-navy-900 px-4 py-2 text-sm font-600 text-gold-400 shadow-lg dark:bg-navy-50 dark:text-navy-900">
          <span className="flex items-center gap-1.5"><Check size={15} /> Guardado</span>
        </div>
      )}
    </div>
  );
}

/**
 * Una casilla del checklist, compartida por "Esta semana" y las fases: marcar
 * en un lado actualiza el otro (el estado vive en `datos`). Área táctil de
 * 44px como mínimo — esto se usa desde WhatsApp, en el teléfono.
 */
function CasillaAccion({
  accion: a,
  deshabilitada,
  onTildar,
}: {
  accion: { id: string; texto: string; hecha: boolean };
  deshabilitada: boolean;
  onTildar: (id: string, hecha: boolean) => Promise<void>;
}) {
  return (
    <label
      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg p-2 transition hover:bg-navy-50 dark:hover:bg-navy-800 ${deshabilitada ? 'cursor-default opacity-70' : ''}`}
    >
      <input
        type="checkbox"
        className="h-5 w-5 shrink-0 rounded border-navy-300 accent-gold-400"
        checked={a.hecha}
        disabled={deshabilitada}
        onChange={(e) => void onTildar(a.id, e.target.checked)}
      />
      <span className={`text-sm ${a.hecha ? 'text-navy-400 line-through' : 'text-navy-800 dark:text-navy-100'}`}>
        {a.texto}
      </span>
    </label>
  );
}
