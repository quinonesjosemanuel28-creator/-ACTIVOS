import { describe, it, expect } from 'vitest';
import { contextoSql, NOTAS_NEGOCIO, EJEMPLOS_SQL } from '../guia';

describe('guía del asistente (contexto para Claude)', () => {
  it('incluye el esquema real provisto', () => {
    const ctx = contextoSql('pagos(id_pago TEXT, monto_usd REAL, fecha_pago TEXT)');
    expect(ctx).toContain('ESQUEMA REAL');
    expect(ctx).toContain('pagos(id_pago TEXT, monto_usd REAL, fecha_pago TEXT)');
    expect(ctx).toContain(NOTAS_NEGOCIO);
    expect(ctx).toContain(EJEMPLOS_SQL);
  });

  it('aclara que pagos NO tiene columna mes y se usa strftime', () => {
    expect(NOTAS_NEGOCIO).toMatch(/no existe una columna "mes" en pagos/i);
    expect(NOTAS_NEGOCIO).toContain("strftime('%Y-%m', fecha_pago)");
  });

  it('aclara que la facturación sale de pagos, no de ventas/cobros legacy', () => {
    expect(NOTAS_NEGOCIO).toMatch(/FUENTE DE VERDAD/);
    expect(NOTAS_NEGOCIO).toMatch(/legacy/i);
  });

  it('explica lista negra y pendiente de cobranza (conceptos derivados)', () => {
    expect(NOTAS_NEGOCIO).toMatch(/LISTA NEGRA/);
    expect(NOTAS_NEGOCIO).toMatch(/PENDIENTE DE COBRANZA/);
  });

  it('los ejemplos usan columnas reales (pagos.monto_usd, fecha_pago)', () => {
    expect(EJEMPLOS_SQL).toContain('SUM(monto_usd) AS facturacion_usd FROM pagos');
    expect(EJEMPLOS_SQL).toContain("strftime('%Y-%m', fecha_pago) = '2026-05'");
  });
});
