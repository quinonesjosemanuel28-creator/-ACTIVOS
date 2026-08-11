/**
 * Validación del formulario de diagnóstico. El borde donde entra el dato crudo
 * del alumno sin sesión: si algo pasa de acá, va a la base.
 *
 * Incluye las dos guardas de DERIVA del módulo — que el catálogo Zod, la lista
 * de métricas del dominio y el esquema real de la base digan lo mismo. Sin
 * ellas, agregar una pregunta en un solo lado se pierde en silencio.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../../../infrastructure/sqlite/db';
import { COLUMNAS_RESPUESTA } from '../../../infrastructure/sqlite/alumnosRepos';
import { SCHEMA_SQL_PG } from '../../../infrastructure/postgres/schema';
import { METRICAS_CLARIDAD, SUFIJO_SIN_DATO } from '../../../domain/alumnos/claridad';
import { CAMPOS_RESPUESTA } from '../../../domain/alumnos/tipos';
import {
  aRespuestas,
  alumnoInputSchema,
  CAMPOS_CON_CASILLA,
  CAMPOS_OBLIGATORIOS,
  diagnosticoInputSchema,
} from '../schemas';

/** Mínimo válido: las 36 obligatorias de los bloques 1–8. */
function base(): Record<string, unknown> {
  return {
    antiguedad_meses: 24,
    tipo_dedicacion: 'Negocio principal',
    objetivo_6m: 'Crecer',
    vision_negocio: 'Armar una empresa financiera',
    bloqueo_principal: 'Cobranza',
    capital_colocado: 1_000_000,
    origen_capital: 'Propio',
    capital_disponible: 100_000,
    separacion_dinero: 'Parcialmente',
    ganancia_mensual: 80_000,
    clientes_activos: 20,
    ticket_promedio: 50_000,
    estructura_plazos: '6 cuotas',
    perfil_cliente: ['Comerciantes'],
    tasa_declarada: '10% mensual',
    ejemplo_total_100k: 150_000,
    punitorio: '2% semanal',
    documentacion_solicitada: ['DNI'],
    firma_documentacion: 'Solo pagaré',
    criterio_monto: 'Por antigüedad',
    criterios_aprobacion: 'Sí, escritos',
    herramienta_consulta: 'Nosis',
    politica_garantias: 'Garante arriba de 500 mil',
    mora_clientes: 10,
    monto_en_mora: 90_000,
    proceso_cobranza: 'No tengo proceso',
    descripcion_cobranza: 'WhatsApp',
    dificultad_cobranza: 'Insistir',
    sistema_registro: ['Cuaderno'],
    canales_captacion: ['Instagram'],
    equipo: 'Solo yo',
    situacion_fiscal: 'Monotributo',
    unidad_ventas: 'No, solo presto dinero',
    prioridad_declarada: ['Cobranza'],
    meta_clientes_90d: 90,
    meta_capital_90d: 20_000_000,
    meta_ganancia_90d: 1_500_000,
    vision_12m: 'Financiera formal',
    freno_percibido: 'Procesos',
  };
}

describe('Diagnóstico · el catálogo coincide con la especificación', () => {
  it('48 preguntas en el diagnóstico: las 45 del documento + las 3 metas a 90 días', () => {
    expect(CAMPOS_RESPUESTA).toHaveLength(48);
    expect(CAMPOS_RESPUESTA.length + 7).toBe(55); // 52 del documento + 3 metas
  });

  it('las metas a 90 días son obligatorias pero NO suman al índice: siguen siendo 19 casillas', () => {
    // La invariante que protege el índice de claridad: mide cuánto SABE el
    // alumno de su negocio (19 métricas duras). Las metas son intenciones; si
    // entraran, el denominador cambiaría y el índice dejaría de ser comparable
    // contra el de los 90 días, que es la métrica de resultado del programa.
    expect(CAMPOS_CON_CASILLA).toHaveLength(19);
    for (const meta of ['meta_clientes_90d', 'meta_capital_90d', 'meta_ganancia_90d'] as const) {
      expect(CAMPOS_CON_CASILLA).not.toContain(meta);
      expect(CAMPOS_OBLIGATORIOS).toContain(meta);
    }
    expect(CAMPOS_OBLIGATORIOS).toHaveLength(39); // 36 + las 3 metas
  });

  it('GUARDA DE DERIVA · las casillas del catálogo son exactamente las métricas del dominio', () => {
    // Si alguien agrega una casilla en Zod y se olvida del índice de claridad
    // (o al revés), el índice mediría sobre un universo distinto al del
    // formulario. Acá se cae.
    expect([...CAMPOS_CON_CASILLA].sort()).toEqual([...METRICAS_CLARIDAD].sort());
  });

  it('GUARDA DE DERIVA · las columnas del catálogo existen todas en la base', () => {
    const db = getDbMemoria();
    const cols = (db.prepare('PRAGMA table_info(diagnosticos)').all() as { name: string }[]).map((c) => c.name);
    for (const col of COLUMNAS_RESPUESTA) {
      expect(cols, `falta la columna ${col} en diagnosticos`).toContain(col);
    }
    // Y al revés: ninguna columna de respuesta del esquema quedó fuera del catálogo.
    const cabecera = new Set([
      'id', 'alumno_id', 'fecha', 'origen', 'editado_por_consultor', 'programa', 'moneda',
      'indice_claridad', 'metricas_aplicables', 'metricas_respondidas', 'creado_en',
    ]);
    for (const col of cols) {
      if (!cabecera.has(col)) expect(COLUMNAS_RESPUESTA, `la columna ${col} no está en el catálogo`).toContain(col);
    }
  });

  it('GUARDA DE DERIVA · PostgreSQL tiene las mismas columnas que el catálogo', () => {
    // El espejo entre motores se verifica a nivel de TABLAS en
    // tablasMigracion.test.ts, no de columnas. Con ~90 columnas armadas desde
    // el catálogo, que a Postgres le falte una solo se notaría en producción:
    // los tests corren sobre SQLite.
    const bloque = /CREATE TABLE IF NOT EXISTS diagnosticos\s*\(([\s\S]*?)\n\);/.exec(SCHEMA_SQL_PG);
    expect(bloque, 'no se encontró la tabla diagnosticos en el esquema de PostgreSQL').toBeTruthy();
    const declaradas = new Set(
      bloque![1]!
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('--'))
        .map((l) => l.split(/\s+/)[0]!),
    );
    for (const col of COLUMNAS_RESPUESTA) {
      expect(declaradas, `falta la columna ${col} en diagnosticos (PostgreSQL)`).toContain(col);
    }
  });
});

describe('Diagnóstico · obligatorias', () => {
  it('el mínimo válido pasa', () => {
    expect(() => diagnosticoInputSchema.parse(base())).not.toThrow();
  });

  it('falta una obligatoria sin casilla → error en ese campo', () => {
    const { objetivo_6m: _, ...sinObjetivo } = base();
    const r = diagnosticoInputSchema.safeParse(sinObjetivo);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.objetivo_6m).toBeTruthy();
  });

  it('texto en blanco NO salda una obligatoria', () => {
    const r = diagnosticoInputSchema.safeParse({ ...base(), equipo: '   ' });
    expect(r.success).toBe(false);
  });

  it('multi vacío NO salda una obligatoria', () => {
    const r = diagnosticoInputSchema.safeParse({ ...base(), perfil_cliente: [] });
    expect(r.success).toBe(false);
  });

  it('obligatoria CON casilla: se salda con el número o marcando "no lo tengo claro"', () => {
    // Sin número y sin casilla: no pasa. No sabemos si no sabe o si se la salteó.
    const vacia = { ...base(), capital_colocado: null };
    expect(diagnosticoInputSchema.safeParse(vacia).success).toBe(false);

    // Declarando que no lo sabe: pasa.
    const declarada = { ...base(), capital_colocado: null, capital_colocado_sin_dato: true };
    expect(diagnosticoInputSchema.safeParse(declarada).success).toBe(true);
  });

  it('el mensaje de una obligatoria con casilla ofrece las dos salidas', () => {
    const r = diagnosticoInputSchema.safeParse({ ...base(), mora_clientes: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.mora_clientes?.[0]).toMatch(/no lo tengo claro/i);
    }
  });

  it('las opcionales pueden faltar sin bloquear el envío', () => {
    const r = diagnosticoInputSchema.safeParse(base()); // no trae ninguna opcional
    expect(r.success).toBe(true);
  });
});

describe('Diagnóstico · la casilla limpia el valor', () => {
  it('marcada, el número se descarta antes de tocar la base', () => {
    const datos = diagnosticoInputSchema.parse({
      ...base(),
      ganancia_mensual: 80_000,
      ganancia_mensual_sin_dato: true,
    }) as Record<string, unknown>;
    expect(datos.ganancia_mensual).toBeNull();
    expect(datos.ganancia_mensual_sin_dato).toBe(true);
  });

  it('sin marcar, el valor sobrevive', () => {
    const datos = diagnosticoInputSchema.parse(base()) as Record<string, unknown>;
    expect(datos.ganancia_mensual).toBe(80_000);
    expect(datos.ganancia_mensual_sin_dato).toBe(false);
  });
});

describe('Diagnóstico · tipos y rangos', () => {
  it('rechaza una opción que no está en la lista', () => {
    expect(diagnosticoInputSchema.safeParse({ ...base(), origen_capital: 'Prestado del banco' }).success).toBe(false);
  });

  it('rechaza un valor inventado dentro de un multi', () => {
    expect(diagnosticoInputSchema.safeParse({ ...base(), perfil_cliente: ['Marcianos'] }).success).toBe(false);
  });

  it('un porcentaje no puede pasar de 100 ni ser negativo', () => {
    expect(diagnosticoInputSchema.safeParse({ ...base(), mora_clientes: 120 }).success).toBe(false);
    expect(diagnosticoInputSchema.safeParse({ ...base(), mora_clientes: -1 }).success).toBe(false);
    expect(diagnosticoInputSchema.safeParse({ ...base(), mora_clientes: 100 }).success).toBe(true);
  });

  it('la plata no puede ser negativa, pero CERO es un dato válido', () => {
    expect(diagnosticoInputSchema.safeParse({ ...base(), monto_en_mora: -5 }).success).toBe(false);
    // Mora en 0 = cartera sana. Tiene que poder guardarse.
    expect(diagnosticoInputSchema.safeParse({ ...base(), monto_en_mora: 0 }).success).toBe(true);
  });

  it('un número mandado como texto se rechaza (no se adivina)', () => {
    expect(diagnosticoInputSchema.safeParse({ ...base(), capital_colocado: '1000000' }).success).toBe(false);
  });
});

describe('Diagnóstico · normalización a la base', () => {
  it('los multi salen como JSON y las 19 casillas siempre booleanas', () => {
    const datos = diagnosticoInputSchema.parse(base()) as Record<string, unknown>;
    const r = aRespuestas(datos);
    expect(r.perfil_cliente).toBe('["Comerciantes"]');
    for (const m of METRICAS_CLARIDAD) {
      expect(typeof r[`${m}${SUFIJO_SIN_DATO}`]).toBe('boolean');
    }
  });

  it('devuelve las 45 respuestas, con null en las que no vinieron', () => {
    const datos = diagnosticoInputSchema.parse(base()) as Record<string, unknown>;
    const r = aRespuestas(datos);
    for (const c of CAMPOS_RESPUESTA) expect(c in r).toBe(true);
    expect(r.retiro_mensual).toBeNull(); // opcional no enviada
  });
});

describe('Ficha del alumno · bloque 0', () => {
  const ficha = { nombre: 'Gonzalo', programa: 'Prestamista a Empresario' };

  it('nombre y programa son obligatorios', () => {
    expect(alumnoInputSchema.safeParse(ficha).success).toBe(true);
    expect(alumnoInputSchema.safeParse({ nombre: 'X' }).success).toBe(false);
    expect(alumnoInputSchema.safeParse({ ...ficha, nombre: '  ' }).success).toBe(false);
  });

  it('la moneda por defecto es ARS y se normaliza a mayúscula', () => {
    expect(alumnoInputSchema.parse(ficha).moneda).toBe('ARS');
    expect(alumnoInputSchema.parse({ ...ficha, moneda: 'cop' }).moneda).toBe('COP');
  });

  it('la moneda tiene que ser un ISO de 3 letras', () => {
    expect(alumnoInputSchema.safeParse({ ...ficha, moneda: 'PESOS' }).success).toBe(false);
  });

  it('rechaza un programa fuera de la lista', () => {
    expect(alumnoInputSchema.safeParse({ ...ficha, programa: 'Curso pirata' }).success).toBe(false);
  });
});
