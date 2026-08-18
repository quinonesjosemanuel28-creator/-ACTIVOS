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
import type { ReposAuth } from '../../application/auth/ports';
import type { ReposAlumnos } from '../../application/alumnos/ports';
import { armarRepositoriosDashboard } from '../adapters/dashboardRepos';
import { getDb } from '../sqlite/db';
import { crearRepositorios } from '../sqlite/repos';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearEgresosAdminRepo } from '../sqlite/egresosRepos';
import { crearLiquidacionRepo } from '../sqlite/comisionesRepos';
import { crearFunnelCanalRepo } from '../sqlite/funnelCanalRepos';
import { crearUsuariosRepo, crearSesionesRepo } from '../sqlite/authRepos';
import {
  crearAlumnosRepo,
  crearContactosRepo,
  crearMedicionesRepo,
  crearDiagnosticosRepo,
  crearDocumentosRepo,
  crearHistorialRepo,
  crearPlanesRepo,
  crearSeguimientoRepo,
  crearCheckinsRepo,
  crearTokensRepo,
} from '../sqlite/alumnosRepos';
import { getPoolPg } from '../postgres/db';
import { crearRepositoriosPg } from '../postgres/repos';
import { crearReposCierresPg } from '../postgres/cierresRepos';
import { crearEgresosAdminRepoPg } from '../postgres/egresosRepos';
import { crearLiquidacionRepoPg } from '../postgres/comisionesRepos';
import { crearFunnelCanalRepoPg } from '../postgres/funnelCanalRepos';
import { crearUsuariosRepoPg, crearSesionesRepoPg } from '../postgres/authRepos';
import {
  crearAlumnosRepoPg,
  crearContactosRepoPg,
  crearMedicionesRepoPg,
  crearDiagnosticosRepoPg,
  crearDocumentosRepoPg,
  crearHistorialRepoPg,
  crearPlanesRepoPg,
  crearSeguimientoRepoPg,
  crearCheckinsRepoPg,
  crearTokensRepoPg,
} from '../postgres/alumnosRepos';
import { hasherBcrypt } from '../auth/hasher';

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
  /** Repos de auth (usuarios + sesiones) + hasher bcrypt. */
  reposAuth: ReposAuth;
  /** Repos del módulo de alumnos: ficha, diagnósticos, tokens e historial. */
  reposAlumnos: ReposAlumnos;
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
      reposAuth: { usuarios: crearUsuariosRepoPg(pool), sesiones: crearSesionesRepoPg(pool), hasher: hasherBcrypt },
      reposAlumnos: {
        alumnos: crearAlumnosRepoPg(pool),
        diagnosticos: crearDiagnosticosRepoPg(pool),
        tokens: crearTokensRepoPg(pool),
        historial: crearHistorialRepoPg(pool),
        planes: crearPlanesRepoPg(pool),
        seguimiento: crearSeguimientoRepoPg(pool),
        checkins: crearCheckinsRepoPg(pool),
        documentos: crearDocumentosRepoPg(pool),
        contactos: crearContactosRepoPg(pool),
        mediciones: crearMedicionesRepoPg(pool),
      },
    };
  }
  return infraestructuraDesdeDb(getDb());
}

/**
 * Arma la infraestructura completa sobre una base SQLite dada. La usa el
 * arranque (archivo local) y los tests (getDbMemoria + hasher rápido).
 */
export function infraestructuraDesdeDb(
  db: Parameters<typeof crearRepositorios>[0],
  hasher: ReposAuth['hasher'] = hasherBcrypt,
): Infraestructura {
  const repos = crearRepositorios(db);
  const reposCierres = crearReposCierres(db);
  const reposFunnelCanal = crearFunnelCanalRepo(db);
  return {
    driver: 'sqlite',
    repos,
    reposDash: armarRepositoriosDashboard(repos, reposCierres, reposFunnelCanal),
    reposCierres,
    reposEgresos: crearEgresosAdminRepo(db),
    reposLiquidacion: crearLiquidacionRepo(db),
    reposFunnelCanal,
    reposAuth: { usuarios: crearUsuariosRepo(db), sesiones: crearSesionesRepo(db), hasher },
    reposAlumnos: {
      alumnos: crearAlumnosRepo(db),
      diagnosticos: crearDiagnosticosRepo(db),
      tokens: crearTokensRepo(db),
      historial: crearHistorialRepo(db),
      planes: crearPlanesRepo(db),
      seguimiento: crearSeguimientoRepo(db),
      checkins: crearCheckinsRepo(db),
      documentos: crearDocumentosRepo(db),
      contactos: crearContactosRepo(db),
      mediciones: crearMedicionesRepo(db),
    },
  };
}
