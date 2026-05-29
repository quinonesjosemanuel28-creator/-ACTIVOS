import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { crearRepositorios } from '../sqlite/repos';
import { sembrarBaseDemo } from '../seed/demo';
import { construirImportacion, type FilaPagoCruda } from '../../domain/cierres/importacion';
import * as ucc from '../../application/cierres/useCases';
import * as uc from '../../application/useCases';

/** Genera un .xlsx de PRUEBA (no datos reales) y lo vuelve a leer como rows. */
function filasDesdeXlsxDePrueba(): FilaPagoCruda[] {
  const datos = [
    { id_cierre: 'T0001', fecha_pago: '2026-03-05', cliente_nombre: 'Test Uno', cliente_mail: 't1@mail.com', programa: 'Empresario', closer: 'Ana', funnel: 'IG Ads', monto_usd: 1500, monto_ars: 1_770_000, cotizacion: '', tipo_pago: 'Reserva/Seña', numero_cuota: '', medio_pago: 'CRYPTO', revisar: '', comentarios: '' },
    { id_cierre: 'T0001', fecha_pago: '2026-04-10', cliente_nombre: 'Test Uno', cliente_mail: 't1@mail.com', programa: 'Empresario', closer: 'Ana', funnel: 'IG Ads', monto_usd: 1500, monto_ars: 1_860_000, cotizacion: '', tipo_pago: 'Cuota', numero_cuota: '2/2', medio_pago: 'Transferencia BBVA', revisar: '', comentarios: '' },
    { id_cierre: 'T0002', fecha_pago: '2026-03-09', cliente_nombre: 'Test Dos', cliente_mail: '', programa: 'Cero a Gestor', closer: 'Bruno', funnel: 'Webinar', monto_usd: 1200, monto_ars: 1_416_000, cotizacion: '', tipo_pago: 'Pago Completo', numero_cuota: '', medio_pago: 'Hotmart', revisar: 'falta mail', comentarios: '' },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), 'PAGOS');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: true });
  return XLSX.utils.sheet_to_json<FilaPagoCruda>(wb2.Sheets['PAGOS']!, { defval: '' });
}

function setup() {
  const db = getDbMemoria();
  sembrarBaseDemo(crearRepositorios(db)); // egresos/funnel/parámetros para el dashboard
  return { db, repos: crearReposCierres(db) };
}

describe('Importación end-to-end (xlsx de prueba)', () => {
  it('lee la hoja PAGOS, agrupa y persiste; el cierre con "revisar" queda marcado', () => {
    const { repos } = setup();
    const previa = construirImportacion(filasDesdeXlsxDePrueba());
    expect(previa.resumen).toEqual({ cierres: 2, pagos: 3, aRevisar: 1 });

    ucc.importarCierresPagos(repos, { cierres: previa.cierres, pagos: previa.pagos });
    const filas = ucc.listarCierresConPagos(repos);
    expect(filas).toHaveLength(2);
    const t1 = filas.find((f) => f.cierre.idCierre === 'T0001')!;
    expect(t1.cierre.ticketTotalUsd).toBe(3000);
    expect(t1.pagos).toHaveLength(2);
    expect(filas.find((f) => f.cierre.idCierre === 'T0002')!.cierre.revisar).toBe('falta mail');
  });

  it('es idempotente: reimportar el mismo archivo no duplica', () => {
    const { repos } = setup();
    const previa = construirImportacion(filasDesdeXlsxDePrueba());
    ucc.importarCierresPagos(repos, { cierres: previa.cierres, pagos: previa.pagos });
    ucc.importarCierresPagos(repos, { cierres: previa.cierres, pagos: previa.pagos });
    expect(ucc.listarCierresConPagos(repos)).toHaveLength(2);
    expect(repos.pagos.listarTodos()).toHaveLength(3);
  });

  it('impacta el dashboard (lee cierres vía adaptador)', () => {
    const { db, repos } = setup();
    const previa = construirImportacion(filasDesdeXlsxDePrueba());
    ucc.importarCierresPagos(repos, { cierres: previa.cierres, pagos: previa.pagos });
    const snap = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-03').snapshot;
    expect(snap.cierres.valor).toBe(2); // T0001 y T0002 cierran en marzo
    expect(snap.cashCollected.valor).toBe(1500 + 1200); // pagos de marzo
  });

  it('quitarRevisar limpia el flag', () => {
    const { repos } = setup();
    const previa = construirImportacion(filasDesdeXlsxDePrueba());
    ucc.importarCierresPagos(repos, { cierres: previa.cierres, pagos: previa.pagos });
    ucc.quitarRevisar(repos, 'T0002');
    expect(repos.cierres.obtener('T0002')!.revisar).toBeUndefined();
  });
});
