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

/**
 * Roles del sistema. NO son una sola escalera:
 *
 *  - LECTOR ⊂ EDITOR ⊂ ADMIN son la escalera del CONTABLE (cada uno incluye
 *    lo del anterior y suma).
 *  - CONSULTOR cuelga aparte: pertenece al módulo de alumnos y NO ve nada de
 *    contabilidad — ni de Academy ni de ninguna unidad del holding. No es "un
 *    LECTOR con menos cosas": es otra rama del árbol. Por eso `puede` es una
 *    lista blanca por rol y no una comparación de nivel.
 */
export type Rol = 'LECTOR' | 'EDITOR' | 'ADMIN' | 'CONSULTOR';

export const ROLES: readonly Rol[] = ['LECTOR', 'EDITOR', 'ADMIN', 'CONSULTOR'] as const;

/** ¿Es un rol válido? (validación de entradas en el borde). */
export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

/**
 * Acciones que el sistema sabe autorizar. Cada endpoint del server declara
 * la acción mínima que exige; la UI usa las mismas para mostrar/ocultar.
 *
 * Contable + administración:
 * - 'ver': lecturas (dashboards, métricas, históricos, cobranza, asistente IA).
 * - 'editar': altas/ediciones del día a día (cierres, pagos, egresos, funnel,
 *   parámetros, liquidar comisiones, cerrar mes).
 * - 'importar': acciones destructivas sobre la base (importar Excel, resetear,
 *   borrar demo). Solo ADMIN.
 * - 'gestionar_usuarios': crear/editar/baja/resetear usuarios. Solo ADMIN.
 *
 * Módulo de alumnos (universo separado: 'ver' NO habilita nada de acá, y
 * 'ver_alumnos' NO habilita nada del contable):
 * - 'ver_alumnos': ficha, diagnósticos e índice de claridad de su cartera.
 * - 'editar_alumnos': alta/edición de alumnos y respuestas del diagnóstico.
 *
 * El ÁMBITO (qué filas alcanza) es un eje aparte: ver `Ambito` más abajo.
 */
export type Accion =
  | 'ver'
  | 'editar'
  | 'importar'
  | 'gestionar_usuarios'
  | 'ver_alumnos'
  | 'editar_alumnos';

export const ACCIONES: readonly Accion[] = [
  'ver',
  'editar',
  'importar',
  'gestionar_usuarios',
  'ver_alumnos',
  'editar_alumnos',
] as const;

/**
 * Matriz de permisos: qué acciones habilita cada rol. Fuente de verdad ÚNICA.
 *
 * CONSULTOR no tiene 'ver': es lo que lo deja afuera del contable de raíz. No
 * alcanza con no mostrarle el menú — las rutas de lectura del contable exigen
 * 'ver' y le responden 403.
 */
const PERMISOS: Record<Rol, ReadonlySet<Accion>> = {
  LECTOR: new Set<Accion>(['ver']),
  EDITOR: new Set<Accion>(['ver', 'editar']),
  ADMIN: new Set<Accion>(['ver', 'editar', 'importar', 'gestionar_usuarios', 'ver_alumnos', 'editar_alumnos']),
  CONSULTOR: new Set<Accion>(['ver_alumnos', 'editar_alumnos']),
};

/** ¿El rol puede ejecutar la acción? Núcleo de la autorización. */
export function puede(rol: Rol, accion: Accion): boolean {
  return PERMISOS[rol].has(accion);
}

/** Todas las acciones permitidas para un rol (para enviar a la UI). */
export function accionesDe(rol: Rol): Accion[] {
  return ACCIONES.filter((a) => puede(rol, a));
}

// ───────────────────────── Eje 2: ámbito por fila ─────────────────────────

/**
 * Segundo eje de la autorización. `puede` responde QUÉ acciones; el ámbito
 * responde SOBRE QUÉ FILAS.
 *
 * - 'todos': el rol alcanza todas las filas del recurso.
 * - 'solo_los_mios': solo las filas de las que el usuario es titular (para un
 *   consultor, los alumnos con `consultor_id` = su id).
 *
 * ADMIN es 'todos' a propósito: José ve todas las carteras.
 */
export type Ambito = 'todos' | 'solo_los_mios';

export const AMBITOS: readonly Ambito[] = ['todos', 'solo_los_mios'] as const;

const AMBITO_POR_ROL: Record<Rol, Ambito> = {
  LECTOR: 'todos',
  EDITOR: 'todos',
  ADMIN: 'todos',
  CONSULTOR: 'solo_los_mios',
};

/** Ámbito de filas del rol. */
export function ambitoDe(rol: Rol): Ambito {
  return AMBITO_POR_ROL[rol];
}

/**
 * Ámbito ya resuelto contra un usuario concreto. Lo arma el server a partir de
 * la SESIÓN — nunca de la query string — y lo baja hasta la consulta.
 */
export interface Alcance {
  ambito: Ambito;
  /** Id del usuario de la sesión: el titular cuando el ámbito es acotado. */
  idUsuario: string;
}

export function alcanceDeUsuario(usuario: { id: string; rol: Rol }): Alcance {
  return { ambito: ambitoDe(usuario.rol), idUsuario: usuario.id };
}

/**
 * Titular que hay que FORZAR en la consulta, o undefined si el ámbito no
 * restringe. Con ámbito acotado devuelve siempre el id de la sesión: el
 * cliente no puede pedir la cartera de otro, ni pidiéndola explícitamente.
 */
export function titularForzado(alcance: Alcance): string | undefined {
  return alcance.ambito === 'solo_los_mios' ? alcance.idUsuario : undefined;
}

/**
 * Ciñe al ámbito un titular pedido por el cliente. El servidor MANDA:
 *
 *  - ámbito 'todos'         → vale lo que pidió el cliente (filtro cosmético).
 *  - ámbito 'solo_los_mios' → el titular queda fijado al de la sesión, pida lo
 *    que pida el cliente (o no pida nada).
 *
 * Así el filtro del cliente solo puede ACHICAR el resultado, nunca ensancharlo.
 */
export function titularSegunAlcance(pedidoPorElCliente: string | undefined, alcance: Alcance): string | undefined {
  return titularForzado(alcance) ?? pedidoPorElCliente;
}

/**
 * ¿El alcance llega a una fila cuyo titular es `titularDeLaFila`? Para las
 * lecturas/escrituras de UNA fila, donde no hay filtro que forzar: se compara
 * después de traerla y, si da false, se responde como si no existiera.
 */
export function alcanzaFila(alcance: Alcance, titularDeLaFila: string | null | undefined): boolean {
  if (alcance.ambito === 'todos') return true;
  return !!titularDeLaFila && titularDeLaFila === alcance.idUsuario;
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
 *   por consultor (ya vigente): un consultor podría pedir la cartera de otro.
 *   En el ticket 6 el asistente se reactiva sobre el módulo consultando
 *   vistas ya filtradas por sesión, y estas entradas se retiran de acá.
 */
export const TABLAS_SENSIBLES: readonly string[] = [
  'usuarios',
  'sesiones',
  // ── módulo de alumnos (retirar cuando el asistente tenga vistas filtradas) ──
  'alumnos',
  'diagnosticos',
  'diagnostico_tokens',
  'alumno_consultor_historial',
  'planes',
  'okrs',
  'krs',
  'acciones',
  'checkins',
] as const;
