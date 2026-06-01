import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import * as ucc from '../../application/cierres/useCases';

function setup() {
  const db = getDbMemoria();
  const repos = crearReposCierres(db);
  return { db, repos };
}

function setupConDemo() {
  const s = setup();
  sembrarCierresDemo(s.repos);
  return s;
}

describe('Cierres · CRUD y cascade', () => {
  it('editar un cierre NO borra sus pagos (upsert in-place, no REPLACE)', () => {
    const { repos } = setup();
    const c = ucc.crearCierre(repos, { fechaCierre: '2026-03-10', clienteNombre: 'Test', programa: 'Empresario', ticketTotalUsd: 3000, closer: 'Ana' });
    ucc.agregarPago(repos, { idCierre: c.idCierre, fechaPago: '2026-03-10', montoUsd: 1000, tipoPago: 'Reserva/Seña', medioPago: 'Otro' });
    // Cualquier guardado del cierre (editar/quitarRevisar/marcarInactivo)
    ucc.editarCierre(repos, c.idCierre, { fechaCierre: '2026-03-10', clienteNombre: 'Test EDIT', programa: 'Empresario', ticketTotalUsd: 3000 });
    expect(repos.pagos.listarPorCierre(c.idCierre)).toHaveLength(1); // los pagos sobreviven
    expect(repos.cierres.obtener(c.idCierre)!.clienteNombre).toBe('Test EDIT');
  });

  it('crea un cierre y le agrega pagos', () => {
    const { repos } = setup();
    const c = ucc.crearCierre(repos, {
      fechaCierre: '2026-03-10', clienteNombre: 'Test', programa: 'Empresario', ticketTotalUsd: 3000, closer: 'Ana',
    });
    ucc.agregarPago(repos, { idCierre: c.idCierre, fechaPago: '2026-03-10', montoUsd: 1000, montoArs: 1_180_000, tipoPago: 'Reserva/Seña', medioPago: 'Transferencia Lemon' });
    const fila = ucc.listarCierresConPagos(repos).find((f) => f.cierre.idCierre === c.idCierre)!;
    expect(fila.pagadoUsd).toBe(1000);
    expect(fila.pagadoArs).toBe(1_180_000);
    expect(fila.pendienteUsd).toBe(2000);
    expect(fila.estadoSaldo).toBe('solo-seña');
  });

  it('eliminar un cierre arrastra sus pagos (ON DELETE CASCADE)', () => {
    const { repos } = setup();
    const c = ucc.crearCierre(repos, { fechaCierre: '2026-03-10', clienteNombre: 'X', programa: 'Empresario', ticketTotalUsd: 3000 });
    ucc.agregarPago(repos, { idCierre: c.idCierre, fechaPago: '2026-03-11', montoUsd: 500, tipoPago: 'Cuota', medioPago: 'CRYPTO' });
    expect(repos.pagos.listarTodos()).toHaveLength(1);
    ucc.eliminarCierre(repos, c.idCierre);
    expect(repos.cierres.obtener(c.idCierre)).toBeNull();
    expect(repos.pagos.listarTodos()).toHaveLength(0);
  });

  it('deriva la cotización al guardar usd + ars', () => {
    const { repos } = setup();
    const c = ucc.crearCierre(repos, { fechaCierre: '2026-03-10', clienteNombre: 'Y', programa: 'Cero a Gestor', ticketTotalUsd: 1200 });
    const pago = ucc.agregarPago(repos, { idCierre: c.idCierre, fechaPago: '2026-03-12', montoUsd: 1000, montoArs: 1_180_000, tipoPago: 'Pago Completo', medioPago: 'Hotmart' });
    expect(pago.cotizacion).toBeCloseTo(1180);
  });

  it('ARS+USD mandan: deriva la cotización e ignora la tipeada inconsistente', () => {
    const { repos } = setup();
    const c = ucc.crearCierre(repos, { fechaCierre: '2026-03-10', clienteNombre: 'Z', programa: 'Empresario', ticketTotalUsd: 3000 });
    const pago = ucc.agregarPago(repos, { idCierre: c.idCierre, fechaPago: '2026-03-12', montoUsd: 1000, montoArs: 1_180_000, cotizacion: 900, tipoPago: 'Cuota', medioPago: 'Otro' });
    expect(pago.cotizacion).toBeCloseTo(1180); // 1_180_000 / 1000, no 900
  });

  it('rechaza pago sin USD ni cotización (no derivable)', () => {
    const { repos } = setup();
    const c = ucc.crearCierre(repos, { fechaCierre: '2026-03-10', clienteNombre: 'W', programa: 'Empresario', ticketTotalUsd: 3000 });
    expect(() =>
      ucc.agregarPago(repos, { idCierre: c.idCierre, fechaPago: '2026-03-12', montoArs: 1_180_000, tipoPago: 'Cuota', medioPago: 'Otro' }),
    ).toThrow();
  });
});

describe('Cierres · filtros, buscador y resumen', () => {
  it('filtra por programa y por estado', () => {
    const { repos } = setupConDemo();
    expect(ucc.listarCierresConPagos(repos, { programa: 'Empresario' }).every((f) => f.cierre.programa === 'Empresario')).toBe(true);
    expect(ucc.listarCierresConPagos(repos, { estado: 'Activo' }).length).toBeGreaterThan(0);
  });

  it('busca por nombre/mail', () => {
    const { repos } = setupConDemo();
    const r = ucc.listarCierresConPagos(repos, { q: 'lucía' });
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.every((f) => f.cierre.clienteNombre.toLowerCase().includes('lucía'))).toBe(true);
  });

  it('resumen del mes: totales USD/ARS y cotización ponderada', () => {
    const { repos } = setupConDemo();
    const resumen = ucc.resumenDelMes(repos, '2026-03');
    expect(resumen.totalCobradoUsd).toBeGreaterThan(0);
    expect(resumen.totalCobradoArs).toBeGreaterThan(0);
    expect(resumen.cotizacionPonderada).toBeCloseTo(resumen.totalCobradoArs / resumen.totalCobradoUsd);
  });
});

describe('Cierres · reseteo seguro', () => {
  it('borrar demo limpia solo lo sembrado, no lo real', () => {
    const { repos } = setupConDemo();
    const real = ucc.crearCierre(repos, { fechaCierre: '2026-05-02', clienteNombre: 'Real', programa: 'Empresario', ticketTotalUsd: 4000 });
    const res = ucc.borrarDatosDemo(repos);
    expect(res.cierresBorrados).toBeGreaterThan(0);
    expect(repos.cierres.obtener(real.idCierre)).not.toBeNull(); // el real sobrevive
    expect(ucc.listarCierresConPagos(repos)).toHaveLength(1);
  });

  it('reiniciar exige el token BORRAR', () => {
    const { repos } = setupConDemo();
    expect(() => ucc.reiniciarCierresYPagos(repos, { confirm: 'si' })).toThrow();
    expect(() => ucc.reiniciarCierresYPagos(repos, {})).toThrow();
  });

  it('reiniciar con token vacía todo', () => {
    const { repos } = setupConDemo();
    const res = ucc.reiniciarCierresYPagos(repos, { confirm: 'BORRAR' });
    expect(res.cierresBorrados).toBeGreaterThan(0);
    expect(ucc.listarCierresConPagos(repos)).toHaveLength(0);
    expect(repos.pagos.listarTodos()).toHaveLength(0);
  });
});
