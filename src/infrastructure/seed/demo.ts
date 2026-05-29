/**
 * CAPA 4 — INFRAESTRUCTURA · Generador de datos demo realistas.
 *
 * Siembra 7 meses coherentes (Nov 2025 → May 2026) para ver el dashboard
 * funcionando de inmediato. Incluye cohortes (cobros diferidos), mezcla
 * Empresario/Gestor (R8), egresos de los tres tipos y un funnel por mes.
 */
import type { Cobro, Egreso, FunnelMes, Mes, Parametros, Programa, Venta } from '../../domain/types';
import type { Repositorios } from '../../application/ports';

const MESES: Mes[] = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
const CLOSERS = ['Ana', 'Bruno', 'Caro'];
const SETTERS = ['Diego', 'Eva'];
const FUNNELS = ['IG Ads', 'Webinar', 'Referido'];

// PRNG determinista para que el seed sea reproducible.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const TICKET: Record<Programa, number> = { Empresario: 3000, Gestor: 1200 };

interface SeedData {
  ventas: Venta[];
  cobros: Cobro[];
  egresos: Egreso[];
  funnels: { mes: Mes; funnel: FunnelMes }[];
  parametros: Parametros;
}

export function generarDemo(): SeedData {
  const rand = rng(42);
  const ventas: Venta[] = [];
  const cobros: Cobro[] = [];
  const egresos: Egreso[] = [];
  const funnels: { mes: Mes; funnel: FunnelMes }[] = [];

  MESES.forEach((mes, idx) => {
    const dia = (n: number) => `${mes}-${String(((n % 27) + 1)).padStart(2, '0')}`;
    // Crecimiento gradual de cierres
    const cierresEmp = 2 + Math.floor(rand() * 3) + Math.floor(idx / 2); // 2..7
    const cierresGes = 3 + Math.floor(rand() * 4); // 3..6

    const generarVentas = (programa: Programa, cantidad: number) => {
      for (let i = 0; i < cantidad; i++) {
        const id = `V-${mes}-${programa[0]}${i}`;
        const ticket = TICKET[programa] * (0.85 + rand() * 0.4);
        const closer = programa === 'Empresario' && idx < 2 ? 'Ana' : CLOSERS[Math.floor(rand() * CLOSERS.length)]!;
        ventas.push({
          idVenta: id,
          fechaVenta: dia(i * 3 + 2),
          mesVenta: mes,
          cliente: `Cliente ${programa[0]}${idx}-${i}`,
          programa,
          closer,
          setter: SETTERS[Math.floor(rand() * SETTERS.length)],
          funnel: FUNNELS[Math.floor(rand() * FUNNELS.length)],
          ticketTotalUsd: Math.round(ticket),
          unidadNegocio: 'ACADEMY',
          estado: 'Activo',
        });
        // Cash nuevo: ~60% se cobra el mismo mes; el resto en cohortes futuras
        const anticipo = Math.round(ticket * (0.5 + rand() * 0.2));
        cobros.push({
          idCobro: `${id}-c0`,
          idVentaOrigen: id,
          fechaCobro: dia(i * 3 + 4),
          mesCobro: mes,
          mesOriginalVenta: mes,
          montoUsd: anticipo,
          programa,
          unidadNegocio: 'ACADEMY',
        });
        // Resto cobrado en el mes siguiente (cohorte), si existe
        const siguiente = MESES[idx + 1];
        if (siguiente) {
          cobros.push({
            idCobro: `${id}-c1`,
            idVentaOrigen: id,
            fechaCobro: `${siguiente}-12`,
            mesCobro: siguiente,
            mesOriginalVenta: mes,
            montoUsd: Math.round(ticket - anticipo),
            programa,
            unidadNegocio: 'ACADEMY',
          });
        }
      }
    };

    generarVentas('Empresario', cierresEmp);
    generarVentas('Gestor', cierresGes);

    // Egresos: Marketing (Directo), Comisiones (Directo), Estructura (Operativo), extraordinario ocasional
    const marketing = 1500 + idx * 250 + Math.round(rand() * 500);
    egresos.push(
      { idEgreso: `E-${mes}-mkt`, fecha: dia(1), mes, tipo: 'Directo', categoria: 'Marketing', concepto: 'Pauta IG/Meta', montoUsd: marketing, unidadNegocio: 'ACADEMY' },
      { idEgreso: `E-${mes}-com`, fecha: dia(20), mes, tipo: 'Directo', categoria: 'Comisiones', concepto: 'Comisiones closers', montoUsd: Math.round((cierresEmp + cierresGes) * 180), unidadNegocio: 'ACADEMY' },
      { idEgreso: `E-${mes}-her`, fecha: dia(2), mes, tipo: 'Operativo', categoria: 'Herramientas', concepto: 'SaaS / CRM', montoUsd: 350, unidadNegocio: 'ACADEMY' },
      { idEgreso: `E-${mes}-est`, fecha: dia(3), mes, tipo: 'Operativo', categoria: 'Estructura', concepto: 'Sueldos + oficina', montoUsd: 4200, unidadNegocio: 'ACADEMY' },
    );
    if (idx === 3) {
      egresos.push({ idEgreso: `E-${mes}-ext`, fecha: dia(15), mes, tipo: 'Extraordinario', categoria: 'Legal', concepto: 'Constitución sociedad', montoUsd: 1800, unidadNegocio: 'ACADEMY' });
    }

    // Funnel coherente con los cierres del mes
    const cerrados = cierresEmp + cierresGes;
    const asistieron = Math.round(cerrados / (0.18 + rand() * 0.06));
    const agendas = Math.round(asistieron / (0.6 + rand() * 0.1));
    funnels.push({ mes, funnel: { agendas, asistieron, cerrados } });
  });

  const parametros: Parametros = {
    cajaInicialUsd: 8000,
    costosFijosMensualesUsd: 6500,
    metaCashCollectedUsd: 18000,
    metaMargenOperativo: 0.25,
    topeCacUsd: 350,
    metaTasaCierre: 0.2,
    runwayMinimoMeses: 3,
  };

  return { ventas, cobros, egresos, funnels, parametros };
}

/** Carga idempotente del demo en los repositorios. */
export function sembrarDemo(repos: Repositorios): { ventas: number; cobros: number; egresos: number } {
  const data = generarDemo();
  data.ventas.forEach((v) => repos.ventas.insertar(v));
  data.cobros.forEach((c) => repos.cobros.insertar(c));
  data.egresos.forEach((e) => repos.egresos.insertar(e));
  data.funnels.forEach((f) => repos.funnel.guardar(f.mes, f.funnel));
  repos.parametros.guardar(data.parametros);
  return { ventas: data.ventas.length, cobros: data.cobros.length, egresos: data.egresos.length };
}
