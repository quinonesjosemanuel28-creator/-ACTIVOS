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
  type Contacto,
  type Diagnostico,
  type MotivoTokenInvalido,
  type TokenDiagnostico,
} from '../../domain/alumnos/tipos';
import { PREGUNTAS_FICHA, type CampoFicha } from '../../domain/alumnos/formulario';
import {
  DIAS_VIGENCIA_LINK,
  estadoAcciones,
  estadoDe,
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
  alertaInactividad,
  avanceKrs,
  calcularSalud,
  chipFase,
  diasDelPlan,
  puntajeRiesgo,
  type AlertaInactividad,
  type ChipFase,
  type EstadoAlumno,
  type MotivoNeutro,
  type Salud,
} from '../../domain/alumnos/panel';
import {
  accionesPorFase,
  calcularSaludPorAcciones,
  type MotivoNeutroAcciones,
  type SaludPorAcciones,
} from '../../domain/alumnos/saludAcciones';
import { notaParaElLink, notasAbiertas, notasDelPlan, type NotaConEstado, type NotaResolucion } from '../../domain/alumnos/notas';
import { CANAL_POR_TIPO, trabaActual, type EntradaBitacora } from '../../domain/alumnos/bitacora';
import { parsearTelefono } from '../../domain/alumnos/telefono';
import { diaDelPlan } from '../../domain/alumnos/vistaAlumno';
import {
  fechaCierreEstimada,
  diasEntre,
  MIME_DOCX,
  MIME_PDF,
  validarDocumento,
  type CambioFechaPlan,
  type EstadoAccion,
  type Kr as KrPlan,
  type Medicion,
  type PlanDocumento,
} from '../../domain/alumnos/plan';
import { estadosDeKrs, valorActual as valorActualDe, type EstadoKr } from '../../domain/alumnos/medicion';
import {
  aRespuestas,
  accionEstadoInputSchema,
  alumnoInputSchema,
  alumnoPatchSchema,
  contactoInputSchema,
  medicionInputSchema,
  diagnosticoInputSchema,
  diagnosticoPatchSchema,
  estadoAlumnoInputSchema,
  fechaInicioInputSchema,
  fichaPublicaSchema,
  krPatchSchema,
  type FichaPublica,
  notaResolucionInputSchema,
  bitacoraInputSchema,
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
    telefonoPais: input.telefonoPais ?? null,
    telefonoNumero: input.telefonoNumero ?? null,
    ultimoAccesoLink: null,
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
    ...(patch.telefonoPais !== undefined && { telefonoPais: patch.telefonoPais ?? null }),
    ...(patch.telefonoNumero !== undefined && { telefonoNumero: patch.telefonoNumero ?? null }),
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
  // Clave "ordenOkr:posiciónKr" → id del KR, para resolver la referencia
  // opcional `kr` del contrato (ticket 8).
  const krPorPosicion = new Map<string, string>();
  const okrs: (Okr & { krs: Kr[] })[] = bloque.okrs.map((o) => {
    const okrId = randomUUID();
    okrPorOrden.set(o.orden, okrId);
    return {
      id: okrId,
      planId: plan.id,
      orden: o.orden,
      objetivo: o.objetivo,
      creadoEn: ahora,
      krs: o.krs.map((k, i) => {
        const krId = randomUUID();
        krPorPosicion.set(`${o.orden}:${i + 1}`, krId);
        return {
          id: krId,
          okrId,
          orden: i + 1,
          texto: k.texto,
          meta: k.meta ?? null,
          // Ticket 9 · contrato v3: el tipo viene de la skill. Sin él, entra
          // como entregable (aditivo: los bloques anteriores siguen valiendo).
          tipo: k.tipo ?? 'entregable',
          valorInicial: k.valor_inicial ?? null,
          meta30: k.meta_30 ?? null,
          meta60: k.meta_60 ?? null,
          meta90: k.meta_90 ?? null,
          unidad: k.unidad ?? null,
          direccion: k.direccion ?? null,
          // El contrato de la skill no trae fechas ni cumplimiento: los fija el
          // consultor en el panel (ticket 7).
          vencimiento: null,
          cumplidoEn: null,
          creadoEn: ahora,
        };
      }),
    };
  });

  const acciones: Accion[] = bloque.fases.flatMap((f) =>
    f.acciones.map((a, i) => ({
      id: randomUUID(),
      planId: plan.id,
      okrId: a.okr !== undefined ? okrPorOrden.get(a.okr)! : null,
      krId: a.okr !== undefined && a.kr !== undefined ? krPorPosicion.get(`${a.okr}:${a.kr}`) ?? null : null,
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
  /** KR al que aporta (ticket 8), para agrupar. Null = "Otras acciones". */
  krId: string | null;
  /** Estado efectivo (ticket 9D): el círculo marca ejecutado; en_curso se ve dorado. */
  estado: EstadoAccion;
  /** La ÚLTIMA nota propia sobre esta acción (ticket 10A). Sin historial. */
  nota: string | null;
  /** La devolución del consultor, SOLO si la nota está resuelta. Archivada = null. */
  devolucion: string | null;
}

/**
 * Una métrica del bloque "Tus números" (ticket 9D §8.6). Solo viajan las que
 * tienen el paquete completo Y al menos una medición: sin valor cargado la
 * métrica NO se muestra — no se deja un hueco vacío. El copy ("bajó 6 puntos
 * desde que arrancaste" / número solo) lo arma la vista con progresoMetrica;
 * acá van los números pelados, nunca un juicio.
 */
export interface MetricaSeguimiento {
  krId: string;
  texto: string;
  unidad: string;
  direccion: 'sube' | 'baja';
  valorInicial: number;
  meta90: number;
  valorActual: number;
}

/** Lo MÍNIMO que el link muestra: acciones por fase. Ni diagnóstico, ni índice, ni OKRs. */
export interface SeguimientoAbierto {
  alumno: string;
  fechaInicio: string;
  faseActual: Fase;
  /** Día 90+ (el trimestre terminó por calendario). */
  vencido: boolean;
  /** "Día 37 de 90 · te quedan 53" — la cuenta la hace el server, no el alumno. */
  dia: number;
  restantes: number;
  /** El plan está en pausa (lo pausó el consultor): la vista lo dice sin drama. */
  pausado: boolean;
  fases: { fase: Fase; acciones: AccionSeguimiento[] }[];
  /**
   * Los KRs del plan en orden (ticket 8): el subtítulo que le da PARA QUÉ a
   * cada acción. Solo id y texto — el OKR es lenguaje de consultoría y no
   * baja al link del alumno.
   */
  krs: { id: string; texto: string }[];
  /** "Tus números" (ticket 9D): las métricas con valor cargado. */
  metricas: MetricaSeguimiento[];
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
  const checkinsPlan = await repos.checkins.listarPorPlan(pc.plan.id);
  const estado = estadoAcciones(checkinsPlan);
  const resolucionesPlan = await repos.notaResoluciones.listarPorPlan(pc.plan.id);
  const pausado = alumno?.estado === 'PAUSADO';

  // La APERTURA es una señal en sí (ticket 8): junto al último check-in, el
  // panel distingue "no abre" (se despegó) de "abre y no marca" (trabado en
  // algo concreto). Solo acá — tildar NO registra acceso.
  if (alumno) await repos.alumnos.registrarAccesoLink(alumno.id, ahora);

  const fases: SeguimientoAbierto['fases'] = ([1, 2, 3] as const).map((fase) => ({
    fase,
    acciones: pc.acciones
      .filter((a) => a.fase === fase)
      .map((a) => {
        // estadoDe honra el checkin legado (marcado sin estado, 9A).
        const ultimo = estado.get(a.id);
        const e = ultimo ? estadoDe(ultimo) : 'pendiente';
        // La última nota propia y su devolución (10A): lo único del ciclo de
        // vida que baja al link. Una archivada no muestra nada distinto.
        const nota = notaParaElLink(a.id, checkinsPlan, resolucionesPlan);
        return { id: a.id, texto: a.texto, hecha: e === 'ejecutado', krId: a.krId, estado: e, nota: nota?.nota ?? null, devolucion: nota?.devolucion ?? null };
      }),
  }));

  // "Tus números" (9D): métricas con paquete completo Y valor cargado. La que
  // no tiene mediciones no aparece — la estrena el consultor en la llamada.
  const mediciones = await repos.mediciones.listarPorPlan(pc.plan.id);
  const metricas: MetricaSeguimiento[] = pc.okrs
    .flatMap((o) => o.krs)
    .filter((k) => k.tipo === 'metrica')
    .flatMap((k) => {
      const actual = valorActualDe(mediciones.filter((m) => m.krId === k.id));
      if (actual === null || k.valorInicial === null || k.meta90 === null || k.unidad === null || k.direccion === null) {
        return [];
      }
      return [{
        krId: k.id,
        texto: k.texto,
        unidad: k.unidad,
        direccion: k.direccion,
        valorInicial: k.valorInicial,
        meta90: k.meta90,
        valorActual: actual,
      }];
    });

  const { dia, restantes } = diaDelPlan(pc.plan.fechaInicio, ahora);
  return {
    alumno: alumno?.nombre ?? '',
    fechaInicio: pc.plan.fechaInicio,
    faseActual: faseActual(pc.plan.fechaInicio, ahora),
    vencido: planVencido(pc.plan.fechaInicio, ahora),
    dia,
    restantes,
    pausado,
    fases,
    krs: pc.okrs.flatMap((o) => o.krs.map((k) => ({ id: k.id, texto: k.texto }))),
    metricas,
  };
}

/**
 * La marca del alumno: un checkin nuevo, append-only. Nunca un UPDATE — la
 * historia completa queda, y el estado actual es el último checkin.
 *
 * Dos formas del cuerpo (ticket 9D):
 *  - `{ marcado }` — el círculo. Un toque, binario, el 90% de los casos, y
 *    lo que la vista vieja siempre mandó: sigue valiendo tal cual.
 *  - `{ estado, nota? }` — el detalle de la acción: los tres estados y la
 *    nota opcional. Las notas se ACUMULAN (cada guardado es una fila); la
 *    más reciente la ve el consultor en la ficha. No se deriva ni espera
 *    respuesta — eso es del ticket 10, prometerlo sin flujo sería peor.
 */
export async function marcarAccion(
  repos: ReposAlumnos,
  token: string,
  accionId: string,
  cuerpo: unknown,
  ahora = ahoraIso(),
): Promise<{ hecha: boolean; estado: EstadoAccion }> {
  const crudo = (cuerpo ?? {}) as Record<string, unknown>;
  let estado: EstadoAccion;
  let nota: string | null = null;
  if (typeof crudo.marcado === 'boolean') {
    estado = crudo.marcado ? 'ejecutado' : 'pendiente';
  } else if (crudo.estado !== undefined) {
    const input = accionEstadoInputSchema.parse(crudo);
    estado = input.estado;
    nota = input.nota ?? null;
  } else {
    throw new ErrorAlumnos('VALIDACION', 'Mandá marcado (true/false) o estado (pendiente/en_curso/ejecutado).');
  }
  const pc = await planDeToken(repos, token, ahora);

  // Pasado el día 90 las casillas SIGUEN marcables (ticket 8 §4.7, revierte
  // el congelamiento del ticket 6): lo que se completa tarde también es
  // información para la llamada de cierre. El límite real es la vigencia del
  // token (120 días), que planDeToken ya validó.
  const accion = pc.acciones.find((a) => a.id === accionId);
  // La acción de OTRO plan no existe para este token (mismo trato que el ámbito).
  if (!accion) throw new ErrorAlumnos('NO_ENCONTRADO', 'Acción inexistente.');

  // `marcado` se sigue escribiendo, derivado del estado (9A): es lo que hace
  // el ticket reversible por revert de código.
  const checkin: Checkin = {
    id: randomUUID(),
    accionId,
    marcado: estado === 'ejecutado',
    estado,
    nota,
    origen: 'alumno',
    usuarioId: null,
    creadoEn: ahora,
  };
  await repos.checkins.crear(checkin);
  return { hecha: estado === 'ejecutado', estado };
}

/**
 * El valor del mes, cargado por el ALUMNO desde su link (ticket 9D §8.6): es
 * un dato que necesita para su propio negocio, no un reporte que le pedimos.
 * Fila nueva en mediciones con origen 'alumno' y sin usuario — append-only,
 * igual que la carga del consultor (9B), que nunca se pisa.
 */
export async function cargarMedicionDesdeLink(
  repos: ReposAlumnos,
  token: string,
  krId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<{ valor: number; cargadoEn: string }> {
  const input = medicionInputSchema.parse(entrada ?? {});
  const pc = await planDeToken(repos, token, ahora);
  // El KR de OTRO plan no existe para este token (mismo trato que el ámbito).
  const kr = pc.okrs.flatMap((o) => o.krs).find((k) => k.id === krId);
  if (!kr) throw new ErrorAlumnos('NO_ENCONTRADO', 'KR inexistente.');
  if (kr.tipo !== 'metrica') {
    throw new ErrorAlumnos('VALIDACION', 'Este KR no lleva valores: se cierra solo con sus acciones.');
  }
  const medicion: Medicion = {
    id: randomUUID(),
    krId,
    valor: input.valor,
    origen: 'alumno',
    usuarioId: null,
    cargadoEn: ahora,
  };
  await repos.mediciones.crear(medicion);
  return { valor: medicion.valor, cargadoEn: medicion.cargadoEn };
}

// ───────────────────────── El avance (panel del consultor) ─────────────────────────

/**
 * Una acción en la ficha del CONSULTOR. Deliberadamente NO extiende
 * AccionSeguimiento (el payload público del link): son audiencias distintas
 * y evolucionan por separado — el ciclo de vida de las notas (10A) viaja en
 * `AvancePlan.notas`, no acá.
 */
export interface AvanceAccion {
  id: string;
  texto: string;
  hecha: boolean;
  /** KR al que aporta (ticket 8). Null = "Otras acciones". */
  krId: string | null;
  fase: Fase;
  /** Orden del OKR al que aporta, si tiene. */
  okrOrden: number | null;
  /** Cuándo cambió por última vez (checkin más nuevo), si alguna vez cambió. */
  ultimoCambio: string | null;
  /** Estado efectivo (ticket 9): pendiente / en_curso / ejecutado. */
  estado: EstadoAccion;
  /** La nota más reciente que acompañó un cambio de esta acción. */
  nota: string | null;
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
  /**
   * Estado DERIVADO de cada KR (ticket 9B): entregables por sus acciones,
   * métricas por su valor, tilde legado honrado. Contador de resultado, sin
   * color — el semáforo (9C) mide acciones contra la agenda, no KRs.
   */
  estadoKrs: EstadoKr[];
  /** Todas las mediciones del plan, la más reciente primero (la ficha las agrupa por KR). */
  mediciones: Medicion[];
  /**
   * Las notas del ALUMNO con su estado derivado (ticket 10A), de la más
   * nueva a la más vieja. La ficha muestra las abiertas por defecto.
   */
  notas: NotaConEstado[];
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
  const medicionesPlan = await repos.mediciones.listarPorPlan(planId);
  const resoluciones = await repos.notaResoluciones.listarPorPlan(planId);
  const okrOrdenPorId = new Map(pc.okrs.map((o) => [o.id, o.orden]));
  // La nota más reciente por acción (puede venir de un checkin viejo: la nota
  // no se pierde cuando un cambio posterior llega sin nota).
  const notaPorAccion = new Map<string, { nota: string; creadoEn: string }>();
  for (const c of checkins) {
    if (c.nota === null) continue;
    const previa = notaPorAccion.get(c.accionId);
    if (!previa || c.creadoEn > previa.creadoEn) notaPorAccion.set(c.accionId, { nota: c.nota, creadoEn: c.creadoEn });
  }

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
          krId: a.krId,
          okrOrden: a.okrId ? okrOrdenPorId.get(a.okrId) ?? null : null,
          ultimoCambio: ultimo?.creadoEn ?? null,
          estado: ultimo ? estadoDe(ultimo) : 'pendiente',
          nota: notaPorAccion.get(a.id)?.nota ?? null,
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
    estadoKrs: estadosDeKrs(pc, checkins, medicionesPlan),
    mediciones: medicionesPlan,
    notas: notasDelPlan(checkins, resoluciones),
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

/**
 * Corrección de una acción desde el PANEL (ticket 9B). La única superficie de
 * marcado es la acción, y la pueden tocar los dos: esto es el lado del
 * consultor — un checkin nuevo con origen 'consultor' y su usuario, jamás un
 * UPDATE. Sirve para las dos direcciones: "figura ejecutado y no está hecho"
 * y "lo hizo y no lo marcó". Un checkin del consultor NO cuenta como señal
 * del alumno: la alerta de inactividad sigue mirando origen 'alumno'.
 */
export async function corregirAccion(
  repos: ReposAlumnos,
  alcance: Alcance,
  usuarioId: string,
  accionId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<{ estado: EstadoAccion }> {
  const contexto = await repos.planes.buscarAccion(accionId);
  const alumno = contexto ? await repos.alumnos.obtener(contexto.alumnoId) : null;
  if (!contexto || !alumno || !alcanzaFila(alcance, alumno.consultorId)) {
    throw new ErrorAlumnos('NO_ENCONTRADO', 'Acción inexistente.');
  }
  const input = accionEstadoInputSchema.parse(entrada);
  await repos.checkins.crear({
    id: randomUUID(),
    accionId,
    // marcado se sigue escribiendo, derivado: reversible por revert (9A).
    marcado: input.estado === 'ejecutado',
    estado: input.estado,
    nota: input.nota ?? null,
    origen: 'consultor',
    usuarioId,
    creadoEn: ahora,
  });
  return { estado: input.estado };
}

/**
 * Carga de una medición desde el panel (ticket 9B). Append-only: cada carga
 * es una fila; la serie completa es la historia del número. La carga por el
 * alumno desde su link llega en 9D.
 */
export async function cargarMedicion(
  repos: ReposAlumnos,
  alcance: Alcance,
  usuarioId: string,
  krId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<Medicion> {
  const contexto = await repos.planes.buscarKr(krId);
  const alumno = contexto ? await repos.alumnos.obtener(contexto.alumnoId) : null;
  if (!contexto || !alumno || !alcanzaFila(alcance, alumno.consultorId)) {
    throw new ErrorAlumnos('NO_ENCONTRADO', 'KR inexistente.');
  }
  if (contexto.kr.tipo !== 'metrica') {
    throw new ErrorAlumnos('VALIDACION', 'Este KR es un entregable: se cierra solo cuando sus acciones están ejecutadas, no con un valor.');
  }
  const input = medicionInputSchema.parse(entrada);
  const medicion: Medicion = {
    id: randomUUID(),
    krId,
    valor: input.valor,
    origen: 'consultor',
    usuarioId,
    cargadoEn: ahora,
  };
  await repos.mediciones.crear(medicion);
  return medicion;
}

// ───── El panel: listado con fase, salud y orden por riesgo ─────

export interface FiltrosPanel {
  q?: string;
  estado?: EstadoAlumno;
  salud?: Salud | 'NEUTRO';
  /**
   * Solo los TRABADOS: alerta de inactividad activa o semáforo ROJO — el
   * filtro de "a quién tengo que escribirle hoy" (ticket 7C).
   */
  soloTrabados?: boolean;
  /** Cosmético (ADMIN filtra por cartera); con ámbito acotado el server lo pisa. */
  consultorId?: string;
}

export interface FilaPanel {
  alumno: Alumno;
  consultorNombre: string | null;
  /** Plan vigente (el de fecha_inicio más reciente), si hay. */
  plan: { id: string; fechaInicio: string; fechaCierreEstimada: string; dias: number; chip: ChipFase } | null;
  krs: { totales: number; cumplidos: number };
  /** Notas del alumno sin resolver (ticket 10A): sin esto, nadie las descubre. */
  notasAbiertas: number;
  /**
   * El semáforo (ticket 9C · switch): mide ACCIONES ejecutadas contra la
   * agenda del plan. Antes leía `krs.cumplido_en` (el tilde del consultor);
   * la columna sigue existiendo pero ya no alimenta ningún color — se borra
   * un ticket después, con rodaje del cálculo nuevo.
   */
  salud: SaludPorAcciones;
  /** Último tilde del ALUMNO vía su link (la señal de ritmo). */
  ultimaActividad: string | null;
  /** Más de 8 días sin señales (ticket 7C). Un contacto reciente la apaga. */
  alerta: AlertaInactividad;
  /** Último contacto registrado del consultor. */
  ultimoContacto: string | null;
  /** Primer KR sin cumplir (el del vencimiento más cercano), para el mensaje de WhatsApp. */
  krPendiente: string | null;
  /** Menor = más arriba. El ORDER BY del panel. */
  riesgo: number;
}

/** ¿Necesita atención YA? Alerta de inactividad o semáforo rojo. */
const esTrabado = (f: Pick<FilaPanel, 'alerta' | 'salud'>): boolean =>
  f.alerta.activa || f.salud.salud === 'ROJO';

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
    const todosLosKrs = vigente ? vigente.okrs.flatMap((o) => o.krs) : [];
    const checkinsVigente = vigente ? await repos.checkins.listarPorPlan(vigente.plan.id) : [];
    const resolucionesVigente = vigente ? await repos.notaResoluciones.listarPorPlan(vigente.plan.id) : [];
    // Lo que se MUESTRA como contador de resultado (ticket 9B): el estado
    // derivado — entregables por acciones, métricas por valor, tilde legado
    // honrado. Solo puede ser ≥ que el contador viejo (derivado ∪ legado).
    const derivados = vigente
      ? estadosDeKrs(vigente, checkinsVigente, await repos.mediciones.listarPorPlan(vigente.plan.id))
      : [];
    const krs = { totales: derivados.length, cumplidos: derivados.filter((k) => k.cumplida).length };
    // ⚠ ENTRADA DEL SEMÁFORO (ticket 9C · switch): acciones ejecutadas contra
    // la agenda del plan. El tilde del consultor (cumplido_en) ya NO se lee
    // acá; el contador de KRs de arriba es resultado, no color.
    const salud = calcularSaludPorAcciones(
      {
        estado: alumno.estado,
        fechaInicio: vigente?.plan.fechaInicio ?? null,
        porFase: accionesPorFase(vigente?.acciones ?? [], checkinsVigente),
      },
      ahora,
    );
    const ultimaActividad = vigente ? ultimaActividadAlumno(checkinsVigente) : null;
    const ultimoContacto = (await repos.contactos.ultimoDeAlumno(alumno.id))?.contactadoEn ?? null;
    const alerta = alertaInactividad(
      {
        estado: alumno.estado,
        fechaInicio: vigente?.plan.fechaInicio ?? null,
        ultimaActividad,
        ultimoContacto,
      },
      ahora,
    );
    // El KR pendiente que pregunta el mensaje de WhatsApp: el del vencimiento
    // más cercano; sin fechas, el primero en orden de plan. "Pendiente" es el
    // cierre DERIVADO (9B) — cumplido_en ya no se lee fuera de la comparación,
    // así el ticket que borra la columna no encuentra lectores.
    const cumplidas = new Set(derivados.filter((k) => k.cumplida).map((k) => k.krId));
    const pendientes = todosLosKrs.filter((k) => !cumplidas.has(k.id));
    const krPendiente =
      pendientes.filter((k) => k.vencimiento !== null).sort((a, b) => a.vencimiento!.localeCompare(b.vencimiento!))[0] ??
      pendientes[0] ??
      null;
    filas.push({
      alumno,
      notasAbiertas: notasAbiertas(checkinsVigente, resolucionesVigente),
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
      alerta,
      ultimoContacto,
      krPendiente: krPendiente?.texto ?? null,
      riesgo: puntajeRiesgo(alumno.estado, salud.salud, alerta.activa),
    });
  }

  let filtradas = filtros.salud
    ? filas.filter((f) => (filtros.salud === 'NEUTRO' ? f.salud.salud === null : f.salud.salud === filtros.salud))
    : filas;
  if (filtros.soloTrabados) filtradas = filtradas.filter(esTrabado);

  // Riesgo primero; a igual riesgo, la brecha más negativa (el más atrasado)
  // arriba; después alfabético para que el orden sea estable.
  return filtradas.sort(
    (a, b) =>
      a.riesgo - b.riesgo ||
      (a.salud.brecha ?? 0) - (b.salud.brecha ?? 0) ||
      a.alumno.nombre.localeCompare(b.alumno.nombre),
  );
}

// ───── Ciclo de vida de las notas (ticket 10A) ─────

/**
 * Resuelve o archiva una nota del alumno: una fila NUEVA en
 * nota_resoluciones — la más nueva gana, corregir es volver a resolver. La
 * devolución la ve el alumno en su link (el schema la exige al resolver y la
 * prohíbe al archivar). Solo notas del ALUMNO: la anotación del consultor
 * (9B) es suya y no tiene ciclo de vida.
 */
export async function resolverNota(
  repos: ReposAlumnos,
  alcance: Alcance,
  usuarioId: string,
  checkinId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<NotaResolucion> {
  const input = notaResolucionInputSchema.parse(entrada ?? {});
  const contexto = await repos.checkins.buscarCheckin(checkinId);
  const alumno = contexto ? await repos.alumnos.obtener(contexto.alumnoId) : null;
  // La nota ajena no existe para este consultor (ámbito hasta la fila).
  if (!contexto || !alumno || !alcanzaFila(alcance, alumno.consultorId)) {
    throw new ErrorAlumnos('NO_ENCONTRADO', 'Nota inexistente.');
  }
  if (contexto.checkin.origen !== 'alumno' || contexto.checkin.nota === null || contexto.checkin.nota.trim() === '') {
    throw new ErrorAlumnos('VALIDACION', 'Este checkin no tiene una nota del alumno para resolver.');
  }
  const resolucion: NotaResolucion = {
    id: randomUUID(),
    checkinId,
    estado: input.estado,
    area: input.area ?? null,
    devolucion: input.devolucion ?? null,
    usuarioId,
    creadaEn: ahora,
  };
  await repos.notaResoluciones.crear(resolucion);
  return resolucion;
}

// ───── Bitácora del consultor (ticket 10B) ─────

export interface BitacoraDeAlumno {
  entradas: (EntradaBitacora & { autorNombre: string | null })[];
  /** La traba vigente, para la cabecera de la ficha. */
  traba: { texto: string; fecha: string; autorNombre: string | null } | null;
}

/**
 * Carga una entrada — y REGISTRA EL CONTACTO en la misma operación: sin eso,
 * la alerta de inactividad seguiría gritando por un alumno que tuvo su
 * consultoría ayer (o habría que cargar dos veces). Un gesto, dos efectos.
 * Append-only: la bitácora no se edita — si algo cambia, otra entrada.
 */
export async function cargarBitacora(
  repos: ReposAlumnos,
  alcance: Alcance,
  usuarioId: string,
  alumnoId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<EntradaBitacora> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  const input = bitacoraInputSchema.parse(entrada ?? {});
  const fila: EntradaBitacora = {
    id: randomUUID(),
    alumnoId,
    texto: input.texto,
    tipoContacto: input.tipoContacto,
    trabaActual: input.trabaActual ?? null,
    usuarioId,
    creadaEn: ahora,
  };
  await repos.bitacora.crear(fila);
  await repos.contactos.crear({
    id: randomUUID(),
    alumnoId,
    consultorId: usuarioId,
    canal: CANAL_POR_TIPO[input.tipoContacto],
    contactadoEn: ahora,
    nota: null,
  });
  return fila;
}

/** La bitácora completa del alumno (ámbito por fila) + la traba vigente. */
export async function bitacoraDeAlumno(
  repos: ReposAlumnos,
  usuarios: UsuariosRepo,
  alcance: Alcance,
  alumnoId: string,
): Promise<BitacoraDeAlumno> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  const entradas = await repos.bitacora.listarPorAlumno(alumnoId);
  const nombrePorId = new Map((await usuarios.listar()).map((u) => [u.id, u.nombre]));
  const vigente = trabaActual(entradas);
  return {
    entradas: entradas.map((e) => ({ ...e, autorNombre: nombrePorId.get(e.usuarioId) ?? null })),
    traba: vigente
      ? { texto: vigente.trabaActual!, fecha: vigente.creadaEn, autorNombre: nombrePorId.get(vigente.usuarioId) ?? null }
      : null,
  };
}

// ───── Comparación de semáforos (ticket 9C · paralelo on-read) ─────

export interface ComparacionAlumno {
  alumnoId: string;
  nombre: string;
  estado: EstadoAlumno;
  /** El que se muestra hoy: KRs tildados (cumplido_en) contra días/90. */
  viejo: { salud: Salud | null; motivo: MotivoNeutro | null; brecha: number | null };
  /** El candidato: acciones ejecutadas contra la agenda del plan. Vive SOLO acá. */
  nuevo: { salud: Salud | null; motivo: MotivoNeutroAcciones | null; brecha: number | null };
  coinciden: boolean;
  acciones: { ejecutadas: number; totales: number };
  /** La ENTRADA del semáforo viejo (tilde manual), no el contador derivado de 9B. */
  krs: { cumplidas: number; totales: number };
}

export interface ComparacionSemaforo {
  generadoEn: string;
  divergencias: number;
  alumnos: ComparacionAlumno[];
}

/**
 * El export ADMIN de la semana de observación (TICKET-9.md §7.1): los dos
 * semáforos lado a lado, por alumno, calculados on-read — sin scheduler y sin
 * serie histórica. El valor nuevo NO viaja en /api/alumnos/panel: los
 * consultores siguen viendo solo el viejo hasta el switch.
 *
 * Lectura de la semana: si todos los planes cargados tienen reparto parejo,
 * cero divergencia ES la confirmación de que el switch es seguro (con reparto
 * parejo la fórmula nueva es idéntica a días/90), no un test que no corrió.
 *
 * El ámbito lo corta la ruta (exigirAmbitoTotal) ANTES de llegar acá: este
 * caso de uso es de ámbito total por definición y no acota por titular.
 */
export async function comparacionSemaforo(repos: ReposAlumnos, ahora = ahoraIso()): Promise<ComparacionSemaforo> {
  const alumnos = await repos.alumnos.listar({});
  const filas: ComparacionAlumno[] = [];
  for (const alumno of alumnos) {
    const vigente = (await repos.planes.listarPorAlumno(alumno.id))[0] ?? null;
    const fechaInicio = vigente?.plan.fechaInicio ?? null;

    const entradaVieja = avanceKrs(vigente ? vigente.okrs.flatMap((o) => o.krs) : []);
    const viejo = calcularSalud(
      { estado: alumno.estado, fechaInicio, krsTotales: entradaVieja.totales, krsCumplidos: entradaVieja.cumplidos },
      ahora,
    );

    const checkins = vigente ? await repos.checkins.listarPorPlan(vigente.plan.id) : [];
    const porFase = accionesPorFase(vigente?.acciones ?? [], checkins);
    const nuevo = calcularSaludPorAcciones({ estado: alumno.estado, fechaInicio, porFase }, ahora);

    filas.push({
      alumnoId: alumno.id,
      nombre: alumno.nombre,
      estado: alumno.estado,
      viejo: { salud: viejo.salud, motivo: viejo.motivo ?? null, brecha: viejo.brecha ?? null },
      nuevo: { salud: nuevo.salud, motivo: nuevo.motivo ?? null, brecha: nuevo.brecha ?? null },
      coinciden: viejo.salud === nuevo.salud,
      acciones: {
        ejecutadas: porFase.reduce((s, f) => s + f.ejecutadas, 0),
        totales: porFase.reduce((s, f) => s + f.totales, 0),
      },
      krs: { cumplidas: entradaVieja.cumplidos, totales: entradaVieja.totales },
    });
  }
  // Divergentes primero: son la razón de ser del export. Después, alfabético.
  filas.sort((a, b) => Number(a.coinciden) - Number(b.coinciden) || a.nombre.localeCompare(b.nombre));
  return { generadoEn: ahora, divergencias: filas.filter((f) => !f.coinciden).length, alumnos: filas };
}

// ───── Seguimiento activo (ticket 7C): contactos y teléfonos ─────

/**
 * Registra que el consultor contactó al alumno. Se llama ANTES de abrir el
 * link de WhatsApp — si el registro falla, el link no se abre: un contacto
 * sin registrar dejaría la alerta gritando por alguien ya atendido.
 */
export async function registrarContacto(
  repos: ReposAlumnos,
  alcance: Alcance,
  consultorId: string,
  alumnoId: string,
  entrada: unknown,
  ahora = ahoraIso(),
): Promise<Contacto> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  const input = contactoInputSchema.parse(entrada ?? {});
  const contacto: Contacto = {
    id: randomUUID(),
    alumnoId,
    consultorId,
    canal: input.canal,
    contactadoEn: ahora,
    nota: input.nota ?? null,
  };
  await repos.contactos.crear(contacto);
  return contacto;
}

/** Historial de contactos del alumno (la ficha lo muestra colapsado). */
export async function listarContactos(
  repos: ReposAlumnos,
  alcance: Alcance,
  alumnoId: string,
): Promise<Contacto[]> {
  const alumno = await obtenerAlumno(repos, alcance, alumnoId);
  if (!alumno) throw new ErrorAlumnos('NO_ENCONTRADO', 'Alumno inexistente.');
  return repos.contactos.listarPorAlumno(alumnoId);
}

export interface ResultadoMigracionTelefonos {
  migrados: number;
  yaMigrados: number;
  /** Los que NO se parsearon con confianza: quedan para revisión manual. */
  sinMigrar: { id: string; nombre: string; whatsapp: string }[];
}

/**
 * Migración de UNA pasada (ticket 7C §7): parte el `whatsapp` libre de las
 * fichas existentes en telefono_pais / telefono_numero. Idempotente: la ficha
 * que ya tiene teléfono normalizado no se toca. Lo que no se parsea con
 * confianza NO se adivina — queda listado para cargarlo a mano (adivinar mal
 * es escribirle a un desconocido).
 */
export async function migrarTelefonos(repos: ReposAlumnos): Promise<ResultadoMigracionTelefonos> {
  const todos = [...(await repos.alumnos.listar()), ...(await repos.alumnos.listarEliminados())];
  const resultado: ResultadoMigracionTelefonos = { migrados: 0, yaMigrados: 0, sinMigrar: [] };
  for (const a of todos) {
    if (a.telefonoPais !== null && a.telefonoNumero !== null) {
      resultado.yaMigrados++;
      continue;
    }
    if (!a.whatsapp) continue; // sin dato no hay nada que migrar (ni que revisar)
    const parseado = parsearTelefono(a.whatsapp);
    if (!parseado) {
      resultado.sinMigrar.push({ id: a.id, nombre: a.nombre, whatsapp: a.whatsapp });
      continue;
    }
    await repos.alumnos.guardar({ ...a, telefonoPais: parseado.pais, telefonoNumero: parseado.numero });
    resultado.migrados++;
  }
  return resultado;
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
