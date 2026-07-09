'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { contact } from '@/config/site';

// Endpoint de Formspree (configurable por entorno). Ver .env.example.
const endpoint = process.env.NEXT_PUBLIC_FORMSPREE_ENDPOINT;

const PAISES = [
  'Argentina', 'Bolivia', 'Chile', 'Colombia', 'Costa Rica', 'Ecuador',
  'El Salvador', 'Guatemala', 'Honduras', 'México', 'Nicaragua', 'Panamá',
  'Paraguay', 'Perú', 'República Dominicana', 'Uruguay', 'Venezuela', 'Otro',
];

type Status = 'idle' | 'sending' | 'success' | 'error';

const inputCls =
  'w-full rounded-md border border-line-warm bg-white px-3.5 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold';
const labelCls = 'eyebrow mb-1.5 block text-navy/60';

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const data = new FormData(form);

    // Sin endpoint configurado: mensaje claro y derivación a WhatsApp/email.
    if (!endpoint) {
      setStatus('error');
      setError('El formulario todavía no está conectado. Escríbenos por WhatsApp o email mientras tanto.');
      return;
    }

    setStatus('sending');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        setStatus('success');
        form.reset();
      } else {
        const json = await res.json().catch(() => null);
        setStatus('error');
        setError(json?.errors?.[0]?.message ?? 'No pudimos enviar tu mensaje. Inténtalo de nuevo en un momento.');
      }
    } catch {
      setStatus('error');
      setError('Hubo un problema de conexión. Inténtalo de nuevo o escríbenos por WhatsApp.');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="flex h-full flex-col items-start justify-center rounded-lg border border-line-warm bg-warm-card p-7"
      >
        <CheckCircle2 className="h-9 w-9 text-gold" aria-hidden="true" />
        <h3 className="mt-4 font-display text-xl font-bold text-navy">
          Gracias. Recibimos tu mensaje.
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-navy/70">
          Te vamos a responder a la brevedad. Si quieres una respuesta más rápida, escríbenos por{' '}
          <a
            href={contact.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-gold underline-offset-2 hover:underline"
          >
            WhatsApp
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Asunto del email que recibe el equipo (Formspree). */}
      <input type="hidden" name="_subject" value="Nuevo contacto desde la web de +Activos Holding" />

      <div>
        <label htmlFor="nombre" className={labelCls}>
          Nombre
        </label>
        <input id="nombre" name="nombre" type="text" required autoComplete="name" className={inputCls} />
      </div>

      <div>
        <label htmlFor="email" className={labelCls}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
      </div>

      <div>
        <label htmlFor="pais" className={labelCls}>
          País
        </label>
        <select id="pais" name="pais" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            Elige tu país
          </option>
          {PAISES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="mensaje" className={labelCls}>
          Mensaje
        </label>
        <textarea id="mensaje" name="mensaje" required rows={4} className={inputCls} />
      </div>

      {status === 'error' && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-5 py-3 text-sm font-bold text-warm transition-colors hover:bg-navy-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  );
}
