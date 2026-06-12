/**
 * CAPA 4 — INFRAESTRUCTURA · Esquema PostgreSQL.
 *
 * Espejo del esquema SQLite (src/infrastructure/sqlite/schema.ts) traducido:
 *   - REAL → DOUBLE PRECISION (números JS sin conversión de strings).
 *   - Flags 0/1 se mantienen como INTEGER (mismo mapeo de filas que SQLite,
 *     y la copia de datos SQLite→PG es 1:1 sin transformar).
 *   - Migraciones aditivas con ALTER TABLE ... ADD COLUMN IF NOT EXISTS
 *     (en SQLite se hace con PRAGMA table_info).
 */
import type { Pool } from 'pg';

export const SCHEMA_SQL_PG = `
CREATE TABLE IF NOT EXISTS ventas (
  id_venta         TEXT PRIMARY KEY,
  fecha_venta      TEXT NOT NULL,
  mes_venta        TEXT NOT NULL,
  cliente          TEXT,
  programa         TEXT NOT NULL CHECK(programa IN ('Empresario','Gestor')),
  closer           TEXT,
  setter           TEXT,
  funnel           TEXT,
  ticket_total_usd DOUBLE PRECISION NOT NULL,
  unidad_negocio   TEXT NOT NULL DEFAULT 'ACADEMY',
  estado           TEXT NOT NULL DEFAULT 'Activo'
);

CREATE TABLE IF NOT EXISTS cobros (
  id_cobro            TEXT PRIMARY KEY,
  id_venta_origen     TEXT REFERENCES ventas(id_venta),
  fecha_cobro         TEXT NOT NULL,
  mes_cobro           TEXT NOT NULL,
  mes_original_venta  TEXT NOT NULL,
  monto_usd           DOUBLE PRECISION NOT NULL,
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
  monto_usd       DOUBLE PRECISION NOT NULL,
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
CREATE TABLE IF NOT EXISTS cierres (
  id_cierre        TEXT PRIMARY KEY,
  fecha_cierre     TEXT NOT NULL,
  cliente_nombre   TEXT NOT NULL,
  cliente_mail     TEXT,
  cliente_telefono TEXT,
  programa         TEXT NOT NULL CHECK(programa IN ('Cero a Gestor','Empresario')),
  ticket_total_usd DOUBLE PRECISION NOT NULL,
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
  monto_usd       DOUBLE PRECISION NOT NULL,
  monto_ars       DOUBLE PRECISION,
  cotizacion      DOUBLE PRECISION,
  tipo_pago       TEXT NOT NULL CHECK(tipo_pago IN ('Reserva/Seña','Cuota','Pago Completo')),
  numero_cuota    TEXT,
  medio_pago      TEXT NOT NULL,
  comprobante_url TEXT,
  comentarios     TEXT,
  closer          TEXT
);

CREATE TABLE IF NOT EXISTS comisiones_liquidacion (
  mes               TEXT PRIMARY KEY,
  fecha_liquidacion TEXT NOT NULL,
  total_ars         DOUBLE PRECISION NOT NULL,
  total_usd         DOUBLE PRECISION NOT NULL,
  cotizacion        DOUBLE PRECISION,
  id_egreso         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS funnel_canal (
  mes        TEXT NOT NULL,
  canal      TEXT NOT NULL,
  agendas    INTEGER NOT NULL DEFAULT 0,
  asistieron INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mes, canal)
);

-- ───────── Auth: usuarios y sesiones (login multi-usuario, 3 roles) ─────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                     TEXT PRIMARY KEY,
  email                  TEXT NOT NULL UNIQUE,
  nombre                 TEXT NOT NULL,
  rol                    TEXT NOT NULL CHECK(rol IN ('LECTOR','EDITOR','ADMIN')),
  password_hash          TEXT NOT NULL,
  activo                 INTEGER NOT NULL DEFAULT 1,
  debe_cambiar_password  INTEGER NOT NULL DEFAULT 0,
  creado_en              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token       TEXT PRIMARY KEY,
  id_usuario  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en   TEXT NOT NULL,
  creada_en   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cierres_fecha ON cierres(fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_pagos_cierre ON pagos(id_cierre);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_ventas_mes ON ventas(mes_venta);
CREATE INDEX IF NOT EXISTS idx_cobros_mes ON cobros(mes_cobro);
CREATE INDEX IF NOT EXISTS idx_egresos_mes ON egresos(mes);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(id_usuario);

-- Migraciones aditivas (mismas que en SQLite, para bases ya creadas).
ALTER TABLE cierres ADD COLUMN IF NOT EXISTS cantidad_cuotas INTEGER;
ALTER TABLE cierres ADD COLUMN IF NOT EXISTS monto_cuota_usd DOUBLE PRECISION;
ALTER TABLE cierres ADD COLUMN IF NOT EXISTS fecha_primera_cuota TEXT;
ALTER TABLE cierres ADD COLUMN IF NOT EXISTS inactivo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pagos   ADD COLUMN IF NOT EXISTS aplica_setting INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pagos   ADD COLUMN IF NOT EXISTS setter TEXT;
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS monto_ars DOUBLE PRECISION;
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS cotizacion DOUBLE PRECISION;
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS recurrente INTEGER NOT NULL DEFAULT 0;
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS medio_pago TEXT;
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS comentarios TEXT;
`;

export async function migrarPg(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL_PG);
}
