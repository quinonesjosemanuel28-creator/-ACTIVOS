import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositorios } from '../sqlite/repos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { sembrarBaseDemo } from '../seed/demo';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import * as ucf from '../../application/funnel/useCases';
import * as ucc from '../../application/cierres/useCases';
import * as uc from '../../application/useCases';

function setup() {
  const db = getDbMemoria();
  sembrarBaseDemo(crearRepositorios(db)); // funnel demo ahora en 0
  sembrarCierresDemo(crearReposCierres(db));
  return db;
}

describe('Funnel · cerrados = cierres nuevos reales', () => {
  it('cerrados del funnel = cierres nuevos del mes (sección Cierres)', () => {
    const db = setup();
    const repos = crearRepositorios(db);
    const reposCierres = crearReposCierres(db);
    const view = ucf.obtenerFunnel(reposCierres, repos.funnel, '2026-05');
    const porPrograma = ucc.resumenDelMes(reposCierres, '2026-05').cierresPorPrograma;
    expect(view.cerrados).toBe(porPrograma.empresario + porPrograma.ceroGestor);
    expect(view.cerrados).toBe(view.cierresPorPrograma.empresario + view.cierresPorPrograma.ceroGestor);
  });

  it('el dashboard usa el cerrados real (adapter), no el demo', () => {
    const db = setup();
    const reposCierres = crearReposCierres(db);
    const cerradosReales = ucf.cerradosReales(reposCierres, '2026-05');
    const funnelDash = crearRepositoriosDashboard(db).funnel.obtener('2026-05');
    expect(funnelDash.cerrados).toBe(cerradosReales);
  });

  it('seed deja agendas/shows en 0 (no inventa) → tasas null y aviso', () => {
    const db = setup();
    const view = ucf.obtenerFunnel(crearReposCierres(db), crearRepositorios(db).funnel, '2026-05');
    expect(view.agendas).toBe(0);
    expect(view.asistieron).toBe(0);
    expect(view.cargaManual).toBe(false);
    expect(view.tasaShow).toBeNull();
    expect(view.tasaCierre).toBeNull();
  });

  it('al cargar agendas/shows, calcula tasas y valor por agenda/show', () => {
    const db = setup();
    const repos = crearRepositorios(db);
    const reposCierres = crearReposCierres(db);
    ucf.guardarFunnelManual(repos.funnel, '2026-05', { agendas: 100, asistieron: 60 });
    const view = ucf.obtenerFunnel(reposCierres, repos.funnel, '2026-05');
    expect(view.agendas).toBe(100);
    expect(view.tasaShow).toBeCloseTo(0.6);
    expect(view.cargaManual).toBe(true);
    // valor por agenda = cash nuevo / agendas
    expect(view.valorPorAgendaUsd).toBeCloseTo(view.cashNuevoUsd / 100);
    expect(view.valorPorShowUsd).toBeCloseTo(view.cashNuevoUsd / 60);
  });

  it('clear:funnel (UPDATE) resetea agendas/shows sin tocar cierres', () => {
    const db = setup();
    const repos = crearRepositorios(db);
    const reposCierres = crearReposCierres(db);
    ucf.guardarFunnelManual(repos.funnel, '2026-05', { agendas: 100, asistieron: 60 });
    const cierresAntes = reposCierres.cierres.listar().length;
    db.prepare('UPDATE funnel SET agendas = 0, asistieron = 0, cerrados = 0').run(); // lo que hace el script
    const view = ucf.obtenerFunnel(reposCierres, repos.funnel, '2026-05');
    expect(view.agendas).toBe(0);
    expect(reposCierres.cierres.listar().length).toBe(cierresAntes); // cierres intactos
    expect(view.cerrados).toBeGreaterThan(0); // cerrados sigue derivándose de cierres
  });

  it('cash nuevo del funnel coincide con la Vista Ejecutiva', () => {
    const db = setup();
    const view = ucf.obtenerFunnel(crearReposCierres(db), crearRepositorios(db).funnel, '2026-05');
    const snap = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05').snapshot;
    expect(view.cashNuevoUsd).toBeCloseTo(snap.cashNuevo, 2);
  });
});
