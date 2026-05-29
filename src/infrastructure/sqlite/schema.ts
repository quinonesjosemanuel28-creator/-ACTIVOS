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

CREATE INDEX IF NOT EXISTS idx_ventas_mes ON ventas(mes_venta);
CREATE INDEX IF NOT EXISTS idx_cobros_mes ON cobros(mes_cobro);
CREATE INDEX IF NOT EXISTS idx_egresos_mes ON egresos(mes);
`;

export function migrar(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
