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
| 6 | Plan de 90 días: carga por bloque + seguimiento del alumno | hecho |
| 7 | Panel de control: estado y salud (7A) · documento del plan (7B) · seguimiento activo (7C) | hecho |
| 8 | El link del alumno: bloque "Esta semana" · copy sin castigo · último acceso · agrupado por KR | hecho |
| 9 | Cierre por acciones: modelo (9A) · cierre automático y métricas (9B) · contrato v3 de la skill · paralelo de semáforos (9C tiempo uno) · vista del alumno (9D) · **switch (9C tiempo dos, 25/08)** | hecho — queda el ticket de limpieza: borrar `krs.cumplido_en`, `checkins.marcado` y el campo `cumplido` del patch, con semanas de rodaje |
| — | Asistente IA sobre el módulo | **descartado** (decisión de José, agosto 2026) |

Quedó anotado para después (fuera del ticket 7): snapshot de cierre a los 90
días y métricas agregadas de la cartera, notificaciones por mail/push, y
mensajería automatizada.

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
- **Asistente IA excluido del módulo.** Las tablas están en `TABLAS_SENSIBLES` desde el mismo commit que las crea. ~~Temporal: se reactiva con vistas filtradas~~ → **quedó permanente: el asistente sobre el módulo se descartó en el ticket 7** (ver esa sección).
- **El sembrado desde SQLite no copia las tablas de alumnos** (están en `TABLAS_NO_COPIADAS`): el módulo nace en producción y ese script vacía el destino antes de copiar — incluirlas pisaría datos reales con una base local vacía. Su resguardo es `db:backup`. (El script se llamaba `db:migrar`; desde el ticket 7 es `db:sembrar-desde-sqlite`.)

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

### Cerradas en el ticket 6 (agosto 2026) — antes "definido para los tickets 6+"

- **El seguimiento va por FASES (30/60/90), no por semanas.** El plan ya viene estructurado así (sección 6 de la skill); las semanas serían una capa inventada encima que hay que mantener a mano. Se cae el campo `semana` de `tareas`, la aritmética de fechas y la pantalla de asignar acciones a semanas.
- **La tabla es `acciones`** (`plan_id`, `fase` 1/2/3, `texto`, `orden`), tomadas de la sección 6 del plan. Los OKRs y KRs se cargan igual, para el tablero del consultor y la comparación a los 90 días, pero el checklist del alumno sale de las acciones por fase.
- **El link de seguimiento NO puede reusar el token del diagnóstico:** aquel es de un solo uso y 30 días; este es reusable, dura los 90 días del plan y tiene que ser estable (vive en la conversación de WhatsApp). Va tabla propia y revocable.
- **Los tildes son append-only** (`checkins`), no un UPDATE destructivo: nunca se pierde historia y el timestamp da la señal de ritmo ("sin movimiento hace 12 días") sin modelar semanas.
- **El link muestra SOLO las acciones**, con la fase actual desplegada y las otras plegadas según la fecha. Nada de diagnóstico, índice, bloqueos ni matriz de riesgos: eso tiene marco de consultor.
- **El alumno no tiene login.** El tilde es lo que él *declara*, no un hecho verificado; el consultor valida en la llamada.
- **La skill emite un bloque JSON** junto al `.docx`, para cargar los OKRs y las acciones de un solo pegado. Si hay que tipearlos a mano, el módulo no se usa. **El contrato está en `CONTRATO-PLAN.md`** — tiene los dos lados: lo que la app parsea y el texto que va en la skill. Leerlo antes de arrancar el ticket 6.

### Cerradas en el ticket 7 (agosto 2026) — el panel de control

El criterio rector de todo el ticket: **el panel grita por los que se TRABARON, no por los que van bien.**

- **El asistente IA sobre el módulo quedó DESCARTADO** (decisión de José). La exclusión de las tablas en `TABLAS_SENSIBLES` deja de ser temporal: es permanente, y ya son 12 tablas (se sumaron `plan_fecha_historial`, `plan_documentos` y `contactos`).
- **Estado del alumno** (`ACTIVO`/`PAUSADO`/`FINALIZADO`/`ABANDONADO`) con CHECK en base: es estructural, como `diagnosticos.origen`. Solo `ACTIVO` calcula semáforo y alerta; `PAUSADO` congela; los otros dos apagan. El booleano `activo` viejo sigue como estaba (gating del formulario público).
- **Semáforo por brecha, no por avance absoluto**: `brecha = (KRs cumplidos/totales) − min(días/90, 1)`. Verde ≥ −10 %, naranja ≥ −25 %, rojo debajo. Primeros 7 días neutro; sin KRs o sin plan, neutro con motivo. Es lo que hace que el rojo aparezca el día 20 y no el 61. **Los umbrales son punto de partida**: calibrarlos contra planes reales sigue abierto.
- **`fecha_cierre_estimada` NO se guarda** (desvío del documento de alcance, avisado): se deriva de `fecha_inicio + 90`, igual que las fechas de fase — una columna derivada se desactualiza en cuanto la fecha se edita.
- **Los KRs ganaron `vencimiento` y `cumplido_en`.** El contrato de la skill no trae fechas: los vencimientos los fija el consultor en el panel. El cumplimiento lo tilda el CONSULTOR (alimenta el semáforo); los checkins del alumno siguen siendo por acción, como antes.
- **Fecha de inicio editable con auditoría**: cada cambio desplaza TODOS los vencimientos cargados por el delta (transaccional) y deja fila en `plan_fecha_historial`. La UI muestra cuántos KRs se van a mover antes de confirmar.
- **`eliminar_alumnos` es acción nueva y SOLO de ADMIN** — el espejo de `importar` en el contable. Borrado lógico (`eliminado_en`/`eliminado_por`): el filtro `eliminado_en IS NULL` vive en la CONSULTA (obtener/listar), así ningún listado, conteo, exportación ni link público se olvida. La papelera restaura o purga en físico (cascada por FK) confirmando el nombre exacto.
- **El documento del plan vive en la base** (`plan_documentos`, BYTEA↔BLOB — la excepción de tipo por motor, como REAL↔DOUBLE PRECISION): el filesystem de Railway es efímero y en la base viaja con `db:backup`. Versionado simple: el vigente es el último subido, nunca se pisa. Tipo por EXTENSIÓN (.pdf/.docx), límite 10 MB, listados sin contenido.
- **Teléfono en DOS campos** (`telefono_pais` sin `+`, `telefono_numero` solo dígitos); el `whatsapp` libre queda intacto. La regla del 9 argentino (WhatsApp lo exige entre país y área) se aplica al ARMAR el link, en el dominio. La migración de una pasada (`npm run db:migrar-telefonos`) **no adivina**: sin marca internacional clara queda para revisión manual.
- **El contacto se registra ANTES de abrir WhatsApp** (`contactos`, append-only como los checkins). Es lo que apaga la alerta de inactividad: contacto posterior a la última señal y de hace menos de 8 días.
- **Alerta de inactividad**: `ACTIVO` y más de 8 días sin check-in (sin check-ins, desde `fecha_inicio`). Sin mails ni push: vive en el panel.
- **"Trabado" en el filtro y el contador = alerta activa O semáforo rojo** (el documento usa "trabado" para las dos cosas; el filtro las une: es la lista de "a quién escribirle hoy"). En el ORDEN, la alerta va arriba incluso de los rojos.
- **`db:migrar` se renombró a `db:sembrar-desde-sqlite`**: no migra esquema — siembra datos VACIANDO el destino. El nombre viejo invitaba a correrlo contra producción.
- **Siguen abiertas**: calibrar los umbrales del semáforo con datos reales, la versión final de la plantilla del mensaje de WhatsApp (hoy va el borrador del ticket, en `domain/alumnos/telefono.ts`), y si la papelera purga sola a los 90 días (hoy: siempre manual).

### Cerradas en el ticket 8 (agosto 2026) — el link del alumno

Regla dura del ticket: **la vista del alumno orienta, no alarma.** Nunca muestra el semáforo, ni rojo, ni "trabado", ni porcentajes de atraso — el consultor necesita una alarma; el alumno necesita una salida. Si el link lo hace sentir en falta, deja de abrirlo y se pierde la señal que alimenta el panel.

- **El bloque "Esta semana"**: exactamente 3 acciones arriba de todo, con casillas funcionales. Prioridad: deuda de fases vencidas (de la más vieja), después la fase actual, después la siguiente. La selección se fija al ABRIR (no se recalcula con cada tilde). Dominio puro en `vistaAlumno.ts`.
- **Aterriza abierta la fase con la acción más urgente** (la deuda más vieja; al día, la actual). El badge "estás acá" sigue en la fase por calendario.
- **"Día 37 de 90 · te quedan 53"** en la cabecera (la cuenta la hace el server) con barra de tiempo neutra. El desfase se dice en clave de recuperación, fondo dorado suave, solo si hay deuda.
- **Pasado el día 90 las casillas SIGUEN marcables** — ⚠️ revierte el congelamiento del ticket 6, por decisión explícita del ticket 8 (§4.7): lo completado tarde también es información para la llamada de cierre. El límite real es la vigencia del token (120 días). La cabecera dice "Plan finalizado · día 90 de 90".
- **Guardado ✓** visible ~1,5 s tras el OK del server; si falla, la casilla vuelve atrás. El tilde optimista nunca queda sin confirmación.
- **`ultimo_acceso_link`** en alumnos, registrado SOLO al abrir el link (tildar no lo toca): junto al último check-in, el panel distingue "no abre" (se despegó → se le escribe por el proceso) de "abre y no marca" (trabado → se le escribe por el obstáculo). La alerta de inactividad NO cambia: sigue midiendo check-ins.
- **Las acciones se agrupan bajo su KR** en la vista del alumno (subtítulo gris, no clickeable, contador propio); las sin KR van bajo "Otras acciones" y un plan viejo sin vínculos se ve plano. **El OKR no baja al alumno** (lenguaje de consultoría); sigue en el panel. El bloque "Esta semana" no se agrupa.
- **El contrato ganó `fases[].acciones[].kr`** (posición del KR dentro del OKR referenciado), OPCIONAL y aditivo: sigue la versión 1 y los bloques ya emitidos valen tal cual. Los dos lados en `CONTRATO-PLAN.md`; **actualizar el texto de la skill** para que lo emita.
- **⚠️ El semáforo NO se tocó.** El documento del ticket 8 decía "hoy el semáforo mide acciones cumplidas; se mantiene" — no era así: desde el ticket 7 mide **KRs cumplidos** (tilde del consultor). Como el criterio duro del mismo ticket era "su valor no cambia para ningún alumno existente", se dejó EXACTAMENTE como en producción, y los tests del ticket 7 que fijan sus valores son la verificación. Si algún día se quiere que mida acciones (la señal de ritmo del alumno, como argumenta el ticket 8), es una decisión nueva que hay que tomar explícitamente — no un supuesto.
- El "contador de KRs cerrados sin color" que pedía el ticket ya existía desde el 7 (ficha y columna del panel), con una diferencia de definición: ahí "cumplido" es el tilde del consultor, no "todas sus acciones hechas". No se introdujo una segunda definición de cierre de KR para no tener dos verdades en pantalla.

### Cerradas en el ticket 9 (agosto 2026) — cierre por acciones

El primer ticket que cambia a propósito un cálculo en producción; por eso va en bloques con commits separados y el semáforo se cambia en DOS pasos (TICKET-9.md es la especificación completa, revisión 2).

- **El estado de una acción vive en `checkins` y en ningún otro lado** (extendido con `estado`, `nota`, `usuario_id`). Nada de `acciones.estado`, ni `accion_historial`, ni `marcado_por`: la tabla append-only ES el historial y las notas no se pisan. `marcado` se sigue escribiendo derivado (ejecutado→1) hasta un ticket DESPUÉS del switch — es lo que hace cada bloque reversible por revert de código.
- **Tres estados** (`pendiente` → `en_curso` → `ejecutado`) y **solo ejecutado puntúa**: si en curso sumara medio punto, marcar todo "en curso" en una tarde mostraría 50% sin terminar nada. En curso distingue trabado de inactivo.
- **Cada KR lleva tipo**: `entregable` cierra SOLO (todas sus acciones ejecutadas; destildar la reabre — es un cálculo, no un estado pegado) y `metrica` cierra por valor contra `meta_90` en su dirección. No existe casilla para tildar un entregable a mano; el tilde legado (`cumplido_en`) se honra hasta el switch. Un entregable sin acciones vinculadas nunca cierra y el panel lo señala. **Las métricas NO entran al semáforo** (ritmo ≠ resultado).
- **`mediciones` append-only** (valor numérico, origen alumno/consultor): cargar nunca pisa. En `TABLAS_SENSIBLES` y `TABLAS_NO_COPIADAS`, como todo el módulo.
- **La corrección del consultor es sobre la ACCIÓN, no sobre el KR** (checkin origen consultor + usuario), y **NO silencia la alerta de inactividad**: la señal de ritmo sigue siendo exclusivamente del alumno.
- **Contrato v3 de la skill** (CONTRATO-PLAN.md, ya aplicado en la skill): `tipo` por KR; para métrica el paquete `valor_inicial`/`meta_90`/`unidad`/`direccion` es obligatorio (error estructural si falta); todo entregable con al menos una acción que lo referencie. Aditivo: un bloque sin `tipo` entra entero como entregables.
- **El semáforo cambia en dos pasos** (9C): el cálculo nuevo mide acciones ejecutadas contra la AGENDA del plan (`esperadas = fases vencidas + prorrateo de la actual`; con reparto parejo es idéntico a días/90 — propiedad fijada en test; los tres planes fixture 8/8/8, 3/8/8 y 8/3/3 dan brecha 0 el día 30). Umbrales y gracia de 7 días NO se tocan. Hoy corre **en paralelo on-read, sin exponerse**: el panel muestra el viejo intacto y `GET /api/alumnos/comparacion-semaforo` (solo ámbito total; CONSULTOR recibe 403) muestra ambos lado a lado. **El switch es un commit aparte, después de una semana de observación con cartera real** — si todos los planes cargados son de reparto parejo, cero divergencia ES la confirmación de que el switch es seguro. `cumplido_en` deja de LEERSE en el switch y se borra un ticket después.
- **9D — la vista del alumno**: un solo gesto por elemento (el círculo marca ejecutado, el texto abre el detalle con selector y nota); en curso dorado suave con etiqueta — tres estados, dos tratamientos, nunca rojo; lo empezado va primero en "Esta semana" y con más de 3 a medias el bloque muestra solo esas ("Tenés N acciones a medias. Cerrá algunas antes de arrancar otra."); una acción en curso de fase vencida sigue contando como deuda; "Tus números" muestra inicial → actual → meta y solo comenta si mejoró ("bajó 6 puntos desde que arrancaste") — una métrica sin mediciones no se muestra, y el alumno carga el valor del mes desde el link (fila origen 'alumno'). **Sin botón "Tengo una consulta"**: el canal de consultas es del ticket 10 completo, botón incluido.
- **Backup con restauración probada** (prerequisito de la semana de observación): workflow nocturno en GitHub Actions que hace `pg_dump` de producción, lo restaura en un Postgres descartable del run (`npm run db:restaurar`: migraciones encima + filas verificadas contra el dump) y guarda el `.sql` como artifact 30 días. Ver DEPLOY.md paso 7.
