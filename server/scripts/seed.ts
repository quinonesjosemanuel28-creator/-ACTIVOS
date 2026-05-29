/**
 * Script de siembra: carga datos demo realistas en la base local.
 * Uso: `npm run seed`
 */
import { getDb } from '../../src/infrastructure/sqlite/db';
import { crearRepositorios } from '../../src/infrastructure/sqlite/repos';
import { sembrarDemo } from '../../src/infrastructure/seed/demo';

const repos = crearRepositorios(getDb());
const r = sembrarDemo(repos);
console.log(`[seed] Datos demo cargados → ${r.ventas} ventas, ${r.cobros} cobros, ${r.egresos} egresos.`);
