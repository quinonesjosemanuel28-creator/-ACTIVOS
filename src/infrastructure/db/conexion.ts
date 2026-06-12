/**
 * CAPA 4 — INFRAESTRUCTURA · Punto único de armado de repositorios.
 *
 * El server llama crearInfraestructura() y recibe TODOS los repos ya armados
 * según DB_DRIVER (sqlite default | postgres). La capa de aplicación solo ve
 * los puertos: cambiar de motor no toca ni dominio ni casos de uso.
 */
import { driverConfigurado, type DriverDb } from './factory';
import type { Repositorios } from '../../application/ports';
import type { ReposCierres } from '../../application/cierres/ports';
import type { EgresosAdminRepo } from '../../application/egresos/ports';
import type { LiquidacionRepo } from '../../application/comisiones/ports';
import type { FunnelCanalRepo } from '../../application/funnel/ports';
import { armarRepositoriosDashboard } from '../adapters/dashboardRepos';
import { getDb } from '../sqlite/db';
import { crearRepositorios } from '../sqlite/repos';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearEgresosAdminRepo } from '../sqlite/egresosRepos';
import { crearLiquidacionRepo } from '../sqlite/comisionesRepos';
import { crearFunnelCanalRepo } from '../sqlite/funnelCanalRepos';
import { getPoolPg } from '../postgres/db';
import { crearRepositoriosPg } from '../postgres/repos';
import { crearReposCierresPg } from '../postgres/cierresRepos';
import { crearEgresosAdminRepoPg } from '../postgres/egresosRepos';
import { crearLiquidacionRepoPg } from '../postgres/comisionesRepos';
import { crearFunnelCanalRepoPg } from '../postgres/funnelCanalRepos';

export interface Infraestructura {
  driver: DriverDb;
  /** Repos legacy: egresos, funnel, parámetros, cierre_mes e importación. */
  repos: Repositorios;
  /** Repos del dashboard: ventas/cobros desde cierres/pagos (adaptador). */
  reposDash: Repositorios;
  reposCierres: ReposCierres;
  reposEgresos: EgresosAdminRepo;
  reposLiquidacion: LiquidacionRepo;
  reposFunnelCanal: FunnelCanalRepo;
}

export async function crearInfraestructura(): Promise<Infraestructura> {
  const driver = driverConfigurado();
  if (driver === 'postgres') {
    const pool = await getPoolPg();
    const repos = crearRepositoriosPg(pool);
    const reposCierres = crearReposCierresPg(pool);
    const reposFunnelCanal = crearFunnelCanalRepoPg(pool);
    return {
      driver,
      repos,
      reposDash: armarRepositoriosDashboard(repos, reposCierres, reposFunnelCanal),
      reposCierres,
      reposEgresos: crearEgresosAdminRepoPg(pool),
      reposLiquidacion: crearLiquidacionRepoPg(pool),
      reposFunnelCanal,
    };
  }
  const db = getDb();
  const repos = crearRepositorios(db);
  const reposCierres = crearReposCierres(db);
  const reposFunnelCanal = crearFunnelCanalRepo(db);
  return {
    driver,
    repos,
    reposDash: armarRepositoriosDashboard(repos, reposCierres, reposFunnelCanal),
    reposCierres,
    reposEgresos: crearEgresosAdminRepo(db),
    reposLiquidacion: crearLiquidacionRepo(db),
    reposFunnelCanal,
  };
}
