/**
 * Migración única (NO automática): limpia los datos demo del funnel poniendo
 * agendas y shows en 0. NO toca cierres ni nada más. Después se cargan los
 * valores reales desde la sección Funnel.
 *
 * Uso: npm run clear:funnel
 */
import { getDb } from '../../src/infrastructure/sqlite/db';

const db = getDb();
const info = db.prepare('UPDATE funnel SET agendas = 0, asistieron = 0, cerrados = 0').run();
console.log(`[clear:funnel] ${info.changes} mes(es) de funnel reseteados a 0 (agendas/shows).`);
console.log('[clear:funnel] Los cierres NO se tocaron. "Cerrados" se deriva de los cierres reales.');
