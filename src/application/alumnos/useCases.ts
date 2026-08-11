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
  aRespuestas,
  alumnoInputSchema,
  alumnoPatchSchema,
  diagnosticoInputSchema,
  diagnosticoPatchSchema,
  fichaPublicaSchema,
  type FichaPublica,
} from './schemas';
import type { FiltrosAlumnos, ReposAlumnos } from './ports';

export class ErrorAlumnos extends Error {
  constructor(
    public readonly codigo: 'NO_ENCONTRADO' | 'VALIDACION' | 'TOKEN_INVALIDO',
    mensaje: string,
    /** Detalle del token, para que el server elija el mensaje al alumno. */
    public readonly motivo?: MotivoTokenInvalido,
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
    idCierreVinculado: input.idCierreVinculado ?? null,
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
