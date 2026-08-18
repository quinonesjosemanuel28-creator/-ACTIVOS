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

-- ═════════ Módulo de gestión de alumnos (consultorías 1 a 1) ═════════
-- Fase 1: alumnos, diagnósticos, tokens e historial de reasignación.
-- Las tablas de fase 2 (planes, okrs, tareas, checkins) NO se crean todavía.
-- Universo separado del contable: sin FK hacia cierres/pagos a propósito
-- (un consultor nunca debe poder navegar de un alumno a la facturación).
-- Los nombres de campo son contrato con la skill plan-okr-90-dias: no renombrar.
-- Las listas de opciones de negocio (programa, canal, moneda…) se validan en
-- Zod (capa de aplicación), NO con CHECK: van a crecer y un CHECK en una tabla
-- viva es caro de cambiar. Solo lleva CHECK lo estructural.

CREATE TABLE IF NOT EXISTS alumnos (
  id                   TEXT PRIMARY KEY,
  consultor_id         TEXT NOT NULL REFERENCES usuarios(id),
  -- Bloque 0 — identificación (ficha editable; lo que cambia con el tiempo
  -- queda fotografiado por diagnóstico: ver diagnosticos.programa/moneda)
  nombre               TEXT NOT NULL,
  edad                 INTEGER,
  zona                 TEXT,
  whatsapp             TEXT,
  marca_comercial      TEXT,
  programa             TEXT NOT NULL,
  canal_origen         TEXT,
  -- Moneda de TODOS los montos de sus diagnósticos (ISO 4217: ARS, COP, CLP,
  -- PEN, MXN, UYU…). Sin ella, un promedio de cohorte suma monedas distintas.
  moneda               TEXT NOT NULL DEFAULT 'ARS',
  -- Baja lógica, mismo patrón que usuarios.activo
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
  -- Vínculo futuro con el contable. SIN foreign key a propósito: no debe
  -- existir camino navegable desde un alumno hacia la facturación.
  id_cierre_vinculado  TEXT,
  -- Borrado LÓGICO (ticket 7): no null = papelera. TODA consulta del módulo
  -- filtra eliminado_en IS NULL; el borrado físico existe solo desde la
  -- papelera (ADMIN) y cascadea por las FKs.
  eliminado_en         TEXT,
  eliminado_por        TEXT REFERENCES usuarios(id),
  creado_en            TEXT NOT NULL
);

-- Un registro por envío del formulario. NUNCA se sobrescribe: el diagnóstico
-- inicial y el de los 90 días conviven para poder compararlos.
-- programa y moneda se fotografían al enviar: la ficha del alumno es editable
-- (replanificaciones, cambio de programa o de país) sin reinterpretar
-- diagnósticos viejos.
CREATE TABLE IF NOT EXISTS diagnosticos (
  id                      TEXT PRIMARY KEY,
  alumno_id               TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  fecha                   TEXT NOT NULL,
  origen                  TEXT NOT NULL CHECK(origen IN ('alumno','consultor')),
  editado_por_consultor   INTEGER NOT NULL DEFAULT 0,
  programa                TEXT NOT NULL,
  moneda                  TEXT NOT NULL,
  -- Índice de claridad: % de las 19 métricas con casilla que respondió con
  -- dato, sobre las aplicables. NULL si no respondió ninguna (nunca 0: cero
  -- significaría "midió y le dio 0", que es otra cosa).
  indice_claridad         INTEGER,
  metricas_aplicables     INTEGER NOT NULL DEFAULT 0,
  metricas_respondidas    INTEGER NOT NULL DEFAULT 0,

  -- Bloque 1 — Diagnóstico general
  antiguedad_meses            INTEGER,
  tipo_dedicacion             TEXT,
  objetivo_6m                 TEXT,
  vision_negocio              TEXT,
  bloqueo_principal           TEXT,

  -- Bloque 2 — Capital y rentabilidad. Cada métrica con casilla "No lo tengo
  -- claro" son DOS campos: el valor (nullable) y <campo>_sin_dato. Mora en 0
  -- es cartera sana; mora sin dato es un alumno que no mide. No mezclar.
  capital_colocado                 DOUBLE PRECISION,
  capital_colocado_sin_dato        INTEGER NOT NULL DEFAULT 0,
  origen_capital                   TEXT,
  costo_capital_mensual            DOUBLE PRECISION,
  costo_capital_mensual_sin_dato   INTEGER NOT NULL DEFAULT 0,
  capital_disponible               DOUBLE PRECISION,
  capital_disponible_sin_dato      INTEGER NOT NULL DEFAULT 0,
  recupero_mensual                 DOUBLE PRECISION,
  recupero_mensual_sin_dato        INTEGER NOT NULL DEFAULT 0,
  separacion_dinero                TEXT,
  ganancia_mensual                 DOUBLE PRECISION,
  ganancia_mensual_sin_dato        INTEGER NOT NULL DEFAULT 0,
  retiro_mensual                   DOUBLE PRECISION,
  retiro_mensual_sin_dato          INTEGER NOT NULL DEFAULT 0,
  gastos_operativos                DOUBLE PRECISION,
  gastos_operativos_sin_dato       INTEGER NOT NULL DEFAULT 0,

  -- Bloque 3 — Clientes y cartera
  clientes_activos                 INTEGER,
  clientes_activos_sin_dato        INTEGER NOT NULL DEFAULT 0,
  clientes_nuevos_mes              INTEGER,
  clientes_nuevos_mes_sin_dato     INTEGER NOT NULL DEFAULT 0,
  ticket_promedio                  DOUBLE PRECISION,
  ticket_promedio_sin_dato         INTEGER NOT NULL DEFAULT 0,
  estructura_plazos                TEXT,
  plazo_promedio_meses             DOUBLE PRECISION,
  plazo_promedio_meses_sin_dato    INTEGER NOT NULL DEFAULT 0,
  perfil_cliente                   TEXT,
  recurrencia                      DOUBLE PRECISION,
  recurrencia_sin_dato             INTEGER NOT NULL DEFAULT 0,

  -- Bloque 4 — Precio y condiciones. tasa_declarada, punitorio y
  -- tasa_competencia son texto pero llevan casilla igual: entran en el índice.
  tasa_declarada                   TEXT,
  tasa_declarada_sin_dato          INTEGER NOT NULL DEFAULT 0,
  ejemplo_total_100k               DOUBLE PRECISION,
  ejemplo_total_100k_sin_dato      INTEGER NOT NULL DEFAULT 0,
  punitorio                        TEXT,
  punitorio_sin_dato               INTEGER NOT NULL DEFAULT 0,
  tasa_competencia                 TEXT,
  tasa_competencia_sin_dato        INTEGER NOT NULL DEFAULT 0,

  -- Bloque 5 — Aprobación y riesgo
  documentacion_solicitada         TEXT,
  firma_documentacion              TEXT,
  porcentaje_documentado           DOUBLE PRECISION,
  porcentaje_documentado_sin_dato  INTEGER NOT NULL DEFAULT 0,
  criterio_monto                   TEXT,
  criterios_aprobacion             TEXT,
  herramienta_consulta             TEXT,
  politica_garantias               TEXT,

  -- Bloque 6 — Cobranza y mora
  mora_clientes                    DOUBLE PRECISION,
  mora_clientes_sin_dato           INTEGER NOT NULL DEFAULT 0,
  monto_en_mora                    DOUBLE PRECISION,
  monto_en_mora_sin_dato           INTEGER NOT NULL DEFAULT 0,
  proceso_cobranza                 TEXT,
  descripcion_cobranza             TEXT,
  dificultad_cobranza              TEXT,

  -- Bloque 7 — Procesos, ventas y escala. Las multi-selección se guardan como
  -- JSON en TEXT (no JSONB: el espejo SQLite/PG exige el mismo tipo en ambos;
  -- los repos serializan, igual que traducen snake_case ↔ camelCase).
  sistema_registro                 TEXT,
  canales_captacion                TEXT,
  equipo                           TEXT,
  situacion_fiscal                 TEXT,
  unidad_ventas                    TEXT,
  prioridad_declarada              TEXT,

  -- Bloque 8 — Proyección
  -- Metas del trimestre: alimentan las metas numéricas de los OKRs del plan.
  -- Sin par _sin_dato a propósito: son intenciones, no mediciones, y quedan
  -- fuera del índice de claridad (que se calcula sobre las 19 con casilla).
  meta_clientes_90d                INTEGER,
  meta_capital_90d                 DOUBLE PRECISION,
  meta_ganancia_90d                DOUBLE PRECISION,
  vision_12m                       TEXT,
  freno_percibido                  TEXT,

  creado_en                        TEXT NOT NULL
);

-- Token de acceso al formulario público: un solo uso (usado_en) y vencimiento
-- a 30 días. El reenvío a los 90 días es un token nuevo. Mismo patrón que
-- sesiones.token.
CREATE TABLE IF NOT EXISTS diagnostico_tokens (
  token           TEXT PRIMARY KEY,
  alumno_id       TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  expira_en       TEXT NOT NULL,
  usado_en        TEXT,
  diagnostico_id  TEXT,
  creado_en       TEXT NOT NULL
);

-- Historial de asignación alumno ↔ consultor. hasta NULL = tramo vigente.
CREATE TABLE IF NOT EXISTS alumno_consultor_historial (
  id            TEXT PRIMARY KEY,
  alumno_id     TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  consultor_id  TEXT NOT NULL REFERENCES usuarios(id),
  desde         TEXT NOT NULL,
  hasta         TEXT,
  creado_en     TEXT NOT NULL
);

-- ───────── Fase 2 del módulo: el plan de 90 días (ticket 6) ─────────
-- Espejo EXACTO del bloque en sqlite/schema.ts. El plan entra pegando el
-- bloque JSON de la skill (CONTRATO-PLAN.md). Cargar un plan nuevo NO borra
-- el anterior; el vigente es el de fecha_inicio más reciente.

CREATE TABLE IF NOT EXISTS planes (
  id            TEXT PRIMARY KEY,
  alumno_id     TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  fecha_inicio  TEXT NOT NULL,
  etapa         TEXT,
  objetivo_90d  TEXT,
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
  valor_inicial DOUBLE PRECISION,
  meta_30   DOUBLE PRECISION,
  meta_60   DOUBLE PRECISION,
  meta_90   DOUBLE PRECISION,
  unidad    TEXT,
  direccion TEXT CHECK(direccion IS NULL OR direccion IN ('sube','baja')),
  -- Ticket 7: el cronograma del tablero. vencimiento lo fija el consultor (el
  -- contrato de la skill no trae fechas) y se desplaza junto con fecha_inicio;
  -- cumplido_en alimenta el semáforo de salud (avance = cumplidos/totales).
  vencimiento TEXT,
  cumplido_en TEXT,
  creado_en TEXT NOT NULL
);

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
  valor       DOUBLE PRECISION NOT NULL,
  origen      TEXT NOT NULL CHECK(origen IN ('alumno','consultor')),
  usuario_id  TEXT REFERENCES usuarios(id),
  cargado_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mediciones_kr ON mediciones(kr_id);

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
-- (BYTEA acá, BLOB en el espejo: la excepción de tipo por motor, como
-- REAL ↔ DOUBLE PRECISION): el filesystem de Railway es efímero y en la base
-- el documento viaja con el backup. Versionado simple: se acumulan por plan y
-- el vigente es el último subido — nunca se pisa el anterior.
CREATE TABLE IF NOT EXISTS plan_documentos (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  nombre_archivo  TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  contenido       BYTEA NOT NULL,
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


CREATE INDEX IF NOT EXISTS idx_alumnos_consultor  ON alumnos(consultor_id);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_alumno ON diagnosticos(alumno_id);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_fecha  ON diagnosticos(fecha);
CREATE INDEX IF NOT EXISTS idx_tokens_alumno       ON diagnostico_tokens(alumno_id);
CREATE INDEX IF NOT EXISTS idx_historial_alumno    ON alumno_consultor_historial(alumno_id);

-- Rol CONSULTOR: ensancha el CHECK de usuarios.rol (tabla VIVA en producción).
-- Idempotente: solo actúa si la restricción todavía no admite CONSULTOR, y es
-- puramente aditivo (ninguna fila existente queda inválida). La matriz de
-- permisos del dominio se amplía recién en el ticket 2; hasta entonces el rol
-- es inalcanzable desde la app.
DO $$
DECLARE
  restriccion text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'usuarios'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%CONSULTOR%'
  ) THEN
    SELECT conname INTO restriccion FROM pg_constraint
     WHERE conrelid = 'usuarios'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%rol%';
    IF restriccion IS NOT NULL THEN
      EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', restriccion);
    END IF;
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
      CHECK (rol IN ('LECTOR','EDITOR','ADMIN','CONSULTOR'));
  END IF;
END $$;

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
-- Módulo de alumnos · metas a 90 días (ticket 5). Aditivas: una base creada
-- con el ticket 1 no tiene estas columnas.
ALTER TABLE diagnosticos ADD COLUMN IF NOT EXISTS meta_clientes_90d INTEGER;
ALTER TABLE diagnosticos ADD COLUMN IF NOT EXISTS meta_capital_90d DOUBLE PRECISION;
ALTER TABLE diagnosticos ADD COLUMN IF NOT EXISTS meta_ganancia_90d DOUBLE PRECISION;
-- Módulo de alumnos · panel de control (ticket 7): estado del alumno, borrado
-- lógico y cronograma/cumplimiento de KRs. Las tablas del ticket 6 ya existen
-- en producción: estas columnas entran por acá.
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK(estado IN ('ACTIVO','PAUSADO','FINALIZADO','ABANDONADO'));
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS estado_actualizado_en TEXT;
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS eliminado_en TEXT;
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS eliminado_por TEXT REFERENCES usuarios(id);
ALTER TABLE krs ADD COLUMN IF NOT EXISTS vencimiento TEXT;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS cumplido_en TEXT;
-- Módulo de alumnos · seguimiento activo (ticket 7C): teléfono en dos campos.
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS telefono_pais TEXT;
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS telefono_numero TEXT;
-- Módulo de alumnos · vista del alumno (ticket 8): última apertura del link
-- y el KR de cada acción (agrupa el checklist del alumno).
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS ultimo_acceso_link TEXT;
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS kr_id TEXT REFERENCES krs(id);
-- Módulo de alumnos · medición automática (ticket 9A): tipo de KR con metas
-- numéricas, y checkins con estado/nota/autor. Aditivo puro.
ALTER TABLE krs ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entregable' CHECK(tipo IN ('entregable','metrica'));
ALTER TABLE krs ADD COLUMN IF NOT EXISTS valor_inicial DOUBLE PRECISION;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS meta_30 DOUBLE PRECISION;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS meta_60 DOUBLE PRECISION;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS meta_90 DOUBLE PRECISION;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS unidad TEXT;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS direccion TEXT CHECK(direccion IS NULL OR direccion IN ('sube','baja'));
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS estado TEXT CHECK(estado IS NULL OR estado IN ('pendiente','en_curso','ejecutado'));
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS nota TEXT;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS usuario_id TEXT REFERENCES usuarios(id);
-- Backfill de DATOS (no solo esquema), idempotente por el WHERE: los
-- checkins previos al ticket 9 ganan su estado desde el booleano legado.
UPDATE checkins
   SET estado = CASE WHEN marcado = 1 THEN 'ejecutado' ELSE 'pendiente' END
 WHERE estado IS NULL;
`;

export async function migrarPg(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL_PG);
}
