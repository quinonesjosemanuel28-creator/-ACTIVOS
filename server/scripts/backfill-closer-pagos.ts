/**
 * Migración única (NO corre en el arranque): backfill del closer de cada pago.
 * Cada pago sin closer propio toma el closer de su cierre → todo queda como
 * hoy. Después se corrigen a mano los pocos casos mixtos (un cierre cuyos
 * pagos los cobraron distintos closers, ej. seña Julian + cuota Ayrton).
 *
 * Uso: npm run backfill:closer
 * Idempotente: solo toca filas con closer NULL.
 */
import { getDb } from '../../src/infrastructure/sqlite/db';

const db = getDb();
const info = db
  .prepare(
    `UPDATE pagos
       SET closer = (SELECT c.closer FROM cierres c WHERE c.id_cierre = pagos.id_cierre)
     WHERE closer IS NULL
       AND (SELECT c.closer FROM cierres c WHERE c.id_cierre = pagos.id_cierre) IS NOT NULL`,
  )
  .run();

console.log(`[backfill] ${info.changes} pago(s) heredaron el closer de su cierre.`);
console.log('[backfill] Listo. Corregí a mano los casos mixtos desde "Pagos del cierre".');
