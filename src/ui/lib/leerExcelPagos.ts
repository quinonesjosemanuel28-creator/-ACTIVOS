/**
 * Lectura en el navegador de la hoja "PAGOS" de un .xlsx (SheetJS) →
 * filas crudas para construirImportacion. No escribe nada; solo extrae.
 */
import * as XLSX from 'xlsx';
import type { FilaPagoCruda } from '@domain/cierres/importacion';

/** Normaliza el nombre de columna: minúsculas, sin espacios → guion bajo. */
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');

const COLUMNAS = [
  'id_cierre', 'fecha_pago', 'cliente_nombre', 'cliente_mail', 'programa', 'closer', 'funnel',
  'monto_usd', 'monto_ars', 'cotizacion', 'tipo_pago', 'numero_cuota', 'medio_pago', 'revisar', 'comentarios',
  // Plan de cuotas (fila cabecera del cierre):
  'cantidad_cuotas', 'monto_cuota_usd', 'fecha_primera_cuota', 'ticket_total_usd',
] as const;

export async function leerExcelPagos(file: File): Promise<FilaPagoCruda[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const nombreHoja = wb.SheetNames.find((n) => norm(n) === 'pagos') ?? wb.SheetNames[0];
  if (!nombreHoja) return [];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nombreHoja]!, { defval: '' });
  return filas.map((raw) => {
    const porClave: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) porClave[norm(k)] = raw[k];
    const fila: Record<string, unknown> = {};
    for (const col of COLUMNAS) fila[col] = porClave[col];
    return fila as FilaPagoCruda;
  });
}
