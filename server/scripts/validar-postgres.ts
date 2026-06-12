/**
 * Validación SQLite vs PostgreSQL: corre LOS MISMOS casos de uso sobre los
 * dos motores y compara campo por campo que den números idénticos.
 *
 * Uso: npm run db:validar   (después de npm run db:migrar)
 *  - Solo lectura en ambas bases.
 *  - Compara, por cada mes con datos: snapshot del dashboard, resumen de
 *    cierres, comisiones, resumen de egresos y funnel; además el histórico
 *    completo y la vista de cobranza (a una fecha fija para ambos).
 *  - Sale con código 1 y lista las diferencias si hay UNA sola distinta.
 */
import 'dotenv/config';
import { getDb } from '../../src/infrastructure/sqlite/db';
import { crearRepositorios } from '../../src/infrastructure/sqlite/repos';
import { crearReposCierres } from '../../src/infrastructure/sqlite/cierresRepos';
import { crearEgresosAdminRepo } from '../../src/infrastructure/sqlite/egresosRepos';
import { crearFunnelCanalRepo } from '../../src/infrastructure/sqlite/funnelCanalRepos';
import { getPoolPg, cerrarPoolPg } from '../../src/infrastructure/postgres/db';
import { crearRepositoriosPg } from '../../src/infrastructure/postgres/repos';
import { crearReposCierresPg } from '../../src/infrastructure/postgres/cierresRepos';
import { crearEgresosAdminRepoPg } from '../../src/infrastructure/postgres/egresosRepos';
import { crearFunnelCanalRepoPg } from '../../src/infrastructure/postgres/funnelCanalRepos';
import { armarRepositoriosDashboard } from '../../src/infrastructure/adapters/dashboardRepos';
import type { Repositorios } from '../../src/application/ports';
import type { ReposCierres } from '../../src/application/cierres/ports';
import type { EgresosAdminRepo } from '../../src/application/egresos/ports';
import type { FunnelCanalRepo } from '../../src/application/funnel/ports';
import * as uc from '../../src/application/useCases';
import * as ucc from '../../src/application/cierres/useCases';
import * as ucom from '../../src/application/comisiones/useCases';
import * as uce from '../../src/application/egresos/useCases';
import * as ucf from '../../src/application/funnel/useCases';
import * as ucob from '../../src/application/cobranza/useCases';

interface Lado {
  nombre: string;
  repos: Repositorios;
  reposDash: Repositorios;
  reposCierres: ReposCierres;
  reposEgresos: EgresosAdminRepo;
  reposFunnelCanal: FunnelCanalRepo;
}

const HOY = new Date().toISOString().slice(0, 10); // misma fecha para ambos

/** Ordena arrays por una clave para que la comparación no dependa del motor. */
const porClave = <T>(xs: T[], clave: (x: T) => string): T[] => [...xs].sort((a, b) => clave(a).localeCompare(clave(b)));

async function fotografiar(lado: Lado): Promise<unknown> {
  const { meses } = await uc.obtenerMeses(lado.reposDash);
  const porMes: Record<string, unknown> = {};
  for (const mes of meses) {
    const { snapshot } = await uc.obtenerDashboardDelMes(lado.reposDash, mes);
    const comisiones = await ucom.obtenerComisiones(lado.reposCierres, mes);
    // El orden de las líneas con la MISMA fecha_pago no está definido por el
    // ORDER BY y cada motor desempata distinto: se ordena por id para comparar.
    const porPersona = porClave(comisiones.porPersona, (p) => p.persona).map((p) => ({
      ...p,
      lineas: porClave(p.lineas, (l) => l.idPago),
    }));
    porMes[mes] = {
      dashboard: snapshot,
      resumenCierres: await ucc.resumenDelMes(lado.reposCierres, mes),
      comisiones: { ...comisiones, porPersona },
      egresos: await uce.resumenEgresos(lado.reposEgresos, mes),
      funnel: await ucf.obtenerFunnel(lado.reposCierres, lado.reposFunnelCanal, lado.repos.funnel, mes),
    };
  }
  const cobranza = await ucob.obtenerCobranza(lado.reposCierres, HOY);
  return {
    meses,
    porMes,
    historico: await uc.obtenerHistorico(lado.reposDash),
    cobranza: {
      resumen: cobranza.resumen,
      proyeccion: cobranza.proyeccion,
      cierres: porClave(cobranza.cierres, (c) => c.idCierre),
      listaNegra: porClave(cobranza.listaNegra, (c) => c.idCierre),
      inactivos: porClave(cobranza.inactivos, (c) => c.idCierre),
    },
  };
}

/** Diff recursivo: devuelve las rutas con valores distintos. */
function diferencias(a: unknown, b: unknown, ruta = '', acc: string[] = []): string[] {
  if (Object.is(a, b)) return acc;
  if (typeof a === 'number' && typeof b === 'number') {
    acc.push(`${ruta}: sqlite=${a} ≠ postgres=${b}`);
    return acc;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) acc.push(`${ruta}.length: sqlite=${a.length} ≠ postgres=${b.length}`);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) diferencias(a[i], b[i], `${ruta}[${i}]`, acc);
    return acc;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of claves) {
      diferencias((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], ruta ? `${ruta}.${k}` : k, acc);
    }
    return acc;
  }
  acc.push(`${ruta}: sqlite=${JSON.stringify(a)} ≠ postgres=${JSON.stringify(b)}`);
  return acc;
}

const db = getDb();
const reposLite = crearRepositorios(db);
const cierresLite = crearReposCierres(db);
const canalLite = crearFunnelCanalRepo(db);
const sqlite: Lado = {
  nombre: 'sqlite',
  repos: reposLite,
  reposDash: armarRepositoriosDashboard(reposLite, cierresLite, canalLite),
  reposCierres: cierresLite,
  reposEgresos: crearEgresosAdminRepo(db),
  reposFunnelCanal: canalLite,
};

const pool = await getPoolPg();
const reposPg = crearRepositoriosPg(pool);
const cierresPg = crearReposCierresPg(pool);
const canalPg = crearFunnelCanalRepoPg(pool);
const postgres: Lado = {
  nombre: 'postgres',
  repos: reposPg,
  reposDash: armarRepositoriosDashboard(reposPg, cierresPg, canalPg),
  reposCierres: cierresPg,
  reposEgresos: crearEgresosAdminRepoPg(pool),
  reposFunnelCanal: canalPg,
};

const fotoLite = await fotografiar(sqlite);
const fotoPg = await fotografiar(postgres);
await cerrarPoolPg();

const difs = diferencias(fotoLite, fotoPg);
if (difs.length === 0) {
  const meses = (fotoLite as { meses: string[] }).meses;
  console.log(`[db:validar] ✔ IDÉNTICOS. ${meses.length} mes(es) comparados (${meses.join(', ') || 'sin datos'}).`);
  console.log('[db:validar] Dashboard, cierres, comisiones, egresos, funnel, histórico y cobranza dan los mismos números en SQLite y PostgreSQL.');
} else {
  console.error(`[db:validar] ✘ ${difs.length} diferencia(s) encontradas:`);
  for (const d of difs.slice(0, 50)) console.error('  -', d);
  if (difs.length > 50) console.error(`  … y ${difs.length - 50} más.`);
  process.exit(1);
}
