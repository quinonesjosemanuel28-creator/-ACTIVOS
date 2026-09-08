/**
 * CAPA 2 — APLICACIÓN · Auth · Casos de uso.
 *
 * Login, gestión de sesiones y administración de usuarios. Sin reglas de
 * negocio propias salvo orquestación: la matriz de permisos y la política de
 * contraseñas viven en el dominio. Recibe los repos + el hasher por inyección.
 *
 * Seguridad incorporada:
 *  - Contraseñas siempre hasheadas (puerto Hasher); el texto plano nunca se
 *    persiste ni se loguea.
 *  - Login con mensaje genérico (no revela si el email existe).
 *  - Dar de baja / cambiar contraseña expulsa todas las sesiones del usuario.
 *  - No se puede dejar al sistema sin ningún ADMIN activo.
 */
import {
  aUsuarioPublico,
  esRol,
  normalizarEmail,
  puedeSerResponsable,
  type Rol,
  type Sesion,
  type Usuario,
  type UsuarioPublico,
} from '../../domain/auth/permisos';
import { generarPasswordTemporal, validarPassword } from '../../domain/auth/password';
import type { ReposAuth } from './ports';

/** Duración de una sesión (7 días). */
export const DURACION_SESION_MS = 7 * 24 * 60 * 60 * 1000;

let secuencia = 0;
const nuevoId = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}-${(secuencia++).toString(36)}`;
const ahoraIso = () => new Date().toISOString();

export class ErrorAuth extends Error {
  constructor(
    public readonly codigo: 'CREDENCIALES' | 'NO_AUTORIZADO' | 'VALIDACION' | 'NO_ENCONTRADO' | 'CONFLICTO',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorAuth';
  }
}

// ───────────────────────── Login / sesión ─────────────────────────

export interface ResultadoLogin {
  token: string;
  expiraEn: string;
  usuario: UsuarioPublico;
}

/**
 * Verifica credenciales y abre una sesión. Mensaje genérico ante email
 * inexistente, contraseña incorrecta o usuario inactivo (no filtra cuál fue).
 */
export async function login(
  repos: ReposAuth,
  emailCrudo: unknown,
  password: unknown,
  ahora: number = Date.now(),
): Promise<ResultadoLogin> {
  const generico = new ErrorAuth('CREDENCIALES', 'Email o contraseña incorrectos.');
  if (typeof emailCrudo !== 'string' || typeof password !== 'string') throw generico;

  const email = normalizarEmail(emailCrudo);
  const usuario = await repos.usuarios.obtenerPorEmail(email);
  if (!usuario || !usuario.activo) {
    // Igualamos el costo: hash falso para no revelar por tiempo si existe.
    await repos.hasher.verificar(password, '$2a$12$0000000000000000000000000000000000000000000000000000');
    throw generico;
  }
  const ok = await repos.hasher.verificar(password, usuario.passwordHash);
  if (!ok) throw generico;

  const sesion: Sesion = {
    token: nuevoId('ses'),
    idUsuario: usuario.id,
    creadaEn: new Date(ahora).toISOString(),
    expiraEn: new Date(ahora + DURACION_SESION_MS).toISOString(),
  };
  await repos.sesiones.crear(sesion);
  return { token: sesion.token, expiraEn: sesion.expiraEn, usuario: aUsuarioPublico(usuario) };
}

/** Cierra la sesión actual (logout). */
export async function logout(repos: ReposAuth, token: string): Promise<void> {
  await repos.sesiones.eliminar(token);
}

/**
 * Resuelve la sesión a su usuario, validando expiración y que siga activo.
 * Si la sesión venció o el usuario fue dado de baja, devuelve null (y limpia).
 */
export async function usuarioDeSesion(
  repos: ReposAuth,
  token: string | undefined,
  ahora: number = Date.now(),
): Promise<Usuario | null> {
  if (!token) return null;
  const sesion = await repos.sesiones.obtener(token);
  if (!sesion) return null;
  if (new Date(sesion.expiraEn).getTime() <= ahora) {
    await repos.sesiones.eliminar(token);
    return null;
  }
  const usuario = await repos.usuarios.obtenerPorId(sesion.idUsuario);
  if (!usuario || !usuario.activo) {
    await repos.sesiones.eliminar(token);
    return null;
  }
  return usuario;
}

// ───────────────────────── Gestión de usuarios (ADMIN) ─────────────────────────

export interface AltaUsuario {
  email: string;
  nombre: string;
  rol: Rol;
  /** Si no se provee, se genera una temporal y se devuelve para comunicarla. */
  password?: string;
}

export interface ResultadoAlta {
  usuario: UsuarioPublico;
  /** Contraseña temporal generada (solo si no se pasó una). Mostrar UNA vez. */
  passwordTemporal?: string;
}

/** Crea un usuario. El alta exige cambio de contraseña en el primer login. */
export async function crearUsuario(repos: ReposAuth, input: AltaUsuario): Promise<ResultadoAlta> {
  const email = normalizarEmail(String(input?.email ?? ''));
  if (!email || !email.includes('@')) throw new ErrorAuth('VALIDACION', 'Email inválido.');
  if (typeof input?.nombre !== 'string' || input.nombre.trim() === '')
    throw new ErrorAuth('VALIDACION', 'El nombre es obligatorio.');
  if (!esRol(input?.rol)) throw new ErrorAuth('VALIDACION', 'Rol inválido.');
  if (await repos.usuarios.obtenerPorEmail(email))
    throw new ErrorAuth('CONFLICTO', `Ya existe un usuario con el email ${email}.`);

  const passwordTemporal = input.password ?? generarPasswordTemporal();
  const valida = validarPassword(passwordTemporal);
  if (!valida.ok) throw new ErrorAuth('VALIDACION', valida.motivo!);

  const usuario: Usuario = {
    id: nuevoId('usr'),
    email,
    nombre: input.nombre.trim(),
    rol: input.rol,
    passwordHash: await repos.hasher.hash(passwordTemporal),
    activo: true,
    debeCambiarPassword: true,
    creadoEn: ahoraIso(),
  };
  await repos.usuarios.guardar(usuario);
  return {
    usuario: aUsuarioPublico(usuario),
    passwordTemporal: input.password ? undefined : passwordTemporal,
  };
}

export async function listarUsuarios(repos: ReposAuth): Promise<UsuarioPublico[]> {
  return (await repos.usuarios.listar()).map(aUsuarioPublico);
}

/**
 * Cambia el rol de un usuario. No permite quitar el último ADMIN activo.
 *
 * `contarCartera` (ticket 11C): cuántos alumnos vivos tiene asignados — lo
 * inyecta el server desde el módulo de alumnos. Si el rol NUEVO no puede
 * tener cartera, el cambio se bloquea con cartera asignada: esos alumnos
 * quedarían colgando de un responsable que ya no puede ni verlos. Un pase
 * entre roles con cartera (CONSULTOR ↔ ADMIN) no se bloquea.
 */
export async function cambiarRol(
  repos: ReposAuth,
  idUsuario: string,
  rol: unknown,
  contarCartera?: (usuarioId: string) => Promise<number>,
): Promise<UsuarioPublico> {
  if (!esRol(rol)) throw new ErrorAuth('VALIDACION', 'Rol inválido.');
  const usuario = await repos.usuarios.obtenerPorId(idUsuario);
  if (!usuario) throw new ErrorAuth('NO_ENCONTRADO', 'Usuario inexistente.');
  if (usuario.rol === 'ADMIN' && rol !== 'ADMIN' && usuario.activo) {
    await asegurarNoEsUltimoAdmin(repos);
  }
  if (contarCartera && !puedeSerResponsable(rol) && puedeSerResponsable(usuario.rol)) {
    const n = await contarCartera(idUsuario);
    if (n > 0) {
      throw new ErrorAuth('CONFLICTO', `Tiene ${n} alumno${n === 1 ? '' : 's'} en su cartera: primero reasigná sus alumnos.`);
    }
  }
  const actualizado: Usuario = { ...usuario, rol };
  await repos.usuarios.guardar(actualizado);
  return aUsuarioPublico(actualizado);
}

/** Da de baja a un usuario: lo desactiva y expulsa todas sus sesiones. */
export async function darDeBaja(repos: ReposAuth, idUsuario: string): Promise<UsuarioPublico> {
  const usuario = await repos.usuarios.obtenerPorId(idUsuario);
  if (!usuario) throw new ErrorAuth('NO_ENCONTRADO', 'Usuario inexistente.');
  if (usuario.rol === 'ADMIN' && usuario.activo) await asegurarNoEsUltimoAdmin(repos);
  const actualizado: Usuario = { ...usuario, activo: false };
  await repos.usuarios.guardar(actualizado);
  await repos.sesiones.eliminarDeUsuario(idUsuario); // expulsión inmediata
  return aUsuarioPublico(actualizado);
}

/** Reactiva un usuario dado de baja. */
export async function reactivar(repos: ReposAuth, idUsuario: string): Promise<UsuarioPublico> {
  const usuario = await repos.usuarios.obtenerPorId(idUsuario);
  if (!usuario) throw new ErrorAuth('NO_ENCONTRADO', 'Usuario inexistente.');
  const actualizado: Usuario = { ...usuario, activo: true };
  await repos.usuarios.guardar(actualizado);
  return aUsuarioPublico(actualizado);
}

/**
 * Resetea la contraseña de un usuario (ADMIN). Genera una temporal, fuerza el
 * cambio en el próximo login y expulsa las sesiones vigentes del usuario.
 */
export async function resetearPassword(repos: ReposAuth, idUsuario: string): Promise<{ passwordTemporal: string }> {
  const usuario = await repos.usuarios.obtenerPorId(idUsuario);
  if (!usuario) throw new ErrorAuth('NO_ENCONTRADO', 'Usuario inexistente.');
  const passwordTemporal = generarPasswordTemporal();
  const actualizado: Usuario = {
    ...usuario,
    passwordHash: await repos.hasher.hash(passwordTemporal),
    debeCambiarPassword: true,
  };
  await repos.usuarios.guardar(actualizado);
  await repos.sesiones.eliminarDeUsuario(idUsuario);
  return { passwordTemporal };
}

/**
 * Cambio de contraseña por el propio usuario (verifica la actual). Tras
 * cambiarla, deja sus OTRAS sesiones inválidas y limpia el flag de cambio.
 */
export async function cambiarMiPassword(
  repos: ReposAuth,
  idUsuario: string,
  passwordActual: unknown,
  passwordNueva: unknown,
): Promise<void> {
  const usuario = await repos.usuarios.obtenerPorId(idUsuario);
  if (!usuario) throw new ErrorAuth('NO_ENCONTRADO', 'Usuario inexistente.');
  const ok = typeof passwordActual === 'string' && (await repos.hasher.verificar(passwordActual, usuario.passwordHash));
  if (!ok) throw new ErrorAuth('CREDENCIALES', 'La contraseña actual es incorrecta.');
  const valida = validarPassword(passwordNueva);
  if (!valida.ok) throw new ErrorAuth('VALIDACION', valida.motivo!);
  const actualizado: Usuario = {
    ...usuario,
    passwordHash: await repos.hasher.hash(passwordNueva as string),
    debeCambiarPassword: false,
  };
  await repos.usuarios.guardar(actualizado);
  await repos.sesiones.eliminarDeUsuario(idUsuario);
}

/**
 * Crea el ADMIN inicial si no existe ningún usuario (arranque del sistema).
 * Idempotente: si ya hay usuarios, no hace nada. Pensado para el primer
 * deploy (lee email/contraseña de variables de entorno en el server).
 */
export async function asegurarAdminInicial(
  repos: ReposAuth,
  email: string,
  password: string,
  nombre = 'Administrador',
): Promise<UsuarioPublico | null> {
  const existentes = await repos.usuarios.listar();
  if (existentes.length > 0) return null;
  const valida = validarPassword(password);
  if (!valida.ok) throw new ErrorAuth('VALIDACION', `Contraseña inicial inválida: ${valida.motivo}`);
  const usuario: Usuario = {
    id: nuevoId('usr'),
    email: normalizarEmail(email),
    nombre,
    rol: 'ADMIN',
    passwordHash: await repos.hasher.hash(password),
    activo: true,
    debeCambiarPassword: false,
    creadoEn: ahoraIso(),
  };
  await repos.usuarios.guardar(usuario);
  return aUsuarioPublico(usuario);
}

async function asegurarNoEsUltimoAdmin(repos: ReposAuth): Promise<void> {
  const admins = await repos.usuarios.contarAdminsActivos();
  if (admins <= 1) {
    throw new ErrorAuth('CONFLICTO', 'No se puede quitar el último ADMIN activo del sistema.');
  }
}
