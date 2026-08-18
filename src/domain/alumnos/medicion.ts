/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Cierre de KRs y mediciones (ticket 9B).
 *
 * El cierre de una KR es un CÁLCULO, no un estado pegado:
 *
 *  - `entregable`: cumplida cuando TODAS sus acciones están en `ejecutado`.
 *    Si una acción se destilda, se reabre sola. Sin acciones vinculadas no
 *    puede cerrar nunca — el plan la declara pero no la ejecuta.
 *  - `metrica`: cumplida cuando el valor más reciente alcanza `meta_90` EN LA
 *    DIRECCIÓN correcta (la mora baja, los clientes suben). Sin mediciones no
 *    se asume nada: ni arrancó ni fracasó.
 *
 * El tilde manual del ticket 7 (`cumplido_en`) se HONRA como legado: el
 * trabajo de tildar KRs en la migración de planes no se pierde. Una KR con
 * tilde legado queda cumplida aunque sus acciones no estén marcadas — pero el
 * tilde ya no se escribe más: las cumplidas nuevas son derivadas o por valor.
 *
 * Nada de esto toca el semáforo (sigue sobre cumplido_en hasta el switch de
 * 9C). Es el contador de RESULTADO, sin color.
 */
import { estadoDe, type Checkin, type Kr, type Medicion, type PlanCompleto } from './plan';

/** El valor vigente de una métrica: la medición más reciente. */
export function valorActual(mediciones: readonly Medicion[]): number | null {
  let ultima: Medicion | null = null;
  for (const m of mediciones) {
    if (ultima === null || m.cargadoEn > ultima.cargadoEn) ultima = m;
  }
  return ultima?.valor ?? null;
}

/**
 * ¿El valor ALCANZA la meta en la dirección correcta? Con 'baja' y meta 10:
 * 9 cumple, 10 cumple (alcanzó), 11 no. Con 'sube' y meta 30: 31 sí, 29 no.
 */
export function metaAlcanzada(direccion: 'sube' | 'baja', valor: number, meta: number): boolean {
  return direccion === 'baja' ? valor <= meta : valor >= meta;
}

/** Por qué una KR está cumplida (el panel lo muestra distinto). */
export type MotivoCumplida = 'derivada' | 'tilde_legado' | 'valor';

export interface EstadoKr {
  krId: string;
  tipo: Kr['tipo'];
  cumplida: boolean;
  motivo: MotivoCumplida | null;
  /** Entregable declarada sin ninguna acción que la referencie: nunca cierra. */
  sinAcciones: boolean;
  ejecutadas: number;
  totalAcciones: number;
  /** Métrica: el valor más reciente. Null = sin mediciones ("sin datos"). */
  valorActual: number | null;
}

/**
 * El estado derivado de TODOS los KRs de un plan, de una pasada. Puro: recibe
 * el agregado, los checkins y las mediciones; no consulta nada.
 */
export function estadosDeKrs(
  pc: Pick<PlanCompleto, 'okrs' | 'acciones'>,
  checkins: readonly Checkin[],
  mediciones: readonly Medicion[],
): EstadoKr[] {
  // Estado efectivo por acción: gana el checkin más nuevo (append-only).
  const ultimo = new Map<string, Checkin>();
  for (const c of checkins) {
    const previo = ultimo.get(c.accionId);
    if (!previo || c.creadoEn > previo.creadoEn) ultimo.set(c.accionId, c);
  }
  const ejecutada = (accionId: string): boolean => {
    const c = ultimo.get(accionId);
    return c !== undefined && estadoDe(c) === 'ejecutado';
  };

  const porKr = new Map<string, string[]>(); // krId → ids de acciones
  for (const a of pc.acciones) {
    if (a.krId !== null) porKr.set(a.krId, [...(porKr.get(a.krId) ?? []), a.id]);
  }
  const medicionesPorKr = new Map<string, Medicion[]>();
  for (const m of mediciones) {
    medicionesPorKr.set(m.krId, [...(medicionesPorKr.get(m.krId) ?? []), m]);
  }

  return pc.okrs.flatMap((o) =>
    o.krs.map((kr): EstadoKr => {
      const acciones = porKr.get(kr.id) ?? [];
      const ejecutadas = acciones.filter(ejecutada).length;
      const legado = kr.cumplidoEn !== null;

      if (kr.tipo === 'metrica') {
        const valor = valorActual(medicionesPorKr.get(kr.id) ?? []);
        const porValor =
          valor !== null && kr.meta90 !== null && kr.direccion !== null && metaAlcanzada(kr.direccion, valor, kr.meta90);
        return {
          krId: kr.id,
          tipo: 'metrica',
          cumplida: porValor || legado,
          motivo: porValor ? 'valor' : legado ? 'tilde_legado' : null,
          sinAcciones: false, // una métrica cierra por valor: sin acciones no es anomalía
          ejecutadas,
          totalAcciones: acciones.length,
          valorActual: valor,
        };
      }

      const derivada = acciones.length > 0 && ejecutadas === acciones.length;
      return {
        krId: kr.id,
        tipo: 'entregable',
        cumplida: derivada || legado,
        motivo: derivada ? 'derivada' : legado ? 'tilde_legado' : null,
        sinAcciones: acciones.length === 0,
        ejecutadas,
        totalAcciones: acciones.length,
        valorActual: null,
      };
    }),
  );
}

/**
 * Progreso de una métrica para la vista del ALUMNO (ticket 9D §8.6): si el
 * valor se movió en la dirección correcta desde el arranque, `mejoro` con el
 * `delta` en unidades para decir "bajó 6 puntos desde que arrancaste". Si no
 * se movió (o fue para el otro lado), mejoro=false y la vista muestra el
 * número solo, SIN comentario — nunca "no llegaste", nunca rojo.
 */
export function progresoMetrica(
  direccion: 'sube' | 'baja',
  valorInicial: number,
  valorActual: number,
): { mejoro: boolean; delta: number } {
  const mejoro = direccion === 'baja' ? valorActual < valorInicial : valorActual > valorInicial;
  return { mejoro, delta: Math.abs(valorActual - valorInicial) };
}
