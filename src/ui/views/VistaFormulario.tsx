/**
 * Formulario público de diagnóstico. La ÚNICA pantalla de la SPA sin sesión:
 * el alumno llega por un link con token, no tiene cuenta ni ve nada más.
 *
 * Renderiza desde el catálogo del dominio (domain/alumnos/formulario.ts) — el
 * mismo del que se deriva la validación Zod del server: pregunta que cambia
 * allá, cambia acá. La casilla "No lo tengo claro" deshabilita el campo y
 * descarta lo tipeado, igual que hace el server al guardar.
 *
 * La validación de verdad es la del server (400 con detalle por campo, que acá
 * se pinta pregunta por pregunta); el cliente solo arma el payload con los
 * tipos correctos y omite lo vacío.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import {
  BLOQUES,
  ETIQUETA_CASILLA,
  PREGUNTAS_FICHA,
  TEXTO_EMPUJE,
  type Pregunta,
  type PreguntaFicha,
} from '@domain/alumnos/formulario';
import { formularioApi, ErrorFormulario, type FormularioAbierto, type MotivoToken } from '../lib/formularioApi';
import { Button, Card, Input, Select, Spinner, Textarea } from '../components/ui/primitives';

type Valores = Record<string, string | string[]>;
type SinDato = Record<string, boolean>;

/**
 * Payload del envío a partir del estado del formulario. Pura y exportada para
 * testearla sin montar nada: convierte números, recorta textos, omite vacíos y
 * respeta que la casilla marcada viaja SIN valor.
 */
export function armarPayload(
  preguntas: readonly (Pregunta | PreguntaFicha)[],
  valores: Valores,
  sinDato: SinDato,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of preguntas) {
    const nlc = 'nlc' in p && p.nlc;
    if (nlc) out[`${p.campo}_sin_dato`] = sinDato[p.campo] === true;
    if (nlc && sinDato[p.campo] === true) continue; // la casilla manda: sin valor

    const v = valores[p.campo];
    switch (p.tipo) {
      case 'numero':
      case 'moneda':
      case 'porcentaje': {
        const s = typeof v === 'string' ? v.trim().replace(',', '.') : '';
        if (s !== '') {
          const n = Number(s);
          if (Number.isFinite(n)) out[p.campo] = n;
        }
        break;
      }
      case 'multi': {
        if (Array.isArray(v) && v.length > 0) out[p.campo] = v;
        break;
      }
      default: {
        const s = typeof v === 'string' ? v.trim() : '';
        if (s !== '') out[p.campo] = s;
      }
    }
  }
  return out;
}

/** Preguntas del bloque 0 a mostrar: solo las que la ficha no tiene. */
export function preguntasFichaPendiente(abierto: Pick<FormularioAbierto, 'fichaPendiente'>): PreguntaFicha[] {
  return PREGUNTAS_FICHA.filter((p) => abierto.fichaPendiente.includes(p.campo));
}

// ───────────────────────── Campos ─────────────────────────

interface PropsCampo {
  pregunta: Pregunta | PreguntaFicha;
  moneda: string;
  valor: string | string[] | undefined;
  marcadoSinDato: boolean;
  error?: string;
  onValor: (v: string | string[]) => void;
  onSinDato: (marcado: boolean) => void;
}

function Campo({ pregunta: p, moneda, valor, marcadoSinDato, error, onValor, onSinDato }: PropsCampo) {
  const nlc = 'nlc' in p && p.nlc;
  const ayuda = 'ayuda' in p ? p.ayuda : undefined;

  const control = () => {
    switch (p.tipo) {
      case 'numero':
      case 'porcentaje':
      case 'moneda':
        return (
          <div className="flex items-center gap-2">
            {p.tipo === 'moneda' && <span className="text-xs font-600 text-navy-400">{moneda}</span>}
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              className="max-w-[14rem]"
              value={typeof valor === 'string' ? valor : ''}
              disabled={marcadoSinDato}
              onChange={(e) => onValor(e.target.value)}
            />
            {p.tipo === 'porcentaje' && <span className="text-xs font-600 text-navy-400">%</span>}
          </div>
        );
      case 'opcion':
        return (
          <Select
            className="w-full max-w-md"
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) => onValor(e.target.value)}
          >
            <option value="">Elegí una opción…</option>
            {p.opciones!.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        );
      case 'multi':
        return (
          <div className="space-y-1.5">
            {p.opciones!.map((o) => {
              const elegidas = Array.isArray(valor) ? valor : [];
              const activa = elegidas.includes(o);
              return (
                <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-navy-700 dark:text-navy-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-navy-300 accent-gold-400"
                    checked={activa}
                    onChange={() => onValor(activa ? elegidas.filter((x) => x !== o) : [...elegidas, o])}
                  />
                  {o}
                </label>
              );
            })}
          </div>
        );
      case 'texto_largo':
        return (
          <Textarea
            value={typeof valor === 'string' ? valor : ''}
            disabled={marcadoSinDato}
            onChange={(e) => onValor(e.target.value)}
          />
        );
      default:
        return (
          <Input
            value={typeof valor === 'string' ? valor : ''}
            disabled={marcadoSinDato}
            onChange={(e) => onValor(e.target.value)}
          />
        );
    }
  };

  return (
    <div id={`campo-${p.campo}`} className="space-y-1.5">
      <label className="block text-sm font-600 text-navy-800 dark:text-navy-100">
        {p.label}
        {p.obl && <span className="ml-1 text-signal-red">*</span>}
      </label>
      {ayuda && <p className="text-xs text-navy-400">{ayuda}</p>}
      {control()}
      {nlc && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-navy-500 dark:text-navy-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-navy-300 accent-gold-400"
            checked={marcadoSinDato}
            onChange={(e) => onSinDato(e.target.checked)}
          />
          {ETIQUETA_CASILLA}
        </label>
      )}
      {error && <p className="text-xs font-600 text-signal-red">{error}</p>}
    </div>
  );
}

// ───────────────────────── Pantallas terminales ─────────────────────────

const MENSAJE_TERMINAL: Record<MotivoToken, { titulo: string; detalle: string }> = {
  inexistente: { titulo: 'Este link no es válido', detalle: 'Revisá que lo hayas copiado completo, o pedile uno nuevo a tu consultor.' },
  vencido: { titulo: 'Este link venció', detalle: 'Los links duran 30 días. Pedile uno nuevo a tu consultor y lo completás en el momento.' },
  usado: { titulo: 'Este formulario ya fue enviado', detalle: 'Si necesitás corregir algo, escribile a tu consultor: puede ajustarlo durante la llamada.' },
};

function PantallaTerminal({ motivo }: { motivo: MotivoToken }) {
  const m = MENSAJE_TERMINAL[motivo];
  return (
    <div className="mx-auto mt-24 max-w-md px-4 text-center">
      <AlertTriangle className="mx-auto mb-3 text-gold-400" size={36} />
      <h1 className="font-display text-xl font-700 text-navy-900 dark:text-navy-50">{m.titulo}</h1>
      <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">{m.detalle}</p>
    </div>
  );
}

// ───────────────────────── Vista principal ─────────────────────────

export function VistaFormulario({ token }: { token: string }) {
  const [abierto, setAbierto] = useState<FormularioAbierto | null>(null);
  const [terminal, setTerminal] = useState<MotivoToken | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviado, setEnviado] = useState(false);

  const [valores, setValores] = useState<Valores>({});
  const [sinDato, setSinDato] = useState<SinDato>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    formularioApi
      .abrir(token)
      .then(setAbierto)
      .catch((err) => setTerminal(err instanceof ErrorFormulario && err.motivo ? err.motivo : 'inexistente'))
      .finally(() => setCargando(false));
  }, [token]);

  const preguntasFicha = useMemo(() => (abierto ? preguntasFichaPendiente(abierto) : []), [abierto]);
  const todasLasPreguntas = useMemo<readonly (Pregunta | PreguntaFicha)[]>(
    () => [...preguntasFicha, ...BLOQUES.flatMap((b) => b.preguntas)],
    [preguntasFicha],
  );

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }
  if (terminal) return <PantallaTerminal motivo={terminal} />;
  if (!abierto) return <PantallaTerminal motivo="inexistente" />;

  if (enviado) {
    return (
      <div className="mx-auto mt-24 max-w-md px-4 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-gold-400" size={40} />
        <h1 className="font-display text-2xl font-700 text-navy-900 dark:text-navy-50">¡Listo, {abierto.nombre}!</h1>
        <p className="mt-2 text-sm text-navy-500 dark:text-navy-300">
          Tu diagnóstico ya le llegó a tu consultor. Lo va a revisar antes de la llamada — lo que marcaste como
          "no lo tengo claro" lo resuelven juntos ahí.
        </p>
      </div>
    );
  }

  const enviar = async () => {
    setEnviando(true);
    setErrorGlobal(null);
    setErrores({});
    try {
      await formularioApi.enviar(token, armarPayload(todasLasPreguntas, valores, sinDato));
      setEnviado(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ErrorFormulario && err.motivo) {
        setTerminal(err.motivo);
      } else if (err instanceof ErrorFormulario && err.porCampo) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensajes] of Object.entries(err.porCampo)) porCampo[campo] = mensajes[0] ?? 'Revisá este campo.';
        setErrores(porCampo);
        setErrorGlobal('Faltan algunas respuestas. Revisá los campos marcados en rojo.');
        const primero = todasLasPreguntas.find((p) => porCampo[p.campo]);
        if (primero) document.getElementById(`campo-${primero.campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setErrorGlobal(err instanceof Error ? err.message : 'No se pudo enviar. Probá de nuevo.');
      }
    } finally {
      setEnviando(false);
    }
  };

  const props = (p: Pregunta | PreguntaFicha) => ({
    pregunta: p,
    moneda: abierto.moneda,
    valor: valores[p.campo],
    marcadoSinDato: sinDato[p.campo] === true,
    error: errores[p.campo],
    onValor: (v: string | string[]) => setValores((s) => ({ ...s, [p.campo]: v })),
    onSinDato: (marcado: boolean) =>
      setSinDato((s) => ({ ...s, [p.campo]: marcado })),
  });

  return (
    <div className="min-h-screen bg-navy-50 pb-16 dark:bg-navy-950">
      <div className="mx-auto max-w-2xl space-y-6 px-4 pt-10">
        <header>
          <p className="text-xs font-600 uppercase tracking-wide text-gold-500">+Activos Academy · {abierto.programa}</p>
          <h1 className="mt-1 font-display text-2xl font-700 text-navy-900 dark:text-navy-50">
            Hola, {abierto.nombre} 👋
          </h1>
          <p className="mt-2 text-sm text-navy-600 dark:text-navy-300">
            Este diagnóstico le da a tu consultor la foto real de tu negocio para armar tu plan de 90 días.
            Son 10–15 minutos. Los montos van en <strong>{abierto.moneda}</strong>.
          </p>
          <Card className="mt-4 border-gold-400 bg-gold-400/10 p-4">
            <p className="text-sm text-navy-800 dark:text-navy-100">{TEXTO_EMPUJE}</p>
          </Card>
        </header>

        {preguntasFicha.length > 0 && (
          <Card className="space-y-5 p-5">
            <h2 className="font-display text-lg font-700 text-navy-900 dark:text-navy-50">Sobre vos</h2>
            {preguntasFicha.map((p) => <Campo key={p.campo} {...props(p)} />)}
          </Card>
        )}

        {BLOQUES.map((b, i) => (
          <Card key={b.titulo} className="space-y-5 p-5">
            <div>
              <h2 className="font-display text-lg font-700 text-navy-900 dark:text-navy-50">
                {i + 1}. {b.titulo}
              </h2>
              {b.descripcion && <p className="mt-1 text-xs text-navy-400">{b.descripcion}</p>}
            </div>
            {b.preguntas.map((p) => <Campo key={p.campo} {...props(p)} />)}
          </Card>
        ))}

        {errorGlobal && (
          <Card className="border-signal-red bg-signal-red/10 p-4">
            <p className="text-sm font-600 text-signal-red">{errorGlobal}</p>
          </Card>
        )}

        <Button className="w-full" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? <Spinner className="h-4 w-4" /> : <Send size={16} />}
          <span className="ml-2">Enviar diagnóstico</span>
        </Button>
        <p className="text-center text-xs text-navy-400">
          Tus respuestas las ve solamente tu consultor.
        </p>
      </div>
    </div>
  );
}
