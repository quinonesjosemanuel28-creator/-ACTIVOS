/**
 * CAPA 4 — INFRAESTRUCTURA · Seed demo del módulo Cierres y Clientes.
 *
 * Genera cierres con pagos en ARS y cotización creciente realista. Todos
 * los IDs llevan el prefijo DEMO- para que "Borrar datos de demostración"
 * los limpie con precisión sin tocar datos cargados a mano.
 */
import type { Cierre, MedioPago, Pago, ProgramaCierre, TipoPago } from '../../domain/cierres/types';
import type { ReposCierres } from '../../application/cierres/ports';
import { DEMO_PREFIX } from '../sqlite/cierresRepos';

interface PlanPago {
  offsetMes: number; // 0 = mismo mes del cierre; 1 = mes siguiente (cohorte)
  dia: number;
  fraccionUsd: number; // fracción del ticket
  tipo: TipoPago;
  cuota?: string;
  medio: MedioPago;
}

interface PlanCierre {
  mes: string; // YYYY-MM
  dia: number;
  nombre: string;
  programa: ProgramaCierre;
  ticket: number;
  closer: string;
  setter: string;
  funnel: string;
  pagos: PlanPago[];
}

/** Cotización por mes (ARS por USD), creciente. */
const COTIZACION: Record<string, number> = {
  '2026-01': 1050,
  '2026-02': 1120,
  '2026-03': 1180,
  '2026-04': 1240,
  '2026-05': 1300,
};

const sumarMes = (mes: string, n: number): string => {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const PLAN: PlanCierre[] = [
  {
    mes: '2026-03', dia: 4, nombre: 'Lucía Fernández', programa: 'Empresario', ticket: 3000,
    closer: 'Ana', setter: 'Diego', funnel: 'IG Ads',
    pagos: [
      { offsetMes: 0, dia: 4, fraccionUsd: 0.4, tipo: 'Reserva/Seña', medio: 'Transferencia Lemon' },
      { offsetMes: 0, dia: 18, fraccionUsd: 0.3, tipo: 'Cuota', cuota: '1/2', medio: 'Transferencia BBVA' },
      { offsetMes: 1, dia: 10, fraccionUsd: 0.3, tipo: 'Cuota', cuota: '2/2', medio: 'Transferencia BBVA' },
    ],
  },
  {
    mes: '2026-03', dia: 9, nombre: 'Marcos Pérez', programa: 'Cero a Gestor', ticket: 1200,
    closer: 'Bruno', setter: 'Eva', funnel: 'Webinar',
    pagos: [{ offsetMes: 0, dia: 9, fraccionUsd: 1, tipo: 'Pago Completo', medio: 'CRYPTO' }],
  },
  {
    mes: '2026-03', dia: 15, nombre: 'Sofía Gómez', programa: 'Cero a Gestor', ticket: 1200,
    closer: 'Caro', setter: 'Diego', funnel: 'Referido',
    pagos: [{ offsetMes: 0, dia: 15, fraccionUsd: 0.5, tipo: 'Reserva/Seña', medio: 'Transferencia MP' }],
  },
  {
    mes: '2026-04', dia: 3, nombre: 'Diego Romero', programa: 'Empresario', ticket: 3200,
    closer: 'Ana', setter: 'Eva', funnel: 'IG Ads',
    pagos: [
      { offsetMes: 0, dia: 3, fraccionUsd: 0.5, tipo: 'Reserva/Seña', medio: 'Dólares' },
      { offsetMes: 0, dia: 22, fraccionUsd: 0.5, tipo: 'Pago Completo', medio: 'Transferencia Lemon' },
    ],
  },
  {
    mes: '2026-04', dia: 11, nombre: 'Valentina Díaz', programa: 'Cero a Gestor', ticket: 1300,
    closer: 'Bruno', setter: 'Diego', funnel: 'Webinar',
    pagos: [{ offsetMes: 0, dia: 11, fraccionUsd: 1, tipo: 'Pago Completo', medio: 'Hotmart' }],
  },
  {
    mes: '2026-05', dia: 6, nombre: 'Tomás Acosta', programa: 'Empresario', ticket: 3500,
    closer: 'Caro', setter: 'Eva', funnel: 'IG Ads',
    pagos: [
      { offsetMes: 0, dia: 6, fraccionUsd: 0.4, tipo: 'Reserva/Seña', medio: 'Transferencia Lemon' },
      { offsetMes: 0, dia: 20, fraccionUsd: 0.3, tipo: 'Cuota', cuota: '1/2', medio: 'Transferencia BBVA' },
    ],
  },
  {
    mes: '2026-05', dia: 14, nombre: 'Camila Ruiz', programa: 'Cero a Gestor', ticket: 1300,
    closer: 'Ana', setter: 'Diego', funnel: 'Referido',
    pagos: [{ offsetMes: 0, dia: 14, fraccionUsd: 0.5, tipo: 'Reserva/Seña', medio: 'Transferencia MP' }],
  },
];

export function generarCierresDemo(): { cierres: Cierre[]; pagos: Pago[] } {
  const cierres: Cierre[] = [];
  const pagos: Pago[] = [];
  PLAN.forEach((p, i) => {
    const idCierre = `${DEMO_PREFIX}CL-${i}`;
    cierres.push({
      idCierre,
      fechaCierre: `${p.mes}-${String(p.dia).padStart(2, '0')}`,
      clienteNombre: p.nombre,
      clienteMail: `${p.nombre.toLowerCase().replace(/[^a-z]/g, '.')}@mail.com`,
      clienteTelefono: `+54 9 11 ${1000 + i}-${2000 + i}`,
      programa: p.programa,
      ticketTotalUsd: p.ticket,
      closer: p.closer,
      setter: p.setter,
      funnel: p.funnel,
      unidadNegocio: 'ACADEMY',
      estado: 'Activo',
    });
    p.pagos.forEach((pg, j) => {
      const mesPago = sumarMes(p.mes, pg.offsetMes);
      const cotiz = COTIZACION[mesPago] ?? 1300;
      const montoUsd = Math.round(p.ticket * pg.fraccionUsd);
      pagos.push({
        idPago: `${DEMO_PREFIX}PG-${i}-${j}`,
        idCierre,
        fechaPago: `${mesPago}-${String(pg.dia).padStart(2, '0')}`,
        montoUsd,
        montoArs: montoUsd * cotiz,
        cotizacion: cotiz,
        tipoPago: pg.tipo,
        numeroCuota: pg.cuota,
        medioPago: pg.medio,
      });
    });
  });
  return { cierres, pagos };
}

/** Carga idempotente del demo de cierres/pagos. */
export function sembrarCierresDemo(repos: ReposCierres): { cierres: number; pagos: number } {
  const { cierres, pagos } = generarCierresDemo();
  cierres.forEach((c) => repos.cierres.guardar(c));
  pagos.forEach((p) => repos.pagos.guardar(p));
  return { cierres: cierres.length, pagos: pagos.length };
}
