/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Ciclo de vida de las notas (ticket 10A).
 *
 * La nota del alumno vive en su checkin (ticket 9) y ES historia: no se
 * edita. Lo que cambia es su ciclo de vida — abierta, resuelta, archivada —
 * y eso vive en `nota_resoluciones`, append-only: el estado actual se DERIVA
 * (gana la resolución más nueva de cada checkin), igual que estadoAcciones y
 * estadosDeKrs. Sin resolución, la nota está abierta — por eso las notas
 * previas al ticket no necesitan migración de datos.
 *
 * Corregir una devolución con error = agregar OTRA resolución. La última
 * gana en todas las lecturas; la historia queda.
 */
import type { Checkin } from './plan';

/** Opciones de NEGOCIO (crecen acá y en Zod; sin CHECK en la base a propósito). */
export const AREAS_NOTA = ['legal', 'contable', 'marketing', 'ventas', 'estructura', 'otra'] as const;
export type AreaNota = (typeof AREAS_NOTA)[number];

export type EstadoResolucion = 'resuelta' | 'archivada';

export interface NotaResolucion {
  id: string;
  checkinId: string;
  estado: EstadoResolucion;
  area: string | null;
  /** Lo que ve el ALUMNO en su link (solo con 'resuelta'). Lenguaje para él. */
  devolucion: string | null;
  usuarioId: string;
  creadaEn: string;
}

/** La resolución VIGENTE de cada checkin: la más nueva gana. */
export function resolucionVigente(resoluciones: readonly NotaResolucion[]): Map<string, NotaResolucion> {
  const ultima = new Map<string, NotaResolucion>();
  for (const r of resoluciones) {
    const previa = ultima.get(r.checkinId);
    if (!previa || r.creadaEn > previa.creadaEn) ultima.set(r.checkinId, r);
  }
  return ultima;
}

export type EstadoNota = 'abierta' | EstadoResolucion;

/** Una nota del alumno con su estado derivado, lista para la ficha. */
export interface NotaConEstado {
  checkinId: string;
  accionId: string;
  texto: string;
  creadaEn: string;
  estado: EstadoNota;
  /** De la resolución vigente, cuando existe. */
  area: string | null;
  devolucion: string | null;
  resueltaPor: string | null;
  resueltaEn: string | null;
}

/**
 * Las notas del ALUMNO de un plan, de la más nueva a la más vieja, con su
 * estado derivado. Solo origen 'alumno': la anotación del consultor sobre
 * una acción (9B) es suya y no necesita ciclo de vida.
 */
export function notasDelPlan(
  checkins: readonly Checkin[],
  resoluciones: readonly NotaResolucion[],
): NotaConEstado[] {
  const vigentes = resolucionVigente(resoluciones);
  return checkins
    .filter((c) => c.origen === 'alumno' && c.nota !== null && c.nota.trim() !== '')
    .map((c) => {
      const r = vigentes.get(c.id) ?? null;
      const estado: EstadoNota = r?.estado ?? 'abierta';
      return {
        checkinId: c.id,
        accionId: c.accionId,
        texto: c.nota!,
        creadaEn: c.creadoEn,
        estado,
        area: r?.area ?? null,
        devolucion: r?.estado === 'resuelta' ? r.devolucion : null,
        resueltaPor: r?.usuarioId ?? null,
        resueltaEn: r?.creadaEn ?? null,
      };
    })
    .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

/** Cuántas notas del alumno siguen abiertas (el contador de la fila del panel). */
export function notasAbiertas(checkins: readonly Checkin[], resoluciones: readonly NotaResolucion[]): number {
  return notasDelPlan(checkins, resoluciones).filter((n) => n.estado === 'abierta').length;
}

/**
 * Lo que el LINK muestra de una acción (§5.4): la ÚLTIMA nota propia y su
 * devolución si la resolución vigente es 'resuelta'. Sin historial: la nota
 * que escribió y la respuesta, nada que parezca un ticket de soporte. Una
 * archivada no muestra nada distinto de no tener resolución.
 */
export function notaParaElLink(
  accionId: string,
  checkins: readonly Checkin[],
  resoluciones: readonly NotaResolucion[],
): { nota: string; devolucion: string | null } | null {
  const ultima = notasDelPlan(checkins, resoluciones).find((n) => n.accionId === accionId);
  if (!ultima) return null;
  return { nota: ultima.texto, devolucion: ultima.estado === 'resuelta' ? ultima.devolucion : null };
}
