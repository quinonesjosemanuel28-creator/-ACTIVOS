/**
 * Ticket 10A · El ciclo de vida de la nota es DERIVADO: sin resolución está
 * abierta (las notas pre-ticket no migran nada), la resolución más nueva
 * gana (corregir = agregar, no editar), y al link solo baja la última nota
 * de cada acción con su devolución — una archivada no muestra nada.
 */
import { describe, it, expect } from 'vitest';
import type { Checkin } from '../plan';
import { notaParaElLink, notasAbiertas, notasDelPlan, resolucionVigente, type NotaResolucion } from '../notas';

const chk = (id: string, sobre: Partial<Checkin>): Checkin => ({
  id,
  accionId: 'a1',
  marcado: false,
  estado: 'en_curso',
  nota: null,
  usuarioId: null,
  origen: 'alumno',
  creadoEn: '2026-08-20T10:00:00.000Z',
  ...sobre,
});

const res = (id: string, checkinId: string, sobre: Partial<NotaResolucion>): NotaResolucion => ({
  id,
  checkinId,
  estado: 'resuelta',
  area: null,
  devolucion: null,
  usuarioId: 'u1',
  creadaEn: '2026-08-21T10:00:00.000Z',
  ...sobre,
});

describe('Ticket 10A · derivación del estado de la nota', () => {
  it('sin resolución la nota está ABIERTA: las notas viejas no necesitan migración', () => {
    const checkins = [chk('c1', { nota: 'Me trabé con el contador' })];
    const notas = notasDelPlan(checkins, []);
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ estado: 'abierta', texto: 'Me trabé con el contador', devolucion: null });
    expect(notasAbiertas(checkins, [])).toBe(1);
  });

  it('un checkin sin nota (o del consultor) no es una nota', () => {
    const checkins = [
      chk('c1', { nota: null }),
      chk('c2', { nota: '  ' }),
      chk('c3', { nota: 'anotación interna', origen: 'consultor', usuarioId: 'u1' }),
    ];
    expect(notasDelPlan(checkins, [])).toHaveLength(0);
  });

  it('la resolución más nueva gana: corregir una devolución es agregar otra fila', () => {
    const checkins = [chk('c1', { nota: 'consulta' })];
    const rs = [
      res('r1', 'c1', { devolucion: 'devolución con errata', creadaEn: '2026-08-21T10:00:00.000Z' }),
      res('r2', 'c1', { devolucion: 'devolución corregida', creadaEn: '2026-08-21T11:00:00.000Z' }),
    ];
    expect(resolucionVigente(rs).get('c1')!.devolucion).toBe('devolución corregida');
    expect(notasDelPlan(checkins, rs)[0]).toMatchObject({ estado: 'resuelta', devolucion: 'devolución corregida' });
    expect(notasAbiertas(checkins, rs)).toBe(0);
  });

  it('una ARCHIVADA no lleva devolución al link, aunque el texto exista en la fila', () => {
    const checkins = [chk('c1', { nota: 'consulta' })];
    const rs = [res('r1', 'c1', { estado: 'archivada', devolucion: 'no debería verse' })];
    expect(notasDelPlan(checkins, rs)[0]!.devolucion).toBeNull();
    expect(notaParaElLink('a1', checkins, rs)).toEqual({ nota: 'consulta', devolucion: null });
  });

  it('al link baja SOLO la última nota de la acción, con su devolución si está resuelta', () => {
    const checkins = [
      chk('c1', { nota: 'primera consulta', creadoEn: '2026-08-18T10:00:00.000Z' }),
      chk('c2', { nota: 'segunda consulta', creadoEn: '2026-08-20T10:00:00.000Z' }),
    ];
    const rs = [res('r1', 'c2', { devolucion: 'hablalo con tu contador, es 10 minutos' })];
    expect(notaParaElLink('a1', checkins, rs)).toEqual({
      nota: 'segunda consulta',
      devolucion: 'hablalo con tu contador, es 10 minutos',
    });
    expect(notaParaElLink('a-sin-notas', checkins, rs)).toBeNull();
  });

  it('escribir de nuevo tras un archivo es una nota NUEVA, abierta, con su propio estado', () => {
    const checkins = [
      chk('c1', { nota: 'consulta vieja', creadoEn: '2026-08-18T10:00:00.000Z' }),
      chk('c2', { nota: 'consulta nueva', creadoEn: '2026-08-22T10:00:00.000Z' }),
    ];
    const rs = [res('r1', 'c1', { estado: 'archivada' })];
    const notas = notasDelPlan(checkins, rs);
    expect(notas.map((n) => [n.texto, n.estado])).toEqual([
      ['consulta nueva', 'abierta'],
      ['consulta vieja', 'archivada'],
    ]);
    expect(notasAbiertas(checkins, rs)).toBe(1);
  });
});
