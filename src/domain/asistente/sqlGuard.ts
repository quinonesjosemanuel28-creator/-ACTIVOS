/**
 * CAPA 3 — DOMINIO · Asistente IA · Guard de solo-lectura (puro, testeado).
 *
 * Valida que una SQL generada por la IA sea SELECT de SOLO LECTURA antes de
 * ejecutarla. Defensa en capas (el segundo candado es ejecutar con la DB en
 * modo readonly, en la capa de infraestructura):
 *  1. Una sola sentencia (corta inyección de segundo statement con `;`).
 *  2. Debe empezar con SELECT o WITH (tras stripear comentarios).
 *  3. Lista negra de keywords de escritura/DDL con límites de palabra.
 *
 * Cero dependencias. La IA NUNCA debe poder modificar ni borrar datos.
 */

export interface ResultadoGuard {
  ok: boolean;
  motivo?: string;
}

/** Palabras prohibidas (escritura / DDL / side-effects). Límite de palabra. */
const PROHIBIDAS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE',
  'TRUNCATE', 'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM', 'REINDEX',
  'MERGE', 'GRANT', 'REVOKE',
];

/** Quita comentarios -- de línea y /* * / de bloque, y normaliza espacios. */
function stripComentarios(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ') // comentarios de línea
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // comentarios de bloque
    .trim();
}

/**
 * ¿La SQL es un SELECT de solo lectura seguro de ejecutar?
 * Devuelve { ok:false, motivo } explicando el rechazo.
 */
export function esSoloLectura(sqlOriginal: string): ResultadoGuard {
  if (typeof sqlOriginal !== 'string' || sqlOriginal.trim() === '') {
    return { ok: false, motivo: 'Consulta vacía.' };
  }

  const sql = stripComentarios(sqlOriginal);
  if (sql === '') return { ok: false, motivo: 'La consulta solo contenía comentarios.' };

  // 1) Una sola sentencia: no permitir `;` que separe statements. Se tolera
  // un único `;` final (con o sin espacios) como terminador.
  const sinFinal = sql.replace(/;\s*$/, '');
  if (sinFinal.includes(';')) {
    return { ok: false, motivo: 'Solo se permite una sentencia (sin ";").' };
  }

  // 2) Debe empezar con SELECT o WITH.
  if (!/^\s*(select|with)\b/i.test(sinFinal)) {
    return { ok: false, motivo: 'Solo se permiten consultas SELECT (o WITH … SELECT).' };
  }

  // 3) Lista negra por keyword con límites de palabra (case-insensitive).
  for (const kw of PROHIBIDAS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(sinFinal)) {
      return { ok: false, motivo: `Operación no permitida: ${kw}. Solo lectura.` };
    }
  }

  return { ok: true };
}

/** Agrega un LIMIT defensivo si la consulta no lo tiene (evita resultados enormes). */
export function conLimite(sql: string, limite: number): string {
  const limpia = sql.replace(/;\s*$/, '').trim();
  if (/\blimit\b/i.test(limpia)) return limpia;
  return `${limpia} LIMIT ${limite}`;
}
