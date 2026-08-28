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

export type EstadoAccionUI = 'pendiente' | 'en_curso' | 'ejecutado';

export interface AccionSeguimientoUI {
  id: string;
  texto: string;
  hecha: boolean;
  /** KR al que aporta (ticket 8). Null = "Otras acciones". */
  krId: string | null;
  /** Los tres estados (ticket 9D): el círculo marca ejecutado; en_curso va dorado. */
  estado: EstadoAccionUI;
  /** La última nota propia (ticket 10A) y la devolución del consultor si la respondió. */
  nota: string | null;
  devolucion: string | null;
}

/** Una métrica de "Tus números" (9D): números pelados, el copy lo arma la vista. */
export interface MetricaSeguimientoUI {
  krId: string;
  texto: string;
  unidad: string;
  direccion: 'sube' | 'baja';
  valorInicial: number;
  meta90: number;
  valorActual: number;
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
  /** Los KRs del plan en orden, para el subtítulo de cada grupo. */
  krs: { id: string; texto: string }[];
  /** "Tus números" (9D): solo las métricas con valor cargado. */
  metricas: MetricaSeguimientoUI[];
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
  /** El círculo: binario, como siempre. */
  marcar: (token: string, accionId: string, marcado: boolean) =>
    reqSeguimiento<{ hecha: boolean; estado: EstadoAccionUI }>(`${token}/acciones/${accionId}`, {
      method: 'POST',
      body: JSON.stringify({ marcado }),
    }),
  /** El detalle (9D): estado explícito y nota opcional — cada guardado es una fila. */
  marcarEstado: (token: string, accionId: string, estado: EstadoAccionUI, nota?: string) =>
    reqSeguimiento<{ hecha: boolean; estado: EstadoAccionUI }>(`${token}/acciones/${accionId}`, {
      method: 'POST',
      body: JSON.stringify({ estado, ...(nota && nota.trim() !== '' ? { nota: nota.trim() } : {}) }),
    }),
  /** "Tus números" (9D): el alumno carga el valor del mes de una métrica. */
  cargarMedicion: (token: string, krId: string, valor: number) =>
    reqSeguimiento<{ valor: number; cargadoEn: string }>(`${token}/krs/${krId}/mediciones`, {
      method: 'POST',
      body: JSON.stringify({ valor }),
    }),
};
