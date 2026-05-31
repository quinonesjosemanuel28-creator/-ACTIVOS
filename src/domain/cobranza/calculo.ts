/**
 * CAPA 3 — DOMINIO · Cobranza y morosidad (puro, testeado).
 *
 * PRINCIPIO QUE PROTEGE LA REGLA CRÍTICA:
 * Las cuotas NO son cash. Acá solo se DERIVA un plan de cobranza a partir del
 * cierre (cantidadCuotas + monto por cuota) y los pagos REALES ya cobrados.
 * Cash collected, cohortes, comisiones y utilidad siguen leyendo de `pagos`,
 * así una cuota pendiente (sin pago) queda excluida automáticamente.
 *
 * Mecánica:
 *  - Asignación FIFO: los pagos, ordenados por fecha, llenan cuota 1 → 2 → …
 *    (una cuota se puede pagar en partes: seña de cuota + completar).
 *  - El reloj de 30 días de la cuota N+1 arranca cuando se COMPLETA la N.
 *    La cuota 1 vence a fechaCierre + 30 días.
 *  - Si la cuota previa no está completa, la siguiente NO tiene vencimiento
 *    exigible (su fecha es estimada y solo sirve para proyección visual).
 *  - Cierres sin plan (legacy/saldados) quedan fuera: estado "Saldado".
 */
import type { Cierre, Pago } from '../cierres/types';
import type { Mes } from '../types';

export const DIAS_CUOTA = 30;

export type EstadoCobranza = 'Saldado' | 'Al día' | 'Atrasado' | 'Morosidad';

export interface CuotaDerivada {
  numero: number; // 1-based
  montoUsd: number;
  abonadoUsd: number;
  completa: boolean;
  /** Fecha en que se completó (fecha del pago que la cerró). */
  fechaCompletada?: string;
  /** Vencimiento. Real si la cuota previa está completa; estimado si no. */
  vencimiento: string;
  vencimientoEstimado: boolean;
}

export interface CobranzaCierre {
  idCierre: string;
  tieneePlan: boolean;
  totalUsd: number;
  abonadoUsd: number;
  saldoPendienteUsd: number;
  cuotas: CuotaDerivada[];
  estado: EstadoCobranza;
  /** Días de atraso de la cuota vencida más antigua sin completar (0 si ninguna). */
  diasAtraso: number;
}

function addDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diffDias(desdeIso: string, hastaIso: string): number {
  const a = new Date(`${desdeIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${hastaIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deriva el estado de cobranza de un cierre a una fecha de referencia (hoy).
 * `pagosDelCierre` deben ser los pagos reales de ESE cierre.
 */
export function cobranzaDeCierre(cierre: Cierre, pagosDelCierre: readonly Pago[], hoy: string): CobranzaCierre {
  const tieneePlan = !!cierre.cantidadCuotas && cierre.cantidadCuotas > 0;
  const totalUsd = round2(cierre.ticketTotalUsd);
  const abonadoUsd = round2(pagosDelCierre.reduce((a, p) => a + p.montoUsd, 0));
  const saldoPendienteUsd = round2(Math.max(totalUsd - abonadoUsd, 0));

  if (!tieneePlan) {
    // Legacy / saldado: fuera del sistema de cuotas.
    return {
      idCierre: cierre.idCierre,
      tieneePlan: false,
      totalUsd,
      abonadoUsd,
      saldoPendienteUsd,
      cuotas: [],
      estado: 'Saldado',
      diasAtraso: 0,
    };
  }

  const n = cierre.cantidadCuotas!;
  const montoCuota = round2(cierre.montoCuotaUsd ?? totalUsd / n);

  // FIFO: distribuyo el abonado total entre las cuotas en orden, registrando
  // qué pago completa cada cuota (para arrancar el reloj de la siguiente).
  const pagosOrden = [...pagosDelCierre].sort((a, b) => a.fechaPago.localeCompare(b.fechaPago));
  const completadaEn: (string | undefined)[] = new Array(n).fill(undefined);
  const abonadoCuota: number[] = new Array(n).fill(0);
  let cuotaIdx = 0;
  for (const pago of pagosOrden) {
    let restante = pago.montoUsd;
    while (restante > 0 && cuotaIdx < n) {
      const falta = round2(montoCuota - abonadoCuota[cuotaIdx]!);
      const aplica = Math.min(restante, falta);
      abonadoCuota[cuotaIdx]! += aplica;
      restante = round2(restante - aplica);
      if (round2(abonadoCuota[cuotaIdx]!) >= montoCuota - 0.001) {
        completadaEn[cuotaIdx] = pago.fechaPago;
        cuotaIdx += 1;
      } else {
        break; // la cuota quedó parcial; el resto del pago ya se aplicó
      }
    }
  }

  // Vencimientos encadenados.
  const cuotas: CuotaDerivada[] = [];
  for (let i = 0; i < n; i++) {
    const completa = completadaEn[i] !== undefined;
    let vencimiento: string;
    let estimado = false;
    if (i === 0) {
      vencimiento = addDias(cierre.fechaCierre, DIAS_CUOTA); // cuota 1: cierre + 30
    } else if (completadaEn[i - 1]) {
      vencimiento = addDias(completadaEn[i - 1]!, DIAS_CUOTA); // real: previa completada + 30
    } else {
      // previa no completa → vencimiento estimado (solo visual, nunca cash)
      vencimiento = addDias(cuotas[i - 1]!.vencimiento, DIAS_CUOTA);
      estimado = true;
    }
    cuotas.push({
      numero: i + 1,
      montoUsd: montoCuota,
      abonadoUsd: round2(abonadoCuota[i]!),
      completa,
      fechaCompletada: completadaEn[i],
      vencimiento,
      vencimientoEstimado: estimado,
    });
  }

  // Estado: peor cuota vencida no completa, con vencimiento NO estimado
  // (una cuota cuyo reloj aún no arrancó no genera atraso).
  let diasAtraso = 0;
  for (const c of cuotas) {
    if (c.completa || c.vencimientoEstimado) continue;
    const vencida = diffDias(c.vencimiento, hoy);
    if (vencida > 0) diasAtraso = Math.max(diasAtraso, vencida);
  }
  let estado: EstadoCobranza;
  if (saldoPendienteUsd <= 0.001) estado = 'Saldado';
  else if (diasAtraso > DIAS_CUOTA) estado = 'Morosidad';
  else if (diasAtraso >= 1) estado = 'Atrasado';
  else estado = 'Al día';

  return { idCierre: cierre.idCierre, tieneePlan: true, totalUsd, abonadoUsd, saldoPendienteUsd, cuotas, estado, diasAtraso };
}

/** Proyección de cobranza: monto pendiente por mes futuro (USD). SOLO visual. */
export function proyeccionPorMes(cobranzas: readonly CobranzaCierre[]): Record<Mes, number> {
  const acc: Record<Mes, number> = {};
  for (const cb of cobranzas) {
    for (const c of cb.cuotas) {
      if (c.completa) continue;
      const pendiente = round2(c.montoUsd - c.abonadoUsd);
      if (pendiente <= 0) continue;
      const mes = c.vencimiento.slice(0, 7);
      acc[mes] = round2((acc[mes] ?? 0) + pendiente);
    }
  }
  return acc;
}
