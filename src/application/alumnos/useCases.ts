/**
 * CAPA 2 — APLICACIÓN · Módulo de alumnos · Casos de uso.
 *
 * Orquestan dominio + persistencia. Dos cosas viven acá y en ningún otro lado:
 *
 *  1. **El ámbito por fila se aplica ANTES de consultar.** Los listados bajan
 *     el titular forzado hasta el WHERE (`titularSegunAlcance`); las lecturas
 *     de una fila comparan después de traerla (`alcanzaFila`) y devuelven null
 *     si no la alcanzan — como si no existiera, sin revelar que existe.
 *  2. **El token del formulario público es la única credencial del alumno.**
 *     No hay sesión: quien tiene el link, es el alumno. De ahí que sea
 *     aleatorio de 256 bits, de un solo uso y con vencimiento.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { alcanzaFila, titularSegunAlcance, type Alcance } from '../../domain/auth/permisos';
import { calcularClaridad, METRICAS_CLARIDAD, SUFIJO_SIN_DATO } from '../../domain/alumnos/claridad';
import { esCampoMulti } from '../../domain/alumnos/tipos';
import { exportarDiagnostico } from '../../domain/alumnos/exportacion';
import {
  DIAS_VIGENCIA_TOKEN,
  estadoToken,
  type Alumno,
  type Diagnostico,
  type MotivoTokenInvalido,
  type TokenDiagnostico,
} from '../../domain/alumnos/tipos';
import { PREGUNTAS_FICHA, type CampoFicha } from '../../domain/alumnos/formulario';
import {
  DIAS_VIGENCIA_LINK,
  estadoAcciones,
  estadoTokenSeguimiento,
  faseActual,
  planVencido,
  ultimaActividadAlumno,
  type Accion,
  type Checkin,
  type Fase,
  type Kr,
  type MotivoSeguimientoInvalido,
  type Okr,
  type Plan,
  type PlanCompleto,
  type TokenSeguimiento,
} from '../../domain/alumnos/plan';
import { advertenciasDe, bloquePlanSchema, extraerBloque, type BloquePlan } from './planSchemas';
import {
  avanceKrs,
  calcularSalud,
  chipFase,
  diasDelPlan,
  puntajeRiesgo,
  type ChipFase,
  type EstadoAlumno,
  type Salud,
  type SaludCalculada,
} from '../../domain/alumnos/panel';
import {
  fechaCierreEstimada,
  diasEntre,
  MIME_DOCX,
  MIME_PDF,
  validarDocumento,
  type CambioFechaPlan,
  type Kr as KrPlan,
  type PlanDocumento,
} from '../../domain/alumnos/plan';
import {
  aRespuestas,
  alumnoInputSchema,
  alumnoPatchSchema,
  diagnosticoInputSchema,
  diagnosticoPatchSchema,
  estadoAlumnoInputSchema,
  fechaInicioInputSchema,
  fichaPublicaSchema,
  krPatchSchema,
  type FichaPublica,
} from './schemas';
import type { UsuariosRepo } from '../auth/ports';
import type { FiltrosAlumnos, ReposAlumnos } from './ports';

export class ErrorAlumnos extends Error {
  constructor(
    public readonly codigo: 'NO_ENCONTRADO' | 'VALIDACION' | 'TOKEN_INVALIDO',
    mensaje: string,
    /** Detalle del token, para que el server elija el mensaje al alumno. */
    public readonly motivo?: MotivoTokenInvalido | MotivoSeguimientoInvalido,
  ) {
    super(mensaje);
    this.name = 'ErrorAlumnos';
  }
}

const ahoraIso = () => new Date().toISOString();

/**
 * Token del link público: 32 bytes de aleatoriedad criptográfica. NO se usa el
 * generador secuencial de `auth/useCases` (Date.now + contador): eso es
 * predecible, y acá el token ES la credencial — adivinarlo da acceso al
 * diagnóstico de otra persona.
 */
const nuevoToken = () => randomBytes(32).toString('base64url');

// ───────────────────────── Ficha del alumno (consultor) ─────────────────────────

export async function crearAlumno(
  repos: ReposAlumnos,
  consultorId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<Alumno> {
  const input = alumnoInputSchema.parse(entrada);
  const alumno: Alumno = {
    id: randomUUID(),
    consultorId,
    nombre: input.nombre,
    edad: input.edad ?? null,
    zona: input.zona ?? null,
    whatsapp: input.whatsapp ?? null,
    marcaComercial: input.marcaComercial ?? null,
    programa: input.programa,
    canalOrigen: input.canalOrigen ?? null,
    moneda: input.moneda,
    activo: true,
    estado: 'ACTIVO',
    estadoActualizadoEn: null,
    idCierreVinculado: input.idCierreVinculado ?? null,
    eliminadoEn: null,
    eliminadoPor: null,
    creadoEn: ahora,
  };
  await repos.alumnos.guardar(alumno);
  // El historial arranca con la primera asignación: si se abriera recién en la
  // primera reasignación, el tramo original quedaría sin registrar y el
  // historial mentiría sobre quién lo atendió al principio.
  await repos.historial.abrirTramo({
    id: randomUUID(),
    alumnoId: alumno.id,
    consultorId,
    desde: ahora,
    hasta: null,
    creadoEn: ahora,
  });
  return alumno;
}

/** Listado de la cartera. El ámbito manda sobre lo que pida el cliente. */
export async function listarAlumnos(
  repos: ReposAlumnos,
  alcance: Alcance,
  filtros: FiltrosAlumnos = {},
): Promise<Alumno[]> {
  return repos.alumnos.listar({
    ...filtros,
    consultorId: titularSegunAlcance(filtros.consultorId, alcance),
  });
}

/**
 * Ficha de un alumno. Fuera de ámbito devuelve null, no un 403: un consultor no
 * tiene por qué enterarse de que el alumno de otro existe.
 */
export async function obtenerAlumno(repos: ReposAlumnos, alcance: Alcance, id: string): Promise<Alumno | null> {
  const alumno = await repos.alumnos.obtener(id);
  if (!alumno || !alcanzaFila(alcance, alumno.consultorId)) return null;
  return alumno;
}

export async function editarAlumno(
  repos: ReposAlumnos,
  alcance: Alcance,
  id: string,
  entrada: unknown,
): Promise<Alumno> {
  const alumno = await obtenerAlumno(repos, alcance, id);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  const patch = alumnoPatchSchema.parse(entrada);
  const actualizado: Alumno = {
    ...alumno,
    ...(patch.nombre !== undefined && { nombre: patch.nombre }),
    ...(patch.edad !== undefined && { edad: patch.edad ?? null }),
    ...(patch.zona !== undefined && { zona: patch.zona ?? null }),
    ...(patch.whatsapp !== undefined && { whatsapp: patch.whatsapp ?? null }),
    ...(patch.marcaComercial !== undefined && { marcaComercial: patch.marcaComercial ?? null }),
    ...(patch.programa !== undefined && { programa: patch.programa }),
    ...(patch.canalOrigen !== undefined && { canalOrigen: patch.canalOrigen ?? null }),
    ...(patch.moneda !== undefined && { moneda: patch.moneda }),
    ...(patch.idCierreVinculado !== undefined && { idCierreVinculado: patch.idCierreVinculado ?? null }),
  };
  await repos.alumnos.guardar(actualizado);
  return actualizado;
}

// ───────────────────────── Token del formulario ─────────────────────────

/**
 * Emite el link de diagnóstico. Invalida los pendientes del alumno: reenviar
 * el link deja muerto al anterior, así no quedan dos formularios vivos para la
 * misma persona (y dos diagnósticos compitiendo por el mismo envío).
 */
export async function emitirToken(
  repos: ReposAlumnos,
  alcance: Alcance,
  alumnoId: string,
  ahora = ahoraIso(),
): Promise<TokenDiagnostico> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');

  await repos.tokens.invalidarPendientes(alumnoId, ahora);
  const vence = new Date(new Date(ahora).getTime() + DIAS_VIGENCIA_TOKEN * 24 * 60 * 60 * 1000);
  const token: TokenDiagnostico = {
    token: nuevoToken(),
    alumnoId,
    expiraEn: vence.toISOString(),
    usadoEn: null,
    diagnosticoId: null,
    creadoEn: ahora,
  };
  await repos.tokens.crear(token);
  return token;
}

/** Valor de la ficha para un campo del bloque 0 público. */
function valorFicha(alumno: Alumno, campo: CampoFicha): string | number | null {
  switch (campo) {
    case 'edad': return alumno.edad;
    case 'zona': return alumno.zona;
    case 'whatsapp': return alumno.whatsapp;
    case 'marca_comercial': return alumno.marcaComercial;
    case 'canal_origen': return alumno.canalOrigen;
  }
}

/** Campos del bloque 0 que la ficha todavía no tiene (para preguntarlos en el formulario). */
function fichaPendienteDe(alumno: Alumno): CampoFicha[] {
  return PREGUNTAS_FICHA.filter((p) => valorFicha(alumno, p.campo) === null).map((p) => p.campo);
}

/** Lo mínimo que el formulario público necesita saber para saludar al alumno. */
export interface FormularioAbierto {
  nombre: string;
  programa: string;
  moneda: string;
  /**
   * Campos del bloque 0 que faltan en la ficha, para que el formulario los
   * pregunte. Solo NOMBRES de campo, jamás valores: la ruta es pública.
   */
  fichaPendiente: CampoFicha[];
}

/**
 * Abre el formulario público con un token. Devuelve SOLO el saludo (nombre,
 * programa, moneda) y qué campos de ficha faltan: la ruta no tiene sesión, así
 * que todo lo que se devuelva acá es público para quien tenga el link. Ni
 * consultor, ni valores de la ficha, ni diagnósticos anteriores.
 */
export async function abrirFormulario(
  repos: ReposAlumnos,
  token: string,
  ahora = ahoraIso(),
): Promise<FormularioAbierto> {
  const fila = await repos.tokens.obtener(token);
  const estado = estadoToken(fila, ahora);
  if (!estado.valido) throw new ErrorAlumnos('TOKEN_INVALIDO', 'El link no es válido.', estado.motivo);

  const alumno = await repos.alumnos.obtener(fila!.alumnoId);
  if (!alumno || !alumno.activo) {
    throw new ErrorAlumnos('TOKEN_INVALIDO', 'El link no es válido.', 'inexistente');
  }
  return {
    nombre: alumno.nombre,
    programa: alumno.programa,
    moneda: alumno.moneda,
    fichaPendiente: fichaPendienteDe(alumno),
  };
}

/**
 * Completa la ficha con lo que aportó el alumno — SOLO los huecos. Lo que el
 * consultor ya cargó no se pisa jamás desde una ruta pública, y nombre,
 * programa y moneda ni siquiera se aceptan (no están en el esquema).
 */
function completarFicha(alumno: Alumno, aporte: FichaPublica): Alumno | null {
  let cambio = false;
  const actualizado = { ...alumno };
  if (alumno.edad === null && aporte.edad != null) { actualizado.edad = aporte.edad; cambio = true; }
  if (alumno.zona === null && aporte.zona != null) { actualizado.zona = aporte.zona; cambio = true; }
  if (alumno.whatsapp === null && aporte.whatsapp != null) { actualizado.whatsapp = aporte.whatsapp; cambio = true; }
  if (alumno.marcaComercial === null && aporte.marca_comercial != null) { actualizado.marcaComercial = aporte.marca_comercial; cambio = true; }
  if (alumno.canalOrigen === null && aporte.canal_origen != null) { actualizado.canalOrigen = aporte.canal_origen; cambio = true; }
  return cambio ? actualizado : null;
}

/**
 * Guarda el diagnóstico enviado desde el formulario público y consume el token.
 *
 * Cada envío es una fila NUEVA: el diagnóstico inicial y el de los 90 días
 * conviven para poder compararlos. Nunca un UPDATE.
 */
export async function enviarDiagnostico(
  repos: ReposAlumnos,
  token: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<Diagnostico> {
  const fila = await repos.tokens.obtener(token);
  const estado = estadoToken(fila, ahora);
  if (!estado.valido) throw new ErrorAlumnos('TOKEN_INVALIDO', 'El link no es válido.', estado.motivo);

  const alumno = await repos.alumnos.obtener(fila!.alumnoId);
  if (!alumno || !alumno.activo) {
    throw new ErrorAlumnos('TOKEN_INVALIDO', 'El link no es válido.', 'inexistente');
  }

  // El mismo body trae respuestas + complemento de ficha (bloque 0). Cada
  // esquema toma lo suyo; Zod descarta lo que no le corresponde.
  const datos = diagnosticoInputSchema.parse(entrada);
  const aporte = fichaPublicaSchema.parse(entrada);

  // Las obligatorias del bloque 0 se exigen SI la ficha no las tiene: acá, no
  // solo en la UI — la regla de la casa es que el borde real es el server.
  const faltantes = PREGUNTAS_FICHA.filter(
    (p) => p.obl && valorFicha(alumno, p.campo) === null && aporte[p.campo] == null,
  );
  if (faltantes.length > 0) {
    throw new ErrorAlumnos('VALIDACION', `Falta completar: ${faltantes.map((p) => p.label).join(' · ')}.`);
  }

  const respuestas = aRespuestas(datos as Record<string, unknown>);
  const claridad = calcularClaridad(respuestas);

  const diagnostico: Diagnostico = {
    id: randomUUID(),
    alumnoId: alumno.id,
    fecha: ahora,
    origen: 'alumno',
    editadoPorConsultor: false,
    // Foto del momento: la ficha puede cambiar después sin reinterpretar esto.
    programa: alumno.programa,
    moneda: alumno.moneda,
    indiceClaridad: claridad.indice,
    metricasAplicables: claridad.aplicables,
    metricasRespondidas: claridad.respondidas,
    respuestas,
    creadoEn: ahora,
  };
  await repos.diagnosticos.guardar(diagnostico);
  await repos.tokens.marcarUsado(token, ahora, diagnostico.id);

  // Recién acá se toca la ficha: si el diagnóstico no entró, la ficha tampoco.
  const fichaCompletada = completarFicha(alumno, aporte);
  if (fichaCompletada) await repos.alumnos.guardar(fichaCompletada);

  return diagnostico;
}

/**
 * Corrección del consultor sobre un diagnóstico EXISTENTE, durante la llamada.
 *
 * No crea una fila nueva: la regla "cada envío es una fila nueva" es para los
 * ENVÍOS del formulario. La corrección ajusta la fila y queda registrada con
 * `editadoPorConsultor` — para eso existen las dos columnas (origen dice quién
 * lo cargó; el flag dice que el consultor lo tocó después). La identidad del
 * envío (fecha, origen, foto de programa/moneda) no se toca, y el índice de
 * claridad se recalcula con las respuestas corregidas.
 */
export async function editarDiagnostico(
  repos: ReposAlumnos,
  alcance: Alcance,
  diagnosticoId: string,
  entrada: unknown,
): Promise<Diagnostico> {
  const d = await repos.diagnosticos.obtener(diagnosticoId);
  const alumno = d ? await repos.alumnos.obtener(d.alumnoId) : null;
  // Fuera de ámbito = inexistente: mismo trato que la ficha ajena.
  if (!d || !alumno || !alcanzaFila(alcance, alumno.consultorId)) {
    throw new ErrorAlumnos('NO_ENCONTRADO', 'Diagnóstico inexistente.');
  }

  const patch = diagnosticoPatchSchema.parse(entrada) as Record<string, unknown>;

  const respuestas = { ...d.respuestas };
  for (const [campo, valor] of Object.entries(patch)) {
    if (valor === undefined) continue; // ausente = no tocar lo guardado
    respuestas[campo] = esCampoMulti(campo) && Array.isArray(valor) ? JSON.stringify(valor) : (valor as never);
  }

  // Coherencia casilla ↔ valor, con las mismas reglas del envío:
  for (const m of METRICAS_CLARIDAD) {
    const flag = `${m}${SUFIJO_SIN_DATO}`;
    // Cargar un dato resuelve el "no lo sé" (salvo que el patch diga otra cosa).
    if (patch[flag] === undefined && patch[m] != null) respuestas[flag] = false;
    // Y la casilla marcada MANDA: nunca queda un valor junto a "sin dato".
    if (respuestas[flag] === true) respuestas[m] = null;
  }

  const claridad = calcularClaridad(respuestas);
  const actualizado: Diagnostico = {
    ...d,
    editadoPorConsultor: true,
    respuestas,
    indiceClaridad: claridad.indice,
    metricasAplicables: claridad.aplicables,
    metricasRespondidas: claridad.respondidas,
  };
  await repos.diagnosticos.actualizar(actualizado);
  return actualizado;
}

/**
 * Diagnóstico exportado en el formato que consume la skill del plan de 90
 * días. Mismo ámbito que la lectura: el diagnóstico de un alumno ajeno no
 * existe. Devuelve texto plano (Markdown) para copiar y pegar en Claude.
 */
export async function exportarDiagnosticoParaSkill(
  repos: ReposAlumnos,
  alcance: Alcance,
  diagnosticoId: string,
): Promise<{ nombreArchivo: string; contenido: string }> {
  const d = await repos.diagnosticos.obtener(diagnosticoId);
  const alumno = d ? await repos.alumnos.obtener(d.alumnoId) : null;
  if (!d || !alumno || !alcanzaFila(alcance, alumno.consultorId)) {
    throw new ErrorAlumnos('NO_ENCONTRADO', 'Diagnóstico inexistente.');
  }
  const slug = alumno.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  return {
    nombreArchivo: `Diagnostico_${slug}_${d.fecha.slice(0, 10)}.md`,
    contenido: exportarDiagnostico(alumno, d),
  };
}

// ───────────────────────── Plan de 90 días ─────────────────────────

/** Parsea lo pegado y valida el contrato. Errores de Zod suben tal cual (400). */
function parsearBloque(texto: unknown): { crudo: Record<string, unknown>; bloque: BloquePlan } {
  if (typeof texto !== 'string' || texto.trim() === '') {
    throw new ErrorAlumnos('VALIDACION', 'Pegá el bloque JSON que emitió la skill.');
  }
  const crudo = extraerBloque(texto);
  if (!crudo) {
    throw new ErrorAlumnos('VALIDACION', 'No se encontró un bloque JSON en lo pegado. Copiá el bloque completo, con sus llaves.');
  }
  return { crudo: crudo as Record<string, unknown>, bloque: bloquePlanSchema.parse(crudo) };
}

export interface PreviaPlan {
  /** Lo que se cargaría, ya validado. */
  bloque: BloquePlan;
  /** Lo que el consultor tiene que ver antes de confirmar. */
  advertencias: string[];
}

/**
 * Previa de la carga: valida el bloque y junta las advertencias SIN escribir
 * nada. La UI la muestra y el consultor confirma (pudiendo corregir la fecha
 * de inicio). Carga tolerante, previa ruidosa.
 */
export async function previaPlan(
  repos: ReposAlumnos,
  alcance: Alcance,
  alumnoId: string,
  texto: unknown,
): Promise<PreviaPlan> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');

  const { crudo, bloque } = parsearBloque(texto);
  const advertencias = advertenciasDe(crudo, bloque, alumno.nombre);

  // Un plan ya cargado con la misma fecha huele a doble pegado.
  const existentes = await repos.planes.listarPorAlumno(alumnoId);
  if (existentes.some((p) => p.plan.fechaInicio === bloque.fecha_inicio)) {
    advertencias.push(
      `Ya hay un plan cargado con inicio ${bloque.fecha_inicio}. Confirmar va a crear OTRO plan, no a reemplazarlo.`,
    );
  }
  return { bloque, advertencias };
}

/**
 * Carga el plan: crea el agregado entero (plan + okrs + krs + acciones) en una
 * transacción. `fechaInicio` pisa la del bloque si el consultor la corrigió en
 * la previa. No borra planes anteriores: los trimestres se acumulan.
 */
export async function cargarPlan(
  repos: ReposAlumnos,
  alcance: Alcance,
  alumnoId: string,
  texto: unknown,
  fechaInicio?: string,
  ahora = ahoraIso(),
): Promise<PlanCompleto> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');

  const { bloque } = parsearBloque(texto);
  const inicio = fechaInicio ?? bloque.fecha_inicio;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || Number.isNaN(Date.parse(`${inicio}T00:00:00Z`))) {
    throw new ErrorAlumnos('VALIDACION', 'La fecha de inicio va como YYYY-MM-DD.');
  }

  const plan: Plan = {
    id: randomUUID(),
    alumnoId: alumno.id,
    fechaInicio: inicio,
    etapa: bloque.etapa ?? null,
    objetivo90d: bloque.objetivo_90d ?? null,
    version: bloque.version,
    creadoEn: ahora,
  };

  const okrPorOrden = new Map<number, string>();
  const okrs: (Okr & { krs: Kr[] })[] = bloque.okrs.map((o) => {
    const okrId = randomUUID();
    okrPorOrden.set(o.orden, okrId);
    return {
      id: okrId,
      planId: plan.id,
      orden: o.orden,
      objetivo: o.objetivo,
      creadoEn: ahora,
      krs: o.krs.map((k, i) => ({
        id: randomUUID(),
        okrId,
        orden: i + 1,
        texto: k.texto,
        meta: k.meta ?? null,
        // El contrato de la skill no trae fechas ni cumplimiento: los fija el
        // consultor en el panel (ticket 7).
        vencimiento: null,
        cumplidoEn: null,
        creadoEn: ahora,
      })),
    };
  });

  const acciones: Accion[] = bloque.fases.flatMap((f) =>
    f.acciones.map((a, i) => ({
      id: randomUUID(),
      planId: plan.id,
      okrId: a.okr !== undefined ? okrPorOrden.get(a.okr)! : null,
      fase: f.fase,
      orden: i + 1,
      texto: a.texto,
      creadoEn: ahora,
    })),
  );

  const completo: PlanCompleto = { plan, okrs, acciones };
  await repos.planes.guardarCompleto(completo);
  return completo;
}

/** Planes del alumno (todos los trimestres), respetando el ámbito. */
export async function listarPlanes(repos: ReposAlumnos, alcance: Alcance, alumnoId: string): Promise<PlanCompleto[]> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  return repos.planes.listarPorAlumno(alumnoId);
}

/** Plan alcanzado por la sesión, o inexistente (mismo trato que la ficha ajena). */
async function planAlcanzado(repos: ReposAlumnos, alcance: Alcance, planId: string): Promise<PlanCompleto> {
  const pc = await repos.planes.obtener(planId);
  const alumno = pc ? await repos.alumnos.obtener(pc.plan.alumnoId) : null;
  if (!pc || !alumno || !alcanzaFila(alcance, alumno.consultorId)) {
    throw new ErrorAlumnos('NO_ENCONTRADO', 'Plan inexistente.');
  }
  return pc;
}

// ───────────────────────── Link de seguimiento ─────────────────────────

/**
 * Emite (u obtiene) el link de seguimiento del plan. ESTABLE a propósito: si
 * hay un token vivo se devuelve ESE — el link ya está en el WhatsApp del
 * alumno, y generar otro cada vez lo rompería. Solo revocar + volver a emitir
 * produce uno nuevo.
 *
 * Vence a los 120 días del INICIO del plan (90 de trimestre + 30 de gracia
 * para leer el resumen en la llamada de cierre), y nunca a menos de 30 días de
 * la emisión (por si se emite tarde).
 */
export async function emitirLinkSeguimiento(
  repos: ReposAlumnos,
  alcance: Alcance,
  planId: string,
  ahora = ahoraIso(),
): Promise<{ token: TokenSeguimiento; nuevo: boolean }> {
  const pc = await planAlcanzado(repos, alcance, planId);

  const vigente = await repos.seguimiento.vigenteDePlan(planId, ahora);
  if (vigente) return { token: vigente, nuevo: false };

  const desdeInicio = Date.parse(`${pc.plan.fechaInicio}T00:00:00Z`) + DIAS_VIGENCIA_LINK * 86_400_000;
  const minimo = Date.parse(ahora) + 30 * 86_400_000;
  const token: TokenSeguimiento = {
    token: nuevoToken(),
    planId,
    expiraEn: new Date(Math.max(desdeInicio, minimo)).toISOString(),
    revocadoEn: null,
    creadoEn: ahora,
  };
  await repos.seguimiento.crear(token);
  return { token, nuevo: true };
}

/** Da de baja el link vivo del plan (se filtró, o se quiere uno nuevo). */
export async function revocarLinkSeguimiento(
  repos: ReposAlumnos,
  alcance: Alcance,
  planId: string,
  ahora = ahoraIso(),
): Promise<{ revocados: number }> {
  await planAlcanzado(repos, alcance, planId);
  return { revocados: await repos.seguimiento.revocarDePlan(planId, ahora) };
}

// ───────────────────────── El link del alumno (público) ─────────────────────────

export interface AccionSeguimiento {
  id: string;
  texto: string;
  hecha: boolean;
}

/** Lo MÍNIMO que el link muestra: acciones por fase. Ni diagnóstico, ni índice, ni OKRs. */
export interface SeguimientoAbierto {
  alumno: string;
  fechaInicio: string;
  faseActual: Fase;
  /** Día 90+: se lee, no se tilda. */
  vencido: boolean;
  fases: { fase: Fase; acciones: AccionSeguimiento[] }[];
}

async function planDeToken(repos: ReposAlumnos, token: string, ahora: string): Promise<PlanCompleto> {
  const fila = await repos.seguimiento.obtener(token);
  const estado = estadoTokenSeguimiento(fila, ahora);
  if (!estado.valido) throw new ErrorAlumnos('TOKEN_INVALIDO', 'El link no es válido.', estado.motivo);
  const pc = await repos.planes.obtener(fila!.planId);
  if (!pc) throw new ErrorAlumnos('TOKEN_INVALIDO', 'El link no es válido.', 'inexistente');
  // Alumno en papelera = el link muere con él (obtener filtra eliminados).
  const alumno = await repos.alumnos.obtener(pc.plan.alumnoId);
  if (!alumno) throw new ErrorAlumnos('TOKEN_INVALIDO', 'El link no es válido.', 'inexistente');
  return pc;
}

/** Abre el checklist del alumno. Público: todo lo que devuelve lo ve quien tenga el link. */
export async function abrirSeguimiento(repos: ReposAlumnos, token: string, ahora = ahoraIso()): Promise<SeguimientoAbierto> {
  const pc = await planDeToken(repos, token, ahora);
  const alumno = await repos.alumnos.obtener(pc.plan.alumnoId);
  const estado = estadoAcciones(await repos.checkins.listarPorPlan(pc.plan.id));

  const fases: SeguimientoAbierto['fases'] = ([1, 2, 3] as const).map((fase) => ({
    fase,
    acciones: pc.acciones
      .filter((a) => a.fase === fase)
      .map((a) => ({ id: a.id, texto: a.texto, hecha: estado.get(a.id)?.marcado === true })),
  }));

  return {
    alumno: alumno?.nombre ?? '',
    fechaInicio: pc.plan.fechaInicio,
    faseActual: faseActual(pc.plan.fechaInicio, ahora),
    vencido: planVencido(pc.plan.fechaInicio, ahora),
    fases,
  };
}

/**
 * El tilde del alumno: un checkin nuevo, append-only. Nunca un UPDATE — la
 * historia completa queda, y el estado actual es el último checkin.
 */
export async function marcarAccion(
  repos: ReposAlumnos,
  token: string,
  accionId: string,
  marcado: unknown,
  ahora = ahoraIso(),
): Promise<{ hecha: boolean }> {
  if (typeof marcado !== 'boolean') throw new ErrorAlumnos('VALIDACION', 'marcado tiene que ser true o false.');
  const pc = await planDeToken(repos, token, ahora);

  if (planVencido(pc.plan.fechaInicio, ahora)) {
    throw new ErrorAlumnos('VALIDACION', 'El trimestre ya terminó: el checklist quedó congelado. Repasalo con tu consultor.');
  }
  const accion = pc.acciones.find((a) => a.id === accionId);
  // La acción de OTRO plan no existe para este token (mismo trato que el ámbito).
  if (!accion) throw new ErrorAlumnos('NO_ENCONTRADO', 'Acción inexistente.');

  const checkin: Checkin = { id: randomUUID(), accionId, marcado, origen: 'alumno', creadoEn: ahora };
  await repos.checkins.crear(checkin);
  return { hecha: marcado };
}

// ───────────────────────── El avance (panel del consultor) ─────────────────────────

export interface AvanceAccion extends AccionSeguimiento {
  fase: Fase;
  /** Orden del OKR al que aporta, si tiene. */
  okrOrden: number | null;
  /** Cuándo cambió por última vez (checkin más nuevo), si alguna vez cambió. */
  ultimoCambio: string | null;
}

export interface AvancePlan {
  planId: string;
  fechaInicio: string;
  faseActual: Fase;
  vencido: boolean;
  /** Última vez que el ALUMNO tildó algo. La señal de ritmo. */
  ultimaActividad: string | null;
  fases: { fase: Fase; total: number; hechas: number; acciones: AvanceAccion[] }[];
  /** El link vivo, para copiarlo desde el panel (null = no emitido o revocado). */
  link: { token: string; expiraEn: string } | null;
  /** Cambios de fecha de inicio, del más nuevo al más viejo (ticket 7). */
  cambiosFecha: CambioFechaPlan[];
}

/** El tablero de seguimiento del consultor. Lo tildado es lo que el alumno DECLARA. */
export async function avancePlan(
  repos: ReposAlumnos,
  alcance: Alcance,
  planId: string,
  ahora = ahoraIso(),
): Promise<AvancePlan> {
  const pc = await planAlcanzado(repos, alcance, planId);
  const checkins = await repos.checkins.listarPorPlan(planId);
  const estado = estadoAcciones(checkins);
  const okrOrdenPorId = new Map(pc.okrs.map((o) => [o.id, o.orden]));

  const fases: AvancePlan['fases'] = ([1, 2, 3] as const).map((fase) => {
    const acciones = pc.acciones
      .filter((a) => a.fase === fase)
      .map((a): AvanceAccion => {
        const ultimo = estado.get(a.id);
        return {
          id: a.id,
          texto: a.texto,
          fase,
          hecha: ultimo?.marcado === true,
          okrOrden: a.okrId ? okrOrdenPorId.get(a.okrId) ?? null : null,
          ultimoCambio: ultimo?.creadoEn ?? null,
        };
      });
    return { fase, total: acciones.length, hechas: acciones.filter((a) => a.hecha).length, acciones };
  });

  const vigente = await repos.seguimiento.vigenteDePlan(planId, ahora);
  return {
    planId,
    fechaInicio: pc.plan.fechaInicio,
    faseActual: faseActual(pc.plan.fechaInicio, ahora),
    vencido: planVencido(pc.plan.fechaInicio, ahora),
    ultimaActividad: ultimaActividadAlumno(checkins),
    fases,
    link: vigente ? { token: vigente.token, expiraEn: vigente.expiraEn } : null,
    cambiosFecha: await repos.planes.listarCambiosFecha(planId),
  };
}

/** Diagnósticos de un alumno, respetando el ámbito del que consulta. */
export async function listarDiagnosticos(
  repos: ReposAlumnos,
  alcance: Alcance,
  alumnoId: string,
): Promise<Diagnostico[]> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  return repos.diagnosticos.listarPorAlumno(alumnoId);
}

// ───────────────────────── Panel de control (ticket 7) ─────────────────────────

/**
 * Cambio de estado del alumno (ACTIVO/PAUSADO/FINALIZADO/ABANDONADO). El
 * ámbito ya garantiza quién puede: el consultor ASIGNADO (su cartera) o ADMIN
 * (todas). Registra estadoActualizadoEn.
 */
export async function cambiarEstadoAlumno(
  repos: ReposAlumnos,
  alcance: Alcance,
  id: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<Alumno> {
  const alumno = await obtenerAlumno(repos, alcance, id);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  const { estado } = estadoAlumnoInputSchema.parse(entrada);
  if (estado === alumno.estado) return alumno;
  const actualizado: Alumno = { ...alumno, estado, estadoActualizadoEn: ahora };
  await repos.alumnos.guardar(actualizado);
  return actualizado;
}

/**
 * Cambio de fecha de inicio del plan. Desplaza TODOS los vencimientos
 * cargados de los KRs por el mismo delta (el cronograma entero se corre) y
 * deja el rastro en plan_fecha_historial. La confirmación con "cuántos KRs se
 * van a mover" la arma la UI con el plan que ya tiene; acá se ejecuta.
 */
export async function cambiarFechaInicioPlan(
  repos: ReposAlumnos,
  alcance: Alcance,
  usuarioId: string,
  planId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<{ fechaAnterior: string; fechaNueva: string; deltaDias: number; krsDesplazados: number }> {
  const pc = await planAlcanzado(repos, alcance, planId);
  const { fechaNueva, motivo } = fechaInicioInputSchema.parse(entrada);
  const fechaAnterior = pc.plan.fechaInicio;
  if (fechaNueva === fechaAnterior) {
    throw new ErrorAlumnos('VALIDACION', 'El plan ya arranca ese día: no hay nada que cambiar.');
  }
  const krsDesplazados = await repos.planes.cambiarFechaInicio({
    id: randomUUID(),
    planId,
    fechaAnterior,
    fechaNueva,
    cambiadoPor: usuarioId,
    cambiadoEn: ahora,
    motivo: motivo ?? null,
  });
  return { fechaAnterior, fechaNueva, deltaDias: diasEntre(fechaAnterior, fechaNueva), krsDesplazados };
}

/**
 * Seguimiento de un KR desde el tablero del consultor: tildar cumplimiento
 * (con fecha) y/o fijar el vencimiento. El ámbito baja hasta la fila vía el
 * plan del KR — el KR de un alumno ajeno no existe.
 */
export async function editarKr(
  repos: ReposAlumnos,
  alcance: Alcance,
  krId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<KrPlan> {
  const contexto = await repos.planes.buscarKr(krId);
  const alumno = contexto ? await repos.alumnos.obtener(contexto.alumnoId) : null;
  if (!contexto || !alumno || !alcanzaFila(alcance, alumno.consultorId)) {
    throw new ErrorAlumnos('NO_ENCONTRADO', 'KR inexistente.');
  }
  const patch = krPatchSchema.parse(entrada);
  const campos: { cumplidoEn?: string | null; vencimiento?: string | null } = {};
  if (patch.cumplido !== undefined) campos.cumplidoEn = patch.cumplido ? ahora : null;
  if (patch.vencimiento !== undefined) campos.vencimiento = patch.vencimiento;
  await repos.planes.actualizarKr(krId, campos);
  return {
    ...contexto.kr,
    cumplidoEn: campos.cumplidoEn !== undefined ? campos.cumplidoEn : contexto.kr.cumplidoEn,
    vencimiento: campos.vencimiento !== undefined ? campos.vencimiento : contexto.kr.vencimiento,
  };
}

// ───── El panel: listado con fase, salud y orden por riesgo ─────

export interface FiltrosPanel {
  q?: string;
  estado?: EstadoAlumno;
  salud?: Salud | 'NEUTRO';
  /** Cosmético (ADMIN filtra por cartera); con ámbito acotado el server lo pisa. */
  consultorId?: string;
}

export interface FilaPanel {
  alumno: Alumno;
  consultorNombre: string | null;
  /** Plan vigente (el de fecha_inicio más reciente), si hay. */
  plan: { id: string; fechaInicio: string; fechaCierreEstimada: string; dias: number; chip: ChipFase } | null;
  krs: { totales: number; cumplidos: number };
  salud: SaludCalculada;
  /** Último tilde del ALUMNO vía su link (la señal de ritmo). */
  ultimaActividad: string | null;
  /** Menor = más arriba. El ORDER BY del panel. */
  riesgo: number;
}

/**
 * El panel de control de la cartera: cada alumno con su fase, semáforo y
 * riesgo, ORDENADO por riesgo descendente — los trabados gritan arriba, los
 * que van bien no hacen ruido. El ámbito manda igual que en el listado plano.
 */
export async function panelAlumnos(
  repos: ReposAlumnos,
  usuarios: UsuariosRepo,
  alcance: Alcance,
  filtros: FiltrosPanel = {},
  ahora = ahoraIso(),
): Promise<FilaPanel[]> {
  const alumnos = await repos.alumnos.listar({
    q: filtros.q,
    estado: filtros.estado,
    consultorId: titularSegunAlcance(filtros.consultorId, alcance),
  });
  const nombrePorId = new Map((await usuarios.listar()).map((u) => [u.id, u.nombre]));

  const filas: FilaPanel[] = [];
  for (const alumno of alumnos) {
    const vigente = (await repos.planes.listarPorAlumno(alumno.id))[0] ?? null;
    const krs = vigente ? avanceKrs(vigente.okrs.flatMap((o) => o.krs)) : { totales: 0, cumplidos: 0 };
    const salud = calcularSalud(
      {
        estado: alumno.estado,
        fechaInicio: vigente?.plan.fechaInicio ?? null,
        krsTotales: krs.totales,
        krsCumplidos: krs.cumplidos,
      },
      ahora,
    );
    const ultimaActividad = vigente
      ? ultimaActividadAlumno(await repos.checkins.listarPorPlan(vigente.plan.id))
      : null;
    filas.push({
      alumno,
      consultorNombre: nombrePorId.get(alumno.consultorId) ?? null,
      plan: vigente
        ? {
            id: vigente.plan.id,
            fechaInicio: vigente.plan.fechaInicio,
            fechaCierreEstimada: fechaCierreEstimada(vigente.plan.fechaInicio),
            dias: diasDelPlan(vigente.plan.fechaInicio, ahora),
            chip: chipFase(vigente.plan.fechaInicio, ahora),
          }
        : null,
      krs,
      salud,
      ultimaActividad,
      riesgo: puntajeRiesgo(alumno.estado, salud.salud),
    });
  }

  const filtradas = filtros.salud
    ? filas.filter((f) => (filtros.salud === 'NEUTRO' ? f.salud.salud === null : f.salud.salud === filtros.salud))
    : filas;

  // Riesgo primero; a igual riesgo, la brecha más negativa (el más atrasado)
  // arriba; después alfabético para que el orden sea estable.
  return filtradas.sort(
    (a, b) =>
      a.riesgo - b.riesgo ||
      (a.salud.brecha ?? 0) - (b.salud.brecha ?? 0) ||
      a.alumno.nombre.localeCompare(b.alumno.nombre),
  );
}

// ───── El documento del plan (ticket 7B) ─────

const MENSAJE_DOC: Record<'tipo' | 'tamano' | 'vacio', string> = {
  tipo: 'Solo se aceptan .pdf o .docx.',
  tamano: 'El archivo pasa los 10 MB. Comprimí el PDF o subí una versión más liviana.',
  vacio: 'El archivo llegó vacío. Probá subirlo de nuevo.',
};

/**
 * Sube una versión del documento del plan. El tipo se deriva de la EXTENSIÓN
 * del nombre (el Content-Type del cliente no es confiable) y el límite de
 * 10 MB se corta acá, en el borde real. Nunca pisa la versión anterior.
 */
export async function subirDocumentoPlan(
  repos: ReposAlumnos,
  alcance: Alcance,
  usuarioId: string,
  planId: string,
  nombreArchivo: unknown,
  contenido: Uint8Array,
  ahora = ahoraIso(),
): Promise<PlanDocumento> {
  await planAlcanzado(repos, alcance, planId);

  const nombre = typeof nombreArchivo === 'string' ? nombreArchivo.trim() : '';
  if (nombre === '') throw new ErrorAlumnos('VALIDACION', 'Falta el nombre del archivo.');
  const minusculas = nombre.toLowerCase();
  const mimeType = minusculas.endsWith('.pdf') ? MIME_PDF : minusculas.endsWith('.docx') ? MIME_DOCX : null;
  if (!mimeType) throw new ErrorAlumnos('VALIDACION', MENSAJE_DOC.tipo);

  const estado = validarDocumento({ mimeType, tamanoBytes: contenido.byteLength });
  if (!estado.valido) throw new ErrorAlumnos('VALIDACION', MENSAJE_DOC[estado.motivo]);

  const doc: PlanDocumento = {
    id: randomUUID(),
    planId,
    nombreArchivo: nombre,
    mimeType,
    tamanoBytes: contenido.byteLength,
    subidoPor: usuarioId,
    subidoEn: ahora,
  };
  await repos.documentos.crear(doc, contenido);
  return doc;
}

/** Versiones del documento, la vigente primero. Solo metadatos. */
export async function listarDocumentosPlan(
  repos: ReposAlumnos,
  alcance: Alcance,
  planId: string,
): Promise<PlanDocumento[]> {
  await planAlcanzado(repos, alcance, planId);
  return repos.documentos.listarPorPlan(planId);
}

/** Un documento con su contenido (visor embebido / descarga). Ajeno = 404. */
export async function obtenerDocumentoPlan(
  repos: ReposAlumnos,
  alcance: Alcance,
  documentoId: string,
): Promise<{ doc: PlanDocumento; contenido: Uint8Array }> {
  const fila = await repos.documentos.obtener(documentoId);
  if (!fila) throw new ErrorAlumnos('NO_ENCONTRADO', 'Documento inexistente.');
  await planAlcanzado(repos, alcance, fila.doc.planId);
  return fila;
}

// ───── Papelera (borrado lógico; rutas solo ADMIN vía 'eliminar_alumnos') ─────

/** Manda la ficha a la papelera. Desaparece de todo listado al instante. */
export async function eliminarAlumno(
  repos: ReposAlumnos,
  alcance: Alcance,
  usuarioId: string,
  id: string,
  ahora = ahoraIso(),
): Promise<{ ok: true }> {
  const alumno = await obtenerAlumno(repos, alcance, id);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  await repos.alumnos.eliminar(id, ahora, usuarioId);
  return { ok: true };
}

export interface FilaPapelera {
  alumno: Alumno;
  /** Quién lo eliminó, ya resuelto a nombre (la papelera muestra responsable). */
  eliminadoPorNombre: string | null;
}

export async function listarPapelera(repos: ReposAlumnos, usuarios: UsuariosRepo): Promise<FilaPapelera[]> {
  const nombrePorId = new Map((await usuarios.listar()).map((u) => [u.id, u.nombre]));
  return (await repos.alumnos.listarEliminados()).map((alumno) => ({
    alumno,
    eliminadoPorNombre: alumno.eliminadoPor ? nombrePorId.get(alumno.eliminadoPor) ?? null : null,
  }));
}

export async function restaurarAlumno(repos: ReposAlumnos, id: string): Promise<Alumno> {
  const alumno = await repos.alumnos.obtenerEliminado(id);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'No está en la papelera.');
  await repos.alumnos.restaurar(id);
  return { ...alumno, eliminadoEn: null, eliminadoPor: null };
}

/**
 * Borrado FÍSICO, solo desde la papelera y confirmando con el NOMBRE exacto
 * del alumno — el mismo patrón de fricción que el reseteo de cierres. Cascadea
 * diagnósticos, tokens, planes y checkins por FK.
 */
export async function eliminarAlumnoDefinitivo(
  repos: ReposAlumnos,
  id: string,
  confirmacion: unknown,
): Promise<{ ok: true }> {
  const alumno = await repos.alumnos.obtenerEliminado(id);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'No está en la papelera.');
  if (typeof confirmacion !== 'string' || confirmacion.trim() !== alumno.nombre) {
    throw new ErrorAlumnos('VALIDACION', 'Para borrar definitivamente escribí el nombre exacto del alumno.');
  }
  await repos.alumnos.eliminarDefinitivo(id);
  return { ok: true };
}
