/**
 * CAPA 4 — INFRAESTRUCTURA · Parser del tablero .xlsx (SheetJS).
 *
 * Migra el Excel actual a SQLite. Lee las hojas VENTAS / COBROS / EGRESOS /
 * PARAMETROS por nombre (tolerante a mayúsculas/espacios) y normaliza a
 * entidades de dominio. La importación es idempotente: usa los IDs del
 * Excel como PK, así reimportar no duplica (INSERT OR REPLACE en el repo).
 */
import * as XLSX from 'xlsx';
import type { Cobro, Egreso, Mes, Programa, TipoEgreso, UnidadNegocio, Venta } from '../../domain/types';

export interface ParseResult {
  ventas: Venta[];
  cobros: Cobro[];
  egresos: Egreso[];
  parametros: Record<string, number>;
  advertencias: string[];
}

type Row = Record<string, unknown>;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');

/** Busca el valor de una fila por varios alias de columna. */
function pick(row: Row, alias: string[]): unknown {
  const claves = Object.keys(row).reduce<Record<string, unknown>>((acc, k) => {
    acc[norm(k)] = row[k];
    return acc;
  }, {});
  for (const a of alias) {
    const v = claves[norm(a)];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const toStr = (v: unknown): string | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  return String(v).trim();
};

/** Normaliza una fecha de Excel (serial o texto) a YYYY-MM-DD. */
function toFecha(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v ?? '');
  return s.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

const toMes = (fecha: string): Mes => fecha.slice(0, 7);
const asPrograma = (v: unknown): Programa => (toStr(v) === 'Gestor' ? 'Gestor' : 'Empresario');
const asUnidad = (v: unknown): UnidadNegocio => {
  const s = (toStr(v) ?? 'ACADEMY').toUpperCase();
  return s === 'LEGAL' || s === 'TECNOLOGIA' ? (s as UnidadNegocio) : 'ACADEMY';
};
const asTipo = (v: unknown): TipoEgreso => {
  const s = toStr(v);
  return s === 'Directo' || s === 'Extraordinario' ? s : 'Operativo';
};

function sheetRows(wb: XLSX.WorkBook, nombres: string[]): Row[] {
  const hoja = wb.SheetNames.find((n) => nombres.some((x) => norm(n) === norm(x)));
  if (!hoja) return [];
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[hoja]!, { defval: '' });
}

export function parsearTablero(buffer: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const advertencias: string[] = [];

  const ventas: Venta[] = sheetRows(wb, ['VENTAS', 'Ventas']).map((r, i) => {
    const fecha = toFecha(pick(r, ['fecha_venta', 'fecha']));
    return {
      idVenta: toStr(pick(r, ['id_venta', 'id'])) ?? `XLS-V-${i}`,
      fechaVenta: fecha,
      mesVenta: toStr(pick(r, ['mes_venta', 'mes'])) ?? toMes(fecha),
      cliente: toStr(pick(r, ['cliente'])),
      programa: asPrograma(pick(r, ['programa'])),
      closer: toStr(pick(r, ['closer'])),
      setter: toStr(pick(r, ['setter'])),
      funnel: toStr(pick(r, ['funnel'])),
      ticketTotalUsd: toNum(pick(r, ['ticket_total_usd', 'ticket', 'monto'])),
      unidadNegocio: asUnidad(pick(r, ['unidad_negocio', 'unidad'])),
      estado: toStr(pick(r, ['estado'])) ?? 'Activo',
    };
  });

  const cobros: Cobro[] = sheetRows(wb, ['COBROS', 'Cobros']).map((r, i) => {
    const fecha = toFecha(pick(r, ['fecha_cobro', 'fecha']));
    const mesCobro = toStr(pick(r, ['mes_cobro'])) ?? toMes(fecha);
    return {
      idCobro: toStr(pick(r, ['id_cobro', 'id'])) ?? `XLS-C-${i}`,
      idVentaOrigen: toStr(pick(r, ['id_venta_origen', 'id_venta'])),
      fechaCobro: fecha,
      mesCobro,
      mesOriginalVenta: toStr(pick(r, ['mes_original_venta', 'mes_venta'])) ?? mesCobro,
      montoUsd: toNum(pick(r, ['monto_usd', 'monto'])),
      programa: asPrograma(pick(r, ['programa'])),
      unidadNegocio: asUnidad(pick(r, ['unidad_negocio', 'unidad'])),
    };
  });

  const egresos: Egreso[] = sheetRows(wb, ['EGRESOS', 'Egresos', 'Gastos']).map((r, i) => {
    const fecha = toFecha(pick(r, ['fecha']));
    return {
      idEgreso: toStr(pick(r, ['id_egreso', 'id'])) ?? `XLS-E-${i}`,
      fecha,
      mes: toStr(pick(r, ['mes'])) ?? toMes(fecha),
      tipo: asTipo(pick(r, ['tipo'])),
      categoria: toStr(pick(r, ['categoria'])) ?? 'Otros',
      concepto: toStr(pick(r, ['concepto'])),
      montoUsd: toNum(pick(r, ['monto_usd', 'monto'])),
      programa: toStr(pick(r, ['programa'])) === 'Gestor' ? 'Gestor' : toStr(pick(r, ['programa'])) === 'Empresario' ? 'Empresario' : undefined,
      unidadNegocio: asUnidad(pick(r, ['unidad_negocio', 'unidad'])),
    };
  });

  const parametros: Record<string, number> = {};
  for (const r of sheetRows(wb, ['PARAMETROS', 'Parametros', 'Parámetros'])) {
    const clave = toStr(pick(r, ['clave', 'parametro', 'nombre']));
    const valor = pick(r, ['valor', 'value']);
    if (clave) parametros[norm(clave)] = toNum(valor);
  }

  if (!ventas.length) advertencias.push('No se encontraron filas en la hoja VENTAS.');
  if (!cobros.length) advertencias.push('No se encontraron filas en la hoja COBROS.');

  return { ventas, cobros, egresos, parametros, advertencias };
}
