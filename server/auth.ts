/**
 * SERVER · Guardias de autenticación/autorización + cookie de sesión.
 *
 * - La cookie es HttpOnly (el JS del navegador nunca la lee) + SameSite=Lax,
 *   y Secure en producción. Contiene SOLO el token opaco de sesión.
 * - `autenticar` resuelve token → usuario (consultando la tabla sesiones:
 *   dar de baja a alguien lo expulsa al instante).
 * - `requiere(accion)` consulta la matriz de permisos del DOMINIO: acá no
 *   hay reglas propias, solo se aplica la fuente de verdad única.
 * - Limitador de intentos de login en memoria (anti fuerza bruta).
 */
import type express from 'express';
import {
  alcanceDeUsuario,
  puede,
  type Accion,
  type Alcance,
  type Usuario,
} from '../src/domain/auth/permisos';
import { usuarioDeSesion } from '../src/application/auth/useCases';
import type { ReposAuth } from '../src/application/auth/ports';

export const NOMBRE_COOKIE = 'activos_sesion';
/** La cookie dura lo mismo que la sesión (7 días). */
const DURACION_COOKIE_S = 7 * 24 * 60 * 60;

/** Extrae el token de sesión de la cookie (sin dependencias). */
export function tokenDe(req: express.Request): string | undefined {
  const crudo = req.headers.cookie;
  if (!crudo) return undefined;
  const m = crudo.match(new RegExp(`(?:^|;\\s*)${NOMBRE_COOKIE}=([^;]+)`));
  return m?.[1];
}

export function setCookieSesion(res: express.Response, token: string, segura: boolean): void {
  const partes = [`${NOMBRE_COOKIE}=${token}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${DURACION_COOKIE_S}`];
  if (segura) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function borrarCookieSesion(res: express.Response, segura: boolean): void {
  const partes = [`${NOMBRE_COOKIE}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (segura) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

/** Usuario autenticado del request (lo deja `autenticar` en res.locals). */
export function usuarioDe(res: express.Response): Usuario {
  return res.locals.usuario as Usuario;
}

/**
 * Ámbito de filas de la sesión. Sale del USUARIO autenticado, nunca de la
 * query string: es la única fuente válida para acotar una consulta.
 */
export function alcanceDe(res: express.Response): Alcance {
  return alcanceDeUsuario(usuarioDe(res));
}

/**
 * Corta en seco si la sesión tiene ámbito acotado sobre un recurso que todavía
 * no sabe filtrar por titular.
 *
 * El contable no tiene titular por fila ligado a `usuarios`: `cierres.closer`
 * es texto libre (el nombre del closer), no un id. Hoy ningún rol con 'ver'
 * está acotado, así que esto nunca se dispara — pero el día que alguno lo esté,
 * la consulta falla en vez de devolver de más. Falla cerrado, no abierto.
 */
export function exigirAmbitoTotal(alcance: Alcance, recurso: string): void {
  if (alcance.ambito !== 'todos') {
    throw new Error(`El recurso "${recurso}" no sabe acotar por titular: consulta bloqueada.`);
  }
}

export interface Guardias {
  /** Exige sesión válida; deja el usuario en res.locals. 401 si no hay. */
  autenticar: express.RequestHandler;
  /** Exige que el rol del usuario habilite la acción. 403 si no. */
  requiere: (accion: Accion) => express.RequestHandler;
}

export function crearGuardias(reposAuth: ReposAuth): Guardias {
  const autenticar: express.RequestHandler = async (req, res, next) => {
    try {
      const usuario = await usuarioDeSesion(reposAuth, tokenDe(req));
      if (!usuario) {
        res.status(401).json({ error: 'Necesitás iniciar sesión.' });
        return;
      }
      res.locals.usuario = usuario;
      next();
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error de autenticación' });
    }
  };

  const requiere =
    (accion: Accion): express.RequestHandler =>
    (_req, res, next) => {
      const usuario = res.locals.usuario as Usuario | undefined;
      if (!usuario) {
        res.status(401).json({ error: 'Necesitás iniciar sesión.' });
        return;
      }
      if (!puede(usuario.rol, accion)) {
        res.status(403).json({ error: `Tu rol (${usuario.rol}) no permite esta acción.` });
        return;
      }
      next();
    };

  return { autenticar, requiere };
}

// ───────────────────────── Anti fuerza bruta ─────────────────────────

export interface LimitadorLogin {
  /** ¿Esta IP todavía puede intentar loguear? */
  permitido(ip: string): boolean;
  /** Registra un intento fallido. */
  fallo(ip: string): void;
  /** Login exitoso: limpia el contador de la IP. */
  exito(ip: string): void;
}

/**
 * Limitador en memoria: máx. `max` intentos fallidos por IP por ventana.
 * Suficiente para una app de equipo chico en un solo proceso.
 */
export function crearLimitadorLogin(opciones: { max?: number; ventanaMs?: number } = {}): LimitadorLogin {
  const max = opciones.max ?? 10;
  const ventanaMs = opciones.ventanaMs ?? 15 * 60_000;
  const intentos = new Map<string, { n: number; desde: number }>();

  return {
    permitido(ip) {
      const reg = intentos.get(ip);
      if (!reg) return true;
      if (Date.now() - reg.desde > ventanaMs) {
        intentos.delete(ip); // ventana vencida: arranca de cero
        return true;
      }
      return reg.n < max;
    },
    fallo(ip) {
      const reg = intentos.get(ip);
      if (!reg || Date.now() - reg.desde > ventanaMs) {
        intentos.set(ip, { n: 1, desde: Date.now() });
      } else {
        reg.n += 1;
      }
    },
    exito(ip) {
      intentos.delete(ip);
    },
  };
}
