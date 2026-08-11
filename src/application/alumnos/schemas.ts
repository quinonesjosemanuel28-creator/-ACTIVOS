/**
 * CAPA 2 — APLICACIÓN · Módulo de alumnos · Validación Zod del formulario.
 *
 * El borde donde entra el dato crudo del alumno, sin sesión. Todo lo que
 * llegue por la ruta pública pasa por acá antes de tocar la base.
 *
 * El esquema se GENERA desde `CATALOGO`, una tabla declarativa que espeja
 * pregunta por pregunta la especificación funcional. Escribir 45 validaciones a
 * mano invitaba a que una se desalineara del documento sin que nadie lo note;
 * así se audita leyendo la tabla al lado del .md.
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
import {
  CAMPOS_RESPUESTA,
  esCampoMulti,
  type CampoRespuesta,
  type RespuestasDiagnostico,
} from '../../domain/alumnos/tipos';
import { METRICAS_CLARIDAD, SUFIJO_SIN_DATO } from '../../domain/alumnos/claridad';

type TipoCampo = 'numero' | 'moneda' | 'porcentaje' | 'texto' | 'texto_largo' | 'opcion' | 'multi';

interface DefinicionCampo {
  tipo: TipoCampo;
  /** Obligatoria para poder enviar el formulario. */
  obl: boolean;
  /** Admite la casilla "No lo tengo claro". */
  nlc: boolean;
  /** Opciones cerradas (opción / multi). Se validan acá, NUNCA con CHECK en la base. */
  opciones?: readonly string[];
}

const PROGRAMAS = ['De Cero a Gestor Financiero', 'Prestamista a Empresario', 'Prestamista a Empresario Elite'] as const;
const CANALES_ORIGEN = ['Instagram', 'TikTok', 'YouTube', 'Referido de un alumno', 'Publicidad', 'Otro'] as const;

/** Espeja la sección 3 de la especificación funcional. Un renglón por pregunta. */
const CATALOGO: Record<CampoRespuesta, DefinicionCampo> = {
  // ── Bloque 1 — Diagnóstico general ──
  antiguedad_meses: { tipo: 'numero', obl: true, nlc: false },
  tipo_dedicacion: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['Ingreso extra', 'Negocio principal', 'Proyecto en crecimiento', 'Negocio principal y en crecimiento'] },
  objetivo_6m: { tipo: 'texto_largo', obl: true, nlc: false },
  vision_negocio: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['Seguir prestando individualmente', 'Armar una empresa financiera', 'Todavía no lo tengo definido'] },
  bloqueo_principal: { tipo: 'texto_largo', obl: true, nlc: false },

  // ── Bloque 2 — Capital y rentabilidad ──
  capital_colocado: { tipo: 'moneda', obl: true, nlc: true },
  origen_capital: { tipo: 'opcion', obl: true, nlc: false, opciones: ['Propio', 'De terceros', 'Mixto'] },
  costo_capital_mensual: { tipo: 'porcentaje', obl: false, nlc: true },
  capital_disponible: { tipo: 'moneda', obl: true, nlc: true },
  recupero_mensual: { tipo: 'moneda', obl: false, nlc: true },
  separacion_dinero: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['Sí, totalmente separado', 'Parcialmente', 'No, es la misma caja'] },
  ganancia_mensual: { tipo: 'moneda', obl: true, nlc: true },
  retiro_mensual: { tipo: 'moneda', obl: false, nlc: true },
  gastos_operativos: { tipo: 'moneda', obl: false, nlc: true },

  // ── Bloque 3 — Clientes y cartera ──
  clientes_activos: { tipo: 'numero', obl: true, nlc: true },
  clientes_nuevos_mes: { tipo: 'numero', obl: false, nlc: true },
  ticket_promedio: { tipo: 'moneda', obl: true, nlc: true },
  estructura_plazos: { tipo: 'texto_largo', obl: true, nlc: false },
  plazo_promedio_meses: { tipo: 'numero', obl: false, nlc: true },
  perfil_cliente: { tipo: 'multi', obl: true, nlc: false,
    opciones: ['Empleados en relación de dependencia', 'Monotributistas', 'Comerciantes', 'Jubilados', 'Empleados públicos', 'Informales', 'Otro'] },
  recurrencia: { tipo: 'porcentaje', obl: false, nlc: true },

  // ── Bloque 4 — Precio y condiciones ──
  tasa_declarada: { tipo: 'texto', obl: true, nlc: true },
  ejemplo_total_100k: { tipo: 'moneda', obl: true, nlc: true },
  punitorio: { tipo: 'texto', obl: true, nlc: true },
  tasa_competencia: { tipo: 'texto', obl: false, nlc: true },

  // ── Bloque 5 — Aprobación y riesgo ──
  documentacion_solicitada: { tipo: 'multi', obl: true, nlc: false,
    opciones: ['DNI', 'Recibo de sueldo', 'Constancia de monotributo', 'Comprobante de domicilio', 'Verificación de redes sociales', 'Referencias personales', 'Ninguna'] },
  firma_documentacion: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['Sí, contrato y pagaré', 'Solo contrato', 'Solo pagaré', 'No, presto de palabra'] },
  porcentaje_documentado: { tipo: 'porcentaje', obl: false, nlc: true },
  criterio_monto: { tipo: 'texto_largo', obl: true, nlc: false },
  criterios_aprobacion: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['Sí, escritos', 'Los tengo en la cabeza pero no escritos', 'No tengo criterios definidos'] },
  herramienta_consulta: { tipo: 'texto', obl: true, nlc: false },
  politica_garantias: { tipo: 'texto_largo', obl: true, nlc: false },

  // ── Bloque 6 — Cobranza y mora ──
  mora_clientes: { tipo: 'porcentaje', obl: true, nlc: true },
  monto_en_mora: { tipo: 'moneda', obl: true, nlc: true },
  proceso_cobranza: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['Sí, con pasos definidos', 'Solo aviso el día del vencimiento', 'Solo reclamo cuando ya se atrasó', 'No tengo proceso'] },
  descripcion_cobranza: { tipo: 'texto_largo', obl: true, nlc: false },
  dificultad_cobranza: { tipo: 'texto_largo', obl: true, nlc: false },

  // ── Bloque 7 — Procesos, ventas y escala ──
  sistema_registro: { tipo: 'multi', obl: true, nlc: false,
    opciones: ['Cuaderno', 'Excel o Sheets', 'App de préstamos', 'Controla', 'Otro sistema'] },
  canales_captacion: { tipo: 'multi', obl: true, nlc: false,
    opciones: ['Referidos de clientes', 'Vendedores comisionistas', 'WhatsApp e historias', 'Instagram', 'Folletos y volantes', 'Publicidad paga', 'Comerciantes aliados'] },
  equipo: { tipo: 'texto_largo', obl: true, nlc: false },
  situacion_fiscal: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['Sin formalizar', 'Monotributo', 'SAS o SRL constituida', 'En trámite'] },
  unidad_ventas: { tipo: 'opcion', obl: true, nlc: false,
    opciones: ['No, solo presto dinero', 'Sí, ya vendo productos', 'No, pero me interesa arrancar'] },
  prioridad_declarada: { tipo: 'multi', obl: true, nlc: false,
    opciones: ['Ventas', 'Aprobación', 'Cobranza', 'Capital', 'Procesos', 'Formalización'] },

  // ── Bloque 8 — Proyección ──
  vision_12m: { tipo: 'texto_largo', obl: true, nlc: false },
  freno_percibido: { tipo: 'texto_largo', obl: true, nlc: false },
};

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

function validadorDe(def: DefinicionCampo): z.ZodTypeAny {
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
  idCierreVinculado: z.string().trim().nullable().optional(),
});
export type AlumnoInput = z.infer<typeof alumnoInputSchema>;

/** Edición de la ficha: los mismos campos, todos opcionales. */
export const alumnoPatchSchema = alumnoInputSchema.partial();
export type AlumnoPatch = z.infer<typeof alumnoPatchSchema>;

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
