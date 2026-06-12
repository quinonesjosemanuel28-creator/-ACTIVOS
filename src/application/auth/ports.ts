/**
 * CAPA 2 — APLICACIÓN · Auth · Puertos (interfaces).
 *
 * La aplicación define qué necesita de la persistencia y del hashing; la
 * infraestructura implementa estas interfaces (inversión de dependencias).
 * Async desde el día 1 (igual que el resto: cumple SQLite y PostgreSQL).
 */
import type { Rol, Sesion, Usuario } from '../../domain/auth/permisos';

export interface UsuariosRepo {
  obtenerPorId(id: string): Promise<Usuario | null>;
  obtenerPorEmail(email: string): Promise<Usuario | null>;
  listar(): Promise<Usuario[]>;
  guardar(usuario: Usuario): Promise<void>; // upsert por id
  /** Cantidad de ADMIN activos (para no quedarnos sin ninguno). */
  contarAdminsActivos(): Promise<number>;
}

export interface SesionesRepo {
  crear(sesion: Sesion): Promise<void>;
  obtener(token: string): Promise<Sesion | null>;
  eliminar(token: string): Promise<void>;
  /** Borra TODAS las sesiones de un usuario (baja / cambio de contraseña). */
  eliminarDeUsuario(idUsuario: string): Promise<void>;
  /** Limpia sesiones vencidas (mantenimiento). Devuelve cuántas borró. */
  limpiarVencidas(ahoraIso: string): Promise<number>;
}

/**
 * Puerto de hashing: la app no conoce bcrypt. Infra lo implementa con
 * bcryptjs; los tests pueden inyectar un hasher trivial (rápido).
 */
export interface Hasher {
  hash(plano: string): Promise<string>;
  verificar(plano: string, hash: string): Promise<boolean>;
}

/** Repos de auth agrupados (lo que necesitan los casos de uso). */
export interface ReposAuth {
  usuarios: UsuariosRepo;
  sesiones: SesionesRepo;
  hasher: Hasher;
}

export type { Rol };
