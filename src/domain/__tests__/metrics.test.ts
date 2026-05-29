import { describe, it, expect } from 'vitest';
import * as m from '../metrics';
import { cobro, datosMes, egreso, venta } from './fixtures';

describe('Cash — R1: lente de cobros', () => {
  const cobros = [
    cobro({ idCobro: 'a', montoUsd: 1000, mesCobro: '2026-03', mesOriginalVenta: '2026-03' }), // nuevo
    cobro({ idCobro: 'b', montoUsd: 600, mesCobro: '2026-03', mesOriginalVenta: '2026-01' }), // cohorte
    cobro({ idCobro: 'c', montoUsd: 400, mesCobro: '2026-03', mesOriginalVenta: '2026-02' }), // cohorte
  ];

  it('Cash Collected = Σ cobros del mes', () => {
    expect(m.cashCollected(cobros)).toBe(2000);
  });
  it('Cash Nuevo = cobros donde mes_cobro = mes_original_venta', () => {
    expect(m.cashNuevo(cobros)).toBe(1000);
  });
  it('Cohortes = Cash Collected − Cash Nuevo', () => {
    expect(m.cohortes(cobros)).toBe(1000);
  });
  it('Concentración de cohortes = cohortes / cash', () => {
    expect(m.concentracionCohortes(cobros)).toBe(0.5);
  });
  it('Concentración null si no hubo cash', () => {
    expect(m.concentracionCohortes([])).toBeNull();
  });
});

describe('Ventas y AOV — R2: AOV Real solo con Cash Nuevo', () => {
  const d = datosMes({
    ventas: [venta({ idVenta: '1', ticketTotalUsd: 2000 }), venta({ idVenta: '2', ticketTotalUsd: 3000 })],
    cobros: [
      cobro({ montoUsd: 800, mesCobro: '2026-01', mesOriginalVenta: '2026-01' }), // nuevo
      cobro({ montoUsd: 5000, mesCobro: '2026-01', mesOriginalVenta: '2025-12' }), // cohorte, NO cuenta para AOV
    ],
  });

  it('Ventas Nuevas USD = Σ ticket', () => {
    expect(m.ventasNuevasUsd(d)).toBe(5000);
  });
  it('Cierres Nuevos = count ventas', () => {
    expect(m.cierresNuevos(d)).toBe(2);
  });
  it('AOV Real usa SOLO cash nuevo (excluye cohortes) → 800/2', () => {
    expect(m.aovReal(d)).toBe(400);
  });
  it('AOV Real = null si cierres = 0 (división por cero)', () => {
    expect(m.aovReal(datosMes({ cobros: [cobro({ montoUsd: 500 })] }))).toBeNull();
  });
});

describe('Rentabilidad', () => {
  const d = datosMes({
    cobros: [cobro({ montoUsd: 10000, mesCobro: '2026-01', mesOriginalVenta: '2026-01' })],
    egresos: [
      egreso({ tipo: 'Directo', categoria: 'Comisiones', montoUsd: 2000 }),
      egreso({ tipo: 'Operativo', categoria: 'Estructura', montoUsd: 3000 }),
    ],
  });

  it('Utilidad Operativa = Cash − Egresos Totales', () => {
    expect(m.utilidadOperativa(d)).toBe(5000);
  });
  it('Margen Operativo = Utilidad / Cash', () => {
    expect(m.margenOperativo(d)).toBe(0.5);
  });
  it('Margen Contribución ignora estructura (solo egresos directos)', () => {
    expect(m.margenContribucion(d)).toBe(0.8); // (10000-2000)/10000
  });
  it('Márgenes = null si no hubo cash', () => {
    expect(m.margenOperativo(datosMes())).toBeNull();
    expect(m.margenContribucion(datosMes())).toBeNull();
  });
});

describe('Marketing & adquisición', () => {
  const d = datosMes({
    ventas: [venta({ idVenta: '1' }), venta({ idVenta: '2' }), venta({ idVenta: '3' }), venta({ idVenta: '4' })],
    cobros: [cobro({ montoUsd: 8000, mesCobro: '2026-01', mesOriginalVenta: '2026-01' })],
    egresos: [egreso({ categoria: 'Marketing', tipo: 'Directo', montoUsd: 1000 })],
  });

  it('CAC = inversión marketing / cierres', () => {
    expect(m.cac(d)).toBe(250);
  });
  it('ROAS = cash / inversión', () => {
    expect(m.roas(d)).toBe(8);
  });
  it('MER = ventas nuevas / inversión', () => {
    expect(m.mer(d)).toBe(4); // 4*1000 / 1000
  });
  it('CAC/ROAS/MER = null sin inversión marketing', () => {
    const sin = datosMes({ ventas: [venta()], cobros: [cobro()] });
    expect(m.roas(sin)).toBeNull();
    expect(m.mer(sin)).toBeNull();
  });
});

describe('Caja y runway — R4: arrastre histórico', () => {
  const cobrosH = [
    cobro({ mesCobro: '2026-01', montoUsd: 5000 }),
    cobro({ mesCobro: '2026-02', montoUsd: 7000 }),
    cobro({ mesCobro: '2026-03', montoUsd: 9000 }),
  ];
  const egresosH = [
    egreso({ mes: '2026-01', montoUsd: 3000 }),
    egreso({ mes: '2026-02', montoUsd: 4000 }),
    egreso({ mes: '2026-03', montoUsd: 5000 }),
  ];

  it('Caja Final acumula TODO hasta el mes inclusive', () => {
    // hasta 2026-02: 1000 + (5000+7000) - (3000+4000) = 6000
    expect(m.cajaFinal(1000, cobrosH, egresosH, '2026-02')).toBe(6000);
  });
  it('Caja Final del último mes acumula toda la historia', () => {
    // 1000 + 21000 - 12000 = 10000
    expect(m.cajaFinal(1000, cobrosH, egresosH, '2026-03')).toBe(10000);
  });
  it('Runway = caja / costos fijos', () => {
    expect(m.runway(10000, 2500)).toBe(4);
  });
  it('Runway = null si costos fijos = 0', () => {
    expect(m.runway(10000, 0)).toBeNull();
  });
});

describe('Morosidad de cohorte', () => {
  it('comprometido cohorte − cobrado cohorte', () => {
    const ventasH = [
      venta({ mesVenta: '2025-12', ticketTotalUsd: 4000 }),
      venta({ mesVenta: '2026-01', ticketTotalUsd: 6000 }), // no es cohorte respecto a 2026-02
    ];
    const cobrosH = [cobro({ mesOriginalVenta: '2025-12', montoUsd: 1500 })];
    // mes = 2026-02 → cohorte = ventas < 2026-02 = 4000 + 6000 = 10000; cobrado cohorte = 1500
    expect(m.morosidadCohorte(ventasH, cobrosH, '2026-02')).toBe(8500);
  });
});

describe('Funnel', () => {
  it('tasa de show y de cierre', () => {
    expect(m.tasaShow({ agendas: 100, asistieron: 60, cerrados: 12 })).toBe(0.6);
    expect(m.tasaCierre({ agendas: 100, asistieron: 60, cerrados: 12 })).toBe(0.2);
  });
  it('null si denominador 0', () => {
    expect(m.tasaShow({ agendas: 0, asistieron: 0, cerrados: 0 })).toBeNull();
  });
});

describe('R8 · filtrado por programa', () => {
  const d = datosMes({
    ventas: [venta({ programa: 'Empresario' }), venta({ programa: 'Gestor' })],
    cobros: [
      cobro({ programa: 'Empresario', montoUsd: 1000 }),
      cobro({ programa: 'Gestor', montoUsd: 500 }),
    ],
    egresos: [
      egreso({ programa: 'Empresario', montoUsd: 100 }),
      egreso({ programa: undefined, montoUsd: 50 }), // compartido → cuenta para ambos
    ],
  });

  it('separa Empresario manteniendo egresos compartidos', () => {
    const emp = m.filtrarPorPrograma(d, 'Empresario');
    expect(emp.ventas).toHaveLength(1);
    expect(m.cashCollected(emp.cobros)).toBe(1000);
    expect(m.egresosTotales(emp.egresos)).toBe(150);
  });
  it('separa Gestor', () => {
    const g = m.filtrarPorPrograma(d, 'Gestor');
    expect(m.cashCollected(g.cobros)).toBe(500);
  });
});
