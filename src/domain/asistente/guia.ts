/**
 * CAPA 3 — DOMINIO · Asistente IA · Guía de negocio para el text-to-SQL.
 *
 * Contexto explícito que se inyecta en el prompt de Claude para que NO invente
 * columnas (p. ej. `mes` en `pagos`, que no existe) y entienda qué tabla es la
 * fuente real de cada métrica. Es texto puro y versionado: cuando cambia el
 * modelo de datos, se actualiza acá.
 *
 * Soporta los dos motores: las notas y los ejemplos se generan según el
 * dialecto (SQLite usa strftime/date('now'); PostgreSQL usa to_char/INTERVAL).
 */

export type DialectoSql = 'sqlite' | 'postgres';

/** Fragmentos que difieren entre motores (el resto del texto es idéntico). */
const SQL_DIALECTO: Record<
  DialectoSql,
  { motor: string; filtroMes: string; ejemploMes: string; vencida60: string }
> = {
  sqlite: {
    motor: 'SQLite',
    filtroMes: "strftime('%Y-%m', fecha_pago) o substr(fecha_pago,1,7)",
    ejemploMes: "strftime('%Y-%m', fecha_pago) = '2026-05'",
    vencida60: "date(c.fecha_primera_cuota) < date('now','-60 day')",
  },
  postgres: {
    motor: 'PostgreSQL',
    filtroMes: "to_char(fecha_pago::date, 'YYYY-MM') o substr(fecha_pago,1,7)",
    ejemploMes: "substr(fecha_pago,1,7) = '2026-05'",
    vencida60: "c.fecha_primera_cuota::date < CURRENT_DATE - INTERVAL '60 days'",
  },
};

/** Notas de negocio sobre tablas y columnas clave (qué significa cada cosa). */
export function notasNegocio(dialecto: DialectoSql = 'sqlite'): string {
  const d = SQL_DIALECTO[dialecto];
  return `Notas importantes del modelo de datos (${d.motor}):

FUENTE DE VERDAD DEL CASH/FACTURACIÓN: la tabla "pagos" (cobros reales).
- pagos.monto_usd = dinero cobrado en USD (la facturación se suma de acá).
- pagos.monto_ars = dinero cobrado en ARS (puede ser NULL si no se cargó).
- pagos.fecha_pago = fecha del cobro, formato 'YYYY-MM-DD' (TEXT). NO existe una columna "mes" en pagos: para filtrar por mes usá ${d.filtroMes}.
- pagos.id_cierre referencia cierres.id_cierre. pagos.closer = quién cobró ese pago (puede diferir del closer del cierre).

CIERRES = las ventas/clientes. "cierres":
- cierres.cliente_nombre = nombre del cliente. cierres.fecha_cierre = 'YYYY-MM-DD'. cierres.ticket_total_usd = monto comprometido.
- cierres.programa ∈ ('Empresario','Cero a Gestor'). cierres.closer / cierres.setter = vendedor/setter de la venta.
- cierres.cantidad_cuotas (1..4) y cierres.monto_cuota_usd: plan de cuotas (NULL = venta sin plan, saldada).
- cierres.fecha_primera_cuota = vencimiento de la cuota 1. cierres.inactivo (0/1) = cliente dado de baja manual.

NO USAR para facturación: "ventas" y "cobros" son tablas LEGACY (suelen estar vacías). Usá SIEMPRE "pagos" para cash y "cierres" para ventas/clientes.

EGRESOS = gastos. "egresos": fecha (TEXT 'YYYY-MM-DD'), mes (TEXT 'YYYY-MM'), categoria, monto_usd, monto_ars, recurrente (0/1), tipo. "Retiros de socios" es distribución, no costo operativo.

CONCEPTOS DERIVADOS (no son columnas — se calculan):
- "LISTA NEGRA" / morosidad: un cierre con plan de cuotas cuya cuota más vieja impaga está vencida hace MÁS de 60 días respecto de hoy. No hay columna "lista_negra"; se calcula comparando el vencimiento de las cuotas (fecha_primera_cuota + (n-1) meses) contra la fecha de hoy y lo cobrado en "pagos". Para una aproximación simple en SQL: cierres con cantidad_cuotas IS NOT NULL, inactivo=0, cuyo saldo pendiente (ticket_total_usd − suma de pagos del cierre) > 0 y fecha_primera_cuota anterior a hace ~60 días.
- "PENDIENTE DE COBRANZA": para cada cierre con plan, ticket_total_usd − (suma de pagos.monto_usd de ese cierre). Solo cuenta cierres con inactivo=0.
- "CLOSER MÁS EFECTIVO": agrupar por closer y sumar monto_usd (de pagos para cash cobrado, o contar cierres para ventas).`;
}

/** Ejemplos de preguntas comunes → SQL correcta (few-shot). */
export function ejemplosSql(dialecto: DialectoSql = 'sqlite'): string {
  const d = SQL_DIALECTO[dialecto];
  return `Ejemplos de cómo se consultan cosas comunes (seguí estos patrones):

P: ¿Cuánto facturé en total?
SQL: SELECT SUM(monto_usd) AS facturacion_usd FROM pagos

P: ¿Cuánto facturé en mayo 2026?
SQL: SELECT SUM(monto_usd) AS facturacion_usd FROM pagos WHERE ${d.ejemploMes}

P: ¿Cuál es mi closer más efectivo? (por cash cobrado)
SQL: SELECT closer, SUM(monto_usd) AS cobrado_usd FROM pagos WHERE closer IS NOT NULL GROUP BY closer ORDER BY cobrado_usd DESC

P: ¿Cuántos cierres hubo por programa?
SQL: SELECT programa, COUNT(*) AS cantidad FROM cierres GROUP BY programa

P: ¿Cuánto tengo pendiente de cobranza?
SQL: SELECT SUM(c.ticket_total_usd - COALESCE((SELECT SUM(p.monto_usd) FROM pagos p WHERE p.id_cierre = c.id_cierre), 0)) AS pendiente_usd FROM cierres c WHERE c.cantidad_cuotas IS NOT NULL AND c.inactivo = 0

P: ¿Quiénes están en lista negra? (cuota vencida +60 días, con saldo)
SQL: SELECT c.cliente_nombre, c.ticket_total_usd - COALESCE((SELECT SUM(p.monto_usd) FROM pagos p WHERE p.id_cierre = c.id_cierre),0) AS saldo_usd, c.fecha_primera_cuota FROM cierres c WHERE c.cantidad_cuotas IS NOT NULL AND c.inactivo = 0 AND c.fecha_primera_cuota IS NOT NULL AND ${d.vencida60} AND (c.ticket_total_usd - COALESCE((SELECT SUM(p.monto_usd) FROM pagos p WHERE p.id_cierre = c.id_cierre),0)) > 0`;
}

/** Variantes SQLite (default histórico; los tests del dominio las cubren). */
export const NOTAS_NEGOCIO = notasNegocio('sqlite');
export const EJEMPLOS_SQL = ejemplosSql('sqlite');

/** Arma el bloque de contexto completo para el prompt de generación de SQL. */
export function contextoSql(esquemaReal: string, dialecto: DialectoSql = 'sqlite'): string {
  return [
    'ESQUEMA REAL (usá EXACTAMENTE estos nombres de tablas y columnas; no inventes otros):',
    esquemaReal,
    '',
    notasNegocio(dialecto),
    '',
    ejemplosSql(dialecto),
  ].join('\n');
}
