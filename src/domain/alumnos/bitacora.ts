/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Bitácora del consultor (ticket 10B).
 *
 * La historia del alumno más allá del color: qué pasó en cada llamada y en
 * qué está trabado HOY. Append-only — si algo cambia, se agrega una entrada.
 * El alumno NUNCA la ve: acá vive lenguaje interno ("no está ejecutando"),
 * y por eso la tabla no se consulta desde el endpoint público del link.
 *
 * El semáforo (9C) dice QUE un alumno está en rojo; la traba actual dice POR
 * QUÉ — un duelo y un abandono son el mismo color y dos situaciones opuestas.
 */

/** Opciones de NEGOCIO (crecen acá y en Zod; sin CHECK en la base). */
export const TIPOS_CONTACTO = ['consultoria_1a1', 'llamada_seguimiento', 'whatsapp', 'otro'] as const;
export type TipoContacto = (typeof TIPOS_CONTACTO)[number];

export interface EntradaBitacora {
  id: string;
  alumnoId: string;
  texto: string;
  tipoContacto: string;
  trabaActual: string | null;
  usuarioId: string;
  creadaEn: string;
}

/**
 * La traba vigente: la de la entrada MÁS NUEVA que haya cargado una. Una
 * entrada sin traba no pisa la anterior — solo se reemplaza escribiendo otra.
 */
export function trabaActual(entradas: readonly EntradaBitacora[]): EntradaBitacora | null {
  let vigente: EntradaBitacora | null = null;
  for (const e of entradas) {
    if (e.trabaActual !== null && e.trabaActual.trim() !== '' && (!vigente || e.creadaEn > vigente.creadaEn)) {
      vigente = e;
    }
  }
  return vigente;
}

/** Con qué canal queda el CONTACTO que registra cada entrada (apaga la alerta). */
export const CANAL_POR_TIPO: Record<TipoContacto, string> = {
  consultoria_1a1: 'CONSULTORIA_1A1',
  llamada_seguimiento: 'LLAMADA',
  whatsapp: 'WHATSAPP',
  otro: 'OTRO',
};
