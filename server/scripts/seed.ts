/**
 * Script de siembra: carga datos demo realistas en la base local.
 * Uso: `npm run seed`
 */
import { getDb } from '../../src/infrastructure/sqlite/db';
import { crearRepositorios } from '../../src/infrastructure/sqlite/repos';
import { crearReposCierres } from '../../src/infrastructure/sqlite/cierresRepos';
import { sembrarDemo } from '../../src/infrastructure/seed/demo';
import { sembrarCierresDemo } from '../../src/infrastructure/seed/cierresDemo';

const db = getDb();
const repos = crearRepositorios(db);
const r = sembrarDemo(repos);
console.log(`[seed] Datos demo cargados → ${r.ventas} ventas, ${r.cobros} cobros, ${r.egresos} egresos.`);

const c = sembrarCierresDemo(crearReposCierres(db));
console.log(`[seed] Módulo Cierres → ${c.cierres} cierres, ${c.pagos} pagos (prefijo DEMO-).`);
