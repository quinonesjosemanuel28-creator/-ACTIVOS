/**
 * CAPA 3 — DOMINIO · Cálculo de comisiones (puro, testeado).
 *
 * Regla de negocio (cerrada):
 *  - Por PAGO, sobre el ARS realmente cobrado (montoArs):
 *    · Closer del pago (efectivo = pago.closer ?? cierre.closer): 10% SIEMPRE.
 *    · Setter (efectivo = pago.setter ?? cierre.setter): 2% SOLO si el pago
 *      tiene aplicaSetting = true y hay setter.
 *  - Pagos sin ARS comisionan 0 (no se puede calcular sobre ARS inexistente).
 *  - La comisión se DERIVA del pago (no se guarda): editar el pago recalcula.
 *  - Bonos: fuera de este cálculo.
 */
import { closerEfectivo } from '../cierres/metrics';
import type { Cierre, Pago } from '../cierres/types';
import type { Mes } from '../types';

export const PCT_CLOSER = 0.1;
export const PCT_SETTER = 0.02;

const mesDe = (fechaIso: string): Mes => fechaIso.slice(0, 7);

/** Setter efectivo del pago: el del pago, o el del cierre si no tiene propio. */
export function setterEfectivo(pago: Pago, cierre: Cierre | undefined): string | undefined {
  return pago.setter ?? cierre?.setter;
}

/** Una línea de comisión atribuida a una persona por un pago concreto. */
export interface LineaComision {
  idPago: string;
  idCierre: string;
  cliente?: string;
  fechaPago: string;
  rol: 'closer' | 'setter';
  persona: string;
  baseArs: number;
  pct: number;
  montoArs: number;
}

/**
 * Comisiones que genera UN pago (0, 1 o 2 líneas). Base = montoArs ?? 0.
 * Si no hay ARS, devuelve [] (no comisiona).
 */
export function comisionDePago(pago: Pago, cierre: Cierre | undefined): LineaComision[] {
  const baseArs = pago.montoArs ?? 0;
  if (baseArs <= 0) return [];
  const lineas: LineaComision[] = [];

  const closer = closerEfectivo(pago, cierre);
  if (closer) {
    lineas.push({
      idPago: pago.idPago,
      idCierre: pago.idCierre,
      cliente: cierre?.clienteNombre,
      fechaPago: pago.fechaPago,
      rol: 'closer',
      persona: closer,
      baseArs,
      pct: PCT_CLOSER,
      montoArs: baseArs * PCT_CLOSER,
    });
  }

  const setter = setterEfectivo(pago, cierre);
  if (pago.aplicaSetting && setter) {
    lineas.push({
      idPago: pago.idPago,
      idCierre: pago.idCierre,
      cliente: cierre?.clienteNombre,
      fechaPago: pago.fechaPago,
      rol: 'setter',
      persona: setter,
      baseArs,
      pct: PCT_SETTER,
      montoArs: baseArs * PCT_SETTER,
    });
  }

  return lineas;
}

/** Resumen de comisiones de una persona en el período. */
export interface ComisionPersona {
  persona: string;
  comisionCloserArs: number;
  comisionSetterArs: number;
  totalArs: number;
  lineas: LineaComision[];
}

export interface ComisionesDelMes {
  mes: Mes;
  porPersona: ComisionPersona[];
  totalArs: number;
  /** Pagos del mes con ARS faltante (comisionan 0): para marcarlos en la vista. */
  pagosSinArs: number;
}

/**
 * Comisiones del mes (por fecha de cobro del pago), agregadas por persona y
 * con el desglose de líneas que las componen.
 */
export function comisionesDelMes(
  cierres: readonly Cierre[],
  pagos: readonly Pago[],
  mes: Mes,
): ComisionesDelMes {
  const cierrePorId = new Map(cierres.map((c) => [c.idCierre, c]));
  const pagosMes = pagos.filter((p) => mesDe(p.fechaPago) === mes);

  const acc = new Map<string, ComisionPersona>();
  const get = (persona: string): ComisionPersona => {
    let p = acc.get(persona);
    if (!p) {
      p = { persona, comisionCloserArs: 0, comisionSetterArs: 0, totalArs: 0, lineas: [] };
      acc.set(persona, p);
    }
    return p;
  };

  let pagosSinArs = 0;
  for (const pago of pagosMes) {
    if (!pago.montoArs || pago.montoArs <= 0) pagosSinArs += 1;
    for (const linea of comisionDePago(pago, cierrePorId.get(pago.idCierre))) {
      const persona = get(linea.persona);
      if (linea.rol === 'closer') persona.comisionCloserArs += linea.montoArs;
      else persona.comisionSetterArs += linea.montoArs;
      persona.totalArs += linea.montoArs;
      persona.lineas.push(linea);
    }
  }

  const porPersona = [...acc.values()].sort((a, b) => b.totalArs - a.totalArs);
  const totalArs = porPersona.reduce((s, p) => s + p.totalArs, 0);
  return { mes, porPersona, totalArs, pagosSinArs };
}
