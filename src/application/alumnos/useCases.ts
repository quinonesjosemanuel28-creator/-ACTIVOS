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
import { calcularClaridad } from '../../domain/alumnos/claridad';
import {
  DIAS_VIGENCIA_TOKEN,
  estadoToken,
  type Alumno,
  type Diagnostico,
  type MotivoTokenInvalido,
  type TokenDiagnostico,
} from '../../domain/alumnos/tipos';
import { aRespuestas, alumnoInputSchema, alumnoPatchSchema, diagnosticoInputSchema } from './schemas';
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

/** Lo mínimo que el formulario público necesita saber para saludar al alumno. */
export interface FormularioAbierto {
  nombre: string;
  programa: string;
  moneda: string;
}

/**
 * Abre el formulario público con un token. Devuelve SOLO nombre, programa y
 * moneda: la ruta no tiene sesión, así que todo lo que se devuelva acá es
 * público para quien tenga el link. Ni consultor, ni WhatsApp, ni diagnósticos
 * anteriores.
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
  return { nombre: alumno.nombre, programa: alumno.programa, moneda: alumno.moneda };
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

  const datos = diagnosticoInputSchema.parse(entrada);
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
  return diagnostico;
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
