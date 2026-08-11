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

-- ───────── Auth: usuarios y sesiones (login multi-usuario) ─────────
-- NOTA: si tenés un data/activos.db local creado ANTES del rol CONSULTOR, ese
-- archivo conserva el CHECK viejo (SQLite no permite modificarlo). Borrá el
-- .db y se regenera. Tests (:memory:) y producción (PostgreSQL, con su bloque
-- DO) siempre tienen la versión nueva.
CREATE TABLE IF NOT EXISTS usuarios (
  id                     TEXT PRIMARY KEY,
  email                  TEXT NOT NULL UNIQUE,
  nombre                 TEXT NOT NULL,
  rol                    TEXT NOT NULL CHECK(rol IN ('LECTOR','EDITOR','ADMIN','CONSULTOR')),
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
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(id_usuario);

-- ═════════ Módulo de gestión de alumnos (consultorías 1 a 1) ═════════
-- Espejo EXACTO del bloque en postgres/schema.ts (REAL ↔ DOUBLE PRECISION).
-- Fase 1 solamente; planes/okrs/tareas/checkins se crean en fase 2.
-- Sin FK hacia el contable a propósito. Nombres = contrato con la skill
-- plan-okr-90-dias. Opciones de negocio se validan en Zod, no con CHECK.

CREATE TABLE IF NOT EXISTS alumnos (
  id                   TEXT PRIMARY KEY,
  consultor_id         TEXT NOT NULL REFERENCES usuarios(id),
  nombre               TEXT NOT NULL,
  edad                 INTEGER,
  zona                 TEXT,
  whatsapp             TEXT,
  marca_comercial      TEXT,
  programa             TEXT NOT NULL,
  canal_origen         TEXT,
  moneda               TEXT NOT NULL DEFAULT 'ARS',
  activo               INTEGER NOT NULL DEFAULT 1,
  id_cierre_vinculado  TEXT,
  creado_en            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnosticos (
  id                      TEXT PRIMARY KEY,
  alumno_id               TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  fecha                   TEXT NOT NULL,
  origen                  TEXT NOT NULL CHECK(origen IN ('alumno','consultor')),
  editado_por_consultor   INTEGER NOT NULL DEFAULT 0,
  programa                TEXT NOT NULL,
  moneda                  TEXT NOT NULL,
  indice_claridad         INTEGER,
  metricas_aplicables     INTEGER NOT NULL DEFAULT 0,
  metricas_respondidas    INTEGER NOT NULL DEFAULT 0,

  antiguedad_meses            INTEGER,
  tipo_dedicacion             TEXT,
  objetivo_6m                 TEXT,
  vision_negocio              TEXT,
  bloqueo_principal           TEXT,

  capital_colocado                 REAL,
  capital_colocado_sin_dato        INTEGER NOT NULL DEFAULT 0,
  origen_capital                   TEXT,
  costo_capital_mensual            REAL,
  costo_capital_mensual_sin_dato   INTEGER NOT NULL DEFAULT 0,
  capital_disponible               REAL,
  capital_disponible_sin_dato      INTEGER NOT NULL DEFAULT 0,
  recupero_mensual                 REAL,
  recupero_mensual_sin_dato        INTEGER NOT NULL DEFAULT 0,
  separacion_dinero                TEXT,
  ganancia_mensual                 REAL,
  ganancia_mensual_sin_dato        INTEGER NOT NULL DEFAULT 0,
  retiro_mensual                   REAL,
  retiro_mensual_sin_dato          INTEGER NOT NULL DEFAULT 0,
  gastos_operativos                REAL,
  gastos_operativos_sin_dato       INTEGER NOT NULL DEFAULT 0,

  clientes_activos                 INTEGER,
  clientes_activos_sin_dato        INTEGER NOT NULL DEFAULT 0,
  clientes_nuevos_mes              INTEGER,
  clientes_nuevos_mes_sin_dato     INTEGER NOT NULL DEFAULT 0,
  ticket_promedio                  REAL,
  ticket_promedio_sin_dato         INTEGER NOT NULL DEFAULT 0,
  estructura_plazos                TEXT,
  plazo_promedio_meses             REAL,
  plazo_promedio_meses_sin_dato    INTEGER NOT NULL DEFAULT 0,
  perfil_cliente                   TEXT,
  recurrencia                      REAL,
  recurrencia_sin_dato             INTEGER NOT NULL DEFAULT 0,

  tasa_declarada                   TEXT,
  tasa_declarada_sin_dato          INTEGER NOT NULL DEFAULT 0,
  ejemplo_total_100k               REAL,
  ejemplo_total_100k_sin_dato      INTEGER NOT NULL DEFAULT 0,
  punitorio                        TEXT,
  punitorio_sin_dato               INTEGER NOT NULL DEFAULT 0,
  tasa_competencia                 TEXT,
  tasa_competencia_sin_dato        INTEGER NOT NULL DEFAULT 0,

  documentacion_solicitada         TEXT,
  firma_documentacion              TEXT,
  porcentaje_documentado           REAL,
  porcentaje_documentado_sin_dato  INTEGER NOT NULL DEFAULT 0,
  criterio_monto                   TEXT,
  criterios_aprobacion             TEXT,
  herramienta_consulta             TEXT,
  politica_garantias               TEXT,

  mora_clientes                    REAL,
  mora_clientes_sin_dato           INTEGER NOT NULL DEFAULT 0,
  monto_en_mora                    REAL,
  monto_en_mora_sin_dato           INTEGER NOT NULL DEFAULT 0,
  proceso_cobranza                 TEXT,
  descripcion_cobranza             TEXT,
  dificultad_cobranza              TEXT,

  sistema_registro                 TEXT,
  canales_captacion                TEXT,
  equipo                           TEXT,
  situacion_fiscal                 TEXT,
  unidad_ventas                    TEXT,
  prioridad_declarada              TEXT,

  vision_12m                       TEXT,
  freno_percibido                  TEXT,

  creado_en                        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostico_tokens (
  token           TEXT PRIMARY KEY,
  alumno_id       TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  expira_en       TEXT NOT NULL,
  usado_en        TEXT,
  diagnostico_id  TEXT,
  creado_en       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alumno_consultor_historial (
  id            TEXT PRIMARY KEY,
  alumno_id     TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  consultor_id  TEXT NOT NULL REFERENCES usuarios(id),
  desde         TEXT NOT NULL,
  hasta         TEXT,
  creado_en     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alumnos_consultor   ON alumnos(consultor_id);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_alumno ON diagnosticos(alumno_id);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_fecha  ON diagnosticos(fecha);
CREATE INDEX IF NOT EXISTS idx_tokens_alumno       ON diagnostico_tokens(alumno_id);
CREATE INDEX IF NOT EXISTS idx_historial_alumno    ON alumno_consultor_historial(alumno_id);


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
  agregarColumnaSiFalta(db, 'cierres', 'fecha_primera_cuota', 'TEXT');
  agregarColumnaSiFalta(db, 'cierres', 'inactivo', 'INTEGER NOT NULL DEFAULT 0');
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
