/**
 * Listas de tablas para los scripts de datos (db:migrar).
 *
 * TODA tabla del esquema tiene que estar en UNA de las dos listas — un test
 * estructural (tablasMigracion.test.ts) lo verifica contra el SCHEMA_SQL_PG,
 * así la lista no vuelve a quedar desactualizada cuando se agregue un módulo.
 */

/**
 * Tablas que db:migrar COPIA de SQLite local → Postgres, en orden de FK
 * (cobros→ventas, pagos→cierres). Son las del módulo contable, cuya fuente
 * de verdad histórica fue la base local.
 */
export const TABLAS = [
  'ventas',
  'cobros',
  'egresos',
  'funnel',
  'parametros',
  'cierre_mes',
  'cierres',
  'pagos',
  'funnel_canal',
  'comisiones_liquidacion',
] as const;

/**
 * Tablas que db:migrar NO copia, a propósito. db:migrar VACÍA cada tabla
 * destino antes de copiar: incluir una de estas pisaría datos vivos de
 * producción con una base local vacía o desactualizada.
 *
 * - usuarios/sesiones: el auth vive por entorno (el ADMIN se crea por
 *   variables de entorno; las sesiones son efímeras). Copiarlas dejaría a
 *   todo el equipo afuera.
 * - Módulo de alumnos: nace y vive en producción (los consultores cargan en
 *   la nube). Nunca existe una "fuente local" que copiar; su resguardo es
 *   db:backup (pg_dump), que abarca todas las tablas.
 */
export const TABLAS_NO_COPIADAS = [
  'usuarios',
  'sesiones',
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
