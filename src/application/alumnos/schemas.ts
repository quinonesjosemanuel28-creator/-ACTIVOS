/**
 * CAPA 2 — APLICACIÓN · Módulo de alumnos · Validación Zod del formulario.
 *
 * El borde donde entra el dato crudo del alumno, sin sesión. Todo lo que
 * llegue por la ruta pública pasa por acá antes de tocar la base.
 *
 * El esquema se GENERA desde el catálogo del formulario que vive en el DOMINIO
 * (domain/alumnos/formulario.ts) — el mismo del que la UI toma las preguntas.
 * Escribir 45 validaciones a mano invitaba a que una se desalineara del
 * documento sin que nadie lo note; así, validación y render se mueven juntos.
 *
 * Dos reglas que no son evidentes:
 *
 *  - **Obligatoria + casilla = "contestá o declará que no sabés".** Las 19
 *    métricas duras se pueden saldar de dos maneras: con un número o marcando
 *    "no lo tengo claro". Lo que NO se puede es dejarlas en blanco sin decir
 *    nada — ahí no sabemos si el alumno no sabe o si se saltó la pregunta, y el
 *    índice de claridad mediría cualquier cosa.
 *  - **La casilla marcada limpia el valor.** Si viene marcada, el valor se
 *    descarta acá mismo: la base nunca guarda un número que el alumno declaró
 *    desconocer.
 */
import { z } from 'zod';
import { AREAS_NOTA } from '../../domain/alumnos/notas';
import { TIPOS_CONTACTO } from '../../domain/alumnos/bitacora';
import {
  CAMPOS_RESPUESTA,
  esCampoMulti,
  type CampoRespuesta,
  type RespuestasDiagnostico,
} from '../../domain/alumnos/tipos';
import { METRICAS_CLARIDAD, SUFIJO_SIN_DATO } from '../../domain/alumnos/claridad';
import { PREGUNTA_POR_CAMPO, PREGUNTAS_FICHA, type Pregunta } from '../../domain/alumnos/formulario';

const PROGRAMAS = ['De Cero a Gestor Financiero', 'Prestamista a Empresario', 'Prestamista a Empresario Elite'] as const;
const CANALES_ORIGEN = PREGUNTAS_FICHA.find((p) => p.campo === 'canal_origen')!.opciones as [string, ...string[]];

/** Vista campo → definición sobre el catálogo del dominio. */
const CATALOGO: Record<CampoRespuesta, Pregunta> = Object.fromEntries(
  CAMPOS_RESPUESTA.map((campo) => {
    const pregunta = PREGUNTA_POR_CAMPO.get(campo);
    if (!pregunta) throw new Error(`El catálogo del formulario no define la pregunta "${campo}"`);
    return [campo, pregunta];
  }),
) as Record<CampoRespuesta, Pregunta>;

export { CATALOGO as CATALOGO_DIAGNOSTICO };

/** Las 19 con casilla, según el catálogo. Debe coincidir con METRICAS_CLARIDAD. */
export const CAMPOS_CON_CASILLA: readonly CampoRespuesta[] = CAMPOS_RESPUESTA.filter((c) => CATALOGO[c].nlc);

/** Las obligatorias del diagnóstico (bloques 1–8; el bloque 0 es la ficha). */
export const CAMPOS_OBLIGATORIOS: readonly CampoRespuesta[] = CAMPOS_RESPUESTA.filter((c) => CATALOGO[c].obl);

// ───────────────────────── Construcción del esquema ─────────────────────────

/** Texto vacío o solo espacios = no respondido. Evita "  " como respuesta válida. */
const textoOpcional = z
  .string()
  .transform((s) => (s.trim() === '' ? null : s.trim()))
  .nullable()
  .optional();

function validadorDe(def: Pregunta): z.ZodTypeAny {
  switch (def.tipo) {
    case 'numero':
      return z.number().min(0, 'No puede ser negativo').nullable().optional();
    case 'moneda':
      return z.number().min(0, 'No puede ser negativo').nullable().optional();
    case 'porcentaje':
      return z.number().min(0, 'No puede ser negativo').max(100, 'Un porcentaje no puede pasar de 100').nullable().optional();
    case 'opcion':
      return z.enum(def.opciones as [string, ...string[]]).nullable().optional();
    case 'multi':
      return z.array(z.enum(def.opciones as [string, ...string[]])).nullable().optional();
    case 'texto':
    case 'texto_largo':
      return textoOpcional;
  }
}

const formaDiagnostico: Record<string, z.ZodTypeAny> = {};
for (const campo of CAMPOS_RESPUESTA) {
  formaDiagnostico[campo] = validadorDe(CATALOGO[campo]);
  if (CATALOGO[campo].nlc) {
    formaDiagnostico[`${campo}${SUFIJO_SIN_DATO}`] = z.boolean().optional().default(false);
  }
}

/** ¿Hay dato cargado para este campo? (antes de aplicar la casilla) */
function tieneValor(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'number') return Number.isFinite(valor);
  return true;
}

export const diagnosticoInputSchema = z
  .object(formaDiagnostico)
  .transform((datos) => {
    // La casilla marcada MANDA: se descarta el valor. La base nunca guarda un
    // número que el alumno declaró desconocer.
    const salida = { ...datos } as Record<string, unknown>;
    for (const campo of CAMPOS_CON_CASILLA) {
      if (salida[`${campo}${SUFIJO_SIN_DATO}`] === true) salida[campo] = null;
    }
    return salida;
  })
  .superRefine((datos, ctx) => {
    for (const campo of CAMPOS_OBLIGATORIOS) {
      const respondido = tieneValor(datos[campo]);
      // Obligatoria con casilla: vale contestarla O declarar que no se sabe.
      const declarada = CATALOGO[campo].nlc && datos[`${campo}${SUFIJO_SIN_DATO}`] === true;
      if (!respondido && !declarada) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [campo],
          message: CATALOGO[campo].nlc
            ? 'Completá el dato o marcá "No lo tengo claro".'
            : 'Esta pregunta es obligatoria.',
        });
      }
    }
  });

export type DiagnosticoInput = z.infer<typeof diagnosticoInputSchema>;

/**
 * Corrección del consultor durante la llamada: cualquier subconjunto de las 45
 * respuestas y sus casillas. SIN defaults a propósito — acá "ausente" significa
 * "no tocar lo guardado", y un default(false) pisaría casillas que el alumno
 * marcó. Tampoco exige obligatorias: es un parche, no un envío.
 */
const formaPatch: Record<string, z.ZodTypeAny> = {};
for (const campo of CAMPOS_RESPUESTA) {
  formaPatch[campo] = validadorDe(CATALOGO[campo]);
  if (CATALOGO[campo].nlc) formaPatch[`${campo}${SUFIJO_SIN_DATO}`] = z.boolean().optional();
}
export const diagnosticoPatchSchema = z.object(formaPatch);
export type DiagnosticoPatch = z.infer<typeof diagnosticoPatchSchema>;

// ───────────────────────── Bloque 0 · ficha del alumno ─────────────────────────

export const alumnoInputSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  edad: z.number().int().min(16, 'Edad inválida').max(100, 'Edad inválida').nullable().optional(),
  zona: z.string().trim().min(1).nullable().optional(),
  whatsapp: z.string().trim().min(1).nullable().optional(),
  marcaComercial: z.string().trim().nullable().optional(),
  programa: z.enum(PROGRAMAS),
  canalOrigen: z.enum(CANALES_ORIGEN).nullable().optional(),
  /** ISO 4217. Sin CHECK en la base: la lista de países va a crecer. */
  moneda: z.string().trim().length(3, 'Usá el código ISO de 3 letras (ARS, COP, CLP…)').toUpperCase().default('ARS'),
  /**
   * Teléfono normalizado (ticket 7C): país sin '+' y número solo dígitos. El
   * campo `whatsapp` libre sigue existiendo (lo escribe el alumno); estos dos
   * son los que arman el link de wa.me y por eso entran ya limpios.
   */
  telefonoPais: z.string().trim().regex(/^\d{1,3}$/, 'Código de país: solo dígitos, sin el +').nullable().optional(),
  telefonoNumero: z.string().trim().regex(/^\d{6,12}$/, 'Número: solo dígitos, con código de área y sin el 15').nullable().optional(),
  idCierreVinculado: z.string().trim().nullable().optional(),
});
export type AlumnoInput = z.infer<typeof alumnoInputSchema>;

/** Edición de la ficha: los mismos campos, todos opcionales. */
export const alumnoPatchSchema = alumnoInputSchema.partial();
export type AlumnoPatch = z.infer<typeof alumnoPatchSchema>;

// ───────────────────────── Panel de control (ticket 7) ─────────────────────────

const FECHA_YMD = /^\d{4}-\d{2}-\d{2}$/;

const fechaYmd = z.string().regex(FECHA_YMD, 'La fecha va como YYYY-MM-DD').refine(
  (f) => !Number.isNaN(Date.parse(`${f}T00:00:00Z`)),
  'Fecha inválida',
);

/** Cambio de estado del alumno. El enum vive en el dominio (panel.ts). */
export const estadoAlumnoInputSchema = z.object({
  estado: z.enum(['ACTIVO', 'PAUSADO', 'FINALIZADO', 'ABANDONADO']),
});

/** Cambio de fecha de inicio del plan: fecha nueva + motivo opcional. */
export const fechaInicioInputSchema = z.object({
  fechaNueva: fechaYmd,
  motivo: z.string().trim().transform((s) => (s === '' ? null : s)).nullable().optional(),
});

/**
 * Edición de seguimiento de un KR: cumplimiento y/o vencimiento. Ausente = no
 * tocar (mismo criterio que el patch del diagnóstico); null = limpiar.
 *
 * ⚠ `cumplido` está DEPRECADO y ya no alimenta NINGÚN color: desde el switch
 * de 9C el semáforo mide acciones contra la agenda. Solo lo lee el lado
 * "viejo" del export de comparación (rodaje del cálculo nuevo). El campo se
 * elimina en el ticket de limpieza, junto con krs.cumplido_en y
 * checkins.marcado — que un revert del switch tenga de dónde volver a leer.
 */
export const krPatchSchema = z
  .object({
    cumplido: z.boolean().optional(),
    vencimiento: fechaYmd.nullable().optional(),
  })
  .refine((v) => v.cumplido !== undefined || v.vencimiento !== undefined, 'Nada para actualizar.');

/**
 * Corrección de una acción desde el panel (ticket 9B): el consultor fija el
 * estado — y opcionalmente el porqué. Cada corrección es un checkin nuevo.
 */
export const accionEstadoInputSchema = z.object({
  estado: z.enum(['pendiente', 'en_curso', 'ejecutado']),
  nota: z.string().trim().transform((s) => (s === '' ? null : s)).nullable().optional(),
});

/**
 * Resolución de una nota (ticket 10A). La DEVOLUCIÓN la ve el alumno en su
 * link: obligatoria al resolver (responder sin texto no es responder) y
 * prohibida al archivar (archivar es cerrar sin respuesta — si hay algo para
 * decirle, es una resolución). El área es opción de negocio: enum en Zod,
 * sin CHECK en la base, como contactos.canal.
 */
export const notaResolucionInputSchema = z
  .object({
    estado: z.enum(['resuelta', 'archivada']),
    area: z.enum(AREAS_NOTA).nullable().optional(),
    devolucion: z.string().trim().max(2000, 'Hasta 2000 caracteres.').transform((s) => (s === '' ? null : s)).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const dev = v.devolucion ?? null;
    if (v.estado === 'resuelta' && dev === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['devolucion'], message: 'Responder lleva devolución: es lo que va a ver el alumno.' });
    }
    if (v.estado === 'archivada' && dev !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['devolucion'], message: 'Archivar es cerrar sin respuesta. Si hay devolución, es una nota resuelta.' });
    }
  });

/**
 * Entrada de bitácora (ticket 10B): texto libre — un coach que sale de una
 * llamada de una hora escribe cuatro líneas, no completa campos. Solo dos
 * cosas más: el tipo de contacto (un clic) y la traba actual, opcional.
 */
export const bitacoraInputSchema = z.object({
  texto: z.string().trim().min(1, 'La entrada no puede estar vacía.').max(5000, 'Hasta 5000 caracteres.'),
  tipoContacto: z.enum(TIPOS_CONTACTO),
  trabaActual: z.string().trim().max(300, 'La traba es un titular, no un informe: hasta 300 caracteres.').transform((s) => (s === '' ? null : s)).nullable().optional(),
});

/** Carga de una medición (ticket 9B): un número finito, nada más. */
export const medicionInputSchema = z.object({
  valor: z.number().finite('El valor tiene que ser un número.'),
});

/**
 * Registro de contacto (ticket 7C). El canal es opción de negocio: hoy solo
 * WhatsApp, la lista crece acá cuando haga falta (llamada, mail…).
 */
export const contactoInputSchema = z.object({
  canal: z.enum(['WHATSAPP']).default('WHATSAPP'),
  nota: z.string().trim().transform((s) => (s === '' ? null : s)).nullable().optional(),
});

/**
 * Bloque 0 por el link público — semántica completar-si-falta. Claves en
 * snake_case porque son los nombres de campo de la especificación (los que
 * viajan en el mismo body que las respuestas). `nombre`, `programa` y `moneda`
 * NO están acá a propósito: son identidad fijada por el consultor, y el link
 * público jamás los toca.
 */
export const fichaPublicaSchema = z.object({
  edad: z.number().int().min(16, 'Edad inválida').max(100, 'Edad inválida').nullable().optional(),
  zona: textoOpcional,
  whatsapp: textoOpcional,
  marca_comercial: textoOpcional,
  canal_origen: z.enum(CANALES_ORIGEN).nullable().optional(),
});
export type FichaPublica = z.infer<typeof fichaPublicaSchema>;

/**
 * Normaliza la salida de Zod al formato de la base: los multi van como JSON en
 * TEXT (el espejo SQLite/PostgreSQL exige el mismo tipo en los dos motores).
 */
export function aRespuestas(datos: Record<string, unknown>): RespuestasDiagnostico {
  const out: RespuestasDiagnostico = {};
  for (const campo of CAMPOS_RESPUESTA) {
    const v = datos[campo];
    out[campo] = esCampoMulti(campo) && Array.isArray(v) ? JSON.stringify(v) : (v as never) ?? null;
  }
  for (const m of METRICAS_CLARIDAD) {
    out[`${m}${SUFIJO_SIN_DATO}`] = datos[`${m}${SUFIJO_SIN_DATO}`] === true;
  }
  return out;
}
