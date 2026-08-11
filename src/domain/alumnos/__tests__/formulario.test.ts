import { describe, it, expect } from 'vitest';
import { BLOQUES, PREGUNTA_POR_CAMPO, PREGUNTAS_FICHA, TEXTO_EMPUJE } from '../formulario';
import { CAMPOS_RESPUESTA, CAMPOS_MULTI } from '../tipos';
import { METRICAS_CLARIDAD } from '../claridad';

/**
 * El catálogo del formulario es la fuente de la que derivan la validación Zod
 * y el render. Estas guardas lo atan al resto del módulo: si alguien agrega,
 * saca o reordena una pregunta en un solo lado, esto se cae.
 */
describe('Formulario · el catálogo espeja la especificación', () => {
  const campos = BLOQUES.flatMap((b) => b.preguntas).map((p) => p.campo);

  it('8 bloques con las 45 respuestas, en el MISMO orden que el contrato', () => {
    expect(BLOQUES).toHaveLength(8);
    // Orden incluido: el listado de faltantes del índice sale en orden de
    // formulario, y ese orden lo define CAMPOS_RESPUESTA.
    expect(campos).toEqual([...CAMPOS_RESPUESTA]);
  });

  it('las preguntas con casilla son exactamente las 19 métricas del índice', () => {
    const conCasilla = BLOQUES.flatMap((b) => b.preguntas).filter((p) => p.nlc).map((p) => p.campo);
    expect([...conCasilla].sort()).toEqual([...METRICAS_CLARIDAD].sort());
  });

  it('toda opción/multi trae su lista de opciones, y los multi coinciden con CAMPOS_MULTI', () => {
    for (const p of BLOQUES.flatMap((b) => b.preguntas)) {
      if (p.tipo === 'opcion' || p.tipo === 'multi') {
        expect(p.opciones, `${p.campo} sin opciones`).toBeTruthy();
        expect(p.opciones!.length).toBeGreaterThan(1);
      }
    }
    const multi = BLOQUES.flatMap((b) => b.preguntas).filter((p) => p.tipo === 'multi').map((p) => p.campo);
    expect([...multi].sort()).toEqual([...CAMPOS_MULTI].sort());
  });

  it('el índice plano resuelve cualquier campo del contrato', () => {
    for (const campo of CAMPOS_RESPUESTA) expect(PREGUNTA_POR_CAMPO.get(campo)).toBeTruthy();
  });

  it('el bloque 0 público son los 5 complementos de ficha (sin nombre/programa/moneda)', () => {
    expect(PREGUNTAS_FICHA.map((p) => p.campo)).toEqual(['edad', 'zona', 'whatsapp', 'marca_comercial', 'canal_origen']);
  });

  it('el empujón a estimar existe y dice lo que tiene que decir', () => {
    expect(TEXTO_EMPUJE).toMatch(/mejor estimación/i);
    expect(TEXTO_EMPUJE).toMatch(/no lo tengo claro/i);
  });
});
