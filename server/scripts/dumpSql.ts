/**
 * Lectura de un dump .sql de pg_dump SIN ejecutarlo: cuántas filas declara
 * por tabla. Es la vara contra la que el ensayo de restauración compara lo
 * que quedó en la base — si los números no coinciden, el backup NO sirve,
 * por más que psql haya terminado sin error.
 *
 * Puro a propósito (recibe el texto, devuelve el mapa): se testea sin base.
 */

/**
 * Cuenta las filas de cada bloque `COPY public.tabla (…) FROM stdin;` hasta
 * su terminador `\.`. Las tablas sin datos también aparecen (con 0): que una
 * tabla entera falte en el dump es exactamente lo que hay que detectar.
 */
export function filasPorTablaDelDump(sql: string): Map<string, number> {
  const filas = new Map<string, number>();
  const lineas = sql.split('\n');
  let tabla: string | null = null;

  for (const linea of lineas) {
    if (tabla !== null) {
      // Dentro del bloque COPY: cada línea es una fila, hasta el terminador.
      if (linea === '\\.') {
        tabla = null;
      } else {
        filas.set(tabla, (filas.get(tabla) ?? 0) + 1);
      }
      continue;
    }
    const m = /^COPY (?:"?[\w$]+"?\.)?"?([\w$]+)"? \(.*\) FROM stdin;$/.exec(linea);
    if (m) {
      tabla = m[1]!;
      if (!filas.has(tabla)) filas.set(tabla, 0);
    }
  }
  return filas;
}
