/**
 * Ticket 9B · El cierre de KRs es un CÁLCULO, no un estado pegado.
 *
 * Lo que se protege: la entregable cierra sola con la última acción y se
 * reabre sola al destildar; sin acciones vinculadas no cierra nunca; el tilde
 * legado del ticket 7 se honra; la métrica cumple por valor EN LA DIRECCIÓN
 * correcta (9 cumple una meta de "bajar a 10"; 11 no) y sin mediciones no se
 * asume nada.
 */
import { describe, it, expect } from 'vitest';
import { estadosDeKrs, metaAlcanzada, valorActual } from '../medicion';
import type { Checkin, Kr, Medicion } from '../plan';

const kr = (id: string, over: Partial<Kr> = {}): Kr => ({
  id, okrId: 'o1', orden: 1, texto: `KR ${id}`, meta: null,
  tipo: 'entregable', valorInicial: null, meta30: null, meta60: null, meta90: null,
  unidad: null, direccion: null, vencimiento: null, cumplidoEn: null,
  creadoEn: '2026-08-01T00:00:00Z', ...over,
});

const accion = (id: string, krId: string | null) => ({
  id, planId: 'p1', okrId: 'o1', krId, fase: 1 as const, orden: 1, texto: id, creadoEn: '2026-08-01T00:00:00Z',
});

const checkin = (accionId: string, estado: Checkin['estado'], creadoEn: string, origen: Checkin['origen'] = 'alumno'): Checkin => ({
  id: `${accionId}-${creadoEn}`, accionId, marcado: estado === 'ejecutado', estado, nota: null, origen, usuarioId: null, creadoEn,
});

const plan = (krs: Kr[], acciones: ReturnType<typeof accion>[]) => ({
  okrs: [{ id: 'o1', planId: 'p1', orden: 1, objetivo: 'O', creadoEn: '2026-08-01T00:00:00Z', krs }],
  acciones,
});

describe('Cierre de KRs · entregables derivadas', () => {
  it('cierra SOLA cuando la última acción queda ejecutada; antes no', () => {
    const pc = plan([kr('k1')], [accion('a1', 'k1'), accion('a2', 'k1')]);
    const aMedias = estadosDeKrs(pc, [checkin('a1', 'ejecutado', 'T1')], []);
    expect(aMedias[0]).toMatchObject({ cumplida: false, motivo: null, ejecutadas: 1, totalAcciones: 2 });

    const completa = estadosDeKrs(pc, [checkin('a1', 'ejecutado', 'T1'), checkin('a2', 'ejecutado', 'T2')], []);
    expect(completa[0]).toMatchObject({ cumplida: true, motivo: 'derivada' });
  });

  it('destildar una acción la REABRE sola (el checkin más nuevo manda)', () => {
    const pc = plan([kr('k1')], [accion('a1', 'k1')]);
    const checkins = [checkin('a1', 'ejecutado', 'T1'), checkin('a1', 'pendiente', 'T2')];
    expect(estadosDeKrs(pc, checkins, [])[0]!.cumplida).toBe(false);
  });

  it('en_curso NO cierra: cierra solo con todas en ejecutado', () => {
    const pc = plan([kr('k1')], [accion('a1', 'k1'), accion('a2', 'k1')]);
    const checkins = [checkin('a1', 'ejecutado', 'T1'), checkin('a2', 'en_curso', 'T2')];
    expect(estadosDeKrs(pc, checkins, [])[0]!.cumplida).toBe(false);
  });

  it('sin acciones vinculadas: no cierra nunca y queda señalada', () => {
    const pc = plan([kr('k1')], [accion('a1', null)]); // la acción existe pero no la referencia
    expect(estadosDeKrs(pc, [checkin('a1', 'ejecutado', 'T1')], [])[0]).toMatchObject({
      cumplida: false, sinAcciones: true, totalAcciones: 0,
    });
  });

  it('el tilde legado del ticket 7 se honra: cumplida aunque sus acciones no estén marcadas', () => {
    const pc = plan([kr('k1', { cumplidoEn: '2026-08-10T00:00:00Z' })], [accion('a1', 'k1')]);
    expect(estadosDeKrs(pc, [], [])[0]).toMatchObject({ cumplida: true, motivo: 'tilde_legado' });
  });
});

describe('Cierre de KRs · métricas por valor', () => {
  const mora = kr('k1', { tipo: 'metrica', valorInicial: 20, meta90: 10, unidad: '%', direccion: 'baja' });
  const medicion = (valor: number, cargadoEn: string): Medicion => ({
    id: `m-${cargadoEn}`, krId: 'k1', valor, origen: 'alumno', usuarioId: null, cargadoEn,
  });

  it('criterio de aceptación: dirección baja con meta 10 se cumple con 9, no con 11', () => {
    expect(metaAlcanzada('baja', 9, 10)).toBe(true);
    expect(metaAlcanzada('baja', 11, 10)).toBe(false);
    expect(metaAlcanzada('sube', 31, 30)).toBe(true);
    expect(metaAlcanzada('sube', 29, 30)).toBe(false);
  });

  it('cumple por el valor MÁS RECIENTE, no por el mejor histórico', () => {
    const pc = plan([mora], []);
    const bajoYSubio = [medicion(9, '2026-08-10T00:00:00Z'), medicion(12, '2026-08-15T00:00:00Z')];
    expect(valorActual(bajoYSubio)).toBe(12);
    expect(estadosDeKrs(pc, [], bajoYSubio)[0]).toMatchObject({ cumplida: false, valorActual: 12 });

    const llego = [...bajoYSubio, medicion(9.5, '2026-08-16T00:00:00Z')];
    expect(estadosDeKrs(pc, [], llego)[0]).toMatchObject({ cumplida: true, motivo: 'valor', valorActual: 9.5 });
  });

  it('sin mediciones: "sin datos" — ni cumplida ni incumplida, y sin aviso de sin_acciones', () => {
    expect(estadosDeKrs(plan([mora], []), [], [])[0]).toMatchObject({
      cumplida: false, valorActual: null, sinAcciones: false,
    });
  });
});
