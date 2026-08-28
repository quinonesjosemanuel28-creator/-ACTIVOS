# Ticket 10 — Notas y bitácora

> Alcance sobre el panel del consultor y la vista pública `/seguimiento/:token`.
> Depende de los tickets 8 y 9, ambos en producción.
> Dos bloques con commits separados: **10A** ciclo de vida de las notas del alumno · **10B** bitácora del consultor.
> **Aditivo: no toca el cálculo del semáforo, ni el estado de las acciones, ni la matriz de permisos.**
>
> *Revisión 2 (agosto 2026): incorpora las seis correcciones acordadas antes de ejecutar. Los cambios respecto del documento original están marcados con «▲ rev2».*

---

## 1. Por qué

Dos problemas distintos, y la ficha del alumno es el lugar donde los dos se resuelven.

**El primero es un defecto de algo que ya está en producción.** El ticket 9 le dio al alumno un campo de nota en cada acción. Esa nota hoy queda archivada: no se le puede dar devolución, no se puede cerrar, y queda latente en el panel del consultor. En dos semanas de uso, el panel se llena de notas viejas que nadie puede cerrar.

**El segundo es un hueco.** Cuando un consultor hace una consultoría 1 a 1 con un alumno, lo que pasó en esa llamada no queda en ningún lado. Si después otro abre la ficha, no tiene forma de saber en qué está trabado ese alumno ni qué se acordó. Esa información vive hoy en la cabeza de quien hizo la sesión.

---

## 2. La decisión que ordena el ticket

**Las consultas se resuelven por WhatsApp. La plataforma es el registro, no el canal.**

Se evaluó construir un canal de consultas completo dentro de la app —con derivación por área, rol de referente y hilo de mensajes— y se descartó. Motivos:

- **En adopción, WhatsApp gana.** Un prestamista manda dos minutos de audio antes de sentarse a escribir en un formulario. Un canal que no se usa vale cero.
- El alumno ya tiene un motivo para volver al link: marcar sus acciones. La consulta no necesita ser el gancho.
- La derivación con rol nuevo es infraestructura de helpdesk para un volumen que todavía no existe.

Lo único que WhatsApp **no** puede dar, y que este ticket sí conserva: el **contexto** (la nota atada a la acción donde se trabó), el **registro** (lo que se resolvió hace tres semanas sigue existiendo, y sobrevive a un cambio de consultor) y la **medición** (qué área concentra las trabas de la cartera).

---

## 3. Reglas duras

> **La bitácora del consultor no la ve el alumno. Nunca.** Ahí se va a escribir "no está ejecutando" o "le cuesta sostener el ritmo": es lenguaje interno. Las tablas de bitácora no se consultan desde el endpoint público del link.

> **La devolución de una nota SÍ la ve el alumno.** Son dos campos con audiencias opuestas conviviendo en la misma ficha: la UI lo marca agresivamente en el punto de escritura («Esto lo ve el alumno» / «Interno — el alumno nunca lo ve»). ▲ rev2

> **Las reglas del ticket 8 siguen intactas.** La vista del alumno no muestra semáforo, rojo, "trabado" ni porcentajes de atraso. Una nota sin responder no es un reproche.

> **Append-only en serio.** ▲ rev2 — `checkins` NO gana columnas mutables: el ciclo de vida de la nota vive en una tabla nueva append-only (`nota_resoluciones`) y el estado actual se DERIVA (gana la resolución más nueva), igual que `estadoAcciones` y `estadosDeKrs`. La bitácora tampoco se edita ni se borra.

---

## 4. Fuera de alcance

- Canal de consultas con derivación por área y rol de referente.
- Hilo de mensajes, respuestas anidadas, adjuntos.
- Notificaciones de cualquier tipo.
- Alertas por consulta sin responder.

Se reevalúan cuando haya volumen real y se sepa cómo se usa esto.

---

## 5. Bloque 10A — Ciclo de vida de las notas del alumno

Hoy la nota del alumno existe (ticket 9, en `checkins.nota`) pero no tiene ciclo de vida. Este bloque se lo da.

### 5.1 Modelo de datos ▲ rev2

```sql
-- Resoluciones de nota, append-only. El "estado actual" de una nota se
-- DERIVA: gana la resolución más nueva de su checkin; sin filas = abierta.
CREATE TABLE IF NOT EXISTS nota_resoluciones (
  id          TEXT PRIMARY KEY,
  checkin_id  TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  estado      TEXT NOT NULL,            -- 'resuelta' | 'archivada' (Zod, no CHECK)
  area        TEXT,                     -- opción de negocio: solo Zod
  devolucion  TEXT,                     -- lo que ve el alumno (solo con 'resuelta')
  usuario_id  TEXT NOT NULL REFERENCES usuarios(id),
  creada_en   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nota_res_checkin ON nota_resoluciones(checkin_id);
```

Por qué así y no columnas sobre `checkins` (la alternativa del documento original):

- **No hay backfill**: una nota vieja sin resolución ES abierta por definición. 10A no toca ninguna tabla viva.
- **Una devolución con error se corrige** agregando otra resolución (la última gana), sin editar historia.
- Es el patrón que el repo ya usa tres veces; un revert de 10A no deja columnas muertas.
- `estado` y `area` **sin CHECK**: son opciones de negocio y crecen — se validan solo en Zod, como `contactos.canal` (convención del repo). ▲ rev2

La tabla va a `TABLAS_SENSIBLES` y `TABLAS_NO_COPIADAS`. ▲ rev2

### 5.2 Qué puede hacer el consultor

En la ficha del alumno, cada nota con su acción de origen y tres acciones posibles:

- **Responder** — escribe la devolución. La nota pasa a `resuelta` y **la devolución aparece en el link del alumno**, junto a la acción donde preguntó.
- **Archivar** — la nota sale del panel sin devolución. Para lo que no requiere respuesta.
- **Etiquetar el área** al resolver o archivar: legal, contable, marketing, ventas, estructura u otra.

El panel muestra por defecto **solo las notas abiertas**. Las resueltas y archivadas quedan en una lista colapsada.

**El panel de alumnos muestra cuántas notas abiertas tiene cada uno** («2 notas» en la fila). ▲ rev2 — sin notificaciones (descartadas), esta es la única forma de que una nota nueva se descubra sin abrir cada ficha; el panel ya recorre los checkins, el costo es cero.

> **La etiqueta de área es lo que más rinde a largo plazo.** Es un desplegable de un clic al cerrar, y con 50 notas cargadas te dice qué área concentra las trabas de la cartera. Si el 40% son legales, eso no es un problema de soporte: es una clase que falta en la Academy.

### 5.3 Botón de WhatsApp con contexto

Junto a cada nota abierta, un botón que abre el chat del alumno con el mensaje precargado: su nombre y el texto de la nota. Reutiliza la normalización de teléfonos y la regla del 9 del ticket 7.

El flujo real: ves la nota, apretás WhatsApp, resolvés la conversación ahí, volvés y escribís la devolución en dos líneas.

### 5.4 Qué ve el alumno ▲ rev2

El payload público del link **hoy no incluye la nota** (decisión del ticket 9: mínimo indispensable). 10A la agrega: por acción, **la última nota propia y su devolución** si existe — sin historial de notas viejas. El test que fija las claves del payload se actualiza a propósito, como en cada ticket.

En el detalle de la acción: su nota y, debajo, la devolución cuando existe. Sin estados intermedios, sin "en revisión", sin nada que parezca un ticket de soporte.

Una nota archivada sin devolución no le muestra nada distinto de hoy. Si escribe de nuevo sobre la misma acción, es una nota nueva con su propio estado.

### 5.5 Criterios de aceptación 10A

- [ ] Las notas existentes en producción aparecen como abiertas **sin migración de datos** (derivación pura). ▲ rev2
- [ ] La ficha muestra por defecto solo las notas abiertas.
- [ ] El panel de alumnos muestra el contador de notas abiertas por fila. ▲ rev2
- [ ] Responder una nota la saca de las abiertas y muestra la devolución en el link del alumno.
- [ ] Archivar una nota la saca de las abiertas **sin** mostrarle nada nuevo al alumno.
- [ ] Al resolver o archivar se puede etiquetar el área, y queda registrado quién y cuándo.
- [ ] Una segunda resolución sobre la misma nota reemplaza a la primera en TODAS las lecturas (corrección sin editar historia). ▲ rev2
- [ ] El botón de WhatsApp abre el chat con el nombre y el texto de la nota precargados.
- [ ] En ningún estado aparece rojo, semáforo ni lenguaje de reproche en la vista del alumno.
- [ ] Un CONSULTOR solo resuelve notas de su cartera (la ajena responde como inexistente).
- [ ] **El semáforo de cada alumno da el mismo valor antes y después del deploy.**

---

## 6. Bloque 10B — Bitácora del consultor

Lo que convierte la ficha en la historia del alumno.

### 6.1 Modelo de datos ▲ rev2

```sql
CREATE TABLE IF NOT EXISTS bitacora (
  id             TEXT PRIMARY KEY,
  alumno_id      TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  texto          TEXT NOT NULL,
  tipo_contacto  TEXT NOT NULL,        -- opción de negocio: solo Zod
  traba_actual   TEXT,
  usuario_id     TEXT NOT NULL REFERENCES usuarios(id),
  creada_en      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bitacora_alumno ON bitacora(alumno_id);
```

Cambios sobre el documento original: `ON DELETE CASCADE` (sin él, la **purga definitiva** de la papelera fallaría con error de FK — `DELETE FROM alumnos` confía en el cascade), índice por alumno, FK real a `usuarios`, y `tipo_contacto` sin CHECK (opción de negocio, crece: se valida en Zod). ▲ rev2

**Append-only.** No se edita ni se borra: es historia. Si algo cambia, se agrega una entrada nueva.

Va a `TABLAS_SENSIBLES` y `TABLAS_NO_COPIADAS`, y **no se consulta nunca desde el endpoint público del link**.

### 6.2 Cómo se carga

**Texto libre, sin formulario.** Un coach que sale de una llamada de una hora quiere escribir cuatro líneas, no completar campos. Si tiene estructura, no la carga.

Dos cosas más, y solo dos:

- **Tipo de contacto**, un desplegable de un clic: `consultoria_1a1`, `llamada_seguimiento`, `whatsapp`, `otro`.
- **Traba actual**, un campo corto y **opcional**.

### 6.3 La bitácora registra el contacto ▲ rev2

Cargar una entrada **registra también un contacto** (tabla `contactos`, misma operación): la alerta de inactividad se apaga sola. Sin esto quedaban dos opciones malas: doble carga (bitácora + botón de contacto) o la alerta gritando por un alumno que tuvo su 1-a-1 ayer. Un gesto, dos efectos. La alerta no se toca: sigue leyendo `contactos`, como siempre.

### 6.4 La traba actual

Es el campo que hace que la bitácora sirva en cinco segundos en lugar de haber que leerla.

La última traba cargada se muestra **destacada en la cabecera de la ficha**, con su fecha y su autor, y persiste hasta que otra entrada la reemplace:

```
Traba actual · 18/08 · Matías Liberati
No consigue que el contador le arme la SAS. Está frenado ahí hace tres semanas.
```

Una entrada de bitácora sin `traba_actual` no pisa la anterior: solo se reemplaza cuando alguien escribe una nueva.

> **Por qué esto importa junto al ticket 9.** El semáforo te dice **que** un alumno está en rojo. La bitácora te dice **por qué**. Un alumno rojo porque se le murió un familiar y otro rojo porque abandonó son el mismo color en el panel y dos situaciones opuestas — sin este campo, el sistema te empuja a tratarlos igual.

### 6.5 Quién ve qué

- **CONSULTOR:** carga y lee la bitácora de los alumnos de su cartera. Ámbito por fila, como siempre.
- **ADMIN:** todas.
- **El alumno:** nada. La bitácora no existe para él.

Sin roles nuevos. Se usa la matriz de permisos que ya está.

### 6.6 Criterios de aceptación 10B

- [ ] Un consultor carga una entrada de bitácora y queda con su autor, tipo de contacto y fecha.
- [ ] Cargar una entrada apaga la alerta de inactividad (registra contacto en la misma operación). ▲ rev2
- [ ] La bitácora es append-only: no hay forma de editar ni borrar una entrada.
- [ ] La última `traba_actual` cargada se muestra en la cabecera de la ficha con fecha y autor.
- [ ] Una entrada sin `traba_actual` no borra ni pisa la anterior.
- [ ] **Ningún endpoint público devuelve datos de bitácora.** Test explícito contra el link del alumno.
- [ ] Un CONSULTOR ve la bitácora solo de los alumnos de su cartera (la ajena, inexistente).
- [ ] La tabla `bitacora` está en `TABLAS_SENSIBLES` y `TABLAS_NO_COPIADAS`. ▲ rev2
- [ ] La purga definitiva de un alumno en papelera no falla con bitácora cargada. ▲ rev2

---

## 7. Notas de implementación

- **Commits separados por bloque.** Con la rev2, 10A tampoco toca tablas vivas: los dos bloques agregan una tabla nueva cada uno. Si 10A da problemas, 10B se sostiene solo.
- Migraciones aditivas e idempotentes en los dos motores.
- Tests verdes antes de cada commit. Rama `desarrollo`; promover = merge a `produccion`, solo cuando José lo pida.
- Si algo de este documento choca con una decisión que ya está en `MODULO-ALUMNOS.md`, **avisar cuál es el conflicto en vez de resolverlo solo.**

---

## 8. Estados de borde

| Situación | Comportamiento |
|---|---|
| Nota sobre una acción que después se destilda | La nota sigue viva; no depende del estado de la acción |
| Alumno `pausado` o `finalizado` | Puede seguir dejando notas mientras el token viva; la bitácora se sigue cargando |
| Alumno en la papelera | El link deja de resolver; notas y bitácora quedan en la base (la purga DEFINITIVA borra todo por cascade, como el resto del alumno) ▲ rev2 |
| Nota archivada y el alumno vuelve a escribir sobre la misma acción | Es una nota nueva (checkin nuevo), con su propio estado |
| Consultor dado de baja | Sus entradas de bitácora y resoluciones quedan con su `usuario_id` histórico |
| Cambio de consultor asignado | El consultor nuevo lee toda la bitácora previa: ese es el punto del bloque |
| Checkin con nota Y cambio de estado en la misma fila | El ciclo de vida aplica a la nota; el estado de la acción no se ve afectado por resolver/archivar |

---

## 9. Lo que este ticket deja preparado

Con las notas etiquetadas por área y la bitácora cargada, en dos o tres meses vas a poder responder dos preguntas que hoy no tienen dónde apoyarse:

1. **Qué área concentra las trabas de la cartera** — y por lo tanto qué contenido le falta a la Academy.
2. **Qué pasó realmente con cada alumno** más allá del color del semáforo.

Ninguna de las dos se construye: emergen de usar esto durante un trimestre.
