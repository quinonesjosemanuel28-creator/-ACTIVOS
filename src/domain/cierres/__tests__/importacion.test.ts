import { describe, it, expect } from 'vitest';
import { construirImportacion, type FilaPagoCruda } from '../importacion';

const fila = (p: Partial<FilaPagoCruda>): FilaPagoCruda => p;

describe('construirImportacion', () => {
  it('agrupa por id_cierre y suma el ticket', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C0001', fecha_pago: '2026-03-02', cliente_nombre: 'Ana', programa: 'Empresario', monto_usd: 1000, monto_ars: 1_180_000, tipo_pago: 'Reserva/Seña', medio_pago: 'CRYPTO' }),
      fila({ id_cierre: 'C0001', fecha_pago: '2026-04-12', cliente_nombre: 'Ana', programa: 'Empresario', monto_usd: 2000, monto_ars: 2_480_000, tipo_pago: 'Cuota', numero_cuota: '2/2', medio_pago: 'Transferencia BBVA' }),
    ]);
    expect(r.cierres).toHaveLength(1);
    expect(r.pagos).toHaveLength(2);
    expect(r.cierres[0]!.ticketTotalUsd).toBe(3000);
    expect(r.cierres[0]!.clienteNombre).toBe('Ana');
    expect(r.pagos.map((p) => p.idPago)).toEqual(['C0001-P1', 'C0001-P2']);
  });

  it('deriva la cotización cuando viene vacía', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C1', fecha_pago: '2026-03-02', programa: 'Cero a Gestor', monto_usd: 1000, monto_ars: 1_180_000, medio_pago: 'Hotmart' }),
    ]);
    expect(r.pagos[0]!.cotizacion).toBeCloseTo(1180);
  });

  it('marca el cierre a revisar si alguna fila trae texto en "revisar"', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C2', fecha_pago: '2026-03-02', programa: 'Empresario', monto_usd: 500, medio_pago: 'Otro', revisar: 'falta mail' }),
    ]);
    expect(r.cierres[0]!.revisar).toBe('falta mail');
    expect(r.resumen.aRevisar).toBe(1);
  });

  it('medio_pago desconocido → Otro; tipo_pago desconocido → Cuota', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C3', fecha_pago: '2026-03-02', programa: 'Empresario', monto_usd: 500, medio_pago: 'MercadoPagoX', tipo_pago: '???' }),
    ]);
    expect(r.pagos[0]!.medioPago).toBe('Otro');
    expect(r.pagos[0]!.tipoPago).toBe('Cuota');
  });

  it('reporta filas inválidas (fecha/monto/programa) sin cargarlas', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C4', fecha_pago: 'no-fecha', programa: 'Empresario', monto_usd: 500, medio_pago: 'Otro' }),
      fila({ id_cierre: 'C5', fecha_pago: '2026-03-02', programa: 'OtroPrograma', monto_usd: 500, medio_pago: 'Otro' }),
      fila({ id_cierre: 'C6', fecha_pago: '2026-03-02', programa: 'Empresario', monto_usd: 0, medio_pago: 'Otro' }),
    ]);
    expect(r.cierres).toHaveLength(0);
    expect(r.errores.length).toBeGreaterThanOrEqual(3);
    expect(r.errores.some((e) => /fecha/i.test(e.motivo))).toBe(true);
    expect(r.errores.some((e) => /programa/i.test(e.motivo))).toBe(true);
  });

  it('acepta dd/mm/yyyy', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C7', fecha_pago: '05/03/2026', programa: 'Empresario', monto_usd: 500, medio_pago: 'Otro' }),
    ]);
    expect(r.pagos[0]!.fechaPago).toBe('2026-03-05');
  });

  it('idempotente: mismas filas → mismos IDs deterministas', () => {
    const filas = [
      fila({ id_cierre: 'C8', fecha_pago: '2026-03-02', programa: 'Empresario', monto_usd: 1000, medio_pago: 'Otro' }),
      fila({ id_cierre: 'C8', fecha_pago: '2026-03-09', programa: 'Empresario', monto_usd: 500, medio_pago: 'Otro' }),
    ];
    const a = construirImportacion(filas);
    const b = construirImportacion(filas);
    expect(a.pagos.map((p) => p.idPago)).toEqual(b.pagos.map((p) => p.idPago));
    expect(a.cierres[0]!.idCierre).toBe(b.cierres[0]!.idCierre);
  });

  it('asigna el closer DE CADA FILA al pago; el cierre toma el de la 1ra fila', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C0113', fecha_pago: '2026-03-31', cliente_nombre: 'Cristhian Marín', programa: 'Empresario', closer: 'Julian', monto_usd: 100, medio_pago: 'Transferencia Lemon', tipo_pago: 'Reserva/Seña' }),
      fila({ id_cierre: 'C0113', fecha_pago: '2026-05-04', cliente_nombre: 'Cristhian Marín', programa: 'Empresario', closer: 'Ayrton', monto_usd: 900, medio_pago: 'Transferencia BBVA', tipo_pago: 'Cuota' }),
    ]);
    expect(r.cierres[0]!.closer).toBe('Julian'); // closer de la venta (1ra fila)
    const pagos = r.pagos.filter((p) => p.idCierre === 'C0113');
    expect(pagos.find((p) => p.montoUsd === 100)!.closer).toBe('Julian');
    expect(pagos.find((p) => p.montoUsd === 900)!.closer).toBe('Ayrton');
  });

  it('cierre sin pagos válidos no se crea', () => {
    const r = construirImportacion([
      fila({ id_cierre: 'C9', fecha_pago: 'xx', programa: 'Empresario', monto_usd: 'abc', medio_pago: 'Otro' }),
    ]);
    expect(r.cierres).toHaveLength(0);
  });
});
