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
  // Plan de cuotas (fila cabecera del cierre). Opcionales: sin ellas, el
  // cierre queda legacy/saldado (no entra a Cobranza).
  cantidad_cuotas?: unknown;
  monto_cuota_usd?: unknown;
  fecha_primera_cuota?: unknown;
  /** Total comprometido (opcional): si se carga, deriva la cuota. */
  ticket_total_usd?: unknown;
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

/** Entero positivo, o undefined. */
const entero = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && n >= 1 ? Math.round(n) : undefined;
};

const round2c = (n: number) => Math.round(n * 100) / 100;

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
        // Closer DE ESTA FILA: quien cobró este pago (puede diferir del cierre).
        closer: txt(fila.closer),
      });
    }

    if (pagosCierre.length === 0) continue; // cierre sin pagos válidos: no se crea

    const motivoRevisar = filasGrupo.map(({ fila }) => txt(fila.revisar)).find((t) => t !== undefined);
    if (motivoRevisar) aRevisar += 1;

    // Plan de cuotas (cabecera). "Lo que se pueda derivar, se deriva":
    //  - cantidad + cuota → ticket comprometido = cantidad × cuota
    //  - cantidad + total → cuota = total / cantidad
    // Sin cantidad_cuotas → legacy/saldado: ticket = Σ pagos (compat).
    const cantidadCuotas = entero(cabecera.cantidad_cuotas);
    const montoCuotaCol = num(cabecera.monto_cuota_usd);
    const totalCol = num(cabecera.ticket_total_usd);
    const sumaPagos = pagosCierre.reduce((acc, p) => acc + p.montoUsd, 0);

    let ticketTotalUsd = sumaPagos;
    let montoCuotaUsd: number | undefined;
    let fechaPrimeraCuota: string | undefined;
    if (cantidadCuotas && cantidadCuotas >= 1) {
      if (montoCuotaCol && montoCuotaCol > 0) {
        montoCuotaUsd = round2c(montoCuotaCol);
        ticketTotalUsd = round2c(cantidadCuotas * montoCuotaUsd); // comprometido
      } else if (totalCol && totalCol > 0) {
        ticketTotalUsd = round2c(totalCol);
        montoCuotaUsd = round2c(totalCol / cantidadCuotas);
      } else {
        // Sin cuota ni total cargados: no se puede armar el plan → reporta y
        // cae a legacy (ticket = Σ pagos), sin romper la importación.
        errores.push({ fila: filasGrupo[0]!.nFila, idCierre, motivo: 'Plan de cuotas incompleto: falta monto_cuota_usd o ticket_total_usd.' });
      }
      const fpc = fecha(cabecera.fecha_primera_cuota);
      if (fpc) fechaPrimeraCuota = fpc;
    }
    const conPlan = !!cantidadCuotas && cantidadCuotas >= 1 && montoCuotaUsd !== undefined;

    cierres.push({
      idCierre,
      fechaCierre: pagosCierre[0]!.fechaPago, // 1er pago define el mes del cierre
      clienteNombre: txt(cabecera.cliente_nombre) ?? 'Sin nombre',
      clienteMail: txt(cabecera.cliente_mail),
      programa: prog,
      ticketTotalUsd,
      closer: txt(cabecera.closer),
      funnel: txt(cabecera.funnel),
      unidadNegocio: 'ACADEMY',
      estado: 'Activo',
      revisar: motivoRevisar,
      cantidadCuotas: conPlan ? cantidadCuotas : undefined,
      montoCuotaUsd: conPlan ? montoCuotaUsd : undefined,
      fechaPrimeraCuota: conPlan ? fechaPrimeraCuota : undefined,
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
