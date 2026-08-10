import { describe, expect, it } from 'vitest';
import {
  calcular,
  descomponer,
  escenarioSugerido,
  normalizar,
  PALANCAS,
  retornoPrograma,
  type EscenarioPrestamista,
} from '../margenes';

/**
 * Prestamista de referencia: 100.000 en la calle, 10% mensual, préstamos a 3
 * meses, cartera limpia y sin apalancamiento. Los números dan redondos a
 * propósito para que cada test se lea sin calculadora.
 */
const LIMPIO: EscenarioPrestamista = {
  capitalColocado: 100_000,
  capitalTerceros: 0,
  costoCapitalMensual: 0,
  tasaMensual: 0.1,
  plazoMeses: 3,
  mora: 0,
  diasAtraso: 0,
  incobrable: 0,
  gastosMensuales: 0,
};

describe('calcular · caso base sin fricción', () => {
  it('gira 4 veces al año y cobra 12 meses de interés', () => {
    const r = calcular(LIMPIO);
    expect(r.ciclosPorAno).toBe(4);
    expect(r.plazoEfectivoMeses).toBe(3);
    // 100.000 × 10% × 3 meses × 4 giros = 120.000 (120% anual).
    expect(r.interesesAnuales).toBe(120_000);
    expect(r.utilidadAnual).toBe(120_000);
    expect(r.utilidadMensual).toBe(10_000);
  });

  it('sin costos, el margen neto es 100% y el ROE iguala el rendimiento', () => {
    const r = calcular(LIMPIO);
    expect(r.margenNeto).toBe(1);
    expect(r.roeAnual).toBe(1.2);
    expect(r.rendimientoSobreCartera).toBe(1.2);
  });

  it('no pierde capital ni deja plata quieta', () => {
    const r = calcular(LIMPIO);
    expect(r.perdidaIncobrables).toBe(0);
    expect(r.capitalInmovilizado).toBe(0);
    expect(r.ciclosPerdidosPorMora).toBe(0);
  });
});

describe('calcular · la mora inmoviliza capital', () => {
  const CON_MORA: EscenarioPrestamista = { ...LIMPIO, mora: 0.3, diasAtraso: 30 };

  it('estira el plazo efectivo en proporción a la cartera atrasada', () => {
    // 3 meses + (30% × 30 días / 30) = 3,3 meses.
    expect(calcular(CON_MORA).plazoEfectivoMeses).toBeCloseTo(3.3, 10);
  });

  it('cobra menos intereses aunque la tasa sea la misma', () => {
    const r = calcular(CON_MORA);
    expect(r.ciclosPorAno).toBeCloseTo(12 / 3.3, 10);
    expect(r.interesesAnuales).toBeLessThan(calcular(LIMPIO).interesesAnuales);
    // El capital quieto es la parte de cartera en mora.
    expect(r.capitalInmovilizado).toBe(30_000);
    expect(r.ciclosPerdidosPorMora).toBeCloseTo(4 - 12 / 3.3, 10);
  });

  it('sin cartera en mora, los días de atraso no mueven nada', () => {
    const r = calcular({ ...LIMPIO, mora: 0, diasAtraso: 90 });
    expect(r.plazoEfectivoMeses).toBe(3);
    expect(r.interesesAnuales).toBe(120_000);
  });
});

describe('calcular · el incobrable pega dos veces', () => {
  const CON_PERDIDA: EscenarioPrestamista = { ...LIMPIO, incobrable: 0.1 };

  it('descuenta el interés que esa cartera no paga', () => {
    // 120.000 × (1 − 10%) = 108.000.
    expect(calcular(CON_PERDIDA).interesesAnuales).toBeCloseTo(108_000, 6);
  });

  it('además se lleva el capital, una vez por giro', () => {
    // 100.000 × 10% × 4 giros = 40.000 al año.
    expect(calcular(CON_PERDIDA).perdidaIncobrables).toBeCloseTo(40_000, 6);
    expect(calcular(CON_PERDIDA).utilidadAnual).toBeCloseTo(68_000, 6);
  });
});

describe('calcular · apalancamiento', () => {
  it('el capital de terceros multiplica el retorno sobre la plata propia', () => {
    const apalancado = calcular({
      ...LIMPIO,
      capitalTerceros: 60_000,
      costoCapitalMensual: 0.03,
    });
    // Intereses 120.000 − costo (60.000 × 3% × 12 = 21.600) = 98.400.
    expect(apalancado.costoCapitalAnual).toBeCloseTo(21_600, 6);
    expect(apalancado.utilidadAnual).toBeCloseTo(98_400, 6);
    expect(apalancado.capitalPropio).toBe(40_000);
    // ROE sobre 40.000 propios, muy por encima del rendimiento de la cartera.
    expect(apalancado.roeAnual).toBeCloseTo(2.46, 6);
    expect(apalancado.rendimientoSobreCartera).toBeCloseTo(0.984, 6);
  });

  it('con toda la cartera prestada, el ROE no existe en vez de explotar', () => {
    const r = calcular({ ...LIMPIO, capitalTerceros: 100_000, costoCapitalMensual: 0.02 });
    expect(r.capitalPropio).toBe(0);
    expect(r.roeAnual).toBeNull();
  });
});

describe('calcular · división por cero y datos rotos', () => {
  it('sin capital colocado, las métricas son null y nunca NaN', () => {
    const r = calcular({ ...LIMPIO, capitalColocado: 0 });
    expect(r.interesesAnuales).toBe(0);
    expect(r.margenNeto).toBeNull();
    expect(r.roeAnual).toBeNull();
    expect(r.rendimientoSobreCartera).toBeNull();
  });

  it('sin intereses cobrados (tasa 0) el margen es null, no infinito', () => {
    const r = calcular({ ...LIMPIO, tasaMensual: 0, gastosMensuales: 1_000 });
    expect(r.utilidadAnual).toBe(-12_000);
    expect(r.margenNeto).toBeNull();
  });

  it('los resultados siempre son finitos', () => {
    const roto: EscenarioPrestamista = {
      capitalColocado: Number.NaN,
      capitalTerceros: Number.NEGATIVE_INFINITY,
      costoCapitalMensual: Number.NaN,
      tasaMensual: Number.POSITIVE_INFINITY,
      plazoMeses: 0,
      mora: Number.NaN,
      diasAtraso: Number.NaN,
      incobrable: Number.NaN,
      gastosMensuales: Number.NaN,
    };
    for (const valor of Object.values(calcular(roto))) {
      if (valor !== null) expect(Number.isFinite(valor)).toBe(true);
    }
  });
});

describe('normalizar · blindaje de la carga en vivo', () => {
  it('recorta porcentajes fuera de rango y montos negativos', () => {
    const e = normalizar({
      ...LIMPIO,
      capitalColocado: -5_000,
      mora: 2.5,
      incobrable: -0.4,
      tasaMensual: 8,
      gastosMensuales: -900,
    });
    expect(e.capitalColocado).toBe(0);
    expect(e.mora).toBe(1);
    expect(e.incobrable).toBe(0);
    expect(e.tasaMensual).toBe(1);
    expect(e.gastosMensuales).toBe(0);
  });

  it('el capital de terceros nunca supera la cartera', () => {
    const e = normalizar({ ...LIMPIO, capitalColocado: 50_000, capitalTerceros: 90_000 });
    expect(e.capitalTerceros).toBe(50_000);
  });

  it('un plazo de cero se lleva al mínimo operable', () => {
    expect(normalizar({ ...LIMPIO, plazoMeses: 0 }).plazoMeses).toBe(0.25);
    expect(normalizar({ ...LIMPIO, plazoMeses: 999 }).plazoMeses).toBe(60);
  });
});

describe('descomponer · el waterfall que se muestra en la llamada', () => {
  const HOY: EscenarioPrestamista = {
    capitalColocado: 80_000,
    capitalTerceros: 30_000,
    costoCapitalMensual: 0.04,
    tasaMensual: 0.08,
    plazoMeses: 4,
    mora: 0.35,
    diasAtraso: 45,
    incobrable: 0.12,
    gastosMensuales: 2_500,
  };
  const ORDENADO: EscenarioPrestamista = {
    ...HOY,
    mora: 0.08,
    diasAtraso: 10,
    incobrable: 0.03,
    tasaMensual: 0.1,
    plazoMeses: 3,
    gastosMensuales: 2_200,
    capitalColocado: 100_000,
  };

  it('los aportes suman exactamente la diferencia total', () => {
    const d = descomponer(HOY, ORDENADO);
    const suma = d.aportes.reduce((acc, a) => acc + a.delta, 0);
    expect(suma).toBeCloseTo(d.deltaTotal, 6);
  });

  it('el final del waterfall es el escenario objetivo calculado directo', () => {
    const d = descomponer(HOY, ORDENADO);
    expect(d.utilidadActual).toBeCloseTo(calcular(HOY).utilidadAnual, 6);
    expect(d.utilidadObjetivo).toBeCloseTo(calcular(ORDENADO).utilidadAnual, 6);
  });

  it('cada aporte encadena con el siguiente sin huecos', () => {
    const d = descomponer(HOY, ORDENADO);
    expect(d.aportes[0]!.desde).toBeCloseTo(d.utilidadActual, 6);
    d.aportes.forEach((a, i) => {
      expect(a.hasta - a.desde).toBeCloseTo(a.delta, 6);
      const siguiente = d.aportes[i + 1];
      if (siguiente) expect(siguiente.desde).toBeCloseTo(a.hasta, 6);
    });
    expect(d.aportes.at(-1)!.hasta).toBeCloseTo(d.utilidadObjetivo, 6);
  });

  it('si el objetivo es igual al hoy, ninguna palanca aporta nada', () => {
    const d = descomponer(HOY, HOY);
    expect(d.deltaTotal).toBeCloseTo(0, 6);
    for (const a of d.aportes) expect(a.delta).toBeCloseTo(0, 6);
  });

  it('cubre las seis palancas, sin dejar ningún campo afuera', () => {
    const d = descomponer(HOY, ORDENADO);
    expect(d.aportes.map((a) => a.clave)).toEqual([
      'mora',
      'incobrables',
      'tasa',
      'rotacion',
      'gastos',
      'capital',
    ]);
    expect(d.aportes).toHaveLength(PALANCAS.length);
  });

  it('una palanca que empeora el negocio aporta en negativo', () => {
    const d = descomponer(HOY, { ...HOY, gastosMensuales: HOY.gastosMensuales + 1_000 });
    const gastos = d.aportes.find((a) => a.clave === 'gastos')!;
    expect(gastos.delta).toBeCloseTo(-12_000, 6);
    expect(d.deltaTotal).toBeCloseTo(-12_000, 6);
  });
});

describe('escenarioSugerido · el punto de partida del closer', () => {
  const DESORDENADO: EscenarioPrestamista = {
    ...LIMPIO,
    mora: 0.36,
    diasAtraso: 60,
    incobrable: 0.15,
  };

  it('lleva mora e incobrables a un tercio y parte los días de atraso al medio', () => {
    const s = escenarioSugerido(DESORDENADO);
    expect(s.mora).toBeCloseTo(0.12, 10);
    expect(s.diasAtraso).toBe(30);
    expect(s.incobrable).toBeCloseTo(0.05, 10);
  });

  it('suma dos puntos de tasa', () => {
    expect(escenarioSugerido(DESORDENADO).tasaMensual).toBeCloseTo(0.12, 10);
  });

  it('no toca capital, plazo ni gastos: son decisiones del dueño', () => {
    const s = escenarioSugerido(DESORDENADO);
    expect(s.capitalColocado).toBe(DESORDENADO.capitalColocado);
    expect(s.plazoMeses).toBe(DESORDENADO.plazoMeses);
    expect(s.gastosMensuales).toBe(DESORDENADO.gastosMensuales);
  });

  it('nunca empeora una cartera que ya está sana', () => {
    const sana = { ...LIMPIO, mora: 0.01, diasAtraso: 2, incobrable: 0.005 };
    const s = escenarioSugerido(sana);
    expect(s.mora).toBeLessThanOrEqual(sana.mora);
    expect(s.diasAtraso).toBeLessThanOrEqual(sana.diasAtraso);
    expect(s.incobrable).toBeLessThanOrEqual(sana.incobrable);
  });

  it('la mejora sugerida siempre deja al negocio igual o mejor', () => {
    const hoy = calcular(DESORDENADO).utilidadAnual;
    expect(calcular(escenarioSugerido(DESORDENADO)).utilidadAnual).toBeGreaterThan(hoy);
  });
});

describe('retornoPrograma', () => {
  it('cuenta cuántas veces se paga la inversión y en cuántos meses', () => {
    const r = retornoPrograma(36_000, 6_000);
    expect(r.roi).toBe(6);
    expect(r.mesesRecupero).toBe(2);
  });

  it('sin inversión cargada no inventa un ROI', () => {
    expect(retornoPrograma(36_000, 0).roi).toBeNull();
  });

  it('si no hay mejora, no hay recupero', () => {
    expect(retornoPrograma(0, 6_000).mesesRecupero).toBeNull();
    expect(retornoPrograma(-5_000, 6_000).mesesRecupero).toBeNull();
  });
});
