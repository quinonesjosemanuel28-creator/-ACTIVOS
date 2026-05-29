/**
 * CAPA 3 — DOMINIO · Importación de cierres/pagos desde una planilla.
 *
 * Lógica PURA (sin SheetJS ni IO): toma filas crudas de la hoja "PAGOS"
 * (una fila = un pago, pre-agrupadas por id_cierre) y construye los cierres
 * y pagos a persistir, reportando las filas inválidas.
 *
 * Reglas:
 *  - Agrupa por id_cierre. Datos del cierre = primera fila del grupo.
 *  - ticket_total_usd = Σ monto_usd de los pagos VÁLIDOS del cierre.
 *  - Cotización vacía → se deriva monto_ars / monto_usd (ARS+USD mandan).
 *  - Si alguna fila trae "revisar" con texto → el cierre queda marcado.
 *  - IDs deterministas (idPago = `${idCierre}-P{n}`) → re-importar el mismo
 *    archivo NO duplica (el repо hace upsert).
 *  - Filas con fecha/monto/programa ilegibles → van a `errores`, no se cargan.
 */
import type { Cierre, MedioPago, Pago, ProgramaCierre, TipoPago } from './types';

/** Fila cruda extraída de la hoja (valores tal cual, sin normalizar). */
export interface FilaPagoCruda {
  id_cierre?: unknown;
  fecha_pago?: unknown;
  cliente_nombre?: unknown;
  cliente_mail?: unknown;
  programa?: unknown;
  closer?: unknown;
  funnel?: unknown;
  monto_usd?: unknown;
  monto_ars?: unknown;
  cotizacion?: unknown;
  tipo_pago?: unknown;
  numero_cuota?: unknown;
  medio_pago?: unknown;
  revisar?: unknown;
  comentarios?: unknown;
}

export interface ErrorFila {
  fila: number; // número de fila en la planilla (1-based, sin contar encabezado)
  idCierre: string;
  motivo: string;
}

export interface ResultadoImportacion {
  cierres: Cierre[];
  pagos: Pago[];
  resumen: { cierres: number; pagos: number; aRevisar: number };
  errores: ErrorFila[];
}

const MEDIOS: MedioPago[] = [
  'Transferencia Lemon', 'Transferencia BBVA', 'Transferencia MP', 'CRYPTO', 'Hotmart', 'Dólares', 'Otro',
];
const TIPOS: TipoPago[] = ['Reserva/Seña', 'Cuota', 'Pago Completo'];

const txt = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
};

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replace(/[^0-9.,-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Normaliza una fecha a YYYY-MM-DD; null si no es interpretable. */
const fecha = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = txt(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy
  const d = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (d) return `${d[3]}-${d[2]!.padStart(2, '0')}-${d[1]!.padStart(2, '0')}`;
  return null;
};

const programa = (v: unknown): ProgramaCierre | null => {
  const s = txt(v);
  if (s === 'Empresario') return 'Empresario';
  if (s === 'Cero a Gestor') return 'Cero a Gestor';
  return null;
};

const medio = (v: unknown): MedioPago => {
  const s = txt(v);
  return (MEDIOS.find((m) => m === s) ?? 'Otro');
};

const tipo = (v: unknown): TipoPago => {
  const s = txt(v);
  return (TIPOS.find((t) => t === s) ?? 'Cuota');
};

/** Resuelve la triada doble moneda (ARS+USD mandan; deriva el faltante). */
function resolverMonedas(usd?: number, ars?: number, cotiz?: number): { usd?: number; ars?: number; cotiz?: number } {
  const ok = (n?: number) => n !== undefined && n > 0;
  if (ok(usd) && ok(ars)) return { usd, ars, cotiz: ars! / usd! };
  if (ok(usd) && ok(cotiz)) return { usd, ars: usd! * cotiz!, cotiz };
  if (ok(ars) && ok(cotiz)) return { usd: ars! / cotiz!, ars, cotiz };
  return { usd, ars, cotiz: undefined };
}

export function construirImportacion(filas: readonly FilaPagoCruda[]): ResultadoImportacion {
  const errores: ErrorFila[] = [];
  // Agrupa preservando el orden de aparición.
  const grupos = new Map<string, { fila: FilaPagoCruda; nFila: number }[]>();
  filas.forEach((f, i) => {
    const id = txt(f.id_cierre);
    const nFila = i + 1;
    if (!id) {
      errores.push({ fila: nFila, idCierre: '—', motivo: 'Falta id_cierre.' });
      return;
    }
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id)!.push({ fila: f, nFila });
  });

  const cierres: Cierre[] = [];
  const pagos: Pago[] = [];
  let aRevisar = 0;

  for (const [idCierre, filasGrupo] of grupos) {
    const cabecera = filasGrupo[0]!.fila;
    const prog = programa(cabecera.programa);
    if (!prog) {
      filasGrupo.forEach(({ nFila }) =>
        errores.push({ fila: nFila, idCierre, motivo: `Programa inválido ("${txt(cabecera.programa) ?? ''}").` }),
      );
      continue;
    }

    const pagosCierre: Pago[] = [];
    let n = 0;
    for (const { fila, nFila } of filasGrupo) {
      const f = fecha(fila.fecha_pago);
      if (!f) {
        errores.push({ fila: nFila, idCierre, motivo: `Fecha de pago ilegible ("${txt(fila.fecha_pago) ?? ''}").` });
        continue;
      }
      const { usd, ars, cotiz } = resolverMonedas(num(fila.monto_usd), num(fila.monto_ars), num(fila.cotizacion));
      if (usd === undefined || usd <= 0) {
        errores.push({ fila: nFila, idCierre, motivo: 'Monto USD ausente o no derivable.' });
        continue;
      }
      n += 1;
      pagosCierre.push({
        idPago: `${idCierre}-P${n}`,
        idCierre,
        fechaPago: f,
        montoUsd: usd,
        montoArs: ars,
        cotizacion: cotiz,
        tipoPago: tipo(fila.tipo_pago),
        numeroCuota: txt(fila.numero_cuota),
        medioPago: medio(fila.medio_pago),
        comentarios: txt(fila.comentarios),
      });
    }

    if (pagosCierre.length === 0) continue; // cierre sin pagos válidos: no se crea

    const motivoRevisar = filasGrupo.map(({ fila }) => txt(fila.revisar)).find((t) => t !== undefined);
    if (motivoRevisar) aRevisar += 1;

    cierres.push({
      idCierre,
      fechaCierre: pagosCierre[0]!.fechaPago, // 1er pago define el mes del cierre
      clienteNombre: txt(cabecera.cliente_nombre) ?? 'Sin nombre',
      clienteMail: txt(cabecera.cliente_mail),
      programa: prog,
      ticketTotalUsd: pagosCierre.reduce((acc, p) => acc + p.montoUsd, 0),
      closer: txt(cabecera.closer),
      funnel: txt(cabecera.funnel),
      unidadNegocio: 'ACADEMY',
      estado: 'Activo',
      revisar: motivoRevisar,
    });
    pagos.push(...pagosCierre);
  }

  return {
    cierres,
    pagos,
    resumen: { cierres: cierres.length, pagos: pagos.length, aRevisar },
    errores,
  };
}
