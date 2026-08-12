/**
 * El bloque del plan (CONTRATO-PLAN.md): extracción de lo pegado, validación
 * estructural y advertencias. La filosofía bajo test: carga tolerante (lo
 * desconocido no rompe), previa ruidosa (lo desconocido SE VE).
 */
import { describe, it, expect } from 'vitest';
import { advertenciasDe, bloquePlanSchema, extraerBloque, type BloquePlan } from '../planSchemas';

function bloqueValido(): Record<string, unknown> {
  return {
    version: 1,
    alumno: 'Gonzalo Pérez',
    fecha_inicio: '2026-08-18',
    etapa: 'Prestamista Operativo',
    objetivo_90d: 'Ordenar para crecer sin sumar mora.',
    okrs: [
      { orden: 1, objetivo: 'Ordenar la administración', krs: [{ texto: 'Tablero único', meta: '100%' }] },
      { orden: 2, objetivo: 'Profesionalizar cobranzas', krs: [{ texto: 'Protocolo por tramos' }] },
    ],
    fases: [
      { fase: 1, titulo: 'Ordenar', acciones: [{ texto: 'Armar el tablero', okr: 1 }, { texto: 'Separar cuentas', okr: 1 }, { texto: 'Cargar créditos vigentes', okr: 1 }] },
      { fase: 2, titulo: 'Optimizar', acciones: [{ texto: 'Escribir protocolo', okr: 2 }, { texto: 'Llamar morosos', okr: 2 }, { texto: 'Cierre semanal', okr: 1 }] },
      { fase: 3, titulo: 'Escalar', acciones: [{ texto: 'Pedir referidos', okr: 2 }, { texto: 'Definir tope por cliente', okr: 2 }, { texto: 'Revisar mora antes de colocar', okr: 2 }] },
    ],
  };
}

describe('Plan · extraerBloque (lo que sea que el consultor pegue)', () => {
  const json = JSON.stringify(bloqueValido());

  it('el JSON pelado', () => {
    expect(extraerBloque(json)).toBeTruthy();
  });

  it('el bloque cercado con ```json', () => {
    expect(extraerBloque('```json\n' + json + '\n```')).toBeTruthy();
  });

  it('el bloque rodeado de prosa del chat (copió de más)', () => {
    const pegado = `Acá tenés el plan de Gonzalo.\n\n${json}\n\nCualquier cosa avisame.`;
    expect(extraerBloque(pegado)).toBeTruthy();
  });

  it('texto sin JSON → null', () => {
    expect(extraerBloque('esto no tiene nada')).toBeNull();
    expect(extraerBloque('')).toBeNull();
    expect(extraerBloque('[1,2,3]')).toBeNull(); // un array no es el bloque
  });
});

describe('Plan · validación estructural (lo que SÍ frena la carga)', () => {
  it('el bloque del contrato pasa', () => {
    expect(() => bloquePlanSchema.parse(bloqueValido())).not.toThrow();
  });

  it('versión desconocida → error claro', () => {
    const r = bloquePlanSchema.safeParse({ ...bloqueValido(), version: 2 });
    expect(r.success).toBe(false);
  });

  it('fases tienen que ser exactamente 1, 2 y 3', () => {
    const dos = bloqueValido();
    (dos.fases as unknown[]).pop();
    expect(bloquePlanSchema.safeParse(dos).success).toBe(false);

    const repetida = bloqueValido();
    (repetida.fases as { fase: number }[])[2]!.fase = 1;
    expect(bloquePlanSchema.safeParse(repetida).success).toBe(false);
  });

  it('OKRs con orden repetido → error', () => {
    const b = bloqueValido();
    (b.okrs as { orden: number }[])[1]!.orden = 1;
    expect(bloquePlanSchema.safeParse(b).success).toBe(false);
  });

  it('una acción que apunta a un OKR inexistente → error (regla del contrato)', () => {
    const b = bloqueValido();
    (b.fases as { acciones: { okr?: number }[] }[])[0]!.acciones[0]!.okr = 9;
    const r = bloquePlanSchema.safeParse(b);
    expect(r.success).toBe(false);
  });

  it('más de 8 OKRs → error', () => {
    const b = bloqueValido();
    b.okrs = Array.from({ length: 9 }, (_, i) => ({ orden: i + 1, objetivo: `O${i}`, krs: [{ texto: 'k' }] }));
    expect(bloquePlanSchema.safeParse(b).success).toBe(false);
  });
});

describe('Plan · advertencias (lo que NO frena pero se tiene que VER)', () => {
  const parsear = (crudo: Record<string, unknown>): BloquePlan => bloquePlanSchema.parse(crudo);

  it('claves fuera del contrato se reportan con nombre (no se descartan en silencio)', () => {
    const crudo = { ...bloqueValido(), modelos_economicos: [{ escenario: 'conservador' }], notas: 'x' };
    const avisos = advertenciasDe(crudo, parsear(crudo), 'Gonzalo Pérez');
    const aviso = avisos.find((a) => a.includes('contrato no define'));
    expect(aviso).toBeTruthy();
    expect(aviso).toContain('modelos_economicos');
    expect(aviso).toContain('notas');
    expect(aviso).toContain('CONTRATO-PLAN.md');
  });

  it('nombre que no coincide con la ficha se advierte', () => {
    const crudo = bloqueValido();
    const avisos = advertenciasDe(crudo, parsear(crudo), 'Marta López');
    expect(avisos.some((a) => a.includes('Verificá que sea el plan correcto'))).toBe(true);
  });

  it('acentos y mayúsculas NO cuentan como diferencia de nombre', () => {
    const crudo = bloqueValido();
    const avisos = advertenciasDe(crudo, parsear(crudo), 'gonzalo perez');
    expect(avisos.some((a) => a.includes('plan correcto'))).toBe(false);
  });

  it('fase con menos de 3 acciones se advierte, no se bloquea', () => {
    const crudo = bloqueValido();
    (crudo.fases as { acciones: unknown[] }[])[2]!.acciones = [{ texto: 'Única acción' }];
    const bloque = parsear(crudo);
    expect(advertenciasDe(crudo, bloque, 'Gonzalo Pérez').some((a) => a.includes('fase 3') && a.includes('sugiere 3 a 8'))).toBe(true);
  });

  it('una acción de más de 120 caracteres se advierte', () => {
    const crudo = bloqueValido();
    (crudo.fases as { acciones: { texto: string }[] }[])[0]!.acciones[0]!.texto = 'x'.repeat(130);
    const bloque = parsear(crudo);
    expect(advertenciasDe(crudo, bloque, 'Gonzalo Pérez').some((a) => a.includes('120 caracteres'))).toBe(true);
  });

  it('un OKR sin ninguna acción asociada se advierte', () => {
    const crudo = bloqueValido();
    (crudo.okrs as unknown[]).push({ orden: 3, objetivo: 'OKR huérfano', krs: [{ texto: 'k' }] });
    const bloque = parsear(crudo);
    expect(advertenciasDe(crudo, bloque, 'Gonzalo Pérez').some((a) => a.includes('OKR 3') && a.includes('ninguna acción'))).toBe(true);
  });

  it('el bloque canónico del contrato no genera NINGUNA advertencia', () => {
    const crudo = bloqueValido();
    expect(advertenciasDe(crudo, parsear(crudo), 'Gonzalo Pérez')).toEqual([]);
  });
});
