/**
 * CAPA 2 — APLICACIÓN · Módulo de alumnos · El bloque del plan (CONTRATO-PLAN.md).
 *
 * Valida lo que el consultor PEGA: el bloque JSON que emite la skill. El otro
 * lado del contrato vive en CONTRATO-PLAN.md — si esto cambia, cambia aquello.
 *
 * Filosofía: CARGA TOLERANTE, PREVIA RUIDOSA. Lo estructural se exige (3 fases,
 * OKRs con orden único, referencias que existan); lo estilístico (3-8 acciones
 * por fase, 120 caracteres) y lo desconocido (claves que el contrato no
 * define) se REPORTA como advertencia en la previa, sin frenar la carga. Un
 * plan real no se rechaza por una acción de más — pero el consultor tiene que
 * ver qué quedó afuera antes de confirmar.
 */
import { z } from 'zod';

const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como YYYY-MM-DD (ej: 2026-08-18)')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Fecha inválida');

/**
 * Ticket 9: el KR viene tipado. `entregable` cierra solo por sus acciones;
 * `metrica` exige el paquete completo para poder medirse — una métrica sin
 * meta_90 o sin dirección es una promesa que nunca puede cumplirse, así que
 * es error ESTRUCTURAL, no advertencia. Sin `tipo`, entra como entregable
 * (aditivo: los bloques anteriores siguen valiendo tal cual).
 */
const krSchema = z
  .object({
    texto: z.string().trim().min(1, 'Un KR sin texto'),
    meta: z.string().trim().min(1).nullable().optional(),
    tipo: z.enum(['entregable', 'metrica']).optional(),
    valor_inicial: z.number().finite().optional(),
    meta_30: z.number().finite().optional(),
    meta_60: z.number().finite().optional(),
    meta_90: z.number().finite().optional(),
    unidad: z.string().trim().min(1).optional(),
    direccion: z.enum(['sube', 'baja']).optional(),
  })
  .superRefine((k, ctx) => {
    if (k.tipo === 'metrica') {
      for (const campo of ['valor_inicial', 'meta_90', 'unidad', 'direccion'] as const) {
        if (k[campo] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [campo],
            message: `El KR métrica "${k.texto.slice(0, 40)}" necesita ${campo} (los valores van como número, sin comillas; el símbolo va en unidad)`,
          });
        }
      }
    }
  });

const okrSchema = z.object({
  orden: z.number().int().min(1),
  objetivo: z.string().trim().min(1, 'Un OKR sin objetivo'),
  krs: z.array(krSchema).min(1, 'Todo OKR lleva al menos un KR'),
});

const accionSchema = z.object({
  texto: z.string().trim().min(1, 'Una acción sin texto'),
  okr: z.number().int().min(1).optional(),
  /**
   * Posición (1..n) del KR dentro del OKR referenciado (ticket 8): agrupa el
   * checklist del alumno bajo su KR. Opcional y ADITIVO: los bloques viejos
   * siguen valiendo; sin él, la acción va a "Otras acciones".
   */
  kr: z.number().int().min(1).optional(),
});

const faseSchema = z.object({
  fase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  titulo: z.string().trim().min(1).nullable().optional(),
  acciones: z.array(accionSchema).min(1, 'Una fase sin acciones'),
});

export const bloquePlanSchema = z
  .object({
    version: z.literal(1, { errorMap: () => ({ message: 'Versión de bloque desconocida: este panel entiende la 1' }) }),
    alumno: z.string().trim().min(1, 'Falta el nombre del alumno'),
    fecha_inicio: fechaISO,
    etapa: z.string().trim().min(1).nullable().optional(),
    objetivo_90d: z.string().trim().min(1).nullable().optional(),
    okrs: z.array(okrSchema).min(1, 'El bloque no trae OKRs').max(8, 'Más de 8 OKRs no es un trimestre, es una lista de deseos'),
    fases: z.array(faseSchema).length(3, 'Tienen que ser exactamente 3 fases (1-30 / 31-60 / 61-90)'),
  })
  .superRefine((b, ctx) => {
    // Los orden de OKR no se repiten: son la referencia de las acciones.
    const ordenes = b.okrs.map((o) => o.orden);
    if (new Set(ordenes).size !== ordenes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['okrs'], message: 'Hay OKRs con el mismo orden' });
    }
    // Las tres fases son 1, 2 y 3 — sin repetir ni saltear.
    const fases = [...b.fases.map((f) => f.fase)].sort();
    if (fases.join(',') !== '1,2,3') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fases'], message: 'Las fases tienen que ser 1, 2 y 3' });
    }
    // Toda acción que referencia un OKR apunta a uno que existe (CONTRATO), y
    // toda referencia a un KR (ticket 8) exige el OKR y una posición que exista.
    const existentes = new Set(ordenes);
    const porOrden = new Map(b.okrs.map((o) => [o.orden, o]));
    b.fases.forEach((f, i) =>
      f.acciones.forEach((a, j) => {
        if (a.okr !== undefined && !existentes.has(a.okr)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fases', i, 'acciones', j],
            message: `La acción "${a.texto.slice(0, 40)}…" apunta al OKR ${a.okr}, que no está en el bloque`,
          });
        }
        if (a.kr !== undefined) {
          if (a.okr === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['fases', i, 'acciones', j],
              message: `La acción "${a.texto.slice(0, 40)}…" referencia un KR sin decir de qué OKR ("kr" exige "okr")`,
            });
          } else {
            const okr = porOrden.get(a.okr);
            if (okr && a.kr > okr.krs.length) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['fases', i, 'acciones', j],
                message: `La acción "${a.texto.slice(0, 40)}…" apunta al KR ${a.kr} del OKR ${a.okr}, que solo tiene ${okr.krs.length}`,
              });
            }
          }
        }
      }),
    );
  });

export type BloquePlan = z.infer<typeof bloquePlanSchema>;

// ───────────────────────── Extracción del pegado ─────────────────────────

/**
 * Saca el JSON de lo que sea que el consultor haya pegado: el bloque cercado
 * con ```json, el objeto pelado, o el objeto rodeado de prosa del chat. Si no
 * hay JSON parseable, null — el mensaje de error lo pone el caso de uso.
 */
export function extraerBloque(texto: string): unknown | null {
  const limpio = texto.trim();
  const candidatos: string[] = [];

  const cercado = /```(?:json)?\s*([\s\S]*?)```/.exec(limpio);
  if (cercado) candidatos.push(cercado[1]!.trim());
  candidatos.push(limpio);
  const desde = limpio.indexOf('{');
  const hasta = limpio.lastIndexOf('}');
  if (desde >= 0 && hasta > desde) candidatos.push(limpio.slice(desde, hasta + 1));

  for (const c of candidatos) {
    try {
      const v = JSON.parse(c) as unknown;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

// ───────────────────────── Advertencias (previa ruidosa) ─────────────────────────

const CLAVES_CONOCIDAS = new Set(['version', 'alumno', 'fecha_inicio', 'etapa', 'objetivo_90d', 'okrs', 'fases']);

/**
 * Lo que NO frena la carga pero el consultor tiene que ver antes de confirmar.
 * Acá es donde un plan real le muestra a José qué parte quedó fuera del
 * contrato, en vez de descartarla en silencio.
 */
export function advertenciasDe(crudo: Record<string, unknown>, bloque: BloquePlan, nombreFicha: string): string[] {
  const avisos: string[] = [];

  // Claves del bloque que el contrato no define: se IGNORAN al cargar.
  const desconocidas = Object.keys(crudo).filter((k) => !CLAVES_CONOCIDAS.has(k));
  if (desconocidas.length > 0) {
    avisos.push(
      `El bloque trae secciones que el contrato no define y NO se van a cargar: ${desconocidas.join(', ')}. ` +
        'Si tienen que entrar al panel, hay que ampliar el contrato (CONTRATO-PLAN.md).',
    );
  }

  // El nombre no coincide con la ficha: el desastre silencioso del contrato.
  const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (normalizar(bloque.alumno) !== normalizar(nombreFicha)) {
    avisos.push(`El bloque dice "${bloque.alumno}" y la ficha dice "${nombreFicha}". Verificá que sea el plan correcto.`);
  }

  // Reglas de redacción del contrato: se avisan, no se bloquean.
  for (const f of bloque.fases) {
    if (f.acciones.length < 3) avisos.push(`La fase ${f.fase} tiene solo ${f.acciones.length} acción(es); el contrato sugiere 3 a 8.`);
    if (f.acciones.length > 8) avisos.push(`La fase ${f.fase} tiene ${f.acciones.length} acciones; más de 8 abruma el checklist.`);
    for (const a of f.acciones) {
      if (a.texto.length > 120) avisos.push(`Una acción de la fase ${f.fase} pasa los 120 caracteres: "${a.texto.slice(0, 50)}…"`);
    }
  }

  // OKRs a los que ninguna acción aporta: no es error, pero llama la atención.
  const conAccion = new Set(bloque.fases.flatMap((f) => f.acciones.map((a) => a.okr)).filter((x) => x !== undefined));
  for (const o of bloque.okrs) {
    if (!conAccion.has(o.orden)) avisos.push(`El OKR ${o.orden} ("${o.objetivo.slice(0, 40)}…") no tiene ninguna acción asociada.`);
  }

  // ── Ticket 9: coherencia del cierre automático ──

  // KR entregable sin ninguna acción que lo referencie: no va a poder
  // cerrarse NUNCA. Con un bloque que no usa referencias kr en absoluto, un
  // aviso por KR sería puro ruido — se agrupa en uno solo.
  const referencias = bloque.fases.flatMap((f) => f.acciones).filter((a) => a.kr !== undefined);
  const hayEntregables = bloque.okrs.some((o) => o.krs.some((k) => (k.tipo ?? 'entregable') === 'entregable'));
  if (referencias.length === 0 && hayEntregables) {
    avisos.push(
      'Ninguna acción referencia KRs (campo "kr"): los KRs entregables no van a poder cerrarse solos. ' +
        'Pedile a la skill el bloque con las referencias, o cargalo sabiendo que el cierre queda manual sobre las acciones.',
    );
  } else if (referencias.length > 0) {
    const referenciados = new Set(referencias.map((a) => `${a.okr}:${a.kr}`));
    for (const o of bloque.okrs) {
      o.krs.forEach((k, i) => {
        if ((k.tipo ?? 'entregable') === 'entregable' && !referenciados.has(`${o.orden}:${i + 1}`)) {
          avisos.push(
            `El KR "${k.texto.slice(0, 40)}" del OKR ${o.orden} es entregable y ninguna acción lo referencia: no va a poder cerrarse nunca.`,
          );
        }
      });
    }
  }

  // Métricas: los tramos intermedios son lo que el alumno ve.
  for (const o of bloque.okrs) {
    for (const k of o.krs) {
      if (k.tipo === 'metrica' && (k.meta_30 === undefined || k.meta_60 === undefined)) {
        avisos.push(`El KR métrica "${k.texto.slice(0, 40)}" viene sin meta_30/meta_60: el alumno no va a ver tramos intermedios.`);
      }
    }
  }

  // Regla de proporción del contrato: la mayoría de los KRs son entregables.
  const todos = bloque.okrs.flatMap((o) => o.krs);
  const metricas = todos.filter((k) => k.tipo === 'metrica').length;
  if (todos.length > 0 && metricas > todos.length / 2) {
    avisos.push(
      `${metricas} de ${todos.length} KRs vienen como métrica. Revisá: lo que "existe o no existe" es entregable, no métrica.`,
    );
  }

  return avisos;
}
