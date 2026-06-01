import { describe, it, expect } from 'vitest';
import {
  tasaShow,
  tasaCierre,
  tasaGlobal,
  valorPorAgenda,
  valorPorShow,
  tieneCargaManual,
} from '../metrics';

describe('Funnel · tasas', () => {
  const f = { agendas: 100, asistieron: 60, cerrados: 18 };
  it('tasa de show = asistieron / agendas', () => {
    expect(tasaShow(f)).toBeCloseTo(0.6);
  });
  it('tasa de cierre = cerrados / asistieron', () => {
    expect(tasaCierre(f)).toBeCloseTo(0.3);
  });
  it('tasa global = cerrados / agendas', () => {
    expect(tasaGlobal(f)).toBeCloseTo(0.18);
  });

  it('división por cero → null (sin agendas/shows no inventa)', () => {
    expect(tasaShow({ agendas: 0, asistieron: 0, cerrados: 18 })).toBeNull();
    expect(tasaCierre({ agendas: 0, asistieron: 0, cerrados: 18 })).toBeNull();
    expect(tasaGlobal({ agendas: 0, asistieron: 0, cerrados: 18 })).toBeNull();
  });
});

describe('Funnel · valor por agenda / show', () => {
  it('valor por agenda = cash nuevo / agendas', () => {
    expect(valorPorAgenda(18000, 100)).toBe(180);
  });
  it('valor por show = cash nuevo / shows', () => {
    expect(valorPorShow(18000, 60)).toBe(300);
  });
  it('sin agendas/shows → null', () => {
    expect(valorPorAgenda(18000, 0)).toBeNull();
    expect(valorPorShow(18000, 0)).toBeNull();
  });
});

describe('Funnel · carga manual', () => {
  it('detecta si hay agendas o shows cargados', () => {
    expect(tieneCargaManual({ agendas: 0, asistieron: 0, cerrados: 18 })).toBe(false);
    expect(tieneCargaManual({ agendas: 50, asistieron: 0, cerrados: 18 })).toBe(true);
  });
});
