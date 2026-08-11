import { describe, it, expect } from 'vitest';
import {
  aplica,
  calcularClaridad,
  METRICAS_CLARIDAD,
  nivelClaridad,
  respondida,
  type RespuestasClaridad,
} from '../claridad';

/** Diagnóstico con las 19 métricas respondidas con un número/texto válido. */
function todoRespondido(): Record<string, unknown> {
  const r: Record<string, unknown> = {
    origen_capital: 'Mixto',
    firma_documentacion: 'Sí, contrato y pagaré',
  };
  for (const m of METRICAS_CLARIDAD) {
    // Las 3 de texto del bloque 4 van con texto; el resto con número.
    r[m] = ['tasa_declarada', 'punitorio', 'tasa_competencia'].includes(m) ? '10% mensual' : 1;
    r[`${m}_sin_dato`] = false;
  }
  return r;
}

describe('Alumnos · las 19 métricas duras', () => {
  it('son exactamente 19 y no hay repetidas', () => {
    expect(METRICAS_CLARIDAD).toHaveLength(19);
    expect(new Set(METRICAS_CLARIDAD).size).toBe(19);
  });

  it('incluye las 3 de texto del bloque 4 (el dato es duro aunque la respuesta sea texto)', () => {
    for (const m of ['tasa_declarada', 'punitorio', 'tasa_competencia'] as const) {
      expect(METRICAS_CLARIDAD).toContain(m);
    }
  });
});

describe('Alumnos · qué cuenta como respondida', () => {
  it('un valor cargado y la casilla sin marcar cuenta', () => {
    expect(respondida('capital_colocado', { capital_colocado: 500000, capital_colocado_sin_dato: false })).toBe(true);
  });

  it('la casilla marcada MANDA, aunque haya quedado un valor cargado', () => {
    // El alumno tipeó un número y después marcó "no lo tengo claro": su
    // declaración gana. Si no, un valor viejo del formulario inflaría el índice.
    expect(respondida('capital_colocado', { capital_colocado: 500000, capital_colocado_sin_dato: true })).toBe(false);
  });

  it('null, undefined y texto en blanco no son respuestas', () => {
    expect(respondida('capital_colocado', { capital_colocado: null })).toBe(false);
    expect(respondida('capital_colocado', {})).toBe(false);
    expect(respondida('tasa_declarada', { tasa_declarada: '   ' })).toBe(false);
  });

  it('CERO sí es una respuesta: "no tengo mora" es un dato', () => {
    // La distinción que sostiene todo el índice: mora en 0 es una cartera sana;
    // mora sin dato es un alumno que no mide. No se pueden guardar igual.
    expect(respondida('mora_clientes', { mora_clientes: 0, mora_clientes_sin_dato: false })).toBe(true);
    expect(respondida('mora_clientes', { mora_clientes: null, mora_clientes_sin_dato: true })).toBe(false);
  });

  it('NaN no cuenta (un número roto no es un dato)', () => {
    expect(respondida('capital_colocado', { capital_colocado: NaN })).toBe(false);
  });
});

describe('Alumnos · aplicabilidad (las que no aplican salen del denominador)', () => {
  it('con capital propio, el costo del capital de terceros NO aplica', () => {
    expect(aplica('costo_capital_mensual', { origen_capital: 'Propio' })).toBe(false);
    expect(aplica('costo_capital_mensual', { origen_capital: 'Mixto' })).toBe(true);
    expect(aplica('costo_capital_mensual', { origen_capital: 'De terceros' })).toBe(true);
  });

  it('quien presta de palabra no documenta: el porcentaje documentado NO aplica', () => {
    expect(aplica('porcentaje_documentado', { firma_documentacion: 'No, presto de palabra' })).toBe(false);
    expect(aplica('porcentaje_documentado', { firma_documentacion: 'Solo pagaré' })).toBe(true);
  });

  it('el resto de las métricas le aplica a todo el mundo', () => {
    const sinCondicion = METRICAS_CLARIDAD.filter(
      (m) => m !== 'costo_capital_mensual' && m !== 'porcentaje_documentado',
    );
    for (const m of sinCondicion) expect(aplica(m, {})).toBe(true);
  });

  it('no penaliza al alumno de capital propio: 18/18 da 100%, no 18/19', () => {
    const r = { ...todoRespondido(), origen_capital: 'Propio', costo_capital_mensual: null };
    const out = calcularClaridad(r);
    expect(out.aplicables).toBe(18);
    expect(out.respondidas).toBe(18);
    expect(out.indice).toBe(100);
    expect(out.faltantes).toEqual([]);
  });
});

describe('Alumnos · índice de claridad', () => {
  it('todo respondido → 100', () => {
    const out = calcularClaridad(todoRespondido());
    expect(out.aplicables).toBe(19);
    expect(out.respondidas).toBe(19);
    expect(out.indice).toBe(100);
  });

  it('formulario vacío → null, NUNCA 0', () => {
    // Cero significaría "midió y le dio cero". Un formulario vacío es otra
    // cosa: todavía no sabemos nada del alumno.
    const out = calcularClaridad({});
    expect(out.indice).toBeNull();
    expect(out.respondidas).toBe(0);
    expect(out.aplicables).toBe(19);
  });

  it('todas marcadas "no lo tengo claro" → null, no 0', () => {
    const r: Record<string, unknown> = {};
    for (const m of METRICAS_CLARIDAD) r[`${m}_sin_dato`] = true;
    expect(calcularClaridad(r).indice).toBeNull();
  });

  it('devuelve un entero redondeado (4 de 19 = 21%)', () => {
    const r: Record<string, unknown> = {};
    for (const m of METRICAS_CLARIDAD.slice(0, 4)) r[m] = 1;
    const out = calcularClaridad(r);
    expect(out.respondidas).toBe(4);
    expect(out.aplicables).toBe(19);
    expect(out.indice).toBe(21); // 21.05… redondeado
    expect(Number.isInteger(out.indice)).toBe(true);
  });

  it('lista las faltantes en orden de formulario (es el guion de la llamada)', () => {
    const r = todoRespondido();
    r.mora_clientes_sin_dato = true;
    r.capital_colocado_sin_dato = true;
    const out = calcularClaridad(r);
    // capital_colocado es del bloque 2 y mora_clientes del 6: ese es el orden.
    expect(out.faltantes).toEqual(['capital_colocado', 'mora_clientes']);
    expect(out.respondidas).toBe(17);
  });

  it('una métrica que no aplica no aparece como faltante', () => {
    const out = calcularClaridad({ origen_capital: 'Propio', firma_documentacion: 'No, presto de palabra' });
    expect(out.faltantes).not.toContain('costo_capital_mensual');
    expect(out.faltantes).not.toContain('porcentaje_documentado');
    expect(out.aplicables).toBe(17);
    expect(out.faltantes).toHaveLength(17);
  });

  it('el caso del documento: 4 de 18 da 22%', () => {
    const r: Record<string, unknown> = { origen_capital: 'Propio' };
    for (const m of METRICAS_CLARIDAD.filter((x) => x !== 'costo_capital_mensual').slice(0, 4)) r[m] = 1;
    const out = calcularClaridad(r);
    expect(out.aplicables).toBe(18);
    expect(out.respondidas).toBe(4);
    expect(out.indice).toBe(22);
  });
});

describe('Alumnos · escala de lectura del consultor', () => {
  it('respeta los cortes del documento', () => {
    expect(nivelClaridad(0)).toBe('no_mide');
    expect(nivelClaridad(30)).toBe('no_mide');
    expect(nivelClaridad(31)).toBe('parcial');
    expect(nivelClaridad(60)).toBe('parcial');
    expect(nivelClaridad(61)).toBe('conoce');
    expect(nivelClaridad(85)).toBe('conoce');
    expect(nivelClaridad(86)).toBe('tablero');
    expect(nivelClaridad(100)).toBe('tablero');
  });

  it('sin índice no hay nivel: no se puede leer lo que no se midió', () => {
    expect(nivelClaridad(null)).toBeNull();
  });

  it('el índice de un diagnóstico real se puede leer de punta a punta', () => {
    const out = calcularClaridad(todoRespondido());
    expect(nivelClaridad(out.indice)).toBe('tablero');
  });
});

describe('Alumnos · el resultado alimenta la sección 12 del plan', () => {
  it('faltantes son las que van a la tabla de información pendiente', () => {
    const r = todoRespondido();
    for (const m of ['ganancia_mensual', 'monto_en_mora'] as const) r[`${m}_sin_dato`] = true;
    const { faltantes } = calcularClaridad(r as RespuestasClaridad);
    expect(faltantes).toEqual(['ganancia_mensual', 'monto_en_mora']);
  });
});
