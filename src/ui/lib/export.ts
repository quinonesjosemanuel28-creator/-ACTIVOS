/** Exportación: PDF ejecutivo (print) y .xlsx del snapshot actual. */
import * as XLSX from 'xlsx';
import type { DashboardResult } from './api';
import { fmtMes } from './format';

export function exportarPdf() {
  window.print();
}

export function exportarXlsx(mes: string, data: DashboardResult) {
  const s = data.snapshot;
  const filas: [string, number | string | null][] = [
    ['Mes', fmtMes(mes)],
    ['Ventas Nuevas (USD)', s.ventasNuevas.valor],
    ['Cash Collected (USD)', s.cashCollected.valor],
    ['Cash Nuevo (USD)', s.cashNuevo],
    ['Cohortes (USD)', s.cohortes],
    ['Caja Final (USD)', s.cajaFinal.valor],
    ['Utilidad Operativa (USD)', s.utilidadOperativa.valor],
    ['Cierres', s.cierres.valor],
    ['AOV Real (USD)', s.aovReal.valor],
    ['Margen Operativo', s.margenOperativo],
    ['Margen Contribución', s.margenContribucion],
    ['CAC (USD)', s.cac],
    ['ROAS', s.roas],
    ['MER', s.mer],
    ['Runway (meses)', s.runway],
    ['Morosidad cohorte (USD)', s.morosidadCohorte],
  ];
  const ws = XLSX.utils.aoa_to_sheet([['Métrica', 'Valor'], ...filas]);
  const alertas = XLSX.utils.json_to_sheet(
    data.alertas.map((a) => ({ Alerta: a.titulo, Severidad: a.severidad, Detalle: a.detalle, Acción: a.accionSugerida })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
  XLSX.utils.book_append_sheet(wb, alertas, 'Alertas');
  XLSX.writeFile(wb, `Activos_${mes}.xlsx`);
}
