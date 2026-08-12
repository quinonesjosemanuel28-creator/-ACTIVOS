/**
 * El checklist del alumno (segunda ruta pública de la SPA): abre por el link
 * de WhatsApp, sin cuenta, y tilda lo que fue completando.
 *
 * La fase que corresponde a la fecha viene DESPLEGADA y las otras plegadas: el
 * alumno aterriza en "esto es lo tuyo ahora" y ve el resto como horizonte, no
 * como una pila que abruma. Pasado el día 90 el checklist se congela: se lee,
 * no se tilda (la llamada de cierre lo repasa).
 *
 * El tilde es optimista: se pinta ya y se confirma contra el server; si falla,
 * vuelve atrás. Cada tilde es un checkin append-only del lado del server.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
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
  /** Fases desplegadas (arranca solo la actual; el alumno puede abrir otras). */
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());

  useEffect(() => {
    seguimientoApi
      .abrir(token)
      .then((d) => {
        setDatos(d);
        setAbiertas(new Set([d.faseActual]));
      })
      .catch((err) => setTerminal(err instanceof ErrorFormulario && err.motivo ? err.motivo : 'inexistente'))
      .finally(() => setCargando(false));
  }, [token]);

  const tildar = async (accionId: string, hecha: boolean) => {
    if (!datos || datos.vencido) return;
    setErrorTilde(null);
    // Optimista: se pinta ya, se confirma después.
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
    } catch (err) {
      pintar(!hecha); // vuelta atrás
      if (err instanceof ErrorFormulario && err.motivo) setTerminal(err.motivo as MotivoToken);
      else setErrorTilde(err instanceof Error ? err.message : 'No se pudo guardar. Probá de nuevo.');
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

  const total = datos.fases.reduce((n, f) => n + f.acciones.length, 0);
  const hechas = datos.fases.reduce((n, f) => n + f.acciones.filter((a) => a.hecha).length, 0);

  return (
    <div className="min-h-screen bg-navy-50 pb-16 dark:bg-navy-950">
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-8">
        <header>
          <p className="text-xs font-600 uppercase tracking-wide text-gold-500">+Activos Academy · Plan de 90 días</p>
          <h1 className="mt-1 font-display text-2xl font-700 text-navy-900 dark:text-navy-50">Hola, {datos.alumno} 👋</h1>
          <p className="mt-1 text-sm text-navy-600 dark:text-navy-300">
            {datos.vencido
              ? 'El trimestre terminó. Este es tu resumen final — repasalo con tu consultor.'
              : `Tu plan arrancó el ${datos.fechaInicio}. Marcá lo que ya hiciste: tu consultor lo ve al instante.`}
          </p>
          <p className="mt-2 text-sm font-600 text-navy-800 dark:text-navy-100">{hechas} de {total} acciones completadas</p>
        </header>

        {datos.vencido && (
          <Card className="border-gold-400 bg-gold-400/10 p-3">
            <p className="text-sm text-navy-800 dark:text-navy-100">
              El checklist quedó congelado el día 90. Lo que quedó sin tildar es material para la llamada de cierre.
            </p>
          </Card>
        )}

        {datos.fases.map((f) => {
          const abierta = abiertas.has(f.fase);
          const hechasFase = f.acciones.filter((a) => a.hecha).length;
          const esActual = f.fase === datos.faseActual && !datos.vencido;
          return (
            <Card key={f.fase} className="overflow-hidden p-0">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left"
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
                    <label
                      key={a.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-navy-50 dark:hover:bg-navy-800 ${datos.vencido ? 'cursor-default opacity-70' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 rounded border-navy-300 accent-gold-400"
                        checked={a.hecha}
                        disabled={datos.vencido}
                        onChange={(e) => void tildar(a.id, e.target.checked)}
                      />
                      <span className={`text-sm ${a.hecha ? 'text-navy-400 line-through' : 'text-navy-800 dark:text-navy-100'}`}>
                        {a.texto}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        {errorTilde && <p className="text-center text-sm font-600 text-signal-red">{errorTilde}</p>}

        {hechas === total && total > 0 && !datos.vencido && (
          <div className="pt-2 text-center">
            <CheckCircle2 className="mx-auto mb-1 text-gold-400" size={28} />
            <p className="text-sm font-600 text-navy-800 dark:text-navy-100">¡Plan completo! Contáselo a tu consultor.</p>
          </div>
        )}

        <p className="pt-2 text-center text-xs text-navy-400">Guardá este link: es tuyo y dura todo el trimestre.</p>
      </div>
    </div>
  );
}
