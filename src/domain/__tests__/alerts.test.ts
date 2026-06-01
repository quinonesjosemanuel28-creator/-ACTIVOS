import { describe, it, expect } from 'vitest';
import { evaluarAlertas, REGLAS, PESO_SEVERIDAD } from '../alerts';
import { construirSnapshot } from '../dashboard';
import type { Parametros } from '../types';
import { cobro, datosMes, egreso, venta } from './fixtures';

const parametros: Parametros = {
  cajaInicialUsd: 10000,
  costosFijosMensualesUsd: 5000,
  metaCashCollectedUsd: 10000,
  metaMargenOperativo: 0.25,
  topeCacUsd: 350,
  metaTasaCierre: 0.2,
  runwayMinimoMeses: 3,
  objetivoRoas: 3,
  objetivoMer: 3,
};

function ctxMes(over: Parameters<typeof construirSnapshot>[0]['datosMes']) {
  const snapshot = construirSnapshot({
    mes: over.mes,
    datosMes: over,
    datosMesAnterior: null,
    cobrosHistoricos: over.cobros,
    egresosHistoricos: over.egresos,
    ventasHistoricas: over.ventas,
    funnel: { agendas: 100, asistieron: 60, cerrados: 12 },
    funnelAnterior: null,
    parametros,
  });
  return { snapshot, datosMes: over, parametros };
}

describe('Motor de alertas (semáforo)', () => {
  it('hay exactamente 9 reglas', () => {
    expect(REGLAS).toHaveLength(9);
  });

  it('ordena rojas primero', () => {
    const ctx = ctxMes(
      datosMes({
        mes: '2026-01',
        ventas: [venta({ programa: 'Gestor' })], // 0 empresarios → ROJO
        cobros: [],
        egresos: [],
      }),
    );
    const alertas = evaluarAlertas(ctx);
    for (let i = 1; i < alertas.length; i++) {
      expect(PESO_SEVERIDAD[alertas[i - 1]!.severidad]).toBeLessThanOrEqual(
        PESO_SEVERIDAD[alertas[i]!.severidad],
      );
    }
  });

  it('alerta 5: cero empresarios nuevos = ROJO', () => {
    const ctx = ctxMes(datosMes({ mes: '2026-01', ventas: [venta({ programa: 'Gestor' })] }));
    const a = evaluarAlertas(ctx).find((x) => x.id === 'empresarios-nuevos');
    expect(a?.severidad).toBe('ROJO');
  });

  it('alerta 4: cohortes > 50% = ROJO (motor nuevo apagado)', () => {
    const ctx = ctxMes(
      datosMes({
        mes: '2026-03',
        cobros: [
          cobro({ montoUsd: 1000, mesCobro: '2026-03', mesOriginalVenta: '2026-01' }), // cohorte
          cobro({ montoUsd: 100, mesCobro: '2026-03', mesOriginalVenta: '2026-03' }), // nuevo
        ],
      }),
    );
    const a = evaluarAlertas(ctx).find((x) => x.id === 'concentracion-cohortes');
    expect(a?.severidad).toBe('ROJO');
  });

  it('alerta 3: CAC bajo el tope = VERDE', () => {
    const ctx = ctxMes(
      datosMes({
        mes: '2026-01',
        ventas: [venta({ idVenta: '1' }), venta({ idVenta: '2' })],
        egresos: [egreso({ categoria: 'Marketing', montoUsd: 400 })], // CAC 200
        cobros: [cobro({ montoUsd: 12000, mesCobro: '2026-01', mesOriginalVenta: '2026-01' })],
      }),
    );
    const a = evaluarAlertas(ctx).find((x) => x.id === 'cac-vs-tope');
    expect(a?.severidad).toBe('VERDE');
  });

  it('alerta 9: runway < 3 meses = ROJO', () => {
    const ctx = ctxMes(
      datosMes({
        mes: '2026-01',
        cobros: [],
        egresos: [egreso({ montoUsd: 6000 })], // caja 10000-6000=4000, runway 0.8
      }),
    );
    const a = evaluarAlertas(ctx).find((x) => x.id === 'runway');
    expect(a?.severidad).toBe('ROJO');
  });

  it('cada alerta tiene acción sugerida no vacía', () => {
    const ctx = ctxMes(datosMes({ mes: '2026-01' }));
    for (const a of evaluarAlertas(ctx)) {
      expect(a.accionSugerida.length).toBeGreaterThan(0);
    }
  });
});
