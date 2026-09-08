# Ticket 11 — Rol OBSERVADOR y gestión de asignación

> Alcance sobre la matriz de permisos, el alta de alumnos y el panel del consultor.
> Depende de los tickets 7, 9 y 10.
> Tres bloques con commits separados: **11A** el rol · **11B** el selector en el alta · **11C** la reasignación.
> **No toca el cálculo del semáforo ni el modelo de datos de la cartera.**

> *Revisión 2 (septiembre 2026): incorpora las decisiones acordadas antes de ejecutar — la acción `registrar_seguimiento` en lugar de `escribir_bitacora` (cubre bitácora Y contactos: sin eso el observador podía abrir WhatsApp pero no registrar el contacto), el orden de ejecución 11B → 11C → 11A, la UI de solo lectura presupuestada dentro de 11A con test automatizado sobre las diez superficies de escritura, y el bloqueo de cambio de rol con cartera asignada. Los cambios respecto del documento original están marcados con «▲ rev2».*

---

## 1. Por qué

Dos problemas que se descubrieron relevando el código.

**El primero: hoy el equipo interno no puede trabajar sobre la misma cartera.** Matías Liberati hace las consultorías 1 a 1 y Alejandro Sosa el seguimiento, pero con un consultor por alumno y ámbito `solo_los_mios`, si un alumno está asignado a uno, el otro **no puede ni abrir la ficha**. El ticket 10B —la bitácora donde Matías deja lo que se trabajó en la llamada— no se puede usar como fue pensado.

**El segundo: el alta siempre asigna al creador.** La ruta `POST /api/alumnos` pasa el id de la sesión como `consultorId` y el schema no admite otro. Como las altas las dio el ADMIN, **los 10 alumnos de producción están asignados a su usuario**. Y no existe forma de reasignar desde la interfaz: hoy es tocar la base a mano.

---

## 2. Lo que ya está construido y no hay que rehacer

El relevamiento fue claro: **el modelo de datos está completo y esperando.**

- `alumnos.consultor_id` existe, es `NOT NULL`, tiene índice propio y de él se deriva todo el ámbito por fila.
- `alumno_consultor_historial` guarda tramos con `desde` y `hasta`, y se abre solo en el alta.
- **`cerrarTramoVigente(alumnoId, hasta)` está implementado en los dos motores y no lo llama nadie.** Quedó preparado en el ticket 1 esperando exactamente este ticket.

Lo que falta es la capa de operación: elegir consultor, reasignar, y el permiso que lo distinga de editar la ficha.

---

## 3. Decisiones tomadas

**Se descarta el estado "sin asignar".** Se evaluó hacer `consultor_id` nullable y se rechazó: es el invariante sobre el que se apoya todo el modelo de permisos, y el problema que resolvería —fichas invisibles— hoy es estructuralmente imposible. Si el admin no sabe a quién asignar, se lo queda él y lo reasigna después.

**El observador ve la cartera completa**, no una selección. Son diez alumnos y todos son del equipo interno. Acotar tiene sentido el día que haya consultores externos.

**El observador puede usar el botón de WhatsApp.** Es una acción sobre el alumno, no una edición. Pero **el contacto tiene que registrar quién lo hizo y verse en la ficha**: ese contacto apaga la alerta de inactividad, y sin el autor visible la alerta se apagaría sola sin que el consultor responsable sepa por qué.

**Un consultor por alumno.** No se modela co-asignación: `consultor_id` significa *quién es responsable*, y la bitácora del 10B registra quién intervino en cada sesión.

**La acción nueva es `registrar_seguimiento`, no `escribir_bitacora`.** ▲ rev2 — El documento original le daba al observador WhatsApp y bitácora, pero registrar el contacto (`POST /api/alumnos/:id/contactos`) exige hoy `editar_alumnos`: el observador habría podido abrir el chat sin que el contacto quedara registrado — exactamente el agujero que el §5.3 quiere evitar. Bitácora y contacto son la misma familia de acciones (dejar constancia de una intervención, sin editar nada), así que la acción se llama por lo que cubre: **`registrar_seguimiento` = escribir bitácora + registrar contacto**. Las dos rutas pasan de `editar_alumnos` a la acción nueva; CONSULTOR y ADMIN la reciben, con lo que su capacidad efectiva no cambia en nada.

---

## 4. Reglas duras

> **Los permisos van en la consulta a la base, no en la UI.** `puede()` es lista blanca por rol, como en todo el repo.

> **Toda reasignación cierra el tramo vigente y abre el nuevo, en la misma transacción.** Si no, `alumno_consultor_historial` miente y nadie se entera. La transacción vive en la infraestructura: la reasignación es **un método atómico del repo**, no una secuencia de llamadas desde el caso de uso (precedente: `cambiarFechaTx` — `db.transaction` en SQLite, `BEGIN/COMMIT` en Postgres). ▲ rev2

> **Ningún rol nuevo ve nada del módulo contable.** Test explícito.

> **Los permisos de los roles existentes no cambian.** Test de regresión sobre la matriz completa. El único movimiento interno es que bitácora y contactos pasan a `registrar_seguimiento` — el test verifica que la capacidad efectiva de CONSULTOR y ADMIN queda idéntica. ▲ rev2

---

## 5. Bloque 11A — Rol OBSERVADOR

*(Se ejecuta último: 11B → 11C → 11A. Ver §8.)* ▲ rev2

### 5.1 Qué es

Un rol de **solo lectura sobre toda la cartera, con permiso de registrar seguimiento**. Para el equipo interno que interviene sobre alumnos que no tiene asignados: coach empresarial, encargado de éxito.

| Puede | No puede |
|---|---|
| Ver el listado completo de alumnos y cualquier ficha | Editar la ficha del alumno |
| Ver diagnóstico, plan, OKRs, KRs, acciones y semáforo | Cargar o modificar el plan |
| Ver el documento del plan | Marcar o destildar acciones |
| Ver las notas del alumno y toda la bitácora | Cargar mediciones |
| **Escribir entradas de bitácora** | Responder o archivar notas del alumno |
| **Usar el botón de WhatsApp y que el contacto quede registrado** ▲ rev2 | Cambiar estado, fecha de inicio o eliminar fichas |
| — | Reasignar consultores |
| — | Ver absolutamente nada del módulo contable |

### 5.2 Permisos

Acción nueva en la matriz: ▲ rev2

```
registrar_seguimiento     (escribir bitácora + registrar contacto)
```

Asignación por rol:

| Rol | Ámbito sobre alumnos | Acciones |
|---|---|---|
| `OBSERVADOR` | **total** | `ver_alumnos`, `registrar_seguimiento` |
| `CONSULTOR` | `solo_los_mios` (sin cambios) | `ver_alumnos`, `editar_alumnos`, `registrar_seguimiento` |
| `ADMIN` | total (sin cambios) | todas |

Rutas que cambian de acción (capacidad efectiva de CONSULTOR/ADMIN idéntica): ▲ rev2

- `POST /api/alumnos/:id/bitacora`: `editar_alumnos` → `registrar_seguimiento`
- `POST /api/alumnos/:id/contactos`: `editar_alumnos` → `registrar_seguimiento`

El CHECK de `usuarios.rol` se actualiza en los dos motores con el precedente idempotente del repo (bloque DO en Postgres; en SQLite, nota de esquema — los tests parten de base limpia). ▲ rev2

**Nota sobre el export de comparación.** ▲ rev2 — `GET /api/alumnos/comparacion-semaforo` pide `ver_alumnos` con ámbito total interno, así que el OBSERVADOR va a poder verlo. **Aceptado a sabiendas**: es un monitor de rodaje de solo lectura sin datos contables, y muere entero en el ticket de limpieza del 9 (borrado de `cumplido_en`). No se gasta un permiso en una ruta condenada.

### 5.3 El botón de WhatsApp y el registro de contacto

El OBSERVADOR puede abrir el chat del alumno. El contacto se registra igual que hoy, con su `usuario_id` — la ruta ahora lo permite porque pide `registrar_seguimiento`. ▲ rev2

**Y la ficha tiene que mostrar quién registró cada contacto.** Hoy la alerta de inactividad lee el último contacto sin importar el autor: si Matías le escribe a un alumno de Alejandro, la alerta de Alejandro se apaga y él no sabe por qué. Mostrar el autor no cambia la lógica de la alerta — la hace legible.

### 5.4 La ficha en solo lectura ▲ rev2

El server rechaza cada escritura del OBSERVADOR, pero la ficha de hoy está escrita para un rol que puede escribir: estado, fecha de inicio, vencimientos de KR, selector de acciones, mediciones, notas, documento, link, papelera — todo clickeable. Un botón que se ve pero falla al clickear erosiona la confianza en los permisos aunque el server esté bien.

**Las superficies de escritura se ocultan por acción con `usePuede`, no por rol.** Son diez:

1. Editar la ficha (`PUT /api/alumnos/:id`) — `editar_alumnos`
2. Cambiar estado (`PUT /api/alumnos/:id/estado`) — `editar_alumnos`
3. Cambiar fecha de inicio (`PUT /api/planes/:id/fecha-inicio`) — `editar_alumnos`
4. Vencimientos de KR (`PUT /api/krs/:id`) — `editar_alumnos`
5. Selector de estado de acciones ☐◐☑ (`PUT /api/acciones/:id/estado`) — `editar_alumnos`
6. Cargar mediciones (`POST /api/krs/:id/mediciones`) — `editar_alumnos`
7. Responder / archivar notas (`POST /api/checkins/:id/resolucion`) — `editar_alumnos`
8. Subir documento del plan (`POST /api/planes/:id/documentos`) — `editar_alumnos`
9. Emitir / revocar link (`POST|DELETE /api/planes/:id/link`, `POST /api/alumnos/:id/token`) — `editar_alumnos`
10. Enviar a papelera (`DELETE /api/alumnos/:id`) — `eliminar_alumnos`

Bitácora y WhatsApp quedan visibles: son `registrar_seguimiento` y el OBSERVADOR las tiene.

**La verificación es un test automatizado que recorre las diez superficies, no una revisión visual.** Con diez, la forma de fallar es olvidarse una. Dos capas:

- Test de UI (testing-library, como `alumnosUi.test.tsx`): renderiza la ficha como OBSERVADOR y afirma que **ninguna** de las diez superficies está en el documento, y que bitácora y WhatsApp sí están. El mismo test renderiza como CONSULTOR y afirma que las nueve de `editar_alumnos` vuelven a aparecer (papelera es solo ADMIN).
- Test HTTP: las diez rutas responden 403 para un OBSERVADOR autenticado. El rechazo viene de la consulta, no de la UI.

### 5.5 Criterios de aceptación 11A

- [ ] Un OBSERVADOR ve el listado completo de alumnos y puede abrir cualquier ficha.
- [ ] Un OBSERVADOR **no** puede editar la ficha, cargar un plan, marcar acciones ni cargar mediciones. El rechazo viene de la consulta, no de la UI.
- [ ] Un OBSERVADOR **no** puede responder ni archivar notas del alumno.
- [ ] Un OBSERVADOR puede escribir una entrada de bitácora y queda con su `usuario_id`.
- [ ] Un OBSERVADOR puede usar el botón de WhatsApp y el contacto queda registrado con su autor. ▲ rev2 — posible porque la ruta pide `registrar_seguimiento`.
- [ ] La ficha muestra quién registró cada contacto de seguimiento.
- [ ] Un OBSERVADOR **no** accede a ninguna tabla del módulo contable.
- [ ] **Los permisos de ADMIN y CONSULTOR no cambian.** Test de regresión sobre la matriz completa, incluida la equivalencia efectiva tras el movimiento de bitácora/contactos a `registrar_seguimiento`. ▲ rev2
- [ ] **El test de las diez superficies pasa**: ninguna superficie de escritura visible para OBSERVADOR en la ficha, las diez rutas devuelven 403. ▲ rev2

---

## 6. Bloque 11B — Selector de consultor en el alta

### 6.1 El cambio

Hoy `POST /api/alumnos` fuerza `usuarioDe(res).id` como `consultorId`, y `alumnoInputSchema` no admite otro campo.

- Se agrega `consultorId` **opcional** al schema de alta.
- Si no viene, el comportamiento es el de hoy: se asigna el creador. **Cero cambio para quien no use el selector.**
- Si viene y es **el propio id del creador, es válido** y equivale a no mandarlo — mandar explícitamente lo que ya iba a pasar no es un privilegio. ▲ rev2
- Si viene con un id **distinto**, solo un ADMIN puede mandarlo. Un CONSULTOR que lo envíe recibe rechazo explícito, no un silencioso "se asignó a otro".
- El consultor elegido tiene que existir y tener rol CONSULTOR o ADMIN.

En la UI, `FormAlta` suma un desplegable de consultores, con el usuario actual preseleccionado. **El desplegable se muestra solo al ADMIN** ▲ rev2: la lista sale de `GET /api/usuarios`, que pide `gestionar_usuarios` — un CONSULTOR no puede listarla ni elegir a otro, así que para él el alta queda exactamente como hoy.

### 6.2 El tramo del historial

`crearAlumno` ya abre el primer tramo en `alumno_consultor_historial`. **Tiene que abrirlo con el consultor elegido, no con el creador.** Es el punto donde el historial puede empezar a mentir si se resuelve mal.

### 6.3 Criterios de aceptación 11B

- [ ] Un alta sin `consultorId` sigue asignando al creador, exactamente como hoy.
- [ ] Un alta con el **propio id** del creador es válida y equivale a no mandarlo. ▲ rev2
- [ ] Un ADMIN puede elegir otro consultor y el alumno queda asignado a él.
- [ ] Un CONSULTOR que manda `consultorId` distinto del propio recibe un rechazo explícito.
- [ ] Un `consultorId` inexistente o de un usuario sin rol habilitado se rechaza.
- [ ] El primer tramo del historial se abre con el consultor asignado, no con el creador.

---

## 7. Bloque 11C — Reasignación

### 7.1 El caso de uso

Acción nueva en la matriz:

```
reasignar_alumnos     → solo ADMIN
```

> **Por qué no puede viajar por el patch de edición.** Hoy CONSULTOR tiene `editar_alumnos`. Si la reasignación se hiciera por el PUT de la ficha, un consultor podría regalarse un alumno ajeno o desprenderse de uno propio. Tiene que ser una acción distinta.

**Endpoint propio**, no el patch de edición. Recibe el alumno y el consultor nuevo.

**La reasignación es un método atómico del repo** ▲ rev2 — la transacción vive en la infraestructura (precedente: `cambiarFechaTx`; `db.transaction` en SQLite, `BEGIN/COMMIT` en Postgres), no en el caso de uso. Dentro de la transacción:

1. Verificar que el consultor destino existe y tiene rol habilitado.
2. `cerrarTramoVigente(alumnoId, ahora)` — la función que ya existe y nadie llama.
3. Abrir el tramo nuevo con `desde = ahora` y `hasta = NULL`.
4. Actualizar `alumnos.consultor_id`.

Si cualquiera de los cuatro pasos falla, no se aplica ninguno.

### 7.2 Qué pasa con el consultor anterior

**Pierde el acceso completo e inmediato**, incluida la bitácora que él mismo escribió. No es un efecto secundario: es cómo funciona el ámbito derivado, y es coherente.

El conocimiento no se pierde: queda en la plataforma y **el consultor nuevo lee toda la historia previa**. Ese es exactamente el punto del bloque 10B.

Los registros históricos —contactos, checkins, mediciones, resoluciones de notas, entradas de bitácora— **mantienen su autor original**. No se reasignan ni quedan huérfanos: son un registro, y un registro no se reescribe.

### 7.3 Vista de carga antes de asignar

En la pantalla de reasignación, la lista de consultores muestra **cuántos alumnos tiene cada uno y cuántos están en rojo**.

Asignar a ciegas es cómo se sobrecarga a alguien sin querer. Es un `COUNT` agrupado y evita una conversación incómoda tres semanas después.

**Se resuelve del lado del cliente** ▲ rev2: la pantalla es solo ADMIN, que ya tiene el panel completo (ámbito total, con semáforo por fila) y `GET /api/usuarios`. Agrupar por consultor y contar rojos es un reduce sobre datos que ya viajan — no se agrega endpoint.

### 7.4 Reasignación múltiple

Poder seleccionar varios alumnos y moverlos juntos. Cada uno abre y cierra su propio tramo, todo en la misma transacción (batch en una sola transacción del repo). ▲ rev2

No es urgente, pero el caso va a aparecer el día que haya que mover una cartera entera — y hacerlo de a uno con la UI de a uno es cuando se cometen errores.

### 7.5 Cambio de rol con cartera asignada ▲ rev2

Con la reasignación disponible aparece un agujero nuevo: si el ADMIN le cambia el rol a un usuario con alumnos asignados (CONSULTOR → LECTOR, por ejemplo), esos alumnos quedan colgando de un responsable que ya no puede verlos — y nadie se entera hasta que algo falla.

**`cambiarRol` se bloquea si el usuario tiene alumnos asignados** (fuera de la papelera). El mensaje dice qué hacer: *"primero reasigná sus N alumnos"*. La baja (`darDeBaja`) queda como está — el borde de la tabla del §9 ya lo cubre: el ADMIN los reasigna, hasta entonces solo él los ve.

### 7.6 Corrección del estado actual

Los 10 alumnos de producción están asignados al ADMIN por el mecanismo del alta. **Redistribuirlos es el primer uso real de este bloque**, y sirve de prueba de humo: reasignar uno, verificar que el consultor nuevo lo ve y el anterior no, y que el historial quedó con dos tramos correctos.

### 7.7 Criterios de aceptación 11C

- [ ] Un ADMIN reasigna un alumno y el consultor nuevo lo ve al instante.
- [ ] El consultor anterior recibe 404 en la ficha y en todo lo que cuelga de ella.
- [ ] `alumno_consultor_historial` queda con el tramo anterior cerrado (`hasta` con fecha) y el nuevo abierto (`hasta` nulo).
- [ ] **No queda ningún tramo con `hasta` nulo duplicado para el mismo alumno.** Test explícito.
- [ ] Si falla cualquier paso, no se aplica ninguno: el alumno queda con su consultor original y el historial intacto.
- [ ] Un CONSULTOR no puede reasignar, ni por el endpoint nuevo ni por el patch de edición.
- [ ] Reasignar al mismo consultor que ya lo tiene: sin efecto, sin tramo nuevo, sin error.
- [ ] La pantalla de reasignación muestra la carga de alumnos de cada consultor.
- [ ] Los registros históricos mantienen su autor original después de la reasignación.
- [ ] El semáforo y la alerta de inactividad **no cambian** al reasignar.
- [ ] `cambiarRol` sobre un usuario con alumnos asignados se rechaza con el conteo en el mensaje. ▲ rev2

---

## 8. Notas de implementación

- **Orden de ejecución: 11B → 11C → 11A.** ▲ rev2 — 11B y 11C no dependen de 11A y destraban la necesidad operativa inmediata (redistribuir los 10 alumnos de producción, §7.6). 11A toca la matriz de permisos y va aislado al final: si algo sale mal, se revierte el rol sin perder el resto.
- **Commits separados por bloque.**
- Migraciones aditivas e idempotentes en los dos motores.
- Tests verdes antes de cada commit. Rama `desarrollo`; promover = merge a `produccion`.
- Tras promover 11C, la redistribución de los 10 alumnos de producción se hace como prueba de humo guiada (§7.6). ▲ rev2
- Si algo choca con una decisión que ya está en `MODULO-ALUMNOS.md`, **avisar cuál es el conflicto en vez de resolverlo solo.**

---

## 9. Estados de borde

| Situación | Comportamiento |
|---|---|
| Reasignar a un alumno en la papelera | No se puede: la ficha eliminada no admite operaciones |
| Reasignar al mismo consultor que ya lo tiene | Sin efecto, sin tramo nuevo, sin error |
| Consultor dado de baja con alumnos asignados | El ADMIN los reasigna; hasta entonces solo él los ve |
| Cambiarle el rol a un usuario con alumnos asignados | Rechazo: "primero reasigná sus N alumnos" ▲ rev2 |
| OBSERVADOR con un alumno pausado o finalizado | Lo ve y puede escribir bitácora igual |
| Alumno reasignado con notas abiertas | Las notas quedan; las resuelve el consultor nuevo |
| Contacto registrado por un OBSERVADOR | Apaga la alerta de inactividad, y la ficha muestra que fue él |

---

## 10. Lo que este ticket deja preparado

El ámbito acotado (`solo_los_mios`) sigue existiendo y sin cambios. Este ticket no lo debilita: agrega un rol que lo esquiva legítimamente para el equipo interno.

El día que haya consultores externos o franquiciados, `solo_los_mios` va a valer exactamente para lo que fue construido — y el rol OBSERVADOR va a poder acotarse a una selección de alumnos si hace falta, sin tocar nada de lo que se hace acá.
