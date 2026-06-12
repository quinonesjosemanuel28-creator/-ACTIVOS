import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearRepositorios } from '../sqlite/repos';
import { sembrarDemo } from '../seed/demo';
import * as uc from '../../application/useCases';

async function setup() {
  const db = getDbMemoria();
  const repos = crearRepositorios(db);
  await sembrarDemo(repos);
  return repos;
}

describe('Integración · seed + repos + casos de uso', () => {
  it('siembra y lista meses con datos', async () => {
    const repos = await setup();
    const { meses, actual } = await uc.obtenerMeses(repos);
    expect(meses.length).toBeGreaterThanOrEqual(7);
    expect(actual).toBe('2026-05');
  });

  it('arma el dashboard del mes con métricas coherentes', async () => {
    const repos = await setup();
    const { snapshot, alertas, estadoMes } = await uc.obtenerDashboardDelMes(repos, '2026-03');
    expect(snapshot.cashCollected.valor).toBeGreaterThan(0);
    expect(snapshot.cashNuevo + snapshot.cohortes).toBeCloseTo(snapshot.cashCollected.valor ?? 0, 2);
    expect(alertas).toHaveLength(9);
    expect(estadoMes).toBe('Abierto');
  });

  it('R8: separa Empresario vs Gestor', async () => {
    const repos = await setup();
    const cmp = await uc.compararProgramas(repos, '2026-03');
    expect(cmp.empresario.cierres.valor).toBeGreaterThan(0);
    expect(cmp.gestor.cierres.valor).toBeGreaterThan(0);
  });

  it('histórico devuelve serie de varios meses', async () => {
    const repos = await setup();
    const h = await uc.obtenerHistorico(repos);
    expect(h.length).toBeGreaterThanOrEqual(7);
    expect(h[0]).toHaveProperty('cajaFinal');
  });

  it('R6: mes cerrado bloquea ediciones', async () => {
    const repos = await setup();
    await uc.cerrarMes(repos, '2026-03');
    await expect(
      uc.agregarVenta(repos, { fechaVenta: '2026-03-10', programa: 'Empresario', ticketTotalUsd: 3000 }),
    ).rejects.toThrow(/cerrado/i);
  });

  it('agrega venta en mes abierto y se refleja en cierres', async () => {
    const repos = await setup();
    const antes = (await uc.obtenerDashboardDelMes(repos, '2026-05')).snapshot.cierres.valor ?? 0;
    await uc.agregarVenta(repos, { fechaVenta: '2026-05-20', programa: 'Gestor', ticketTotalUsd: 1200 });
    const despues = (await uc.obtenerDashboardDelMes(repos, '2026-05')).snapshot.cierres.valor ?? 0;
    expect(despues).toBe(antes + 1);
  });

  it('valida entradas inválidas con Zod', async () => {
    const repos = await setup();
    await expect(uc.agregarVenta(repos, { fechaVenta: '2026-05-20', programa: 'X', ticketTotalUsd: -5 })).rejects.toThrow();
  });
});
