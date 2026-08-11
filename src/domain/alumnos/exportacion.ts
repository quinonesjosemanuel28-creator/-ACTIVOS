/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Exportación del diagnóstico para la skill.
 *
 * Traduce un diagnóstico guardado al texto que consume `plan-okr-90-dias`
 * fuera de la app. El consultor lo copia, lo pega en Claude, le suma su
 * criterio y de ahí sale el plan. La generación NO se automatiza: el criterio
 * de qué OKRs poner y en qué orden es el valor de la consultoría.
 *
 * POR QUÉ HAY UN MAPEO Y NO UN VOLCADO
 *
 * La skill está escrita alrededor de 30 preguntas en tres bloques
 * (Ordenar / Optimizar / Escalar). Nuestro formulario tiene 48 en otros ocho.
 * No son la misma estructura: hay 16 preguntas que coinciden, 6 que coinciden
 * en parte y 5 que el formulario no releva. Volcar los campos crudos obligaría
 * a la skill a adivinar; el mapeo le entrega cada pregunta en su lugar y, sobre
 * todo, DECLARA lo que falta en vez de dejar un hueco silencioso.
 *
 * El formulario además tiene datos que la skill no pide y que valen oro para el
 * plan (tasa efectiva, ticket promedio, costo del capital, monto en mora): van
 * en su propia sección al final, no se descartan.
 */
import { METRICAS_CLARIDAD, nivelClaridad, SUFIJO_SIN_DATO, type MetricaClaridad } from './claridad';
import { PREGUNTA_POR_CAMPO } from './formulario';
import { CAMPOS_RESPUESTA, esCampoMulti, type Alumno, type CampoRespuesta, type Diagnostico } from './tipos';

type BloqueSkill = 'ORDENAR' | 'OPTIMIZAR' | 'ESCALAR';

interface RenglonSkill {
  bloque: BloqueSkill;
  /** Número de la pregunta en la skill (1–30). El orden es su contrato. */
  n: number;
  pregunta: string;
  /** Campos del formulario que la responden. Vacío = no relevada. */
  campos: readonly string[];
  /** Aclaración para el consultor/la skill cuando la correspondencia no es exacta. */
  nota?: string;
}

/**
 * Las 30 preguntas de la skill, con el campo del formulario que las contesta.
 * Cuando `campos` está vacío, el formulario no la releva: se exporta como
 * pendiente para que la skill la mande a la sección 12 en vez de inventarla.
 */
const MAPA_SKILL: readonly RenglonSkill[] = [
  // ── Bloque 1 · ORDENAR ──
  { bloque: 'ORDENAR', n: 1, pregunta: '¿Cuántos clientes activos tenés actualmente?', campos: ['clientes_activos'] },
  { bloque: 'ORDENAR', n: 2, pregunta: '¿Cuánto capital total tenés colocado en la calle?', campos: ['capital_colocado'] },
  { bloque: 'ORDENAR', n: 3, pregunta: '¿Cuánto recaudás por mes entre capital e intereses?', campos: ['recupero_mensual'],
    nota: 'El formulario releva el RECUPERO DE CAPITAL mensual. La ganancia va aparte, en la pregunta 4.' },
  { bloque: 'ORDENAR', n: 4, pregunta: '¿Cuánto te queda realmente de ganancia neta mensual?', campos: ['ganancia_mensual'] },
  { bloque: 'ORDENAR', n: 5, pregunta: '¿Tenés separado el capital de trabajo, la ganancia, los gastos y el dinero personal?', campos: ['separacion_dinero'] },
  { bloque: 'ORDENAR', n: 6, pregunta: '¿Dónde llevás hoy el control de tus créditos?', campos: ['sistema_registro'] },
  { bloque: 'ORDENAR', n: 7, pregunta: '¿Sabés exactamente cuánto tiene que pagar cada cliente esta semana y cuánto está atrasado?', campos: [] },
  { bloque: 'ORDENAR', n: 8, pregunta: '¿Qué porcentaje de tu cartera está en mora actualmente?', campos: ['mora_clientes', 'monto_en_mora'] },
  { bloque: 'ORDENAR', n: 9, pregunta: '¿Todos tus créditos están respaldados con contrato, pagaré o algún documento firmado?', campos: ['firma_documentacion', 'porcentaje_documentado', 'documentacion_solicitada'] },
  { bloque: 'ORDENAR', n: 10, pregunta: '¿Cuál es el mayor desorden que hoy te está frenando?', campos: ['bloqueo_principal', 'prioridad_declarada'] },

  // ── Bloque 2 · OPTIMIZAR ──
  { bloque: 'OPTIMIZAR', n: 11, pregunta: '¿Qué criterio usás hoy para aprobar o rechazar un crédito?', campos: ['criterios_aprobacion', 'criterio_monto'] },
  { bloque: 'OPTIMIZAR', n: 12, pregunta: '¿Consultás herramientas como Equifax, Veraz u otra fuente antes de entregar dinero?', campos: ['herramienta_consulta'] },
  { bloque: 'OPTIMIZAR', n: 13, pregunta: '¿Clasificás a tus clientes por riesgo bajo, medio y alto?', campos: [] },
  { bloque: 'OPTIMIZAR', n: 14, pregunta: '¿Qué tipo de cliente te genera mejor rentabilidad y menos problemas?', campos: ['perfil_cliente'],
    nota: 'El formulario releva A QUIÉN le presta, no cuál le rinde mejor. Confirmarlo en la llamada.' },
  { bloque: 'OPTIMIZAR', n: 15, pregunta: '¿Tenés un protocolo de cobranza definido antes, durante y después del vencimiento?', campos: ['proceso_cobranza', 'descripcion_cobranza'] },
  { bloque: 'OPTIMIZAR', n: 16, pregunta: '¿Cuántos días dejás pasar antes de llamar o escalar una deuda atrasada?', campos: ['descripcion_cobranza'],
    nota: 'Puede estar dentro del relato de cobranza; si no aparece, preguntarlo.' },
  { bloque: 'OPTIMIZAR', n: 17, pregunta: '¿Aplicás interés por mora o punitorios? ¿Cómo los calculás?', campos: ['punitorio'] },
  { bloque: 'OPTIMIZAR', n: 18, pregunta: '¿Tenés un sistema para priorizar a quién cobrar primero?', campos: [] },
  { bloque: 'OPTIMIZAR', n: 19, pregunta: '¿Llevás registro de los compromisos de pago que asumen los clientes?', campos: [] },
  { bloque: 'OPTIMIZAR', n: 20, pregunta: '¿Sabés qué porcentaje de lo que esperás cobrar cada semana, efectivamente entra?', campos: [] },

  // ── Bloque 3 · ESCALAR ──
  { bloque: 'ESCALAR', n: 21, pregunta: '¿A cuántos clientes querés llegar en los próximos 90 días?', campos: ['meta_clientes_90d'] },
  { bloque: 'ESCALAR', n: 22, pregunta: '¿Cuánto capital necesitás colocar para llegar a ese objetivo?', campos: ['meta_capital_90d'] },
  { bloque: 'ESCALAR', n: 23, pregunta: '¿Cuánta ganancia neta mensual querés generar dentro de 90 días?', campos: ['meta_ganancia_90d'] },
  { bloque: 'ESCALAR', n: 24, pregunta: '¿Cómo conseguís clientes actualmente?', campos: ['canales_captacion'] },
  { bloque: 'ESCALAR', n: 25, pregunta: '¿Tenés una marca comercial profesional con nombre, logo, WhatsApp Business y propuesta clara?', campos: ['marca_comercial'],
    nota: 'El formulario releva solo el NOMBRE de la marca. Logo, WhatsApp Business y propuesta: confirmar en la llamada.' },
  { bloque: 'ESCALAR', n: 26, pregunta: '¿Qué estructura necesitás crear ahora?', campos: ['prioridad_declarada', 'unidad_ventas'] },
  { bloque: 'ESCALAR', n: 27, pregunta: '¿Tenés alguien que te ayude hoy o hacés todo vos?', campos: ['equipo'] },
  { bloque: 'ESCALAR', n: 28, pregunta: '¿Estás formalizado o operás de manera informal?', campos: ['situacion_fiscal'] },
  { bloque: 'ESCALAR', n: 29, pregunta: '¿Tenés capital propio, de terceros, o apalancamiento bancario trabajando en la cartera?', campos: ['origen_capital', 'costo_capital_mensual'] },
  { bloque: 'ESCALAR', n: 30, pregunta: 'Si tuvieras que elegir 3 prioridades estratégicas para los próximos 90 días, ¿cuáles serían?', campos: ['prioridad_declarada', 'objetivo_6m'] },
] as const;

/** Campos ya usados por el mapeo (para saber qué queda como dato adicional). */
const CAMPOS_MAPEADOS = new Set(MAPA_SKILL.flatMap((r) => r.campos));

// ───────────────────────── Formato de valores ─────────────────────────

const miles = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** Datos del diagnóstico + los de la ficha que la skill necesita, en un solo mapa. */
function datosDe(alumno: Alumno, d: Diagnostico): Record<string, unknown> {
  return { ...d.respuestas, marca_comercial: alumno.marcaComercial, zona: alumno.zona };
}

/**
 * Un valor listo para leer. Distingue los tres estados que importan:
 * respondido, "el alumno no lo sabe" (casilla), y sin responder.
 */
function valorLegible(campo: string, datos: Record<string, unknown>, moneda: string): string {
  if (datos[`${campo}${SUFIJO_SIN_DATO}`] === true) return '**El alumno declaró que no conoce este dato.**';

  const v = datos[campo];
  if (v === null || v === undefined || v === '') return '_Sin responder._';

  if (esCampoMulti(campo) && typeof v === 'string') {
    try {
      const lista = JSON.parse(v) as string[];
      return lista.length ? lista.join(', ') : '_Sin responder._';
    } catch {
      return String(v);
    }
  }
  if (typeof v === 'number') {
    const tipo = PREGUNTA_POR_CAMPO.get(campo as CampoRespuesta)?.tipo;
    if (tipo === 'moneda') return `${moneda} ${miles(v)}`;
    if (tipo === 'porcentaje') return `${miles(v)}%`;
    return miles(v);
  }
  return String(v);
}

/** Etiqueta de la pregunta del formulario (para las secciones que no son el mapeo). */
const etiquetaDe = (campo: string): string => PREGUNTA_POR_CAMPO.get(campo as CampoRespuesta)?.label ?? campo;

// ───────────────────────── Información pendiente (sección 12) ─────────────────────────

export interface FilaPendiente {
  dato: string;
  estado: string;
  prioridad: 'Alta' | 'Media';
}

/**
 * Las métricas que quedaron sin dato, armadas como la tabla de la sección 12
 * del plan ("Información pendiente para afinar").
 *
 * La prioridad sale de la obligatoriedad de la pregunta en el formulario: una
 * obligatoria sin dato es un agujero en la foto financiera (Alta); una opcional
 * es afinamiento (Media). Es una heurística, no dogma: el consultor la ajusta.
 */
export function pendientesDe(d: Diagnostico): FilaPendiente[] {
  const pendientes: FilaPendiente[] = [];
  for (const m of METRICAS_CLARIDAD) {
    const pregunta = PREGUNTA_POR_CAMPO.get(m as MetricaClaridad as CampoRespuesta);
    if (!pregunta) continue;
    const declarado = d.respuestas[`${m}${SUFIJO_SIN_DATO}`] === true;
    const vacio = d.respuestas[m] === null || d.respuestas[m] === undefined || d.respuestas[m] === '';
    if (!declarado && !vacio) continue;
    pendientes.push({
      dato: pregunta.label,
      estado: declarado ? 'El alumno no lo conoce' : 'Sin responder',
      prioridad: pregunta.obl ? 'Alta' : 'Media',
    });
  }
  return pendientes;
}

// ───────────────────────── Documento ─────────────────────────

const TITULO_BLOQUE: Record<BloqueSkill, string> = {
  ORDENAR: 'Bloque 1 · ORDENAR',
  OPTIMIZAR: 'Bloque 2 · OPTIMIZAR',
  ESCALAR: 'Bloque 3 · ESCALAR',
};

const LECTURA_INDICE: Record<string, string> = {
  no_mide: 'No mide su negocio · la consultoría arranca por ordenamiento básico',
  parcial: 'Mide de forma parcial e intuitiva · se puede diagnosticar, con datos a confirmar',
  conoce: 'Conoce su negocio · se puede ir directo a estrategia y margen',
  tablero: 'Opera con tablero real · candidato a escalamiento o delegación',
};

/**
 * Documento Markdown listo para pegar en Claude junto a la skill.
 *
 * Markdown y no JSON a propósito: la skill acepta "un documento de diagnóstico
 * subido por el usuario", el consultor lo lee de un vistazo antes de mandarlo,
 * y si algo quedó mal lo corrige a mano en el chat.
 */
export function exportarDiagnostico(alumno: Alumno, d: Diagnostico): string {
  const datos = datosDe(alumno, d);
  const moneda = d.moneda;
  const l: string[] = [];

  // ── Cabecera ──
  l.push(`# Diagnóstico — ${alumno.nombre}`, '');
  l.push(`- **Programa:** ${d.programa}`);
  l.push(`- **Ubicación:** ${alumno.zona ?? '_sin dato_'}`);
  l.push(`- **Marca comercial:** ${alumno.marcaComercial ?? '_no tiene o no la declaró_'}`);
  l.push(`- **Moneda de todos los montos:** ${moneda}`);
  l.push(`- **Fecha del diagnóstico:** ${d.fecha.slice(0, 10)}`);
  if (alumno.edad !== null) l.push(`- **Edad:** ${alumno.edad}`);

  const nivel = nivelClaridad(d.indiceClaridad);
  l.push(
    `- **Índice de claridad:** ${d.indiceClaridad === null ? 'sin datos' : `${d.indiceClaridad}%`} ` +
      `(${d.metricasRespondidas} de ${d.metricasAplicables} métricas duras con dato)` +
      (nivel ? ` — ${LECTURA_INDICE[nivel]}` : ''),
  );
  l.push(
    `- **Origen:** ${d.origen === 'alumno' ? 'formulario completado por el alumno' : 'cargado por el consultor'}` +
      (d.editadoPorConsultor ? ', **corregido por el consultor durante la consultoría**' : ''),
  );
  l.push('');

  // ── Las 30 preguntas ──
  let bloqueActual: BloqueSkill | null = null;
  for (const r of MAPA_SKILL) {
    if (r.bloque !== bloqueActual) {
      bloqueActual = r.bloque;
      l.push('', `## ${TITULO_BLOQUE[r.bloque]}`, '');
    }
    l.push(`**${r.n}. ${r.pregunta}**`);
    if (r.campos.length === 0) {
      l.push('_No relevado en el formulario — preguntarlo en la llamada._');
    } else if (r.campos.length === 1) {
      l.push(valorLegible(r.campos[0]!, datos, moneda));
    } else {
      // Varios campos del formulario contestan una sola pregunta de la skill:
      // sin la etiqueta delante, dos valores apilados son indistinguibles
      // (peor todavía si los dos son "no lo sabe").
      for (const campo of r.campos) l.push(`- ${etiquetaDe(campo)} → ${valorLegible(campo, datos, moneda)}`);
    }
    if (r.nota) l.push(`> Nota: ${r.nota}`);
    l.push('');
  }

  // ── Lo que el formulario tiene de más ──
  const extra = CAMPOS_RESPUESTA.filter((c) => !CAMPOS_MAPEADOS.has(c));
  if (extra.length > 0) {
    l.push('', '## Datos adicionales del diagnóstico', '');
    l.push('_El formulario de +Activos releva más que las 30 preguntas. Esto no entra en el cuestionario base pero sirve para calibrar margen, riesgo y metas._', '');
    for (const campo of extra) {
      l.push(`**${etiquetaDe(campo)}**`, valorLegible(campo, datos, moneda), '');
    }
  }

  // ── Sección 12 pre-armada ──
  const pendientes = pendientesDe(d);
  l.push('', '## Información pendiente para afinar el plan', '');
  if (pendientes.length === 0) {
    l.push('_El alumno respondió todas las métricas duras que le aplican._');
  } else {
    l.push('_Va directo a la sección 12 del plan. Prioridad Alta = obligatoria del formulario sin dato._', '');
    l.push('| Dato | Estado | Prioridad |', '|---|---|---|');
    for (const p of pendientes) l.push(`| ${p.dato} | ${p.estado} | ${p.prioridad} |`);
  }
  l.push('');

  return l.join('\n');
}
