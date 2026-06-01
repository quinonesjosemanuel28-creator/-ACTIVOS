import { describe, it, expect } from 'vitest';
import type { Cierre, Pago } from '../../cierres/types';
import { comisionDePago, comisionesDelMes, PCT_CLOSER, PCT_SETTER } from '../calculo';
import { cierre as mkCierre, pago as mkPago } from '../../cierres/__tests__/fixtures';

describe('comisionDePago', () => {
  it('closer del pago cobra 10% del ARS; sin setting no hay 2%', () => {
    const c = mkCierre({ idCierre: 'C', closer: 'Ana', setter: 'Diego' });
    const p = mkPago({ idCierre: 'C', montoArs: 1_000_000, aplicaSetting: false });
    const lineas = comisionDePago(p, c);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]!.rol).toBe('closer');
    expect(lineas[0]!.persona).toBe('Ana');
    expect(lineas[0]!.montoArs).toBe(100_000); // 10%
  });

  it('con setting: closer 10% + setter 2% (setter heredado del cierre)', () => {
    const c = mkCierre({ idCierre: 'C', closer: 'Ana', setter: 'Diego' });
    const p = mkPago({ idCierre: 'C', montoArs: 1_000_000, aplicaSetting: true });
    const lineas = comisionDePago(p, c);
    expect(lineas).toHaveLength(2);
    expect(lineas.find((l) => l.rol === 'closer')!.montoArs).toBe(100_000);
    const setter = lineas.find((l) => l.rol === 'setter')!;
    expect(setter.persona).toBe('Diego');
    expect(setter.montoArs).toBe(20_000); // 2%
  });

  it('aplicaSetting pero sin setter (ni en pago ni en cierre) → no hay 2%', () => {
    const c = { ...mkCierre({ idCierre: 'C', closer: 'Ana' }), setter: undefined };
    const p = mkPago({ idCierre: 'C', montoArs: 1_000_000, aplicaSetting: true, setter: undefined });
    expect(comisionDePago(p, c).filter((l) => l.rol === 'setter')).toHaveLength(0);
  });

  it('setter propio del pago pisa al del cierre', () => {
    const c = mkCierre({ idCierre: 'C', closer: 'Ana', setter: 'Diego' });
    const p = mkPago({ idCierre: 'C', montoArs: 500_000, aplicaSetting: true, setter: 'Eva' });
    expect(comisionDePago(p, c).find((l) => l.rol === 'setter')!.persona).toBe('Eva');
  });

  it('pago SIN ARS comisiona 0 (no genera líneas)', () => {
    const c = mkCierre({ idCierre: 'C', closer: 'Ana' });
    expect(comisionDePago(mkPago({ idCierre: 'C', montoArs: undefined }), c)).toHaveLength(0);
  });

  it('editar el pago recalcula (deriva del pago)', () => {
    const c = mkCierre({ idCierre: 'C', closer: 'Ana' });
    const antes = comisionDePago(mkPago({ idCierre: 'C', montoArs: 1_000_000 }), c)[0]!.montoArs;
    const despues = comisionDePago(mkPago({ idCierre: 'C', montoArs: 1_500_000 }), c)[0]!.montoArs;
    expect(antes).toBe(100_000);
    expect(despues).toBe(150_000);
  });
});

describe('comisionesDelMes — caso Cristhian (multi-closer)', () => {
  // Cierre cerrado por Julian; seña la cobró Julian (marzo), cuota la cobró
  // Ayrton (mayo). Cada closer su pago.
  const cierres: Cierre[] = [mkCierre({ idCierre: 'C0113', closer: 'Julian', setter: 'Diego', fechaCierre: '2026-03-31' })];
  const pagos: Pago[] = [
    mkPago({ idPago: 'p0', idCierre: 'C0113', fechaPago: '2026-03-31', montoArs: 1_000_000, closer: undefined }), // hereda Julian
    mkPago({ idPago: 'p1', idCierre: 'C0113', fechaPago: '2026-05-04', montoArs: 2_000_000, closer: 'Ayrton' }),
  ];

  it('mayo: Ayrton 10% de su cuota; Julian no aparece', () => {
    const r = comisionesDelMes(cierres, pagos, '2026-05');
    expect(r.porPersona).toHaveLength(1);
    expect(r.porPersona[0]!.persona).toBe('Ayrton');
    expect(r.porPersona[0]!.comisionCloserArs).toBe(200_000);
    expect(r.totalArs).toBe(200_000);
  });

  it('marzo: Julian 10% de la seña', () => {
    const r = comisionesDelMes(cierres, pagos, '2026-03');
    expect(r.porPersona[0]!.persona).toBe('Julian');
    expect(r.porPersona[0]!.comisionCloserArs).toBe(100_000);
  });

  it('con setting en la cuota: Ayrton 10% + Diego (setter del cierre) 2%', () => {
    const pagosSetting = [pagos[0]!, { ...pagos[1]!, aplicaSetting: true }];
    const r = comisionesDelMes(cierres, pagosSetting, '2026-05');
    expect(r.porPersona.find((p) => p.persona === 'Ayrton')!.comisionCloserArs).toBe(200_000);
    expect(r.porPersona.find((p) => p.persona === 'Diego')!.comisionSetterArs).toBe(40_000);
    expect(r.totalArs).toBe(240_000);
  });

  it('cuenta pagos sin ARS del mes (para marcarlos)', () => {
    const conSinArs = [...pagos, mkPago({ idPago: 'x', idCierre: 'C0113', fechaPago: '2026-05-20', montoArs: undefined })];
    expect(comisionesDelMes(cierres, conSinArs, '2026-05').pagosSinArs).toBe(1);
  });
});

describe('porcentajes', () => {
  it('son 10% y 2%', () => {
    expect(PCT_CLOSER).toBe(0.1);
    expect(PCT_SETTER).toBe(0.02);
  });
});
