/**
 * CAPA 3 — DOMINIO · Asistente IA · Descripción del esquema (solo nombres).
 *
 * Genera un texto con tablas y columnas de la base, SIN datos, para mandar a
 * Claude como contexto del text-to-SQL. Recibe la metadata ya extraída por la
 * infraestructura (inversión de dependencias): el dominio no toca SQLite.
 */

export interface ColumnaInfo {
  nombre: string;
  tipo: string;
}
export interface TablaInfo {
  tabla: string;
  columnas: ColumnaInfo[];
}

/** Tablas internas que no aportan al análisis (se excluyen del contexto). */
const OCULTAR = new Set(['sqlite_sequence', 'sqlite_stat1']);

/** Arma el bloque de esquema en texto para el prompt. */
export function describirEsquema(tablas: readonly TablaInfo[]): string {
  return tablas
    .filter((t) => !OCULTAR.has(t.tabla))
    .map((t) => {
      const cols = t.columnas.map((c) => `${c.nombre} ${c.tipo}`).join(', ');
      return `${t.tabla}(${cols})`;
    })
    .join('\n');
}
