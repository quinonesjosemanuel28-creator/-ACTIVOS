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
-- NOTA: si tenés un data/activos.db local creado ANTES del rol CONSULTOR (o
-- del OBSERVADOR, ticket 11A), ese archivo conserva el CHECK viejo (SQLite no
-- permite modificarlo). Borrá el .db y se regenera. Tests (:memory:) y
-- producción (PostgreSQL, con su bloque DO) siempre tienen la versión nueva.
CREATE TABLE IF NOT EXISTS usuarios (
  id                     TEXT PRIMARY KEY,
  email                  TEXT NOT NULL UNIQUE,
  nombre                 TEXT NOT NULL,
  rol                    TEXT NOT NULL CHECK(rol IN ('LECTOR','EDITOR','ADMIN','CONSULTOR','OBSERVADOR')),
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
  -- Ciclo de vida (ticket 7). CHECK porque es estructural, como diagnosticos.origen.
  estado               TEXT NOT NULL DEFAULT 'ACTIVO' CHECK(estado IN ('ACTIVO','PAUSADO','FINALIZADO','ABANDONADO')),
  estado_actualizado_en TEXT,
  -- Teléfono normalizado (ticket 7C): país sin '+', número solo dígitos.
  -- whatsapp (arriba) queda como texto libre del alumno; ESTOS arman wa.me.
  telefono_pais        TEXT,
  telefono_numero      TEXT,
  -- Última APERTURA del link de seguimiento (ticket 8). Junto al último
  -- check-in distingue "no abre" (se despegó) de "abre y no marca" (trabado
  -- en algo concreto): el mismo silencio admite dos mensajes distintos.
  ultimo_acceso_link   TEXT,
  id_cierre_vinculado  TEXT,
  -- Borrado LÓGICO (ticket 7): no null = papelera. TODA consulta del módulo
  -- filtra eliminado_en IS NULL; el borrado físico existe solo desde la
  -- papelera (ADMIN) y cascadea por las FKs.
  eliminado_en         TEXT,
  eliminado_por        TEXT REFERENCES usuarios(id),
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

  -- Metas del trimestre: alimentan las metas numéricas de los OKRs del plan.
  -- Sin par _sin_dato a propósito: son intenciones, no mediciones, y quedan
  -- fuera del índice de claridad (que se calcula sobre las 19 con casilla).
  meta_clientes_90d                INTEGER,
  meta_capital_90d                 REAL,
  meta_ganancia_90d                REAL,
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

-- ───────── Fase 2 del módulo: el plan de 90 días (ticket 6) ─────────
-- El plan entra pegando el bloque JSON que emite la skill (CONTRATO-PLAN.md).
-- Cargar un plan nuevo NO borra el anterior: un alumno acumula trimestres y
-- hay que poder compararlos. El vigente es el de fecha_inicio más reciente.

CREATE TABLE IF NOT EXISTS planes (
  id            TEXT PRIMARY KEY,
  alumno_id     TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  -- Arranque del trimestre. Las tres fases (1-30/31-60/61-90) se DERIVAN de
  -- acá: no se guardan fechas por fase.
  fecha_inicio  TEXT NOT NULL,
  etapa         TEXT,
  objetivo_90d  TEXT,
  -- Versión del contrato con el que se cargó (para migrar formatos viejos).
  version       INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS okrs (
  id        TEXT PRIMARY KEY,
  plan_id   TEXT NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  orden     INTEGER NOT NULL,
  objetivo  TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS krs (
  id        TEXT PRIMARY KEY,
  okr_id    TEXT NOT NULL REFERENCES okrs(id) ON DELETE CASCADE,
  orden     INTEGER NOT NULL,
  texto     TEXT NOT NULL,
  meta      TEXT,
  -- Ticket 9: tipo de KR. Las 'entregable' cierran solas (todas sus acciones
  -- ejecutadas); las 'metrica' cierran por valor contra metas 30/60/90.
  -- Metas y valores NUMÉRICOS: la comparación de cumplimiento tiene dos
  -- lados, y como TEXT '9' > '10'. El símbolo va en unidad.
  tipo      TEXT NOT NULL DEFAULT 'entregable' CHECK(tipo IN ('entregable','metrica')),
  valor_inicial REAL,
  meta_30   REAL,
  meta_60   REAL,
  meta_90   REAL,
  unidad    TEXT,
  direccion TEXT CHECK(direccion IS NULL OR direccion IN ('sube','baja')),
  -- Ticket 7: el cronograma del tablero. vencimiento lo fija el consultor (el
  -- contrato de la skill no trae fechas) y se desplaza junto con fecha_inicio;
  -- cumplido_en alimenta el semáforo de salud (avance = cumplidos/totales).
  vencimiento TEXT,
  cumplido_en TEXT,
  creado_en TEXT NOT NULL
);

-- El checklist del alumno: las acciones de la sección 6 del plan, por fase.
-- fase lleva CHECK porque es estructural (siempre 1/2/3), no opción de negocio.
CREATE TABLE IF NOT EXISTS acciones (
  id        TEXT PRIMARY KEY,
  plan_id   TEXT NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  okr_id    TEXT REFERENCES okrs(id),
  -- KR al que aporta (ticket 8): agrupa el checklist del alumno bajo su KR.
  -- Opcional en el contrato; sin él, la acción va a "Otras acciones".
  kr_id     TEXT REFERENCES krs(id),
  fase      INTEGER NOT NULL CHECK(fase IN (1, 2, 3)),
  orden     INTEGER NOT NULL,
  texto     TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

-- Tildes del alumno, APPEND-ONLY: cada marca/desmarca es una fila nueva, el
-- estado actual de una acción es su último checkin. Nunca se pierde historia
-- y el timestamp da la señal de ritmo sin modelar semanas.
CREATE TABLE IF NOT EXISTS checkins (
  id         TEXT PRIMARY KEY,
  accion_id  TEXT NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  -- LEGADO (ticket 9): derivado de estado, se SIGUE escribiendo para que un
  -- revert de código deje la app funcionando. Se borra un ticket después
  -- del switch del semáforo, junto con krs.cumplido_en.
  marcado    INTEGER NOT NULL,
  -- Ticket 9: pendiente → en_curso → ejecutado. NULLABLE a propósito: las
  -- filas previas se backfillean (idempotente) y se leen con fallback al
  -- booleano — NOT NULL DEFAULT pisaría la distinción "no migrada".
  estado     TEXT CHECK(estado IS NULL OR estado IN ('pendiente','en_curso','ejecutado')),
  -- Nota opcional del cambio. Append-only: cada nota es una fila nueva.
  nota       TEXT,
  origen     TEXT NOT NULL CHECK(origen IN ('alumno','consultor')),
  -- Quién, cuando origen = 'consultor'. Null cuando marca el alumno.
  usuario_id TEXT REFERENCES usuarios(id),
  creado_en  TEXT NOT NULL
);

-- Mediciones de KRs métrica (ticket 9), APPEND-ONLY como los checkins: cada
-- carga es una fila nueva — la serie completa es la historia del número.
CREATE TABLE IF NOT EXISTS mediciones (
  id          TEXT PRIMARY KEY,
  kr_id       TEXT NOT NULL REFERENCES krs(id) ON DELETE CASCADE,
  valor       REAL NOT NULL,
  origen      TEXT NOT NULL CHECK(origen IN ('alumno','consultor')),
  usuario_id  TEXT REFERENCES usuarios(id),
  cargado_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mediciones_kr ON mediciones(kr_id);

-- Resoluciones de nota (ticket 10A), APPEND-ONLY: el "estado actual" de una
-- nota se DERIVA — gana la resolución más nueva de su checkin; sin filas, la
-- nota está abierta. Corregir una devolución = agregar otra resolución, nunca
-- editar. estado y area SIN CHECK: opciones de negocio, se validan en Zod
-- (misma convención que contactos.canal).
CREATE TABLE IF NOT EXISTS nota_resoluciones (
  id          TEXT PRIMARY KEY,
  checkin_id  TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  estado      TEXT NOT NULL,
  area        TEXT,
  devolucion  TEXT,
  usuario_id  TEXT NOT NULL REFERENCES usuarios(id),
  creada_en   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nota_res_checkin ON nota_resoluciones(checkin_id);

-- Bitácora del consultor (ticket 10B), APPEND-ONLY: la historia del alumno
-- no se edita ni se borra — si algo cambia, se agrega una entrada. NUNCA se
-- consulta desde el endpoint público del link: acá vive lenguaje interno.
-- tipo_contacto sin CHECK: opción de negocio, se valida en Zod. El CASCADE
-- es lo que deja funcionar la purga definitiva de la papelera.
CREATE TABLE IF NOT EXISTS bitacora (
  id             TEXT PRIMARY KEY,
  alumno_id      TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  texto          TEXT NOT NULL,
  tipo_contacto  TEXT NOT NULL,
  traba_actual   TEXT,
  usuario_id     TEXT NOT NULL REFERENCES usuarios(id),
  creada_en      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bitacora_alumno ON bitacora(alumno_id);

CREATE INDEX IF NOT EXISTS idx_planes_alumno   ON planes(alumno_id);
CREATE INDEX IF NOT EXISTS idx_okrs_plan       ON okrs(plan_id);
CREATE INDEX IF NOT EXISTS idx_krs_okr         ON krs(okr_id);
CREATE INDEX IF NOT EXISTS idx_acciones_plan   ON acciones(plan_id);
CREATE INDEX IF NOT EXISTS idx_checkins_accion ON checkins(accion_id);

-- Link de seguimiento: la credencial del alumno para tildar su checklist.
-- REUSABLE, a diferencia del token de diagnóstico (aquel es de un solo uso y
-- 30 días; este vive en la conversación de WhatsApp durante el trimestre).
-- ESTABLE: volver a pedirlo devuelve el vigente — solo revocar genera otro.
-- Revocable desde el panel por si el link se filtra.
CREATE TABLE IF NOT EXISTS seguimiento_tokens (
  token        TEXT PRIMARY KEY,
  plan_id      TEXT NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  expira_en    TEXT NOT NULL,
  revocado_en  TEXT,
  creado_en    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_plan ON seguimiento_tokens(plan_id);

-- Auditoría de cambios de fecha_inicio (ticket 7): la fecha es el origen del
-- cálculo de fase y salud — moverla sin rastro dejaría un semáforo imposible
-- de explicar. Cada cambio desplaza además los vencimientos de los KRs.
CREATE TABLE IF NOT EXISTS plan_fecha_historial (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  fecha_anterior  TEXT NOT NULL,
  fecha_nueva     TEXT NOT NULL,
  cambiado_por    TEXT NOT NULL REFERENCES usuarios(id),
  cambiado_en     TEXT NOT NULL,
  motivo          TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_fecha_historial ON plan_fecha_historial(plan_id);

-- El documento del plan (.pdf/.docx), ticket 7B. El contenido va EN LA BASE
-- (BLOB acá, BYTEA en el espejo: la excepción de tipo por motor, como
-- REAL ↔ DOUBLE PRECISION): el filesystem de Railway es efímero y en la base
-- el documento viaja con el backup. Versionado simple: se acumulan por plan y
-- el vigente es el último subido — nunca se pisa el anterior.
CREATE TABLE IF NOT EXISTS plan_documentos (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  nombre_archivo  TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  contenido       BLOB NOT NULL,
  tamano_bytes    INTEGER NOT NULL,
  subido_por      TEXT NOT NULL REFERENCES usuarios(id),
  subido_en       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_documentos ON plan_documentos(plan_id);

-- Registro de contacto (ticket 7C): el consultor tocó al alumno (WhatsApp).
-- Se inserta ANTES de abrir el link, y es lo que APAGA la alerta de
-- inactividad. Append-only como los checkins: la historia de seguimiento no
-- se edita. canal sin CHECK: opción de negocio (hoy WhatsApp), valida Zod.
CREATE TABLE IF NOT EXISTS contactos (
  id             TEXT PRIMARY KEY,
  alumno_id      TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  consultor_id   TEXT NOT NULL REFERENCES usuarios(id),
  canal          TEXT NOT NULL,
  contactado_en  TEXT NOT NULL,
  nota           TEXT
);

CREATE INDEX IF NOT EXISTS idx_contactos_alumno ON contactos(alumno_id);


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
  // Módulo de alumnos · metas a 90 días (ticket 5). Aditivas: una base local
  // creada con el ticket 1 no tiene estas columnas.
  agregarColumnaSiFalta(db, 'diagnosticos', 'meta_clientes_90d', 'INTEGER');
  agregarColumnaSiFalta(db, 'diagnosticos', 'meta_capital_90d', 'REAL');
  agregarColumnaSiFalta(db, 'diagnosticos', 'meta_ganancia_90d', 'REAL');
  // Módulo de alumnos · panel de control (ticket 7): estado del alumno,
  // borrado lógico y cronograma/cumplimiento de KRs.
  agregarColumnaSiFalta(db, 'alumnos', 'estado', "TEXT NOT NULL DEFAULT 'ACTIVO' CHECK(estado IN ('ACTIVO','PAUSADO','FINALIZADO','ABANDONADO'))");
  agregarColumnaSiFalta(db, 'alumnos', 'estado_actualizado_en', 'TEXT');
  agregarColumnaSiFalta(db, 'alumnos', 'eliminado_en', 'TEXT');
  agregarColumnaSiFalta(db, 'alumnos', 'eliminado_por', 'TEXT REFERENCES usuarios(id)');
  agregarColumnaSiFalta(db, 'krs', 'vencimiento', 'TEXT');
  agregarColumnaSiFalta(db, 'krs', 'cumplido_en', 'TEXT');
  // Módulo de alumnos · seguimiento activo (ticket 7C): teléfono en dos campos.
  agregarColumnaSiFalta(db, 'alumnos', 'telefono_pais', 'TEXT');
  agregarColumnaSiFalta(db, 'alumnos', 'telefono_numero', 'TEXT');
  // Módulo de alumnos · vista del alumno (ticket 8): última apertura del link
  // y el KR de cada acción (agrupa el checklist del alumno).
  agregarColumnaSiFalta(db, 'alumnos', 'ultimo_acceso_link', 'TEXT');
  agregarColumnaSiFalta(db, 'acciones', 'kr_id', 'TEXT REFERENCES krs(id)');
  // Módulo de alumnos · medición automática (ticket 9A): tipo de KR con metas
  // numéricas, y checkins con estado/nota/autor. Aditivo puro.
  agregarColumnaSiFalta(db, 'krs', 'tipo', "TEXT NOT NULL DEFAULT 'entregable' CHECK(tipo IN ('entregable','metrica'))");
  agregarColumnaSiFalta(db, 'krs', 'valor_inicial', 'REAL');
  agregarColumnaSiFalta(db, 'krs', 'meta_30', 'REAL');
  agregarColumnaSiFalta(db, 'krs', 'meta_60', 'REAL');
  agregarColumnaSiFalta(db, 'krs', 'meta_90', 'REAL');
  agregarColumnaSiFalta(db, 'krs', 'unidad', 'TEXT');
  agregarColumnaSiFalta(db, 'krs', 'direccion', "TEXT CHECK(direccion IS NULL OR direccion IN ('sube','baja'))");
  agregarColumnaSiFalta(db, 'checkins', 'estado', "TEXT CHECK(estado IS NULL OR estado IN ('pendiente','en_curso','ejecutado'))");
  agregarColumnaSiFalta(db, 'checkins', 'nota', 'TEXT');
  agregarColumnaSiFalta(db, 'checkins', 'usuario_id', 'TEXT REFERENCES usuarios(id)');
  // Backfill de DATOS (no solo esquema), idempotente por el WHERE: los
  // checkins previos al ticket 9 ganan su estado desde el booleano legado.
  db.exec(`
    UPDATE checkins
       SET estado = CASE WHEN marcado = 1 THEN 'ejecutado' ELSE 'pendiente' END
     WHERE estado IS NULL;
  `);
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
