/**
 * CAPA 3 — DOMINIO · Motor de alertas (semáforo).
 *
 * Replica el semáforo automático del tablero como un módulo de reglas
 * configurable. Cada regla evalúa una métrica contra un umbral y devuelve
 * VERDE | AMARILLO | ROJO + detalle + acción sugerida.
 *
 * Las reglas son DATOS (array `REGLAS`). La UI solo las pinta; no contiene
 * lógica de decisión.
 */
import type { DatosMes, Parametros } from './types';
import type { DashboardSnapshot } from './dashboard';

export type Severidad = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface Alerta {
  id: string;
  titulo: string;
  severidad: Severidad;
  detalle: string;
  accionSugerida: string;
}

export interface ContextoAlertas {
  snapshot: DashboardSnapshot;
  datosMes: DatosMes;
  parametros: Parametros;
}

/** Orden de severidad para ordenar tarjetas (rojas primero). */
export const PESO_SEVERIDAD: Record<Severidad, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2 };

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`);

interface Regla {
  id: string;
  titulo: string;
  evaluar: (ctx: ContextoAlertas) => Omit<Alerta, 'id' | 'titulo'>;
}

export const REGLAS: Regla[] = [
  // 1 · Cash Collected vs meta
  {
    id: 'cash-vs-meta',
    titulo: 'Cash Collected vs meta',
    evaluar: ({ snapshot, parametros }) => {
      const cc = snapshot.cashCollected.valor ?? 0;
      const meta = parametros.metaCashCollectedUsd;
      const ok = cc >= meta;
      return {
        severidad: ok ? 'VERDE' : 'ROJO',
        detalle: `${fmtUsd(cc)} sobre meta de ${fmtUsd(meta)} (${fmtPct(meta ? cc / meta : null)}).`,
        accionSugerida: ok
          ? 'Cash en meta. Sostener ritmo de cobros.'
          : 'Activar gestión de cobros y cierres pendientes para alcanzar la meta.',
      };
    },
  },
  // 2 · Margen Operativo vs meta (≥ 25%)
  {
    id: 'margen-operativo',
    titulo: 'Margen Operativo',
    evaluar: ({ snapshot, parametros }) => {
      const mo = snapshot.margenOperativo;
      const meta = parametros.metaMargenOperativo;
      const ok = mo !== null && mo >= meta;
      return {
        severidad: ok ? 'VERDE' : mo !== null && mo >= meta * 0.8 ? 'AMARILLO' : 'ROJO',
        detalle: `Margen ${fmtPct(mo)} (meta ≥ ${fmtPct(meta)}).`,
        accionSugerida: ok
          ? 'Rentabilidad saludable.'
          : 'Revisar estructura de egresos: el margen está por debajo de la meta.',
      };
    },
  },
  // 3 · CAC vs tope ($350)
  {
    id: 'cac-vs-tope',
    titulo: 'CAC vs tope',
    evaluar: ({ snapshot, parametros }) => {
      const cac = snapshot.cac;
      const tope = parametros.topeCacUsd;
      if (cac === null) {
        return {
          severidad: 'AMARILLO',
          detalle: 'Sin cierres este mes: CAC no calculable.',
          accionSugerida: 'Generar cierres para poder medir el costo de adquisición.',
        };
      }
      const ok = cac <= tope;
      return {
        severidad: ok ? 'VERDE' : cac <= tope * 1.2 ? 'AMARILLO' : 'ROJO',
        detalle: `CAC ${fmtUsd(cac)} (tope ${fmtUsd(tope)}).`,
        accionSugerida: ok
          ? 'Adquisición eficiente.'
          : 'CAC sobre el tope: optimizar campañas o mejorar tasa de cierre.',
      };
    },
  },
  // 4 · Concentración de cohortes (> 50% → "motor nuevo apagado")
  {
    id: 'concentracion-cohortes',
    titulo: 'Concentración de cohortes',
    evaluar: ({ snapshot }) => {
      const c = snapshot.concentracionCohortes;
      const ok = c !== null && c <= 0.5;
      return {
        severidad: c === null ? 'AMARILLO' : ok ? 'VERDE' : 'ROJO',
        detalle: `Cohortes representan ${fmtPct(c)} del cash del mes.`,
        accionSugerida: ok
          ? 'El motor nuevo está activo.'
          : 'Cohortes > 50%: el motor nuevo está apagado. Priorizar ventas nuevas.',
      };
    },
  },
  // 5 · Empresarios nuevos del mes (0 → ROJO)
  {
    id: 'empresarios-nuevos',
    titulo: 'Empresarios nuevos del mes',
    evaluar: ({ datosMes }) => {
      const n = datosMes.ventas.filter((v) => v.programa === 'Empresario').length;
      return {
        severidad: n === 0 ? 'ROJO' : n < 2 ? 'AMARILLO' : 'VERDE',
        detalle: `${n} cierre(s) de Empresario este mes.`,
        accionSugerida:
          n === 0
            ? 'Cero empresarios nuevos: revisar pipeline high-ticket con urgencia.'
            : 'Sostener el flujo de empresarios.',
      };
    },
  },
  // 6 · Single-point-of-failure: closer de Empresario
  {
    id: 'spof-closer-empresario',
    titulo: 'Dependencia de closer (Empresario)',
    evaluar: ({ datosMes }) => {
      const emp = datosMes.ventas.filter((v) => v.programa === 'Empresario');
      const closers = new Set(emp.map((v) => v.closer ?? 'sin-asignar'));
      const riesgo = emp.length >= 2 && closers.size === 1;
      return {
        severidad: riesgo ? 'AMARILLO' : 'VERDE',
        detalle: riesgo
          ? `Los ${emp.length} cierres de Empresario dependen de un único closer.`
          : `${closers.size} closer(s) activos en Empresario.`,
        accionSugerida: riesgo
          ? 'Diversificar closers de Empresario para reducir el riesgo de dependencia.'
          : 'Equipo de cierre diversificado.',
      };
    },
  },
  // 7 · Calidad de cartera / morosidad cohorte
  {
    id: 'morosidad-cohorte',
    titulo: 'Calidad de cartera (morosidad)',
    evaluar: ({ snapshot }) => {
      const mora = snapshot.morosidadCohorte;
      const ok = mora <= 0;
      return {
        severidad: ok ? 'VERDE' : 'AMARILLO',
        detalle: `Pendiente de cohortes anteriores: ${fmtUsd(Math.max(0, mora))}.`,
        accionSugerida: ok
          ? 'Cartera al día.'
          : 'Gestionar cobros de cohortes anteriores para sanear la cartera.',
      };
    },
  },
  // 8 · Tasa de cierre del funnel
  {
    id: 'tasa-cierre',
    titulo: 'Tasa de cierre del funnel',
    evaluar: ({ snapshot, parametros }) => {
      const tc = snapshot.tasaCierre;
      const meta = parametros.metaTasaCierre;
      const ok = tc !== null && tc >= meta;
      return {
        severidad: tc === null ? 'AMARILLO' : ok ? 'VERDE' : 'AMARILLO',
        detalle: `Tasa de cierre ${fmtPct(tc)} (meta ≥ ${fmtPct(meta)}).`,
        accionSugerida: ok
          ? 'Funnel convirtiendo bien.'
          : 'Tasa de cierre baja: reforzar entrenamiento de closers / calidad de leads.',
      };
    },
  },
  // 9 · Runway proyectado (< 3 meses → ROJO)
  {
    id: 'runway',
    titulo: 'Runway proyectado',
    evaluar: ({ snapshot, parametros }) => {
      const r = snapshot.runway;
      const min = parametros.runwayMinimoMeses;
      if (r === null) {
        return {
          severidad: 'AMARILLO',
          detalle: 'Costos fijos en 0: runway no calculable.',
          accionSugerida: 'Cargar los costos fijos mensuales en Parámetros.',
        };
      }
      const ok = r >= min;
      return {
        severidad: ok ? 'VERDE' : r >= min * 0.66 ? 'AMARILLO' : 'ROJO',
        detalle: `${r.toFixed(1)} meses de oxígeno (mínimo ${min}).`,
        accionSugerida: ok
          ? 'Runway saludable.'
          : 'Runway corto: acelerar cobros y/o recortar estructura para extender oxígeno.',
      };
    },
  },
];

/** Evalúa todas las reglas y devuelve las alertas ordenadas (rojas primero). */
export function evaluarAlertas(ctx: ContextoAlertas): Alerta[] {
  return REGLAS.map((regla) => ({
    id: regla.id,
    titulo: regla.titulo,
    ...regla.evaluar(ctx),
  })).sort((a, b) => PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad]);
}
