import { describe, it, expect } from 'vitest';
import { contextoSql, ejemplosSql, notasNegocio, NOTAS_NEGOCIO, EJEMPLOS_SQL } from '../guia';

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

describe('guía del asistente · dialecto PostgreSQL', () => {
  it('las notas hablan PostgreSQL (sin strftime; con to_char)', () => {
    const notas = notasNegocio('postgres');
    expect(notas).toContain('PostgreSQL');
    expect(notas).not.toContain('strftime');
    expect(notas).toContain("to_char(fecha_pago::date, 'YYYY-MM')");
  });

  it('los ejemplos PG no usan funciones de SQLite', () => {
    const ej = ejemplosSql('postgres');
    expect(ej).not.toContain('strftime');
    expect(ej).not.toContain("date('now'");
    expect(ej).toContain("substr(fecha_pago,1,7) = '2026-05'");
    expect(ej).toContain("CURRENT_DATE - INTERVAL '60 days'");
  });

  it('contextoSql(esquema, "postgres") arma el bloque con el dialecto pedido', () => {
    const ctx = contextoSql('pagos(id_pago TEXT)', 'postgres');
    expect(ctx).toContain('ESQUEMA REAL');
    expect(ctx).toContain(notasNegocio('postgres'));
    expect(ctx).toContain(ejemplosSql('postgres'));
  });

  it('el default sigue siendo SQLite (compatibilidad)', () => {
    expect(contextoSql('x')).toContain(NOTAS_NEGOCIO);
    expect(notasNegocio()).toBe(NOTAS_NEGOCIO);
    expect(ejemplosSql()).toBe(EJEMPLOS_SQL);
  });
});
