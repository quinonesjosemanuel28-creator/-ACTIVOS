/**
 * Cliente API del formulario público de diagnóstico. Separado de `api.ts` a
 * propósito: estas dos llamadas no llevan sesión, y su manejo de errores es
 * distinto — acá importan el `motivo` del token (vencido/usado) y el detalle
 * por campo de Zod, que el cliente general descarta.
 */
import type { CampoFicha } from '@domain/alumnos/formulario';

/** Lo que el server devuelve al abrir el link (saludo + qué ficha falta). */
export interface FormularioAbierto {
  nombre: string;
  programa: string;
  moneda: string;
  fichaPendiente: CampoFicha[];
}

export type MotivoToken = 'inexistente' | 'vencido' | 'usado';

/** Error del formulario con todo lo que la pantalla necesita para reaccionar. */
export class ErrorFormulario extends Error {
  constructor(
    public readonly status: number,
    mensaje: string,
    /** Token vencido/usado/inexistente (para la pantalla terminal). */
    public readonly motivo?: MotivoToken,
    /** Errores por campo de Zod (para marcar cada pregunta). */
    public readonly porCampo?: Record<string, string[]>,
  ) {
    super(mensaje);
    this.name = 'ErrorFormulario';
  }
}

async function reqFormulario<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/formulario/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      motivo?: MotivoToken;
      detalles?: { fieldErrors?: Record<string, string[]> };
    };
    throw new ErrorFormulario(
      res.status,
      body.error ?? `Error ${res.status}`,
      body.motivo,
      body.detalles?.fieldErrors,
    );
  }
  return res.json() as Promise<T>;
}

export const formularioApi = {
  abrir: (token: string) => reqFormulario<FormularioAbierto>(token),
  enviar: (token: string, respuestas: Record<string, unknown>) =>
    reqFormulario<{ enviado: boolean; id: string }>(token, { method: 'POST', body: JSON.stringify(respuestas) }),
};

// ───────────────────── Link de seguimiento (también público) ─────────────────────

export interface AccionSeguimientoUI {
  id: string;
  texto: string;
  hecha: boolean;
}

export interface SeguimientoAbiertoUI {
  alumno: string;
  fechaInicio: string;
  faseActual: 1 | 2 | 3;
  vencido: boolean;
  /** "Día 37 de 90 · te quedan 53" — la cuenta viene hecha del server. */
  dia: number;
  restantes: number;
  /** El consultor pausó el plan: la vista lo dice sin drama. */
  pausado: boolean;
  fases: { fase: 1 | 2 | 3; acciones: AccionSeguimientoUI[] }[];
}

async function reqSeguimiento<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/seguimiento/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; motivo?: MotivoToken | 'revocado' };
    throw new ErrorFormulario(res.status, body.error ?? `Error ${res.status}`, body.motivo as MotivoToken);
  }
  return res.json() as Promise<T>;
}

export const seguimientoApi = {
  abrir: (token: string) => reqSeguimiento<SeguimientoAbiertoUI>(token),
  marcar: (token: string, accionId: string, marcado: boolean) =>
    reqSeguimiento<{ hecha: boolean }>(`${token}/acciones/${accionId}`, {
      method: 'POST',
      body: JSON.stringify({ marcado }),
    }),
};
