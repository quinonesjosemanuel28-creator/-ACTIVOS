/**
 * CAPA 3 — DOMINIO · Calculadora de márgenes del prestamista (puro, testeado).
 *
 * Motor de la herramienta que el closer usa EN VIVO con el lead: carga los
 * números que el prestamista tiene hoy, mueve las palancas del sistema
 * +Activos y ve, en la misma pantalla, cuánta utilidad deja sobre la mesa.
 *
 * MODELO (estado estacionario, declarado explícitamente para poder defenderlo
 * en la llamada — cada supuesto es conservador a propósito):
 *
 *  1. El capital colocado se mantiene constante: lo que vuelve se recoloca y
 *     lo que se pierde por incobrables se repone. Por eso la pérdida de
 *     capital se cuenta UNA VEZ POR CICLO, no una vez al año.
 *  2. La tasa es FLAT mensual sobre el monto prestado (así opera el 95% del
 *     mercado): interés de un préstamo = capital × tasa × plazo en meses.
 *  3. La mora NO genera interés extra. El atraso solo inmoviliza capital y
 *     alarga el ciclo. Supuesto conservador: si el prestamista cobra
 *     punitorios, su realidad es mejor que la que muestra la calculadora.
 *  4. El incobrable no paga interés Y se lleva el capital. Son dos golpes
 *     distintos y ambos se cuentan.
 *
 * Regla de gobierno heredada del tablero: toda división por cero devuelve
 * `null` y la UI muestra "—". Cero NaN, cero Infinity.
 *
 * Todas las tasas y porcentajes viajan como FRACCIÓN (0.1 = 10%). La UI hace
 * la conversión en el borde.
 */
import { safeDiv } from '../money';

/** Plazo mínimo admitido: una semana (hay carteras que giran semanal). */
export const MIN_PLAZO_MESES = 0.25;
/** Plazo máximo admitido: 5 años. */
export const MAX_PLAZO_MESES = 60;
/** Días del mes comercial, para convertir atraso en meses de ciclo. */
export const DIAS_MES = 30;

/** Los números del negocio del prestamista en un escenario dado. */
export interface EscenarioPrestamista {
  /** Capital colocado en la calle (cartera activa). */
  capitalColocado: number;
  /** Porción de esa cartera que es plata de terceros (inversores/socios). */
  capitalTerceros: number;
  /** Costo mensual del capital de terceros, fracción (0.05 = 5% mensual). */
  costoCapitalMensual: number;
  /** Tasa de interés mensual flat que le cobra al cliente, fracción. */
  tasaMensual: number;
  /** Plazo promedio del préstamo, en meses. */
  plazoMeses: number;
  /** Fracción de la cartera que se atrasa. */
  mora: number;
  /** Días promedio de atraso de esa porción morosa. */
  diasAtraso: number;
  /** Fracción de la cartera que nunca vuelve (incobrable). */
  incobrable: number;
  /** Gastos operativos del mes: sueldos, cobradores, movilidad, oficina. */
  gastosMensuales: number;
}

/** Resultado anualizado del escenario. */
export interface ResultadoPrestamista {
  /** Plazo real del ciclo una vez que la mora lo estira. */
  plazoEfectivoMeses: number;
  /** Veces que el capital gira en un año, ya castigado por la mora. */
  ciclosPorAno: number;
  /** Giros que la mora se come por año (el costo invisible del desorden). */
  ciclosPerdidosPorMora: number;
  /** Plata propia expuesta = colocado − terceros. */
  capitalPropio: number;
  /** Plata quieta hoy por estar atrasada. */
  capitalInmovilizado: number;
  /** Intereses efectivamente cobrados en el año. */
  interesesAnuales: number;
  /** Capital que se evapora por año en manos de incobrables. */
  perdidaIncobrables: number;
  /** Lo que se le paga a los inversores en el año. */
  costoCapitalAnual: number;
  /** Estructura operativa del año. */
  gastosAnuales: number;
  /** Utilidad neta anual. */
  utilidadAnual: number;
  /** Utilidad neta promedio por mes. */
  utilidadMensual: number;
  /** Utilidad / intereses cobrados. De cada $100 de interés, cuánto queda. */
  margenNeto: number | null;
  /** Retorno anual sobre la plata propia (el número rey del prestamista). */
  roeAnual: number | null;
  /** Utilidad / capital colocado, sin importar de quién es la plata. */
  rendimientoSobreCartera: number | null;
}

function num(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

/**
 * Lleva un escenario cargado a mano a un rango sano. Blinda la calculadora
 * de lo que pasa en vivo: campos vacíos, negativos, un 250% de mora tipeado
 * de más. Nunca lanza; siempre devuelve un escenario calculable.
 */
export function normalizar(entrada: EscenarioPrestamista): EscenarioPrestamista {
  const capitalColocado = Math.max(0, num(entrada.capitalColocado));
  return {
    capitalColocado,
    capitalTerceros: clamp(entrada.capitalTerceros, 0, capitalColocado),
    costoCapitalMensual: clamp(entrada.costoCapitalMensual, 0, 1),
    tasaMensual: clamp(entrada.tasaMensual, 0, 1),
    plazoMeses: clamp(entrada.plazoMeses, MIN_PLAZO_MESES, MAX_PLAZO_MESES),
    mora: clamp(entrada.mora, 0, 1),
    diasAtraso: clamp(entrada.diasAtraso, 0, 720),
    incobrable: clamp(entrada.incobrable, 0, 1),
    gastosMensuales: Math.max(0, num(entrada.gastosMensuales)),
  };
}

/** Corre el modelo completo sobre un escenario. Función pura. */
export function calcular(entrada: EscenarioPrestamista): ResultadoPrestamista {
  const e = normalizar(entrada);

  // La mora estira el ciclo: la parte morosa tarda `diasAtraso` de más, y ese
  // atraso pesa en el promedio en proporción a cuánta cartera está en mora.
  const plazoEfectivoMeses = e.plazoMeses + (e.mora * e.diasAtraso) / DIAS_MES;
  const ciclosPorAno = safeDiv(12, plazoEfectivoMeses) ?? 0;
  const ciclosSinMora = safeDiv(12, e.plazoMeses) ?? 0;
  const ciclosPerdidosPorMora = Math.max(0, ciclosSinMora - ciclosPorAno);

  // Solo la cartera sana paga intereses; la incobrable no paga nada.
  const carteraSana = 1 - e.incobrable;
  const interesesAnuales =
    e.capitalColocado * e.tasaMensual * e.plazoMeses * ciclosPorAno * carteraSana;

  // Y además se lleva el capital, una vez por cada giro del año.
  const perdidaIncobrables = e.capitalColocado * e.incobrable * ciclosPorAno;

  const costoCapitalAnual = e.capitalTerceros * e.costoCapitalMensual * 12;
  const gastosAnuales = e.gastosMensuales * 12;

  const utilidadAnual =
    interesesAnuales - perdidaIncobrables - costoCapitalAnual - gastosAnuales;
  const capitalPropio = Math.max(0, e.capitalColocado - e.capitalTerceros);

  return {
    plazoEfectivoMeses,
    ciclosPorAno,
    ciclosPerdidosPorMora,
    capitalPropio,
    capitalInmovilizado: e.capitalColocado * e.mora,
    interesesAnuales,
    perdidaIncobrables,
    costoCapitalAnual,
    gastosAnuales,
    utilidadAnual,
    utilidadMensual: utilidadAnual / 12,
    margenNeto: safeDiv(utilidadAnual, interesesAnuales),
    roeAnual: safeDiv(utilidadAnual, capitalPropio),
    rendimientoSobreCartera: safeDiv(utilidadAnual, e.capitalColocado),
  };
}

// ─────────────────────── Atribución por palanca ───────────────────────

export type ClavePalanca =
  | 'mora'
  | 'incobrables'
  | 'tasa'
  | 'rotacion'
  | 'gastos'
  | 'capital';

export interface Palanca {
  clave: ClavePalanca;
  etiqueta: string;
  /** Copia el escenario `base` reemplazando SOLO los campos de esta palanca. */
  aplicar: (
    base: EscenarioPrestamista,
    objetivo: EscenarioPrestamista,
  ) => EscenarioPrestamista;
}

/**
 * Orden del waterfall. Primero se ordena la casa (cobranza y cartera), después
 * se toca el precio, y recién al final se suma capital — es el orden en que
 * +Activos hace trabajar al cliente, y el orden importa: cada palanca se mide
 * sobre el escenario que dejaron las anteriores.
 */
export const PALANCAS: readonly Palanca[] = [
  {
    clave: 'mora',
    etiqueta: 'Bajar la mora',
    aplicar: (b, o) => ({ ...b, mora: o.mora, diasAtraso: o.diasAtraso }),
  },
  {
    clave: 'incobrables',
    etiqueta: 'Bajar incobrables',
    aplicar: (b, o) => ({ ...b, incobrable: o.incobrable }),
  },
  {
    clave: 'tasa',
    etiqueta: 'Subir la tasa',
    aplicar: (b, o) => ({ ...b, tasaMensual: o.tasaMensual }),
  },
  {
    clave: 'rotacion',
    etiqueta: 'Acelerar la rotación',
    aplicar: (b, o) => ({ ...b, plazoMeses: o.plazoMeses }),
  },
  {
    clave: 'gastos',
    etiqueta: 'Ordenar gastos',
    aplicar: (b, o) => ({ ...b, gastosMensuales: o.gastosMensuales }),
  },
  {
    clave: 'capital',
    etiqueta: 'Capital y apalancamiento',
    aplicar: (b, o) => ({
      ...b,
      capitalColocado: o.capitalColocado,
      capitalTerceros: o.capitalTerceros,
      costoCapitalMensual: o.costoCapitalMensual,
    }),
  },
];

export interface AportePalanca {
  clave: ClavePalanca;
  etiqueta: string;
  /** Utilidad anual antes de mover esta palanca. */
  desde: number;
  /** Utilidad anual después de moverla. */
  hasta: number;
  /** Lo que aporta (o resta) esta palanca sola. */
  delta: number;
}

export interface Descomposicion {
  utilidadActual: number;
  utilidadObjetivo: number;
  deltaTotal: number;
  aportes: AportePalanca[];
}

/**
 * Waterfall: cuánto de la mejora total aporta cada palanca por separado.
 *
 * Se aplican de a una, en el orden de PALANCAS, midiendo el efecto marginal
 * sobre lo que dejó la anterior. Así la suma de los aportes da EXACTAMENTE la
 * diferencia total — sin residuos que haya que explicar en la llamada.
 */
export function descomponer(
  actual: EscenarioPrestamista,
  objetivo: EscenarioPrestamista,
): Descomposicion {
  const obj = normalizar(objetivo);
  let cursor = normalizar(actual);
  let acumulada = calcular(cursor).utilidadAnual;
  const utilidadActual = acumulada;

  const aportes = PALANCAS.map((palanca) => {
    const desde = acumulada;
    cursor = normalizar(palanca.aplicar(cursor, obj));
    const hasta = calcular(cursor).utilidadAnual;
    acumulada = hasta;
    return {
      clave: palanca.clave,
      etiqueta: palanca.etiqueta,
      desde,
      hasta,
      delta: hasta - desde,
    };
  });

  return {
    utilidadActual,
    utilidadObjetivo: acumulada,
    deltaTotal: acumulada - utilidadActual,
    aportes,
  };
}

// ─────────────────────── Escenario sugerido ───────────────────────

/**
 * Propone el escenario "ordenado" a partir del de hoy, para que el closer
 * arranque con algo cargado y después ajuste con el lead.
 *
 * Criterio: metas exigentes pero alcanzables con sistema de cobranza —
 * mora y incobrables a un tercio (con piso realista), la mitad de los días
 * de atraso, y dos puntos más de tasa. Capital, plazo y gastos NO se tocan:
 * son decisiones del dueño, no consecuencia del sistema.
 */
export function escenarioSugerido(
  actual: EscenarioPrestamista,
): EscenarioPrestamista {
  const e = normalizar(actual);
  return {
    ...e,
    mora: Math.min(e.mora, Math.max(0.03, e.mora / 3)),
    diasAtraso: Math.min(e.diasAtraso, Math.max(5, e.diasAtraso / 2)),
    incobrable: Math.min(e.incobrable, Math.max(0.01, e.incobrable / 3)),
    tasaMensual: clamp(e.tasaMensual + 0.02, 0, 1),
  };
}

// ─────────────────────── Retorno del programa ───────────────────────

export interface RetornoPrograma {
  /** Cuántas veces se paga la inversión con la mejora de un año. */
  roi: number | null;
  /** En cuántos meses la mejora cubre la inversión. */
  mesesRecupero: number | null;
}

/**
 * Compara la mejora anual proyectada contra lo que cuesta el programa.
 * Si la mejora no es positiva no hay recupero posible: devuelve `null` en vez
 * de un número inventado.
 */
export function retornoPrograma(
  deltaAnual: number,
  inversion: number,
): RetornoPrograma {
  const delta = num(deltaAnual);
  const mejoraMensual = delta / 12;
  return {
    roi: safeDiv(delta, num(inversion)),
    mesesRecupero: mejoraMensual > 0 ? safeDiv(num(inversion), mejoraMensual) : null,
  };
}
