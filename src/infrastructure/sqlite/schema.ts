/**
 * CAPA 4 — INFRAESTRUCTURA · Esquema SQLite.
 *
 * Tres tablas transaccionales base + parámetros + funnel + cierre de mes.
 * Una fila = un evento atómico (mismo principio del Excel: Ventas ≠ Cobros
 * ≠ Caja son tres lentes distintos — R1).
 */
import type Database from 'better-sqlite3';

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ventas (
  id_venta        TEXT PRIMARY KEY,
  fecha_venta     TEXT NOT NULL,
  mes_venta       TEXT NOT NULL,
  cliente         TEXT,
  programa        TEXT NOT NULL CHECK(programa IN ('Empresario','Gestor')),
  closer          TEXT,
  setter          TEXT,
  funnel          TEXT,
  ticket_total_usd REAL NOT NULL,
  unidad_negocio  TEXT NOT NULL DEFAULT 'ACADEMY',
  estado          TEXT NOT NULL DEFAULT 'Activo'
);

CREATE TABLE IF NOT EXISTS cobros (
  id_cobro            TEXT PRIMARY KEY,
  id_venta_origen     TEXT REFERENCES ventas(id_venta),
  fecha_cobro         TEXT NOT NULL,
  mes_cobro           TEXT NOT NULL,
  mes_original_venta  TEXT NOT NULL,
  monto_usd           REAL NOT NULL,
  programa            TEXT NOT NULL DEFAULT 'Empresario' CHECK(programa IN ('Empresario','Gestor')),
  unidad_negocio      TEXT NOT NULL DEFAULT 'ACADEMY'
);

CREATE TABLE IF NOT EXISTS egresos (
  id_egreso       TEXT PRIMARY KEY,
  fecha           TEXT NOT NULL,
  mes             TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK(tipo IN ('Directo','Operativo','Extraordinario')),
  categoria       TEXT NOT NULL,
  concepto        TEXT,
  monto_usd       REAL NOT NULL,
  programa        TEXT CHECK(programa IN ('Empresario','Gestor')),
  unidad_negocio  TEXT NOT NULL DEFAULT 'ACADEMY'
);

CREATE TABLE IF NOT EXISTS funnel (
  mes             TEXT NOT NULL,
  unidad_negocio  TEXT NOT NULL DEFAULT 'ACADEMY',
  agendas         INTEGER NOT NULL DEFAULT 0,
  asistieron      INTEGER NOT NULL DEFAULT 0,
  cerrados        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mes, unidad_negocio)
);

CREATE TABLE IF NOT EXISTS parametros (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cierre_mes (
  mes     TEXT PRIMARY KEY,
  estado  TEXT NOT NULL DEFAULT 'Abierto' CHECK(estado IN ('Abierto','Cerrado'))
);

-- ───────── Módulo "Cierres y Clientes" (modelo canónico doble moneda) ─────────
-- Aditivo: no modifica las tablas previas. cierres ≈ ventas (más rico);
-- pagos ≈ cobros (superset con ARS). Un cierre tiene muchos pagos.
CREATE TABLE IF NOT EXISTS cierres (
  id_cierre        TEXT PRIMARY KEY,
  fecha_cierre     TEXT NOT NULL,
  cliente_nombre   TEXT NOT NULL,
  cliente_mail     TEXT,
  cliente_telefono TEXT,
  programa         TEXT NOT NULL CHECK(programa IN ('Cero a Gestor','Empresario')),
  ticket_total_usd REAL NOT NULL,
  closer           TEXT,
  setter           TEXT,
  funnel           TEXT,
  referido         TEXT,
  comentarios      TEXT,
  unidad_negocio   TEXT NOT NULL DEFAULT 'ACADEMY',
  estado           TEXT NOT NULL DEFAULT 'Activo' CHECK(estado IN ('Activo','No continúa')),
  revisar          TEXT
);

CREATE TABLE IF NOT EXISTS pagos (
  id_pago         TEXT PRIMARY KEY,
  id_cierre       TEXT NOT NULL REFERENCES cierres(id_cierre) ON DELETE CASCADE,
  fecha_pago      TEXT NOT NULL,
  hora_pago       TEXT,
  monto_usd       REAL NOT NULL,
  monto_ars       REAL,
  cotizacion      REAL,
  tipo_pago       TEXT NOT NULL CHECK(tipo_pago IN ('Reserva/Seña','Cuota','Pago Completo')),
  numero_cuota    TEXT,
  medio_pago      TEXT NOT NULL,
  comprobante_url TEXT,
  comentarios     TEXT,
  closer          TEXT
);

CREATE INDEX IF NOT EXISTS idx_cierres_fecha ON cierres(fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_pagos_cierre ON pagos(id_cierre);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago);


CREATE INDEX IF NOT EXISTS idx_ventas_mes ON ventas(mes_venta);
CREATE INDEX IF NOT EXISTS idx_cobros_mes ON cobros(mes_cobro);
CREATE INDEX IF NOT EXISTS idx_egresos_mes ON egresos(mes);
`;

export function migrar(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  // Migraciones aditivas para bases ya creadas (CREATE TABLE IF NOT EXISTS
  // no agrega columnas nuevas a tablas existentes).
  agregarColumnaSiFalta(db, 'cierres', 'revisar', 'TEXT');
  // Plan de cuotas (solo ventas nuevas). Cierres existentes quedan sin plan
  // = saldados/legacy, fuera del sistema de cobranza. La migración no los toca.
  agregarColumnaSiFalta(db, 'cierres', 'cantidad_cuotas', 'INTEGER');
  agregarColumnaSiFalta(db, 'cierres', 'monto_cuota_usd', 'REAL');
  agregarColumnaSiFalta(db, 'pagos', 'closer', 'TEXT');
  // Módulo Egresos: doble moneda + recurrente + medio/comentarios.
  agregarColumnaSiFalta(db, 'egresos', 'monto_ars', 'REAL');
  agregarColumnaSiFalta(db, 'egresos', 'cotizacion', 'REAL');
  agregarColumnaSiFalta(db, 'egresos', 'recurrente', 'INTEGER NOT NULL DEFAULT 0');
  agregarColumnaSiFalta(db, 'egresos', 'medio_pago', 'TEXT');
  agregarColumnaSiFalta(db, 'egresos', 'comentarios', 'TEXT');
  // Comisiones: flags de setting a nivel de pago + registro de liquidaciones.
  agregarColumnaSiFalta(db, 'pagos', 'aplica_setting', 'INTEGER NOT NULL DEFAULT 0');
  agregarColumnaSiFalta(db, 'pagos', 'setter', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS comisiones_liquidacion (
      mes               TEXT PRIMARY KEY,
      fecha_liquidacion TEXT NOT NULL,
      total_ars         REAL NOT NULL,
      total_usd         REAL NOT NULL,
      cotizacion        REAL,
      id_egreso         TEXT NOT NULL
    );
  `);
  // Funnel por canal: agendas/shows desglosados (el total = suma de canales).
  db.exec(`
    CREATE TABLE IF NOT EXISTS funnel_canal (
      mes        TEXT NOT NULL,
      canal      TEXT NOT NULL,
      agendas    INTEGER NOT NULL DEFAULT 0,
      asistieron INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (mes, canal)
    );
  `);
}

function agregarColumnaSiFalta(db: Database.Database, tabla: string, columna: string, tipo: string): void {
  const cols = db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
  }
}
