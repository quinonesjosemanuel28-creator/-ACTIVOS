import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositorios } from '../sqlite/repos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { sembrarBaseDemo } from '../seed/demo';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import * as ucc from '../../application/cierres/useCases';
import * as ucob from '../../application/cobranza/useCases';
import * as uc from '../../application/useCases';

function setup() {
  const db = getDbMemoria();
  sembrarBaseDemo(crearRepositorios(db));
  sembrarCierresDemo(crearReposCierres(db));
  return db;
}

describe('Cobranza · migración (legacy intactos) + plan', () => {
  it('los cierres demo (legacy, sin plan) quedan FUERA de cobranza', () => {
    const db = setup();
    const cob = ucob.obtenerCobranza(crearReposCierres(db), '2026-06-01');
    expect(cob.cierres).toHaveLength(0); // ninguno tiene plan de cuotas
  });

  it('crearCierre con plan calcula monto de cuota = total / cantidad', () => {
    const db = setup();
    const repos = crearReposCierres(db);
    const c = ucc.crearCierre(repos, {
      fechaCierre: '2026-05-02', clienteNombre: 'Nuevo', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana',
    });
    expect(c.cantidadCuotas).toBe(4);
    expect(c.montoCuotaUsd).toBe(1000);
    expect(repos.cierres.obtener(c.idCierre)!.montoCuotaUsd).toBe(1000);
  });

  it('una venta nueva sin cobrar aparece en cobranza con saldo pendiente', () => {
    const db = setup();
    const repos = crearReposCierres(db);
    ucc.crearCierre(repos, { idCierre: 'NV', fechaCierre: '2026-05-02', clienteNombre: 'Nuevo', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    ucc.agregarPago(repos, { idCierre: 'NV', fechaPago: '2026-05-02', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña', medioPago: 'Otro', closer: 'Ana' });
    const cob = ucob.obtenerCobranza(repos, '2026-05-10');
    const nv = cob.cierres.find((c) => c.idCierre === 'NV')!;
    expect(nv.saldoPendienteUsd).toBe(3000);
    expect(nv.estado).toBe('Al día'); // cuota 1 vence 01/06
  });

  it('REGLA CRÍTICA (integración): la cuota pendiente NO infló cash ni dashboard', () => {
    const db = setup();
    const repos = crearReposCierres(db);
    // dashboard de mayo ANTES
    const antes = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05').snapshot.cashCollected.valor ?? 0;
    // venta nueva 4000 con plan, cobra solo la seña de 1000
    ucc.crearCierre(repos, { idCierre: 'NV', fechaCierre: '2026-05-02', clienteNombre: 'Nuevo', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    ucc.agregarPago(repos, { idCierre: 'NV', fechaPago: '2026-05-02', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña', medioPago: 'Otro', closer: 'Ana' });
    const despues = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05').snapshot.cashCollected.valor ?? 0;
    expect(despues - antes).toBe(1000); // SOLO la seña cobrada, no las 3 cuotas pendientes
  });

  it('morosidad: venta vieja con cuota +30 días sin cobrar', () => {
    const db = setup();
    const repos = crearReposCierres(db);
    ucc.crearCierre(repos, { idCierre: 'MORA', fechaCierre: '2026-01-05', clienteNombre: 'Deudor', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    // sin pagos; a junio la cuota 1 (vence 04/02) está +30 días vencida
    const cob = ucob.obtenerCobranza(repos, '2026-06-01');
    const mora = cob.cierres.find((c) => c.idCierre === 'MORA')!;
    expect(mora.estado).toBe('Morosidad');
    expect(cob.resumen.morosidad).toBeGreaterThanOrEqual(1);
    expect(cob.resumen.morosidadUsd).toBeGreaterThan(0);
  });

  it('proyección agrupa el pendiente por mes (solo visual)', () => {
    const db = setup();
    const repos = crearReposCierres(db);
    ucc.crearCierre(repos, { idCierre: 'P', fechaCierre: '2026-05-02', clienteNombre: 'X', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    ucc.agregarPago(repos, { idCierre: 'P', fechaPago: '2026-05-02', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña', medioPago: 'Otro', closer: 'Ana' });
    const cob = ucob.obtenerCobranza(repos, '2026-05-10');
    const totalProy = cob.proyeccion.reduce((a, p) => a + p.montoUsd, 0);
    expect(totalProy).toBe(3000); // 3 cuotas pendientes
  });
});
