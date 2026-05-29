/**
 * Script de siembra: carga datos demo realistas en la base local.
 * Uso: `npm run seed`
 *
 * Con el adaptador (Approach A), cierres/pagos son la fuente canónica del
 * dashboard. Por eso se siembra la BASE (egresos/funnel/parámetros) + el
 * dataset rico de cierres/pagos; no se siembran ventas/cobros legacy.
 */
import { getDb } from '../../src/infrastructure/sqlite/db';
import { crearRepositorios } from '../../src/infrastructure/sqlite/repos';
import { crearReposCierres } from '../../src/infrastructure/sqlite/cierresRepos';
import { sembrarBaseDemo } from '../../src/infrastructure/seed/demo';
import { sembrarCierresDemo } from '../../src/infrastructure/seed/cierresDemo';

const db = getDb();
const base = sembrarBaseDemo(crearRepositorios(db));
console.log(`[seed] Base demo → ${base.egresos} egresos + funnel + parámetros.`);

const c = sembrarCierresDemo(crearReposCierres(db));
console.log(`[seed] Cierres y Clientes → ${c.cierres} cierres, ${c.pagos} pagos (con ARS, prefijo DEMO-).`);
console.log('[seed] El dashboard lee cierres/pagos vía adaptador.');
