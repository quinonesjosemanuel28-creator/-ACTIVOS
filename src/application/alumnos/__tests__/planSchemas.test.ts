/**
 * El bloque del plan (CONTRATO-PLAN.md): extracción de lo pegado, validación
 * estructural y advertencias. La filosofía bajo test: carga tolerante (lo
 * desconocido no rompe), previa ruidosa (lo desconocido SE VE).
 *
 * Ticket 9 · contrato v3: los KRs vienen tipados. El paquete métrico
 * incompleto es error ESTRUCTURAL (una métrica que no puede medirse es una
 * promesa incumplible); el entregable que ninguna acción referencia es
 * ADVERTENCIA (carga, pero el consultor lo tiene que ver). Y el contrato es
 * aditivo: los bloques anteriores — sin tipo, sin kr — siguen valiendo.
 */
import { describe, it, expect } from 'vitest';
import { advertenciasDe, bloquePlanSchema, extraerBloque, type BloquePlan } from '../planSchemas';

/** El ejemplo canónico de CONTRATO-PLAN.md, espejado tal cual (v3). */
function bloqueValido(): Record<string, unknown> {
  return {
    version: 1,
    alumno: 'Gonzalo Pérez',
    fecha_inicio: '2026-08-18',
    etapa: 'Prestamista Operativo',
    objetivo_90d: 'Ordenar la administración y la cobranza para poder crecer sin sumar mora.',
    okrs: [
      {
        orden: 1,
        objetivo: 'Ordenar la administración financiera',
        krs: [
          { texto: 'Tablero único con todos los créditos cargados', meta: '100% de la cartera', tipo: 'entregable' },
          { texto: 'Separar la caja del negocio de la personal', meta: '2 cuentas distintas', tipo: 'entregable' },
        ],
      },
      {
        orden: 2,
        objetivo: 'Profesionalizar las cobranzas',
        krs: [
          { texto: 'Protocolo de cobranza por tramos', meta: 'escrito y aplicado', tipo: 'entregable' },
          { texto: 'Bajar la mora de la cartera', meta: 'por debajo del 10%', tipo: 'metrica', valor_inicial: 20, meta_30: 16, meta_60: 13, meta_90: 10, unidad: '%', direccion: 'baja' },
        ],
      },
      {
        orden: 3,
        objetivo: 'Escalar la cartera de forma controlada',
        krs: [
          { texto: 'Sumar clientes nuevos por referido calificado', meta: '28 clientes nuevos', tipo: 'metrica', valor_inicial: 0, meta_30: 6, meta_60: 16, meta_90: 28, unidad: 'clientes', direccion: 'sube' },
        ],
      },
    ],
    fases: [
      { fase: 1, titulo: 'Ordenar', acciones: [
        { texto: 'Armar el tablero en Sheets con las columnas mínimas', okr: 1, kr: 1 },
        { texto: 'Abrir una cuenta bancaria solo para el negocio', okr: 1, kr: 2 },
        { texto: 'Cargar los créditos vigentes en el tablero', okr: 1, kr: 1 },
      ] },
      { fase: 2, titulo: 'Optimizar', acciones: [
        { texto: 'Escribir el protocolo de cobranza por tramos', okr: 2, kr: 1 },
        { texto: 'Llamar a todos los morosos de más de 30 días', okr: 2, kr: 2 },
        { texto: 'Hacer el cierre financiero todos los viernes', okr: 1, kr: 1 },
      ] },
      { fase: 3, titulo: 'Escalar', acciones: [
        { texto: 'Pedir referidos a los 10 mejores clientes', okr: 3, kr: 1 },
        { texto: 'Definir el monto máximo por cliente nuevo', okr: 3 },
        { texto: 'Revisar la mora antes de colocar capital nuevo', okr: 2, kr: 2 },
      ] },
    ],
  };
}

/** Un bloque de ANTES de los tickets 8 y 9: sin `kr` y sin `tipo`. */
function bloqueViejo(): Record<string, unknown> {
  return {
    version: 1,
    alumno: 'Gonzalo Pérez',
    fecha_inicio: '2026-08-18',
    okrs: [
      { orden: 1, objetivo: 'Ordenar la administración', krs: [{ texto: 'Tablero único', meta: '100%' }] },
      { orden: 2, objetivo: 'Profesionalizar cobranzas', krs: [{ texto: 'Protocolo por tramos' }] },
    ],
    fases: [
      { fase: 1, acciones: [{ texto: 'Armar el tablero', okr: 1 }, { texto: 'Separar cuentas', okr: 1 }, { texto: 'Cargar créditos vigentes', okr: 1 }] },
      { fase: 2, acciones: [{ texto: 'Escribir protocolo', okr: 2 }, { texto: 'Llamar morosos', okr: 2 }, { texto: 'Cierre semanal', okr: 1 }] },
      { fase: 3, acciones: [{ texto: 'Pedir referidos', okr: 2 }, { texto: 'Definir tope por cliente', okr: 2 }, { texto: 'Revisar mora', okr: 2 }] },
    ],
  };
}

/** Localiza la métrica "Bajar la mora" del fixture para mutarla. */
function moraDe(b: Record<string, unknown>): Record<string, unknown> {
  return (b.okrs as { krs: Record<string, unknown>[] }[])[1]!.krs[1]!;
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
  it('el bloque canónico del contrato pasa', () => {
    expect(() => bloquePlanSchema.parse(bloqueValido())).not.toThrow();
  });

  it('el bloque viejo (sin tipo, sin kr) sigue pasando: el contrato es aditivo', () => {
    expect(bloquePlanSchema.safeParse(bloqueViejo()).success).toBe(true);
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

  it('"kr" sin "okr" → error: la posición no dice nada sin saber de qué OKR', () => {
    const b = bloqueValido();
    (b.fases as { acciones: Record<string, unknown>[] }[])[0]!.acciones[0] = { texto: 'Huérfana', kr: 1 };
    expect(bloquePlanSchema.safeParse(b).success).toBe(false);
  });

  it('"kr" que apunta a una posición que el OKR no tiene → error', () => {
    const b = bloqueValido();
    (b.fases as { acciones: { kr?: number }[] }[])[0]!.acciones[0]!.kr = 5; // el OKR 1 tiene 2 KRs
    expect(bloquePlanSchema.safeParse(b).success).toBe(false);
  });

  // ── Ticket 9 · el paquete métrico es estructural ──

  it.each(['valor_inicial', 'meta_90', 'unidad', 'direccion'] as const)(
    'una métrica sin %s → error estructural, no advertencia',
    (campo) => {
      const b = bloqueValido();
      delete moraDe(b)[campo];
      const r = bloquePlanSchema.safeParse(b);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes(campo))).toBe(true);
      }
    },
  );

  it('los valores de una métrica van como número: "20" entre comillas → error', () => {
    const b = bloqueValido();
    moraDe(b).valor_inicial = '20';
    expect(bloquePlanSchema.safeParse(b).success).toBe(false);
  });

  it('direccion fuera de sube/baja → error', () => {
    const b = bloqueValido();
    moraDe(b).direccion = 'mejora';
    expect(bloquePlanSchema.safeParse(b).success).toBe(false);
  });

  it('tipo desconocido → error', () => {
    const b = bloqueValido();
    moraDe(b).tipo = 'porcentaje';
    expect(bloquePlanSchema.safeParse(b).success).toBe(false);
  });

  it('un entregable NO exige el paquete métrico', () => {
    const b = bloqueValido();
    const protocolo = (b.okrs as { krs: Record<string, unknown>[] }[])[1]!.krs[0]!;
    expect(protocolo.tipo).toBe('entregable');
    expect(protocolo.valor_inicial).toBeUndefined();
    expect(bloquePlanSchema.safeParse(b).success).toBe(true);
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
    (crudo.okrs as unknown[]).push({ orden: 4, objetivo: 'OKR huérfano', krs: [{ texto: 'k', tipo: 'entregable' }] });
    const bloque = parsear(crudo);
    expect(advertenciasDe(crudo, bloque, 'Gonzalo Pérez').some((a) => a.includes('OKR 4') && a.includes('ninguna acción'))).toBe(true);
  });

  // ── Ticket 9 · coherencia del cierre automático ──

  it('un entregable que ninguna acción referencia se nombra: no va a poder cerrarse nunca', () => {
    const crudo = bloqueValido();
    // La única acción que referenciaba el protocolo (2:1) pierde su kr.
    (crudo.fases as { acciones: Record<string, unknown>[] }[])[1]!.acciones[0] = { texto: 'Escribir el protocolo de cobranza por tramos', okr: 2 };
    const avisos = advertenciasDe(crudo, parsear(crudo), 'Gonzalo Pérez');
    const aviso = avisos.find((a) => a.includes('no va a poder cerrarse nunca'));
    expect(aviso).toBeTruthy();
    expect(aviso).toContain('Protocolo de cobranza por tramos');
    expect(aviso).toContain('OKR 2');
  });

  it('bloque viejo sin ninguna referencia kr → UN solo aviso agregado, no uno por KR', () => {
    const crudo = bloqueViejo();
    const avisos = advertenciasDe(crudo, parsear(crudo), 'Gonzalo Pérez');
    expect(avisos.filter((a) => a.includes('cerrarse'))).toHaveLength(1);
    expect(avisos.some((a) => a.includes('Ninguna acción referencia KRs'))).toBe(true);
    expect(avisos.some((a) => a.includes('no va a poder cerrarse nunca'))).toBe(false);
  });

  it('una métrica sin meta_30/meta_60 se advierte: el alumno no ve tramos', () => {
    const crudo = bloqueValido();
    delete moraDe(crudo).meta_30;
    delete moraDe(crudo).meta_60;
    const avisos = advertenciasDe(crudo, parsear(crudo), 'Gonzalo Pérez');
    expect(avisos.some((a) => a.includes('meta_30/meta_60') && a.includes('Bajar la mora'))).toBe(true);
  });

  it('más de la mitad de los KRs como métrica → se advierte la proporción', () => {
    const crudo = bloqueValido();
    const paquete = { tipo: 'metrica', valor_inicial: 0, meta_30: 1, meta_60: 2, meta_90: 3, unidad: 'u', direccion: 'sube' };
    const okr1 = (crudo.okrs as { krs: Record<string, unknown>[] }[])[0]!;
    okr1.krs[0] = { texto: 'Tablero único con todos los créditos cargados', ...paquete };
    okr1.krs[1] = { texto: 'Separar la caja del negocio de la personal', ...paquete };
    const avisos = advertenciasDe(crudo, parsear(crudo), 'Gonzalo Pérez');
    expect(avisos.some((a) => a.includes('4 de 5 KRs') && a.includes('entregable'))).toBe(true);
  });

  it('el bloque canónico del contrato no genera NINGUNA advertencia', () => {
    const crudo = bloqueValido();
    expect(advertenciasDe(crudo, parsear(crudo), 'Gonzalo Pérez')).toEqual([]);
  });
});
