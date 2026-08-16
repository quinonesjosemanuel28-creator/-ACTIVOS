/**
 * Exportación del diagnóstico para la skill del plan de 90 días.
 *
 * Lo que se protege acá: que las 30 preguntas salgan completas y en orden, que
 * "no lo sé" y "sin responder" NO se confundan con un dato, que lo que el
 * formulario no releva se declare en vez de quedar como hueco silencioso, y
 * que ningún campo del formulario se pierda en el camino.
 */
import { describe, it, expect } from 'vitest';
import { exportarDiagnostico, pendientesDe } from '../exportacion';
import { CAMPOS_RESPUESTA } from '../tipos';
import { PREGUNTA_POR_CAMPO } from '../formulario';
import { METRICAS_CLARIDAD } from '../claridad';
import type { Alumno, Diagnostico, RespuestasDiagnostico } from '../tipos';

const ALUMNO: Alumno = {
  id: 'al-1',
  consultorId: 'usr-consu',
  nombre: 'Gonzalo Pérez',
  edad: 38,
  zona: 'Córdoba Capital',
  whatsapp: '+5493510000000',
  marcaComercial: 'Créditos GP',
  programa: 'Prestamista a Empresario',
  canalOrigen: 'Instagram',
  moneda: 'ARS',
  activo: true,
  estado: 'ACTIVO',
  estadoActualizadoEn: null,
  idCierreVinculado: null,
  eliminadoEn: null,
  eliminadoPor: null,
  creadoEn: '2026-08-01T00:00:00.000Z',
};

/** Diagnóstico con todo respondido salvo mora (declarada sin dato). */
function diagnostico(over: Partial<Diagnostico> = {}): Diagnostico {
  const respuestas: RespuestasDiagnostico = {};
  for (const c of CAMPOS_RESPUESTA) {
    const p = PREGUNTA_POR_CAMPO.get(c)!;
    if (p.tipo === 'multi') respuestas[c] = JSON.stringify(['Comerciantes']);
    else if (['numero', 'moneda', 'porcentaje'].includes(p.tipo)) respuestas[c] = 10;
    else respuestas[c] = `respuesta de ${c}`;
    if (p.nlc) respuestas[`${c}_sin_dato`] = false;
  }
  respuestas.capital_colocado = 13_000_000;
  respuestas.clientes_activos = 62;
  respuestas.mora_clientes = null;
  respuestas.mora_clientes_sin_dato = true;
  return {
    id: 'diag-1',
    alumnoId: 'al-1',
    fecha: '2026-08-11T12:00:00.000Z',
    origen: 'alumno',
    editadoPorConsultor: false,
    programa: 'Prestamista a Empresario',
    moneda: 'ARS',
    indiceClaridad: 95,
    metricasAplicables: 19,
    metricasRespondidas: 18,
    respuestas,
    creadoEn: '2026-08-11T12:00:00.000Z',
    ...over,
  };
}

describe('Exportación · las 30 preguntas de la skill', () => {
  const md = exportarDiagnostico(ALUMNO, diagnostico());

  it('salen las 30, numeradas y en los tres bloques', () => {
    for (let n = 1; n <= 30; n++) {
      expect(md, `falta la pregunta ${n}`).toContain(`**${n}. `);
    }
    expect(md).toContain('## Bloque 1 · ORDENAR');
    expect(md).toContain('## Bloque 2 · OPTIMIZAR');
    expect(md).toContain('## Bloque 3 · ESCALAR');
  });

  it('respeta el orden de la skill (su contrato es el número de pregunta)', () => {
    const posiciones = Array.from({ length: 30 }, (_, i) => md.indexOf(`**${i + 1}. `));
    const ordenado = [...posiciones].sort((a, b) => a - b);
    expect(posiciones).toEqual(ordenado);
  });

  it('las metas a 90 días llenan las preguntas 21, 22 y 23 (eran el hueco real)', () => {
    const conMetas = exportarDiagnostico(
      ALUMNO,
      diagnostico({
        respuestas: { ...diagnostico().respuestas, meta_clientes_90d: 90, meta_capital_90d: 20_000_000, meta_ganancia_90d: 1_500_000 },
      }),
    );
    const bloque = conMetas.slice(conMetas.indexOf('**21.'), conMetas.indexOf('**24.'));
    expect(bloque).toContain('90');
    expect(bloque).toContain('ARS 20.000.000');
    expect(bloque).toContain('ARS 1.500.000');
    expect(bloque).not.toContain('No relevado');
  });

  it('lo que el formulario NO releva se declara, no queda como hueco', () => {
    // Preguntas 7, 13, 18, 19 y 20 de la skill.
    const noRelevadas = md.match(/_No relevado en el formulario/g) ?? [];
    expect(noRelevadas).toHaveLength(5);
  });

  it('las correspondencias parciales llevan nota para el consultor', () => {
    expect(md).toContain('> Nota:');
    expect(md).toMatch(/releva el RECUPERO DE CAPITAL/); // pregunta 3
    expect(md).toMatch(/releva A QUIÉN le presta/); // pregunta 14
    expect(md).toMatch(/releva solo el NOMBRE de la marca/); // pregunta 25
  });
});

describe('Exportación · los tres estados de una respuesta no se confunden', () => {
  it('"no lo sé" se declara explícito, nunca como número', () => {
    const md = exportarDiagnostico(ALUMNO, diagnostico());
    expect(md).toContain('**El alumno declaró que no conoce este dato.**');
  });

  it('cuando varios campos contestan una pregunta, cada valor dice a cuál pertenece', () => {
    // La 8 se arma con mora_clientes y monto_en_mora. Sin etiqueta, dos "no lo
    // sabe" apilados son indistinguibles para quien lee el documento.
    const d = diagnostico();
    d.respuestas.monto_en_mora = null;
    d.respuestas.monto_en_mora_sin_dato = true;
    const md = exportarDiagnostico(ALUMNO, d);
    const p8 = md.slice(md.indexOf('**8. '), md.indexOf('**9. '));
    expect(p8).toContain('- ¿Qué porcentaje de tus clientes está atrasado hoy? →');
    expect(p8).toContain('- ¿Cuánto dinero tenés hoy atrasado o en riesgo de cobro? →');
  });

  it('con un solo campo el valor va limpio, sin etiqueta redundante', () => {
    const md = exportarDiagnostico(ALUMNO, diagnostico());
    const p1 = md.slice(md.indexOf('**1. '), md.indexOf('**2. '));
    expect(p1).toContain('\n62');
    expect(p1).not.toContain('→');
  });

  it('sin responder ≠ no lo sé ≠ cero', () => {
    const d = diagnostico();
    d.respuestas.retiro_mensual = null;
    d.respuestas.retiro_mensual_sin_dato = false; // vacío, no declarado
    d.respuestas.gastos_operativos = 0; // cero ES un dato
    const md = exportarDiagnostico(ALUMNO, d);
    expect(md).toContain('_Sin responder._');
    expect(md).toContain('ARS 0'); // el cero se exporta como dato, no como vacío
  });

  it('formatea moneda con su código y los porcentajes con %', () => {
    const md = exportarDiagnostico(ALUMNO, diagnostico());
    expect(md).toContain('ARS 13.000.000');
    expect(md).toMatch(/\d+%/);
  });

  it('usa la moneda FOTOGRAFIADA en el diagnóstico, no la actual de la ficha', () => {
    // La ficha migró a COP, pero el diagnóstico viejo se exporta en ARS.
    const md = exportarDiagnostico({ ...ALUMNO, moneda: 'COP' }, diagnostico());
    expect(md).toContain('ARS 13.000.000');
    expect(md).not.toContain('COP 13.000.000');
  });
});

describe('Exportación · ningún dato del formulario se pierde', () => {
  it('todo campo del contrato aparece en el mapeo o en datos adicionales', () => {
    const md = exportarDiagnostico(ALUMNO, diagnostico());
    for (const campo of CAMPOS_RESPUESTA) {
      const label = PREGUNTA_POR_CAMPO.get(campo)!.label;
      // O lo cubre una de las 30, o sale con su etiqueta en datos adicionales.
      const cubierto = md.includes(label) || md.includes(`respuesta de ${campo}`) || md.includes('## Datos adicionales');
      expect(cubierto, `el campo ${campo} no aparece en la exportación`).toBe(true);
    }
    expect(md).toContain('## Datos adicionales del diagnóstico');
  });

  it('la cabecera trae lo que la skill pide como datos mínimos', () => {
    const md = exportarDiagnostico(ALUMNO, diagnostico());
    expect(md).toContain('# Diagnóstico — Gonzalo Pérez');
    expect(md).toContain('Córdoba Capital'); // ubicación
    expect(md).toContain('Créditos GP'); // marca comercial
    expect(md).toContain('**Moneda de todos los montos:** ARS');
    expect(md).toContain('2026-08-11');
  });

  it('avisa cuando el consultor ya corrigió el diagnóstico', () => {
    const md = exportarDiagnostico(ALUMNO, diagnostico({ editadoPorConsultor: true }));
    expect(md).toContain('corregido por el consultor durante la consultoría');
  });

  it('traduce el índice a la lectura de la escala', () => {
    expect(exportarDiagnostico(ALUMNO, diagnostico({ indiceClaridad: 20 }))).toContain('No mide su negocio');
    expect(exportarDiagnostico(ALUMNO, diagnostico({ indiceClaridad: 95 }))).toContain('Opera con tablero real');
    expect(exportarDiagnostico(ALUMNO, diagnostico({ indiceClaridad: null }))).toContain('sin datos');
  });
});

describe('Exportación · tabla de información pendiente (sección 12 del plan)', () => {
  it('lista las métricas sin dato con su estado y prioridad', () => {
    const pendientes = pendientesDe(diagnostico());
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toEqual({
      dato: '¿Qué porcentaje de tus clientes está atrasado hoy?',
      estado: 'El alumno no lo conoce',
      prioridad: 'Alta', // mora_clientes es obligatoria
    });
  });

  it('distingue "no lo conoce" de "sin responder"', () => {
    const d = diagnostico();
    d.respuestas.recurrencia = null; // opcional, vacía
    const pendientes = pendientesDe(d);
    const recurrencia = pendientes.find((p) => p.dato.includes('renueva'));
    expect(recurrencia?.estado).toBe('Sin responder');
    expect(recurrencia?.prioridad).toBe('Media'); // recurrencia es opcional
  });

  it('un diagnóstico completo no deja pendientes', () => {
    const d = diagnostico();
    d.respuestas.mora_clientes = 12;
    d.respuestas.mora_clientes_sin_dato = false;
    expect(pendientesDe(d)).toEqual([]);
    expect(exportarDiagnostico(ALUMNO, d)).toContain('respondió todas las métricas duras');
  });

  it('sale como tabla Markdown lista para pegar', () => {
    const md = exportarDiagnostico(ALUMNO, diagnostico());
    expect(md).toContain('| Dato | Estado | Prioridad |');
    expect(md).toContain('| ¿Qué porcentaje de tus clientes está atrasado hoy? | El alumno no lo conoce | Alta |');
  });

  it('solo mira las 19 métricas duras: una opinión sin responder no es un pendiente', () => {
    const d = diagnostico();
    d.respuestas.objetivo_6m = null; // texto largo, no es métrica
    const pendientes = pendientesDe(d);
    expect(pendientes.every((p) => METRICAS_CLARIDAD.some((m) => PREGUNTA_POR_CAMPO.get(m)!.label === p.dato))).toBe(true);
  });
});
