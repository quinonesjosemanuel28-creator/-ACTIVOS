/**
 * Asistente IA — chat de consultas en lenguaje natural sobre tus datos.
 * Manda la pregunta + el esquema a Claude (text-to-SQL de solo lectura),
 * ejecuta la SELECT localmente y muestra la respuesta explicada en español.
 */
import { useState, type FormEvent } from 'react';
import { AlertTriangle, Send, Sparkles, User } from 'lucide-react';
import { useAsistenteEstado, usePreguntarAsistente } from '../hooks';
import { Button, Card, CardBody, Input, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import type { RespuestaAsistente } from '../lib/api';
import { cn } from '../lib/utils';

interface Turno {
  pregunta: string;
  respuesta?: RespuestaAsistente;
  cargando?: boolean;
}

const SUGERENCIAS = [
  '¿Cuánto facturé en total?',
  '¿Quiénes están en lista negra?',
  '¿Cuál es mi closer más efectivo?',
  '¿Cuánto tengo pendiente de cobranza?',
];

export function VistaAsistente() {
  const { data: estado } = useAsistenteEstado();
  const preguntar = usePreguntarAsistente();
  const [texto, setTexto] = useState('');
  const [historial, setHistorial] = useState<Turno[]>([]);

  const enviar = (preguntaRaw: string) => {
    const pregunta = preguntaRaw.trim();
    if (!pregunta || preguntar.isPending) return;
    setTexto('');
    const idx = historial.length;
    setHistorial((h) => [...h, { pregunta, cargando: true }]);
    preguntar.mutate(pregunta, {
      onSuccess: (respuesta) =>
        setHistorial((h) => h.map((t, i) => (i === idx ? { ...t, respuesta, cargando: false } : t))),
      onError: (e: Error) =>
        setHistorial((h) =>
          h.map((t, i) => (i === idx ? { ...t, cargando: false, respuesta: { disponible: true, ok: false, respuesta: e.message } } : t)),
        ),
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    enviar(texto);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        titulo="Asistente IA"
        descripcion="Preguntá sobre tus métricas y datos en lenguaje natural. Solo consulta (lectura), nunca modifica nada."
      />

      {estado && !estado.disponible && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border-l-4 border-l-signal-amber bg-amber-50 px-4 py-3 text-sm text-signal-amber dark:bg-amber-900/20">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>El asistente no está configurado. Cargá tu <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">ANTHROPIC_API_KEY</code> en el archivo <b>.env</b> y reiniciá el server.</span>
        </div>
      )}

      {historial.length === 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              disabled={estado && !estado.disponible}
              className="rounded-full border border-navy-200 px-3 py-1.5 text-sm text-navy-600 transition-colors hover:border-gold-400 hover:bg-gold-50 disabled:opacity-50 dark:border-navy-600 dark:text-navy-200 dark:hover:bg-navy-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {historial.map((t, i) => (
          <div key={i} className="space-y-2">
            {/* Pregunta */}
            <div className="flex justify-end">
              <div className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-tr-sm bg-navy-900 px-4 py-2.5 text-sm text-white dark:bg-gold-400 dark:text-navy-900">
                <span>{t.pregunta}</span>
                <User size={15} className="mt-0.5 shrink-0 opacity-70" />
              </div>
            </div>
            {/* Respuesta */}
            <div className="flex justify-start">
              <div className="flex max-w-[90%] items-start gap-2">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
                  <Sparkles size={15} />
                </span>
                <Card className="flex-1">
                  <CardBody className="py-3">
                    {t.cargando ? (
                      <span className="flex items-center gap-2 text-sm text-navy-400"><Spinner /> Pensando…</span>
                    ) : t.respuesta ? (
                      <RespuestaBloque r={t.respuesta} />
                    ) : null}
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="sticky bottom-0 mt-4 flex gap-2 bg-navy-50/80 py-3 backdrop-blur dark:bg-navy-950/80">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí tu pregunta…"
          disabled={estado && !estado.disponible}
        />
        <Button type="submit" disabled={!texto.trim() || preguntar.isPending || (estado && !estado.disponible)}>
          <Send size={16} /> Preguntar
        </Button>
      </form>
    </div>
  );
}

function RespuestaBloque({ r }: { r: RespuestaAsistente }) {
  const [verSql, setVerSql] = useState(false);
  return (
    <div>
      <p className={cn('whitespace-pre-wrap text-sm', r.ok ? 'text-navy-900 dark:text-navy-50' : 'text-signal-amber')}>{r.respuesta}</p>
      {r.ok && r.sql && (
        <div className="mt-2">
          <button onClick={() => setVerSql((v) => !v)} className="text-xs text-navy-400 underline hover:text-navy-600">
            {verSql ? 'Ocultar' : 'Ver'} consulta y datos
          </button>
          {verSql && (
            <div className="mt-2 space-y-2">
              <pre className="overflow-x-auto rounded-lg bg-navy-900 p-3 text-xs text-teal-300">{r.sql}</pre>
              {r.columnas && r.filas && r.filas.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-navy-100 dark:border-navy-700">
                  <table className="w-full text-xs">
                    <thead className="bg-navy-100/70 text-navy-500 dark:bg-navy-800">
                      <tr>{r.columnas.map((c) => <th key={c} className="px-2 py-1 text-left font-600">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {r.filas.slice(0, 50).map((fila, i) => (
                        <tr key={i} className="border-t border-navy-100 dark:border-navy-700">
                          {fila.map((c, j) => <td key={j} className="px-2 py-1 tnum">{String(c ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
