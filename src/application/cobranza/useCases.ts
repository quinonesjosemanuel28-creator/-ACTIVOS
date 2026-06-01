/**
 * CAPA 2 — APLICACIÓN · Módulo Cobranza.
 * Deriva el estado de cobranza/morosidad de cada cierre a partir del plan de
 * cuotas + los pagos REALES. No toca cash/comisiones (que leen de pagos).
 */
import { cobranzaDeCierre, proyeccionPorMes, type CobranzaCierre, type EstadoCobranza } from '../../domain/cobranza/calculo';
import type { ReposCierres } from '../cierres/ports';

export type FilaCobranza = CobranzaCierre & { cliente: string; fechaCierre: string; inactivo: boolean };

export interface CobranzaView {
  hoy: string;
  /** Cierres ACTIVOS con plan de cuotas. */
  cierres: FilaCobranza[];
  /** Lista negra: cierres activos con alguna cuota a +60 días (nivel negro). */
  listaNegra: FilaCobranza[];
  /** Cierres marcados como Inactivo (facturación consolidada). */
  inactivos: FilaCobranza[];
  resumen: {
    alDia: number;
    atrasado: number;
    morosidad: number;
    saldoPendienteUsd: number;
    morosidadUsd: number; // saldo pendiente de cierres en morosidad
    /** Semáforo: cantidad de cierres por color (peor nivel del cierre). */
    semaforo: { verde: number; amarillo: number; naranja: number; rojo: number; negro: number };
  };
  /** Proyección de cobranza por mes (USD). SOLO visual, no es cash. */
  proyeccion: { mes: string; montoUsd: number }[];
}

const hoyIso = () => new Date().toISOString().slice(0, 10);

export function obtenerCobranza(repos: ReposCierres, hoy: string = hoyIso()): CobranzaView {
  const todosCierres = repos.cierres.listar();
  const todosPagos = repos.pagos.listarTodos();

  const conPlan = todosCierres.filter((c) => !!c.cantidadCuotas && c.cantidadCuotas > 0);
  const todas: FilaCobranza[] = conPlan.map((c) => {
    const pagos = todosPagos.filter((p) => p.idCierre === c.idCierre);
    const cb = cobranzaDeCierre(c, pagos, hoy);
    return { ...cb, cliente: c.clienteNombre, fechaCierre: c.fechaCierre, inactivo: !!c.inactivo };
  });

  // Inactivos quedan fuera de cobranza/morosidad/lista negra/proyección.
  const inactivos = todas.filter((c) => c.inactivo);
  const cobranzas = todas.filter((c) => !c.inactivo);
  const listaNegra = cobranzas.filter((c) => c.nivel === 'negro');

  const cuenta = (e: EstadoCobranza) => cobranzas.filter((c) => c.estado === e).length;
  const resumen = {
    alDia: cuenta('Al día'),
    atrasado: cuenta('Atrasado'),
    morosidad: cuenta('Morosidad'),
    saldoPendienteUsd: round2(cobranzas.reduce((a, c) => a + c.saldoPendienteUsd, 0)),
    morosidadUsd: round2(cobranzas.filter((c) => c.estado === 'Morosidad').reduce((a, c) => a + c.saldoPendienteUsd, 0)),
    semaforo: {
      verde: cobranzas.filter((c) => c.nivel === 'verde').length,
      amarillo: cobranzas.filter((c) => c.nivel === 'amarillo').length,
      naranja: cobranzas.filter((c) => c.nivel === 'naranja').length,
      rojo: cobranzas.filter((c) => c.nivel === 'rojo').length,
      negro: cobranzas.filter((c) => c.nivel === 'negro').length,
    },
  };

  const proyMap = proyeccionPorMes(cobranzas);
  const proyeccion = Object.keys(proyMap)
    .sort()
    .map((mes) => ({ mes, montoUsd: proyMap[mes]! }));

  return { hoy, cierres: cobranzas, listaNegra, inactivos, resumen, proyeccion };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
