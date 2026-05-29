import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearRepositorios } from '../sqlite/repos';
import { sembrarDemo } from '../seed/demo';
import * as uc from '../../application/useCases';

function setup() {
  const db = getDbMemoria();
  const repos = crearRepositorios(db);
  sembrarDemo(repos);
  return repos;
}

describe('Integración · seed + repos + casos de uso', () => {
  it('siembra y lista meses con datos', () => {
    const repos = setup();
    const { meses, actual } = uc.obtenerMeses(repos);
    expect(meses.length).toBeGreaterThanOrEqual(7);
    expect(actual).toBe('2026-05');
  });

  it('arma el dashboard del mes con métricas coherentes', () => {
    const repos = setup();
    const { snapshot, alertas, estadoMes } = uc.obtenerDashboardDelMes(repos, '2026-03');
    expect(snapshot.cashCollected.valor).toBeGreaterThan(0);
    expect(snapshot.cashNuevo + snapshot.cohortes).toBeCloseTo(snapshot.cashCollected.valor ?? 0, 2);
    expect(alertas).toHaveLength(9);
    expect(estadoMes).toBe('Abierto');
  });

  it('R8: separa Empresario vs Gestor', () => {
    const repos = setup();
    const cmp = uc.compararProgramas(repos, '2026-03');
    expect(cmp.empresario.cierres.valor).toBeGreaterThan(0);
    expect(cmp.gestor.cierres.valor).toBeGreaterThan(0);
  });

  it('histórico devuelve serie de varios meses', () => {
    const repos = setup();
    const h = uc.obtenerHistorico(repos);
    expect(h.length).toBeGreaterThanOrEqual(7);
    expect(h[0]).toHaveProperty('cajaFinal');
  });

  it('R6: mes cerrado bloquea ediciones', () => {
    const repos = setup();
    uc.cerrarMes(repos, '2026-03');
    expect(() =>
      uc.agregarVenta(repos, { fechaVenta: '2026-03-10', programa: 'Empresario', ticketTotalUsd: 3000 }),
    ).toThrow(/cerrado/i);
  });

  it('agrega venta en mes abierto y se refleja en cierres', () => {
    const repos = setup();
    const antes = uc.obtenerDashboardDelMes(repos, '2026-05').snapshot.cierres.valor ?? 0;
    uc.agregarVenta(repos, { fechaVenta: '2026-05-20', programa: 'Gestor', ticketTotalUsd: 1200 });
    const despues = uc.obtenerDashboardDelMes(repos, '2026-05').snapshot.cierres.valor ?? 0;
    expect(despues).toBe(antes + 1);
  });

  it('valida entradas inválidas con Zod', () => {
    const repos = setup();
    expect(() => uc.agregarVenta(repos, { fechaVenta: '2026-05-20', programa: 'X', ticketTotalUsd: -5 })).toThrow();
  });
});
