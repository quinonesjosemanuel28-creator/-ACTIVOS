/**
 * CAPA 4 — INFRAESTRUCTURA · Selección de driver de base de datos.
 *
 * El driver se elige por la variable de entorno DB_DRIVER:
 *   - "sqlite" (default): better-sqlite3, archivo local data/activos.db.
 *   - "postgres": PostgreSQL vía DATABASE_URL (local o Railway).
 *
 * Los tests fuerzan SQLite en memoria y no pasan por esta variable.
 * Cambiar de motor es reversible: solo se edita el .env.
 */
export type DriverDb = 'sqlite' | 'postgres';

export function driverConfigurado(env: NodeJS.ProcessEnv = process.env): DriverDb {
  const crudo = (env.DB_DRIVER ?? 'sqlite').trim().toLowerCase();
  if (crudo === '' || crudo === 'sqlite') return 'sqlite';
  if (crudo === 'postgres' || crudo === 'postgresql' || crudo === 'pg') return 'postgres';
  throw new Error(`DB_DRIVER inválido: "${env.DB_DRIVER}". Valores aceptados: "sqlite" o "postgres".`);
}

/** URL de conexión a Postgres (requerida solo cuando DB_DRIVER=postgres). */
export function urlPostgres(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DB_DRIVER=postgres pero falta DATABASE_URL en el .env. ' +
        'Ejemplo: DATABASE_URL=postgresql://usuario:clave@localhost:5432/activos',
    );
  }
  return url;
}

/**
 * ¿La conexión a Postgres debe usar TLS? Lo decide:
 *   - PGSSL explícito ('true'/'1' → sí; 'false'/'0' → no) tiene prioridad.
 *   - sslmode=require/verify-* en la propia DATABASE_URL → sí.
 *   - Si no, NO (Postgres local y la red interna de Railway no lo necesitan).
 *
 * En Railway la base pública (proxy) pide TLS: se activa con PGSSL=true. El
 * certificado es de la plataforma, así que no verificamos la cadena
 * (rejectUnauthorized:false) — el cifrado en tránsito igual aplica.
 */
export function sslPostgres(env: NodeJS.ProcessEnv = process.env): false | { rejectUnauthorized: boolean } {
  const flag = env.PGSSL?.trim().toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'require') return { rejectUnauthorized: false };
  if (flag === 'false' || flag === '0') return false;
  const url = env.DATABASE_URL ?? '';
  if (/sslmode=(require|verify-ca|verify-full)/i.test(url)) return { rejectUnauthorized: false };
  return false;
}
