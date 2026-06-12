import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositorios } from '../sqlite/repos';
import { crearFunnelCanalRepo } from '../sqlite/funnelCanalRepos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { sembrarBaseDemo } from '../seed/demo';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import * as ucf from '../../application/funnel/useCases';
import * as ucc from '../../application/cierres/useCases';
import * as uc from '../../application/useCases';

async function setup() {
  const db = getDbMemoria();
  await sembrarBaseDemo(crearRepositorios(db));
  await sembrarCierresDemo(crearReposCierres(db));
  return db;
}
const view = (db: ReturnType<typeof getDbMemoria>, mes: string) =>
  ucf.obtenerFunnel(crearReposCierres(db), crearFunnelCanalRepo(db), crearRepositorios(db).funnel, mes);

describe('Funnel por canal', () => {
  it('cerrados = cierres nuevos del mes (sección Cierres)', async () => {
    const db = await setup();
    const v = await view(db, '2026-05');
    const prog = (await ucc.resumenDelMes(crearReposCierres(db), '2026-05')).cierresPorPrograma;
    expect(v.cerrados).toBe(prog.empresario + prog.ceroGestor);
  });

  it('seed: sin carga por canal → agendas/shows 0, tasas null, aviso', async () => {
    const v = await view(await setup(), '2026-05');
    expect(v.agendas).toBe(0);
    expect(v.cargaManual).toBe(false);
    expect(v.tasaShow).toBeNull();
    expect(v.porCanal.map((c) => c.canal)).toEqual(['Webinar', 'TikTok', 'Instagram orgánico']);
  });

  it('total agendas/shows = suma de canales; tasa de show por canal', async () => {
    const db = await setup();
    const canal = crearFunnelCanalRepo(db);
    await ucf.guardarFunnelCanales(canal, '2026-05', {
      canales: [
        { canal: 'Webinar', agendas: 40, asistieron: 30 },
        { canal: 'TikTok', agendas: 20, asistieron: 8 },
        { canal: 'Instagram orgánico', agendas: 10, asistieron: 6 },
      ],
    });
    const v = await view(db, '2026-05');
    expect(v.agendas).toBe(70); // 40+20+10
    expect(v.asistieron).toBe(44); // 30+8+6
    expect(v.porCanal.find((c) => c.canal === 'Webinar')!.tasaShow).toBeCloseTo(30 / 40);
    expect(v.porCanal.find((c) => c.canal === 'TikTok')!.tasaShow).toBeCloseTo(8 / 20);
    expect(v.tasaShow).toBeCloseTo(44 / 70); // embudo general = suma
  });

  it('canal sin carga → tasa de show null (no inventa)', async () => {
    const db = await setup();
    await ucf.guardarFunnelCanales(crearFunnelCanalRepo(db), '2026-05', {
      canales: [{ canal: 'Webinar', agendas: 0, asistieron: 0 }],
    });
    expect((await view(db, '2026-05')).porCanal.find((c) => c.canal === 'Webinar')!.tasaShow).toBeNull();
  });

  it('cerrados NO se desglosa por canal: la suma de canales no lo afecta', async () => {
    const db = await setup();
    const antes = (await view(db, '2026-05')).cerrados;
    await ucf.guardarFunnelCanales(crearFunnelCanalRepo(db), '2026-05', {
      canales: [{ canal: 'TikTok', agendas: 100, asistieron: 50 }],
    });
    expect((await view(db, '2026-05')).cerrados).toBe(antes); // cerrados intacto (viene de cierres)
  });

  it('el dashboard usa el total por canal + cerrados real', async () => {
    const db = await setup();
    await ucf.guardarFunnelCanales(crearFunnelCanalRepo(db), '2026-05', {
      canales: [{ canal: 'Webinar', agendas: 50, asistieron: 30 }],
    });
    const fDash = await crearRepositoriosDashboard(db).funnel.obtener('2026-05');
    expect(fDash.agendas).toBe(50);
    expect(fDash.cerrados).toBe(await ucf.cerradosReales(crearReposCierres(db), '2026-05'));
  });

  it('clear (DELETE funnel_canal) no toca cierres', async () => {
    const db = await setup();
    await ucf.guardarFunnelCanales(crearFunnelCanalRepo(db), '2026-05', { canales: [{ canal: 'Webinar', agendas: 50, asistieron: 30 }] });
    const cierresAntes = (await crearReposCierres(db).cierres.listar()).length;
    db.prepare('DELETE FROM funnel_canal').run();
    const v = await view(db, '2026-05');
    expect(v.agendas).toBe(0);
    expect((await crearReposCierres(db).cierres.listar()).length).toBe(cierresAntes);
    expect(v.cerrados).toBeGreaterThan(0);
  });

  it('rechaza canal fuera de la lista fija', async () => {
    const db = await setup();
    await expect(ucf.guardarFunnelCanales(crearFunnelCanalRepo(db), '2026-05', { canales: [{ canal: 'Facebook', agendas: 1, asistieron: 1 }] })).rejects.toThrow();
  });

  it('cash nuevo del funnel coincide con la Vista Ejecutiva', async () => {
    const db = await setup();
    const v = await view(db, '2026-05');
    const snap = (await uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05')).snapshot;
    expect(v.cashNuevoUsd).toBeCloseTo(snap.cashNuevo, 2);
  });
});
