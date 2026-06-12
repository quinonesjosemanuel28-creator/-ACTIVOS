/**
 * CAPA 4 — INFRAESTRUCTURA · Generador de datos demo realistas.
 *
 * Siembra 7 meses coherentes (Nov 2025 → May 2026) para ver el dashboard
 * funcionando de inmediato. Incluye cohortes (cobros diferidos), mezcla
 * Empresario/Gestor (R8), egresos de los tres tipos y un funnel por mes.
 */
import type { Cobro, Egreso, FunnelMes, Mes, Parametros, Programa, Venta } from '../../domain/types';
import type { Repositorios } from '../../application/ports';
import { tipoPorCategoria } from '../../domain/egresos/categorias';

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

    // Egresos con las 8 categorías del módulo + doble moneda (ARS a la
    // cotización del mes). Montos mensuales ~iguales que antes para no alterar
    // el dashboard. Algunos recurrentes (proyección) y un retiro (distribución).
    const cotizEg = 980 + idx * 55; // ~980 (nov) → ~1310 (may)
    const ars = (usd: number) => Math.round(usd * cotizEg);
    const eg = (suf: string, d: number, categoria: string, concepto: string, montoUsd: number, recurrente = false) =>
      egresos.push({
        idEgreso: `E-${mes}-${suf}`, fecha: dia(d), mes, tipo: tipoPorCategoria(categoria), categoria, concepto,
        montoUsd, montoArs: ars(montoUsd), cotizacion: cotizEg, recurrente, unidadNegocio: 'ACADEMY',
      });

    const marketing = 1500 + idx * 250 + Math.round(rand() * 500);
    eg('mkt', 1, 'Marketing y publicidad', 'Pauta IG/Meta', marketing);
    // Comisiones: NO se siembran a mano; se generan al "Liquidar comisiones"
    // desde la sección Comisiones (egreso COMI-<mes>), evitando doble conteo.
    eg('tec', 2, 'Infraestructura y tecnología', 'SaaS / CRM / hosting', 350);
    eg('sue', 3, 'Sueldos', 'Equipo', 4200);
    if (rand() > 0.5) eg('var', 12, 'Gastos variables', 'Viáticos / varios', 120 + Math.round(rand() * 200));
    if (idx === 3) eg('hon', 15, 'Honorarios profesionales', 'Contaduría y legal', 1800);
    if (idx === 5) eg('ret', 25, 'Retiros de socios', 'Distribución de utilidades', 3000); // distribución, no operativo

    // Recurrente (alquiler): una sola plantilla en el primer mes; el módulo
    // Egresos la proyecta a todos los meses sin recargarla a mano.
    if (idx === 0) eg('alq', 1, 'Gastos fijos', 'Alquiler oficina', 900, true);

    // Funnel: agendas/shows NO se inventan (carga manual real). Quedan en 0
    // hasta que se carguen; "cerrados" se deriva de los cierres reales.
    funnels.push({ mes, funnel: { agendas: 0, asistieron: 0, cerrados: 0 } });
  });

  const parametros: Parametros = {
    cajaInicialUsd: 8000,
    costosFijosMensualesUsd: 6500,
    metaCashCollectedUsd: 18000,
    metaMargenOperativo: 0.25,
    topeCacUsd: 350,
    metaTasaCierre: 0.2,
    runwayMinimoMeses: 3,
    objetivoRoas: 3,
    objetivoMer: 3,
  };

  return { ventas, cobros, egresos, funnels, parametros };
}

/** Carga idempotente del demo en los repositorios. */
export async function sembrarDemo(repos: Repositorios): Promise<{ ventas: number; cobros: number; egresos: number }> {
  const data = generarDemo();
  for (const v of data.ventas) await repos.ventas.insertar(v);
  for (const c of data.cobros) await repos.cobros.insertar(c);
  for (const e of data.egresos) await repos.egresos.insertar(e);
  for (const f of data.funnels) await repos.funnel.guardar(f.mes, f.funnel);
  await repos.parametros.guardar(data.parametros);
  return { ventas: data.ventas.length, cobros: data.cobros.length, egresos: data.egresos.length };
}

/**
 * Siembra SOLO la base que el modelo de cierres no incluye: egresos, funnel
 * y parámetros. Se usa junto a sembrarCierresDemo cuando cierres/pagos son
 * la fuente canónica del dashboard (no se siembran ventas/cobros legacy).
 */
export async function sembrarBaseDemo(repos: Repositorios): Promise<{ egresos: number }> {
  const data = generarDemo();
  for (const e of data.egresos) await repos.egresos.insertar(e);
  for (const f of data.funnels) await repos.funnel.guardar(f.mes, f.funnel);
  await repos.parametros.guardar(data.parametros);
  return { egresos: data.egresos.length };
}
