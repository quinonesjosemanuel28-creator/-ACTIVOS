/**
 * CAPA 3 — DOMINIO · Autenticación y autorización · Tipos y permisos.
 *
 * TypeScript puro: cero dependencias de bcrypt, PG, Express o React. Define
 * QUÉ puede hacer cada rol (la matriz de permisos) en un único lugar; el
 * server la consulta para custodiar cada ruta y la UI para ocultar botones.
 *
 * Regla rectora: mínimo permiso necesario. Si una acción no está listada
 * para un rol, está PROHIBIDA (lista blanca, no negra).
 */

/** Roles del sistema, de menor a mayor privilegio. */
export type Rol = 'LECTOR' | 'EDITOR' | 'ADMIN';

export const ROLES: readonly Rol[] = ['LECTOR', 'EDITOR', 'ADMIN'] as const;

/** ¿Es un rol válido? (validación de entradas en el borde). */
export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

/**
 * Acciones que el sistema sabe autorizar. Cada endpoint del server declara
 * la acción mínima que exige; la UI usa las mismas para mostrar/ocultar.
 *
 * - 'ver': lecturas (dashboards, métricas, históricos, cobranza, asistente IA).
 * - 'editar': altas/ediciones del día a día (cierres, pagos, egresos, funnel,
 *   parámetros, liquidar comisiones, cerrar mes).
 * - 'importar': acciones destructivas sobre la base (importar Excel, resetear,
 *   borrar demo). Solo ADMIN.
 * - 'gestionar_usuarios': crear/editar/baja/resetear usuarios. Solo ADMIN.
 */
export type Accion = 'ver' | 'editar' | 'importar' | 'gestionar_usuarios';

export const ACCIONES: readonly Accion[] = ['ver', 'editar', 'importar', 'gestionar_usuarios'] as const;

/**
 * Matriz de permisos: qué acciones habilita cada rol. Fuente de verdad ÚNICA.
 * LECTOR ⊂ EDITOR ⊂ ADMIN (cada rol incluye lo del anterior y suma).
 */
const PERMISOS: Record<Rol, ReadonlySet<Accion>> = {
  LECTOR: new Set<Accion>(['ver']),
  EDITOR: new Set<Accion>(['ver', 'editar']),
  ADMIN: new Set<Accion>(['ver', 'editar', 'importar', 'gestionar_usuarios']),
};

/** ¿El rol puede ejecutar la acción? Núcleo de la autorización. */
export function puede(rol: Rol, accion: Accion): boolean {
  return PERMISOS[rol].has(accion);
}

/** Todas las acciones permitidas para un rol (para enviar a la UI). */
export function accionesDe(rol: Rol): Accion[] {
  return ACCIONES.filter((a) => puede(rol, a));
}

// ───────────────────────── Entidades ─────────────────────────

/** Usuario tal como vive en la base (incluye el hash, NUNCA la contraseña). */
export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  passwordHash: string;
  activo: boolean;
  /** Obliga a cambiar la contraseña en el próximo login (alta / reset). */
  debeCambiarPassword: boolean;
  creadoEn: string;
}

/**
 * Vista pública del usuario: lo que se manda al cliente. SIN passwordHash —
 * el hash jamás sale del servidor.
 */
export interface UsuarioPublico {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  creadoEn: string;
}

/** Proyecta un Usuario a su vista pública (descarta el hash). */
export function aUsuarioPublico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    debeCambiarPassword: u.debeCambiarPassword,
    creadoEn: u.creadoEn,
  };
}

/** Sesión activa: token opaco que mapea a un usuario hasta que expira. */
export interface Sesion {
  token: string;
  idUsuario: string;
  expiraEn: string;
  creadaEn: string;
}

/** Normaliza un email para comparar/guardar (minúsculas, sin espacios). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Tablas que el Asistente IA no debe ver ni consultar.
 *
 * - usuarios/sesiones: exclusión PERMANENTE (hashes de contraseña, tokens).
 * - Módulo de alumnos: exclusión TEMPORAL, no de arquitectura. El text-to-SQL
 *   arma la consulta sobre el esquema crudo y pasaría por encima del ámbito
 *   por consultor (ticket 2): un consultor podría pedir la cartera de otro.
 *   En el ticket 6 el asistente se reactiva sobre el módulo consultando
 *   vistas ya filtradas por sesión, y estas entradas se retiran de acá.
 */
export const TABLAS_SENSIBLES: readonly string[] = [
  'usuarios',
  'sesiones',
  // ── módulo de alumnos (retirar en el ticket 6) ──
  'alumnos',
  'diagnosticos',
  'diagnostico_tokens',
  'alumno_consultor_historial',
] as const;
