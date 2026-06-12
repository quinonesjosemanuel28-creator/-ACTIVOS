import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearEgresosAdminRepo } from '../sqlite/egresosRepos';
import { crearLiquidacionRepo } from '../sqlite/comisionesRepos';
import * as ucc from '../../application/cierres/useCases';
import * as ucom from '../../application/comisiones/useCases';
import * as uce from '../../application/egresos/useCases';

async function setup() {
  const db = getDbMemoria();
  const repos = crearReposCierres(db);
  const egresos = crearEgresosAdminRepo(db);
  const liq = crearLiquidacionRepo(db);
  // Cierre cerrado por Julian; cuota de mayo cobrada por Ayrton (multi-closer),
  // con setting marcado (setter Diego heredado del cierre).
  await ucc.crearCierre(repos, { idCierre: 'C0113', fechaCierre: '2026-03-31', clienteNombre: 'Cristhian Marín', programa: 'Empresario', ticketTotalUsd: 3000, closer: 'Julian', setter: 'Diego' });
  await ucc.agregarPago(repos, { idCierre: 'C0113', fechaPago: '2026-05-04', montoUsd: 900, montoArs: 1_170_000, tipoPago: 'Cuota', medioPago: 'Otro', closer: 'Ayrton', aplicaSetting: true });
  return { db, repos, egresos, liq };
}

describe('Comisiones · cálculo derivado', () => {
  it('mayo: Ayrton 10% (117.000) + Diego 2% (23.400)', async () => {
    const { repos } = await setup();
    const c = await ucom.obtenerComisiones(repos, '2026-05');
    expect(c.porPersona.find((p) => p.persona === 'Ayrton')!.comisionCloserArs).toBe(117_000);
    expect(c.porPersona.find((p) => p.persona === 'Diego')!.comisionSetterArs).toBe(23_400);
    expect(c.totalArs).toBe(140_400);
  });

  it('editar el pago recalcula la comisión (deriva del pago)', async () => {
    const { repos } = await setup();
    const pago = (await repos.pagos.listarPorCierre('C0113'))[0]!;
    await ucc.editarPago(repos, pago.idPago, { idCierre: 'C0113', fechaPago: '2026-05-04', montoUsd: 900, montoArs: 2_000_000, tipoPago: 'Cuota', medioPago: 'Otro', closer: 'Ayrton', aplicaSetting: true });
    expect((await ucom.obtenerComisiones(repos, '2026-05')).porPersona.find((p) => p.persona === 'Ayrton')!.comisionCloserArs).toBe(200_000);
  });
});

describe('Comisiones · liquidación (anti-duplicado)', () => {
  it('liquida una vez: crea egreso COMI-<mes> en categoría Comisiones', async () => {
    const { repos, egresos, liq } = await setup();
    const r = await ucom.liquidarComisiones(repos, egresos, liq, '2026-05');
    expect(r.totalArs).toBe(140_400);
    expect(r.idEgreso).toBe('COMI-2026-05');
    const eg = (await egresos.obtener('COMI-2026-05'))!;
    expect(eg.categoria).toBe('Comisiones');
    expect(eg.tipo).toBe('Directo');
    expect(eg.montoArs).toBe(140_400);
    expect(eg.montoUsd).toBeCloseTo(140_400 / 1300); // cotización ponderada del mes (1.170.000/900)
    expect((await liq.obtener('2026-05'))!.idEgreso).toBe('COMI-2026-05');
  });

  it('liquidar DOS veces el mismo mes sin confirmar → bloquea y NO duplica', async () => {
    const { repos, egresos, liq } = await setup();
    await ucom.liquidarComisiones(repos, egresos, liq, '2026-05');
    await expect(ucom.liquidarComisiones(repos, egresos, liq, '2026-05')).rejects.toThrow(/ya fue liquidado/i);
    expect(await uce.listarEgresos(egresos, { categoria: 'Comisiones' })).toHaveLength(1); // sigue habiendo 1
  });

  it('re-liquidar con reemplazar reemplaza el monto (no suma encima)', async () => {
    const { repos, egresos, liq } = await setup();
    await ucom.liquidarComisiones(repos, egresos, liq, '2026-05');
    // Se edita el pago (sube ARS) y se re-liquida.
    const pago = (await repos.pagos.listarPorCierre('C0113'))[0]!;
    await ucc.editarPago(repos, pago.idPago, { idCierre: 'C0113', fechaPago: '2026-05-04', montoUsd: 900, montoArs: 2_000_000, tipoPago: 'Cuota', medioPago: 'Otro', closer: 'Ayrton', aplicaSetting: true });
    const r = await ucom.liquidarComisiones(repos, egresos, liq, '2026-05', { reemplazar: true });
    expect(r.reemplazado).toBe(true);
    expect(await uce.listarEgresos(egresos, { categoria: 'Comisiones' })).toHaveLength(1); // sigue 1, reemplazado
    expect((await egresos.obtener('COMI-2026-05'))!.montoArs).toBe(200_000 + 40_000); // 10% + 2% del nuevo ARS
  });

  it('anular libera el mes (borra egreso y registro)', async () => {
    const { repos, egresos, liq } = await setup();
    await ucom.liquidarComisiones(repos, egresos, liq, '2026-05');
    await ucom.anularLiquidacion(egresos, liq, '2026-05');
    expect(await egresos.obtener('COMI-2026-05')).toBeNull();
    expect(await liq.obtener('2026-05')).toBeNull();
    // tras anular, se puede volver a liquidar sin bloqueo
    await expect(ucom.liquidarComisiones(repos, egresos, liq, '2026-05')).resolves.toBeTruthy();
  });
});
