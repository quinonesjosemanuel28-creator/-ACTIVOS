/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Catálogo del formulario de diagnóstico.
 *
 * La especificación funcional (formulario-diagnostico-especificacion.md)
 * traducida a datos puros: bloques, preguntas, tipos, obligatoriedad, casilla
 * "No lo tengo claro" y opciones cerradas. De acá derivan:
 *
 *  - la validación Zod del borde (capa de aplicación), y
 *  - el render del formulario público (UI).
 *
 * Un solo lugar: si la especificación cambia una pregunta, se toca acá y los
 * dos consumidores se mueven juntos. Los `campo` son contrato con la skill
 * plan-okr-90-dias — no renombrar de un solo lado.
 */
import type { CampoRespuesta } from './tipos';

export type TipoPregunta = 'numero' | 'moneda' | 'porcentaje' | 'texto' | 'texto_largo' | 'opcion' | 'multi';

export interface Pregunta {
  campo: CampoRespuesta;
  /** Texto de la pregunta, tal cual la especificación. */
  label: string;
  tipo: TipoPregunta;
  /** Obligatoria para poder enviar. */
  obl: boolean;
  /** Lleva la casilla "No lo tengo claro". */
  nlc: boolean;
  opciones?: readonly string[];
  /** Aclaración corta debajo del campo (cuando la pregunta la necesita). */
  ayuda?: string;
}

export interface Bloque {
  titulo: string;
  /** Bajada del bloque para el alumno (opcional). */
  descripcion?: string;
  preguntas: readonly Pregunta[];
}

/**
 * El empujón a estimar, arriba de todo el formulario. Sin él, mucha gente marca
 * la casilla por comodidad y el diagnóstico llega vacío.
 */
export const TEXTO_EMPUJE =
  'Si algún número no lo tenés exacto, poné tu mejor estimación. Solo marcá "no lo tengo claro" si realmente no tenés idea — no pasa nada, lo resolvemos juntos en la llamada.';

export const ETIQUETA_CASILLA = 'No lo tengo claro — lo vemos en la consultoría';

/** Bloques 1–8: las 45 respuestas que viven en `diagnosticos`. */
export const BLOQUES: readonly Bloque[] = [
  {
    titulo: 'Diagnóstico general',
    preguntas: [
      { campo: 'antiguedad_meses', label: '¿Hace cuánto tiempo estás trabajando con préstamos personales?', tipo: 'numero', obl: true, nlc: false, ayuda: 'En meses.' },
      { campo: 'tipo_dedicacion', label: '¿Hoy lo tomás como ingreso extra, negocio principal o proyecto en crecimiento?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Ingreso extra', 'Negocio principal', 'Proyecto en crecimiento', 'Negocio principal y en crecimiento'] },
      { campo: 'objetivo_6m', label: '¿Cuál es tu objetivo principal con este negocio en los próximos 6 meses?', tipo: 'texto_largo', obl: true, nlc: false },
      { campo: 'vision_negocio', label: '¿Qué querés construir: seguir prestando individualmente o armar una empresa financiera?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Seguir prestando individualmente', 'Armar una empresa financiera', 'Todavía no lo tengo definido'] },
      { campo: 'bloqueo_principal', label: '¿Cuál sentís que es hoy tu mayor problema o bloqueo?', tipo: 'texto_largo', obl: true, nlc: false },
    ],
  },
  {
    titulo: 'Capital y rentabilidad',
    descripcion: 'El bloque con más números. Acordate: una estimación aproximada vale mucho más que un vacío.',
    preguntas: [
      { campo: 'capital_colocado', label: '¿Con cuánto capital estás trabajando actualmente?', tipo: 'moneda', obl: true, nlc: true, ayuda: 'Total colocado en la calle.' },
      { campo: 'origen_capital', label: '¿Ese capital es propio, de terceros o mixto?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Propio', 'De terceros', 'Mixto'] },
      { campo: 'costo_capital_mensual', label: 'Si trabajás con capital de terceros, ¿cuánto pagás por ese dinero al mes?', tipo: 'porcentaje', obl: false, nlc: true },
      { campo: 'capital_disponible', label: '¿Cuánto capital disponible tenés hoy para seguir prestando?', tipo: 'moneda', obl: true, nlc: true },
      { campo: 'recupero_mensual', label: '¿Cuánto capital recuperás por mes entre todas las cuotas que cobrás?', tipo: 'moneda', obl: false, nlc: true },
      { campo: 'separacion_dinero', label: '¿Tenés separado el dinero personal del dinero del negocio?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Sí, totalmente separado', 'Parcialmente', 'No, es la misma caja'] },
      { campo: 'ganancia_mensual', label: '¿Cuánto ganás realmente por mes con tu cartera?', tipo: 'moneda', obl: true, nlc: true, ayuda: 'Un número, no un rango.' },
      { campo: 'retiro_mensual', label: '¿Cuánto retirás por mes para uso personal?', tipo: 'moneda', obl: false, nlc: true },
      { campo: 'gastos_operativos', label: '¿Cuánto gastás por mes en el negocio?', tipo: 'moneda', obl: false, nlc: true, ayuda: 'Herramientas, comisiones, movilidad, personal.' },
    ],
  },
  {
    titulo: 'Clientes y cartera',
    preguntas: [
      { campo: 'clientes_activos', label: '¿Cuántos clientes activos tenés actualmente?', tipo: 'numero', obl: true, nlc: true },
      { campo: 'clientes_nuevos_mes', label: '¿Cuántos clientes nuevos sumás por mes en promedio?', tipo: 'numero', obl: false, nlc: true },
      { campo: 'ticket_promedio', label: '¿Cuál es el monto promedio que prestás por cliente?', tipo: 'moneda', obl: true, nlc: true },
      { campo: 'estructura_plazos', label: '¿En cuántas cuotas prestás habitualmente?', tipo: 'texto_largo', obl: true, nlc: false, ayuda: 'Detallá los tramos si tenés varios.' },
      { campo: 'plazo_promedio_meses', label: '¿Cuál es el plazo promedio de tus créditos, en meses?', tipo: 'numero', obl: false, nlc: true },
      { campo: 'perfil_cliente', label: '¿Qué tipo de cliente atendés principalmente?', tipo: 'multi', obl: true, nlc: false, opciones: ['Empleados en relación de dependencia', 'Monotributistas', 'Comerciantes', 'Jubilados', 'Empleados públicos', 'Informales', 'Otro'] },
      { campo: 'recurrencia', label: '¿Qué porcentaje de tus clientes renueva o vuelve a pedir?', tipo: 'porcentaje', obl: false, nlc: true },
    ],
  },
  {
    titulo: 'Precio y condiciones',
    preguntas: [
      { campo: 'tasa_declarada', label: '¿Qué interés o recargo cobrás?', tipo: 'texto', obl: true, nlc: true, ayuda: 'Indicá el porcentaje y si es mensual o sobre el total.' },
      { campo: 'ejemplo_total_100k', label: 'Sobre un préstamo de $100.000 a 6 cuotas, ¿cuánto termina devolviendo el cliente en total?', tipo: 'moneda', obl: true, nlc: true },
      { campo: 'punitorio', label: '¿Cobrás punitorio por atraso? ¿Cuánto?', tipo: 'texto', obl: true, nlc: true },
      { campo: 'tasa_competencia', label: '¿Sabés qué están cobrando otros prestamistas en tu zona?', tipo: 'texto', obl: false, nlc: true },
    ],
  },
  {
    titulo: 'Aprobación y riesgo',
    preguntas: [
      { campo: 'documentacion_solicitada', label: '¿Qué documentación pedís antes de aprobar un préstamo?', tipo: 'multi', obl: true, nlc: false, opciones: ['DNI', 'Recibo de sueldo', 'Constancia de monotributo', 'Comprobante de domicilio', 'Verificación de redes sociales', 'Referencias personales', 'Ninguna'] },
      { campo: 'firma_documentacion', label: '¿Firmás contrato y pagaré con tus clientes?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Sí, contrato y pagaré', 'Solo contrato', 'Solo pagaré', 'No, presto de palabra'] },
      { campo: 'porcentaje_documentado', label: 'Si firmás, ¿en qué porcentaje de tus operaciones?', tipo: 'porcentaje', obl: false, nlc: true },
      { campo: 'criterio_monto', label: '¿Cómo decidís cuánto dinero prestarle a cada cliente?', tipo: 'texto_largo', obl: true, nlc: false },
      { campo: 'criterios_aprobacion', label: '¿Tenés criterios claros y escritos para aprobar o rechazar?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Sí, escritos', 'Los tengo en la cabeza pero no escritos', 'No tengo criterios definidos'] },
      { campo: 'herramienta_consulta', label: '¿Consultás Veraz, Nosis, BCRA, Equifax u otra herramienta? ¿Cuál?', tipo: 'texto', obl: true, nlc: false },
      { campo: 'politica_garantias', label: '¿En qué casos pedís garante o garantía?', tipo: 'texto_largo', obl: true, nlc: false },
    ],
  },
  {
    titulo: 'Cobranza y mora',
    preguntas: [
      { campo: 'mora_clientes', label: '¿Qué porcentaje de tus clientes está atrasado hoy?', tipo: 'porcentaje', obl: true, nlc: true },
      { campo: 'monto_en_mora', label: '¿Cuánto dinero tenés hoy atrasado o en riesgo de cobro?', tipo: 'moneda', obl: true, nlc: true },
      { campo: 'proceso_cobranza', label: '¿Tenés un proceso definido para cobrar antes, durante y después del vencimiento?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Sí, con pasos definidos', 'Solo aviso el día del vencimiento', 'Solo reclamo cuando ya se atrasó', 'No tengo proceso'] },
      { campo: 'descripcion_cobranza', label: 'Contame cómo cobrás hoy: qué hacés y cuándo.', tipo: 'texto_largo', obl: true, nlc: false },
      { campo: 'dificultad_cobranza', label: '¿Cuál es tu mayor dificultad al momento de cobrar?', tipo: 'texto_largo', obl: true, nlc: false },
    ],
  },
  {
    titulo: 'Procesos, ventas y escala',
    preguntas: [
      { campo: 'sistema_registro', label: '¿Cómo registrás hoy tus préstamos?', tipo: 'multi', obl: true, nlc: false, opciones: ['Cuaderno', 'Excel o Sheets', 'App de préstamos', 'Controla', 'Otro sistema'] },
      { campo: 'canales_captacion', label: '¿Cómo conseguís clientes actualmente?', tipo: 'multi', obl: true, nlc: false, opciones: ['Referidos de clientes', 'Vendedores comisionistas', 'WhatsApp e historias', 'Instagram', 'Folletos y volantes', 'Publicidad paga', 'Comerciantes aliados'] },
      { campo: 'equipo', label: '¿Trabajás solo o tenés equipo? Si tenés, ¿quién hace qué?', tipo: 'texto_largo', obl: true, nlc: false },
      { campo: 'situacion_fiscal', label: '¿Estás formalizado?', tipo: 'opcion', obl: true, nlc: false, opciones: ['Sin formalizar', 'Monotributo', 'SAS o SRL constituida', 'En trámite'] },
      { campo: 'unidad_ventas', label: '¿Vendés productos financiados además de prestar dinero?', tipo: 'opcion', obl: true, nlc: false, opciones: ['No, solo presto dinero', 'Sí, ya vendo productos', 'No, pero me interesa arrancar'] },
      { campo: 'prioridad_declarada', label: 'Si tuvieras que ordenar una sola área esta semana, ¿cuál sería?', tipo: 'multi', obl: true, nlc: false, opciones: ['Ventas', 'Aprobación', 'Cobranza', 'Capital', 'Procesos', 'Formalización'] },
    ],
  },
  {
    titulo: 'Proyección',
    descripcion: 'Adónde querés llegar. De acá salen las metas numéricas de tu plan de 90 días.',
    preguntas: [
      // Las tres metas del trimestre. Sin casilla a propósito: son intenciones,
      // no mediciones — el alumno siempre tiene una, aunque sea aproximada.
      // Quedan fuera del índice de claridad (ver tipos.ts).
      { campo: 'meta_clientes_90d', label: '¿A cuántos clientes querés llegar en los próximos 90 días?', tipo: 'numero', obl: true, nlc: false, ayuda: 'Un número, aunque sea aproximado.' },
      { campo: 'meta_capital_90d', label: '¿Cuánto capital calculás que necesitás tener colocado para llegar a ese objetivo?', tipo: 'moneda', obl: true, nlc: false },
      { campo: 'meta_ganancia_90d', label: '¿Cuánta ganancia neta mensual querés estar generando dentro de 90 días?', tipo: 'moneda', obl: true, nlc: false },
      { campo: 'vision_12m', label: '¿Dónde querés estar con este negocio dentro de 12 meses?', tipo: 'texto_largo', obl: true, nlc: false },
      { campo: 'freno_percibido', label: '¿Qué es lo que más te frena para llegar ahí?', tipo: 'texto_largo', obl: true, nlc: false },
    ],
  },
] as const;

/** Índice plano campo → pregunta (para derivar la validación sin recorrer bloques). */
export const PREGUNTA_POR_CAMPO: ReadonlyMap<CampoRespuesta, Pregunta> = new Map(
  BLOQUES.flatMap((b) => b.preguntas).map((p) => [p.campo, p]),
);

// ───────────────────── Bloque 0 · complemento público de la ficha ─────────────────────

/**
 * Los campos del bloque 0 que el ALUMNO puede aportar por el link público, con
 * semántica completar-si-falta: solo llenan huecos de la ficha, nunca pisan lo
 * que el consultor ya cargó. `nombre`, `programa` y `moneda` NO están: son la
 * identidad del alumno, los fija el consultor al alta y el link no los toca.
 */
export interface PreguntaFicha {
  campo: 'edad' | 'zona' | 'whatsapp' | 'marca_comercial' | 'canal_origen';
  label: string;
  tipo: 'numero' | 'texto' | 'opcion';
  /** Obligatoria SI la ficha no la tiene todavía. */
  obl: boolean;
  opciones?: readonly string[];
}

export const PREGUNTAS_FICHA: readonly PreguntaFicha[] = [
  { campo: 'edad', label: 'Edad', tipo: 'numero', obl: true },
  { campo: 'zona', label: 'Ciudad y provincia donde operás', tipo: 'texto', obl: true },
  { campo: 'whatsapp', label: 'WhatsApp de contacto', tipo: 'texto', obl: true },
  { campo: 'marca_comercial', label: '¿Tenés una marca comercial? ¿Cómo se llama?', tipo: 'texto', obl: false },
  { campo: 'canal_origen', label: '¿Cómo conociste Más Activos?', tipo: 'opcion', obl: true, opciones: ['Instagram', 'TikTok', 'YouTube', 'Referido de un alumno', 'Publicidad', 'Otro'] },
] as const;

export type CampoFicha = PreguntaFicha['campo'];
