# Módulo de gestión de alumnos

Archivo de contexto. Leer al inicio de cada sesión antes de tocar código de este módulo.

---

## Qué es

Módulo interno de Más Activos Academy para gestionar el ciclo completo de la consultoría 1 a 1: el alumno completa un diagnóstico por link, el consultor lo recibe en un panel, genera un plan estratégico de 90 días fuera de la app, lo carga, y a partir de los OKRs de ese plan hace el seguimiento semanal.

Usuarios: José (dueño, ve todo) y consultores internos (ven solo su cartera de alumnos asignados).

**No es un producto para vender.** Es herramienta interna. No hace falta multi-tenancy, planes de suscripción ni onboarding público.

---

## Reglas duras

Estas no se negocian sin consultar primero:

1. **No tocar el módulo contable.** Está en producción y es la única parte de la app que hoy usa gente. Cualquier cambio que lo afecte se avisa antes de hacerlo.
2. **Los permisos se aplican a nivel de consulta a la base, no de interfaz.** Un consultor no debe poder traer datos de alumnos que no le fueron asignados aunque llame la API a mano. Ocultar botones no es control de acceso.
3. **Los consultores no ven nada de contabilidad.** Ni de Academy ni de ninguna unidad del holding. La separación es total.
4. **Los diagnósticos no se sobrescriben.** Cada envío es un registro nuevo. Hay que poder comparar el diagnóstico inicial contra el de los 90 días.
5. **Un ticket, un commit.** Nada de cambios grandes en un solo paso. Si algo sale mal tiene que poder revertirse sin arrastrar el resto.
6. **Seguir las convenciones que ya existen en el repo.** Nombres, estructura de carpetas, forma de declarar migraciones y permisos. Si algo de este documento choca con lo que ya está, gana lo que ya está — y se avisa.

---

## Modelo de datos

Siete entidades. Los nombres finales se ajustan a la convención del repo.

- **alumnos** — ficha del alumno. Tiene `consultor_id` (el asignado) y `programa`.
- **consultores** — puede ser un rol sobre la tabla de usuarios que ya existe, no una tabla nueva. Ver informe de exploración.
- **diagnosticos** — una fila por envío del formulario. `alumno_id`, `fecha`, y las respuestas. Nunca se pisa.
- **planes** — el plan de 90 días cargado. `alumno_id`, `fecha_inicio`, archivo, estado.
- **okrs** — los objetivos y resultados clave del plan, como registros sueltos. **Esta es la pieza que habilita todo el seguimiento.** Un plan tiene N OKRs; un OKR tiene N KRs.
- **tareas** — tareas semanales que cuelgan de un OKR. `okr_id`, `semana`, `estado`.
- **checkins** — respuestas del alumno sobre su avance.

La relación que ordena todo: `alumno → consultor asignado`. Todo filtro de permisos sale de ahí.

---

## Mecánica de "No lo tengo claro"

El formulario tiene 19 preguntas numéricas duras. En cada una, el alumno puede marcar que no conoce el dato.

Se guarda como **dos campos**, no uno:

| Campo | Tipo | Contenido |
|---|---|---|
| `<nombre>` | numeric, nullable | El valor, o null |
| `<nombre>_sin_dato` | boolean | true si marcó la casilla |

**No usar `0` ni `null` solo para representar "no sabe".** Mora en 0 es una cartera sana; mora sin dato es un alumno que no mide. Si se guardan igual, los promedios de cohorte mienten.

Las preguntas de opinión, contexto o preferencia no llevan casilla.

---

## Índice de claridad

Porcentaje de métricas duras que el alumno respondió con un número, sobre las que le aplican.

```
indice_claridad = (métricas respondidas / métricas aplicables) × 100
```

Las que no aplican no van en el denominador (ejemplo: si el capital es propio, la pregunta sobre el costo del capital de terceros no cuenta).

Se calcula al enviar el formulario, se guarda en el diagnóstico y se muestra en la ficha del alumno junto al listado de qué métricas faltan.

Escala de lectura para el consultor: 0–30% no mide nada / 31–60% mide parcialmente / 61–85% conoce su negocio / 86–100% opera con tablero.

---

## Diccionario de campos

Los nombres de campo, tipos, obligatoriedad y opciones de cada pregunta están en la especificación funcional del formulario (documento aparte).

**Esos nombres los consume también la skill que genera el plan de 90 días, fuera de la app.** Cualquier renombre hay que hacerlo en los dos lados a la vez. Antes de cambiar un nombre de campo, avisar.

---

## Flujo funcional

1. El consultor crea el alumno en el panel y genera un link de diagnóstico con token único.
2. El alumno abre el link y completa el formulario. No necesita cuenta ni login.
3. La respuesta cae en `diagnosticos`, asociada al alumno por el token. Se calcula el índice de claridad.
4. El consultor ve la ficha: respuestas, índice, y qué métricas quedaron sin dato.
5. Durante la consultoría, el consultor puede editar cualquier respuesta desde el panel. Queda registrado que la modificó el consultor y no el alumno.
6. El consultor exporta el diagnóstico en el formato que consume la skill, genera el plan afuera y lo carga con sus OKRs.
7. De los OKRs se derivan tareas semanales. El seguimiento va hacia el alumno por WhatsApp, no esperándolo en un panel.

Los pasos 6 en adelante son fase 2. La fase 1 llega hasta el punto 5.

---

## Orden de construcción

| # | Ticket | Estado |
|---|---|---|
| 0 | Informe de exploración del repo | hecho |
| 1 | Migraciones de las tablas del módulo | hecho |
| 2 | Rol consultor y reglas de acceso | hecho |
| 3 | Formulario público con token por alumno | hecho |
| 4 | Panel del consultor: ficha, diagnóstico, índice de claridad | hecho |
| 5 | Exportación del diagnóstico para la skill | hecho |
| 6 | Asistente IA sobre el módulo (vistas filtradas + herramientas) | pendiente |

Actualizar este estado a medida que se avanza.

---

## Decisiones tomadas

Para no volver a discutirlas:

- Es herramienta interna, no producto. No se construye pensando en venderla.
- El seguimiento con el alumno va por WhatsApp; la app es el tablero del consultor.
- La generación del plan queda fuera de la app, con revisión humana. No se automatiza punta a punta: el criterio de qué OKRs poner y en qué orden es el valor de la consultoría.
- Este módulo estrena el patrón con el que se van a agregar los módulos de las demás unidades del holding. Vale la pena hacerlo prolijo.

### Cerradas en el diseño del ticket 1 (agosto 2026)

- **Permisos en dos ejes** (acciones × ámbito `todos`/`solo_los_mios`), no un escalón más de la escalera del contable. Se implementa en el ticket 2. ADMIN ve todas las carteras.
- **`CONSULTOR` entra a la base en el ticket 1** (CHECK de `usuarios.rol` ensanchado) pero a la matriz de permisos recién en el ticket 2: hasta entonces es inalcanzable desde la app.
- **Moneda por alumno** (`alumnos.moneda`, ISO 4217), no sufijo por campo. Los montos de un diagnóstico se interpretan contra ella.
- **`programa` y `moneda` se fotografían en cada diagnóstico**: la ficha es editable (replanificaciones, cambio de programa o país) sin reinterpretar diagnósticos viejos.
- **Índice de claridad sobre las 19 métricas con casilla** (incluidas las 3 de texto: `tasa_declarada`, `punitorio`, `tasa_competencia`). Entero; `null` si no respondió ninguna, nunca `0`.
- **Token en tabla propia**: un solo uso (`usado_en`), vence a los 30 días, token nuevo por reenvío.
- **Historial de reasignación** en `alumno_consultor_historial` (`hasta = null` = vigente).
- **Sin FK entre alumnos y contable.** `alumnos.id_cierre_vinculado` existe pero es texto suelto, sin relación activa.
- **Opciones de negocio sin CHECK en la base** (programa, canal, moneda…): se validan en Zod. Solo lleva CHECK lo estructural (`diagnosticos.origen`).
- **Multi-selección como JSON en TEXT** (no JSONB): el espejo SQLite/PostgreSQL exige el mismo tipo en ambos motores.
- **Asistente IA excluido del módulo — temporal.** Las 4 tablas están en `TABLAS_SENSIBLES` desde el mismo commit que las crea. Se reactiva en el ticket 6 con vistas filtradas por sesión (consulta) y herramientas acotadas (acción); nunca escritura por SQL generado.
- **db:migrar no copia las tablas de alumnos** (están en `TABLAS_NO_COPIADAS`): el módulo nace en producción y ese script vacía el destino antes de copiar — incluirlas pisaría datos reales con una base local vacía. Su resguardo es `db:backup`.

### Cerradas en el ticket 2 (agosto 2026)

- **`CONSULTOR` no es un escalón de la escalera del contable.** `puede()` es lista blanca por rol, no comparación de nivel: LECTOR ⊂ EDITOR ⊂ ADMIN siguen siendo la escalera del contable, y `CONSULTOR` cuelga aparte. No tiene `'ver'`, y por eso queda afuera del contable de raíz.
- **Dos familias de acciones.** Contable/administración (`ver`, `editar`, `importar`, `gestionar_usuarios`) y alumnos (`ver_alumnos`, `editar_alumnos`). No se cruzan: `ver` no habilita nada de alumnos y `ver_alumnos` no habilita nada del contable. ADMIN tiene ambas.
- **Las rutas de LECTURA del contable ahora exigen `'ver'`.** Antes solo exigían sesión: cualquier usuario logueado leía todo el contable y el gating era únicamente de UI. Sin esto, agregar `CONSULTOR` le habría abierto la contabilidad entera. Para LECTOR/EDITOR/ADMIN no cambia nada (los tres tienen `'ver'`).
- **El ámbito por fila sale de la sesión, nunca de la query string.** `alcanceDe(res)` deriva el `Alcance` del usuario autenticado. `titularSegunAlcance()` deja que el filtro del cliente ACHIQUE el resultado pero jamás lo ensanche; `alcanzaFila()` cubre la lectura/escritura de una fila suelta (si no la alcanza, se responde como si no existiera).
- **El contable no tiene titular por fila.** `cierres.closer` es texto libre (el nombre del closer), no un id de `usuarios`: no sirve como control de acceso y no se lo convirtió en uno. Sus filtros (`closer`, `unidad`, `mes`…) son cosméticos y así están documentados. La protección real del contable es `'ver'` + ámbito total.
- **Red que falla cerrada:** `exigirAmbitoTotal()` corta la consulta si alguna vez una sesión con ámbito acotado llega al contable. Hoy no se dispara nunca; el día que alguien le dé `'ver'` a un rol acotado, la consulta muere en vez de devolver la tabla entera.
- **UI del consultor:** el menú del contable le queda vacío y el dashboard no se monta (sería un 403 por panel). Ve una pantalla de "panel en construcción" hasta el ticket 4.
- **Sigue pendiente para el ticket 4:** no hay endpoints ni repos de alumnos todavía. El mecanismo de ámbito está listo y testeado, pero quien construya el panel tiene que aplicarlo en la consulta (`titularSegunAlcance` en los listados, `alcanzaFila` en la ficha) — no alcanza con exigir `ver_alumnos`.

### Cerradas en el ticket 3 (agosto 2026)

- **El catálogo del formulario vive en el dominio** (`domain/alumnos/formulario.ts`): texto, tipo, opciones, obligatoriedad y casilla de cada pregunta. La validación Zod y el render derivan del mismo lugar, con guardas de deriva que atan catálogo ↔ métricas del índice ↔ esquema de los DOS motores.
- **Obligatoria con casilla = "contestá o declará que no sabés".** Se salda con el número o marcando la casilla; en blanco sin decir nada no pasa. Y la casilla marcada LIMPIA el valor: la base nunca guarda un número que el alumno declaró desconocer.
- **El token es la credencial** (256 bits, `randomBytes`): un solo uso, 30 días, reenviar vence el anterior. La ruta pública responde lo mínimo (saludo + `fichaPendiente`, solo nombres de campo) y tiene limitador por IP donde el error de validación NO cuenta como intento.
- **Bloque 0 completar-si-falta:** el link llena los huecos de la ficha (edad, zona, whatsapp, marca, canal) pero jamás pisa lo cargado; `nombre`/`programa`/`moneda` ni figuran en el esquema público. Las obligatorias del bloque 0 se exigen en el server cuando faltan.
- **El envío inválido no consume el token** (el alumno corrige y reenvía con el mismo link) y **la ficha se completa recién después de guardar el diagnóstico**: si el diagnóstico no entró, la ficha no se toca.
- **Repos ya cableados** (`reposAlumnos` en los dos motores) y **el ámbito por fila aplicado en la consulta**: los listados fuerzan titular en el WHERE, la ficha ajena responde 404 con el mismo cuerpo que la inexistente. El ticket 4 los consume, no los reconstruye — el párrafo de "pendiente" de arriba queda saldado en la API; falta solo la PANTALLA del panel.
- **La ruta del alumno es `/formulario/<token>`**, única ruta pública de la SPA (por pathname, sin router). El endpoint privado del panel emite el token en `POST /api/alumnos/:id/token`.

### Cerradas en el ticket 4 (agosto 2026)

- **La corrección del consultor NO crea fila.** "Cada envío es una fila nueva" es para los ENVÍOS del formulario; la corrección ajusta la fila y queda marcada con `editado_por_consultor` — para eso el esquema tiene DOS columnas (`origen` = quién lo cargó; el flag = el consultor lo tocó después). El índice se recalcula; fecha, origen y la foto de programa/moneda no se tocan. `PUT /api/diagnosticos/:id`.
- **El patch viaja mínimo:** solo los campos tocados (`armarPatch` en la UI, Zod sin defaults en el server — un default(false) pisaría casillas del alumno). Cargar un dato resuelve el "no lo sé"; marcar la casilla borra el valor. Ausente = no tocar.
- **Dos shells según el rol:** CONSULTOR entra a un shell propio sin nada del contable (ni `useMeses`, que le daría 403); ADMIN ve "Alumnos" como vista del dashboard. LECTOR/EDITOR no la ven.
- **Una sola definición de las preguntas:** el panel corrige con el MISMO `Campo` y los mismos `BLOQUES` del formulario público (catálogo del dominio). Los faltantes se muestran como "para sacar en la llamada", con el texto de cada pregunta y en orden de formulario.
- **Verificado en navegador real** (Playwright sobre el build de producción): alta → link → envío sin sesión → índice y faltantes → corrección → índice recalculado.

### Cerradas en el ticket 5 (agosto 2026)

- **Tres metas a 90 días en el bloque 8** (`meta_clientes_90d`, `meta_capital_90d`, `meta_ganancia_90d`): son las preguntas 21-23 de la skill, las que calibran las metas numéricas de los OKRs. **Obligatorias, sin casilla y FUERA del índice de claridad** — son intenciones, no mediciones. Si entraran, el denominador pasaría de 19 a 22 y el índice dejaría de ser comparable contra el de los 90 días. Hay test que fija la invariante.
- **La exportación es un MAPEO, no un volcado.** La skill se organiza en 30 preguntas (Ordenar/Optimizar/Escalar) y el formulario en 48 sobre otros ocho bloques. Del cruce: 16 coinciden, 6 en parte (llevan nota), 5 el formulario no las releva y se exportan como *"no relevado — preguntarlo en la llamada"* para que la skill no las invente.
- **Los tres estados de una respuesta nunca se confunden** en el documento: respondido / "el alumno no lo conoce" / sin responder. Cero es un dato. Cuando varios campos contestan una pregunta de la skill, cada valor va con su etiqueta.
- **La moneda del documento es la fotografiada en el diagnóstico**, no la actual de la ficha.
- **La sección 12 del plan sale pre-armada** desde las casillas, con prioridad Alta/Media según la obligatoriedad de la pregunta (heurística, el consultor la ajusta).
- `GET /api/diagnosticos/:id/exportacion` con el mismo ámbito que la lectura. En el panel: copiar (para pegar en Claude) y descargar `.md`.

### Definido para los tickets 6+ (seguimiento)

- **El seguimiento va por FASES (30/60/90), no por semanas.** El plan ya viene estructurado así (sección 6 de la skill); las semanas serían una capa inventada encima que hay que mantener a mano. Se cae el campo `semana` de `tareas`, la aritmética de fechas y la pantalla de asignar acciones a semanas.
- **La tabla es `acciones`** (`plan_id`, `fase` 1/2/3, `texto`, `orden`), tomadas de la sección 6 del plan. Los OKRs y KRs se cargan igual, para el tablero del consultor y la comparación a los 90 días, pero el checklist del alumno sale de las acciones por fase.
- **El link de seguimiento NO puede reusar el token del diagnóstico:** aquel es de un solo uso y 30 días; este es reusable, dura los 90 días del plan y tiene que ser estable (vive en la conversación de WhatsApp). Va tabla propia y revocable.
- **Los tildes son append-only** (`checkins`), no un UPDATE destructivo: nunca se pierde historia y el timestamp da la señal de ritmo ("sin movimiento hace 12 días") sin modelar semanas.
- **El link muestra SOLO las acciones**, con la fase actual desplegada y las otras plegadas según la fecha. Nada de diagnóstico, índice, bloqueos ni matriz de riesgos: eso tiene marco de consultor.
- **El alumno no tiene login.** El tilde es lo que él *declara*, no un hecho verificado; el consultor valida en la llamada.
- **La skill debería emitir un bloque estructurado** junto al `.docx`, para cargar los OKRs y las acciones de un solo pegado. Si hay que tipearlos a mano, el módulo no se usa.
