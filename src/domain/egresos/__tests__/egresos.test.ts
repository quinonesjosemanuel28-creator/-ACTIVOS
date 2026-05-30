import { describe, it, expect } from 'vitest';
import type { Egreso } from '../../types';
import { esDistribucion, tipoPorCategoria } from '../categorias';
import {
  costoOperativoUsd,
  cotizacionPonderada,
  distribucionUsd,
  egresosDelMes,
  resumenEgresos,
  totalesPorCategoria,
} from '../metrics';

function egreso(p: Partial<Egreso>): Egreso {
  return {
    idEgreso: p.idEgreso ?? 'e',
    fecha: p.fecha ?? '2026-05-03',
    mes: p.mes ?? (p.fecha ?? '2026-05-03').slice(0, 7),
    tipo: p.tipo ?? 'Operativo',
    categoria: p.categoria ?? 'Gastos fijos',
    concepto: p.concepto,
    montoUsd: p.montoUsd ?? 100,
    montoArs: p.montoArs,
    cotizacion: p.cotizacion,
    recurrente: p.recurrente,
    medioPago: p.medioPago,
    comentarios: p.comentarios,
    unidadNegocio: p.unidadNegocio ?? 'ACADEMY',
  };
}

describe('categorías', () => {
  it('Retiros de socios es distribución; el resto no', () => {
    expect(esDistribucion('Retiros de socios')).toBe(true);
    expect(esDistribucion('Sueldos')).toBe(false);
  });
  it('tipo derivado por categoría (bajo el capó, para el margen)', () => {
    expect(tipoPorCategoria('Marketing y publicidad')).toBe('Directo');
    expect(tipoPorCategoria('Comisiones')).toBe('Directo');
    expect(tipoPorCategoria('Sueldos')).toBe('Operativo');
    expect(tipoPorCategoria('Retiros de socios')).toBe('Extraordinario');
  });
});

describe('totales por categoría y separación operativo vs retiros', () => {
  const egresos = [
    egreso({ categoria: 'Sueldos', montoUsd: 1000 }),
    egreso({ categoria: 'Marketing y publicidad', montoUsd: 600 }),
    egreso({ categoria: 'Gastos fijos', montoUsd: 400 }),
    egreso({ categoria: 'Retiros de socios', montoUsd: 2000 }), // distribución
  ];

  it('costo operativo excluye retiros de socios', () => {
    expect(costoOperativoUsd(egresos)).toBe(2000); // 1000+600+400
    expect(distribucionUsd(egresos)).toBe(2000);
  });

  it('desglose por categoría con % sobre el total y orden desc', () => {
    const lineas = totalesPorCategoria(egresos);
    expect(lineas[0]!.categoria).toBe('Retiros de socios'); // mayor monto primero
    const sueldos = lineas.find((l) => l.categoria === 'Sueldos')!;
    expect(sueldos.pctUsd).toBeCloseTo(1000 / 4000);
    expect(lineas.find((l) => l.categoria === 'Retiros de socios')!.esDistribucion).toBe(true);
  });

  it('resumen completo: total incluye todo, operativo separa los retiros', () => {
    const r = resumenEgresos(egresos);
    expect(r.totalUsd).toBe(4000);
    expect(r.costoOperativoUsd).toBe(2000);
    expect(r.distribucionUsd).toBe(2000);
  });
});

describe('doble moneda', () => {
  it('cotización ponderada = Σars/Σusd solo sobre egresos con ARS', () => {
    const egresos = [
      egreso({ montoUsd: 1000, montoArs: 1_300_000 }),
      egreso({ montoUsd: 500 }), // sin ARS: no distorsiona
    ];
    expect(cotizacionPonderada(egresos)).toBe(1300);
  });
  it('sin ARS → cotización null', () => {
    expect(cotizacionPonderada([egreso({ montoUsd: 100 })])).toBeNull();
  });
});

describe('recurrentes (proyección virtual)', () => {
  const egresos = [
    egreso({ idEgreso: 'alq', categoria: 'Gastos fijos', montoUsd: 800, recurrente: true, fecha: '2026-03-01', mes: '2026-03' }),
    egreso({ idEgreso: 'puntual', categoria: 'Gastos variables', montoUsd: 50, fecha: '2026-05-10', mes: '2026-05' }),
  ];

  it('un recurrente aparece en su mes de inicio y en meses posteriores', () => {
    expect(egresosDelMes(egresos, '2026-03').map((e) => e.idEgreso)).toEqual(['alq']);
    expect(egresosDelMes(egresos, '2026-04').map((e) => e.idEgreso)).toEqual(['alq']); // proyectado
    const may = egresosDelMes(egresos, '2026-05').map((e) => e.idEgreso).sort();
    expect(may).toEqual(['alq', 'puntual']); // recurrente proyectado + puntual del mes
  });

  it('un recurrente NO aparece en meses anteriores a su inicio', () => {
    expect(egresosDelMes(egresos, '2026-02')).toHaveLength(0);
  });

  it('el puntual solo aparece en su mes', () => {
    expect(egresosDelMes(egresos, '2026-04').some((e) => e.idEgreso === 'puntual')).toBe(false);
  });

  it('la proyección conserva el monto cada mes', () => {
    expect(egresosDelMes(egresos, '2026-06').find((e) => e.idEgreso === 'alq')!.montoUsd).toBe(800);
  });
});
