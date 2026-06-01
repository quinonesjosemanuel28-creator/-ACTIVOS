/** CAPA 3 — DOMINIO · Canales del funnel (fijos para arrancar). */
export const CANALES_FUNNEL = ['Webinar', 'TikTok', 'Instagram orgánico'] as const;
export type CanalFunnel = (typeof CANALES_FUNNEL)[number];

/** Canal usado para datos migrados que no tienen canal de origen. */
export const CANAL_SIN_ESPECIFICAR = 'Sin especificar';

export function esCanalFunnel(v: string): v is CanalFunnel {
  return (CANALES_FUNNEL as readonly string[]).includes(v);
}
