# Ticket 9 — Medición automática: KRs que cierran solas y semáforo sobre datos reales

> Alcance sobre el módulo de alumnos. Depende de los tickets 7 y 8, ambos en producción.
> Cuatro bloques con commits separados: **9A** modelo · **9B** cierre y métricas · **9C** cambio de semáforo · **9D** vista del alumno.
> **Es el primer ticket que cambia a propósito un cálculo que ya corre en producción.** El roadmap está diseñado alrededor de eso.
>
> *Revisión 2 (agosto 2026): incorpora las tres correcciones de diseño acordadas — agenda del plan como denominador del tiempo, checkins extendido como única fuente de verdad, y paralelo on-read sin scheduler. Los cambios respecto de la revisión 1 están marcados con «▲ rev2».*

---

## 1. Por qué

Hoy el semáforo mide **KRs tildadas manualmente por el consultor**. Eso tiene dos problemas:

1. **Mide dos cosas mezcladas.** El color refleja tanto el avance del alumno como la diligencia del consultor en tildar. La semana que el consultor está ocupado, la cartera entera se pone naranja sin que ningún alumno haya hecho nada mal.
2. **Es la única señal del sistema que no se actualiza sola.** El alumno marca acciones en su link todos los días; ese dato existe y hoy no alimenta la medición.

El objetivo del ticket: que el sistema mida lo que efectivamente pasa, sin depender de que alguien registre el avance a mano.

---

## 2. Reglas duras

> **Ningún alumno cambia de color sin una decisión explícita.** El bloque 9C existe para eso: se calculan los dos semáforos en paralelo antes de switchear. Un cambio de color silencioso es un fallo del ticket, no un efecto secundario.

> **Se cambia una variable por vez.** El semáforo pasa a medir acciones, pero **los umbrales (−10 % / −25 %) y los 7 días de gracia no se tocan en este ticket.** Calibrarlos es trabajo aparte y posterior.

> **Una sola fuente de verdad por dato.** El estado de una acción vive en `checkins` y en ningún otro lado. ▲ rev2

> **La regla del ticket 8 sigue intacta.** La vista del alumno nunca muestra semáforo, rojo, "trabado" ni porcentajes de atraso.

---

## 3. Decisiones cerradas

### 3.1 El semáforo mide acciones ejecutadas — con el tiempo en la agenda del plan ▲ rev2

```
avance    = acciones ejecutadas / acciones totales del plan
esperadas = acciones de las fases YA VENCIDAS + (acciones de la fase actual × fracción transcurrida)
tiempo    = esperadas / acciones totales del plan
brecha    = avance − tiempo
```

Umbrales sin cambios: brecha ≥ −10 % verde · entre −10 % y −25 % naranja · por debajo de −25 % rojo · primeros 7 días neutro.

**Por qué el tiempo NO puede ser `días / 90`.** Al pasar el numerador a acciones, el denominador del tiempo dejó de corresponder: las acciones tienen fase y el reparto por fase es libre (el contrato *sugiere* 3-8 por fase pero solo advierte — `advertenciasDe`, no el schema). Con `días/90`, dos alumnos igual de perfectos dan colores distintos:

| Plan | Reparto | Día 30, Fase 1 completa | avance | `días/90` | brecha | Color |
|---|---|---|---|---|---|---|
| A | 8 / 8 / 8 (24) | 8 ejecutadas | 33 % | 33 % | 0 | 🟢 |
| B | 3 / 8 / 8 (19) | 3 ejecutadas | 16 % | 33 % | −17 % | 🟠 ✗ |
| C | 8 / 3 / 3 (14) | 8 ejecutadas | 57 % | 33 % | +24 % | 🟢 (y se queda verde semanas sin hacer nada) ✗ |

Con el tiempo sobre la agenda del plan, los tres dan **brecha 0** el día 30, que es lo correcto: los tres van al día.

**Propiedad que hay que fijar en un test:** en un plan de reparto parejo, la fórmula nueva da **exactamente lo mismo** que `días/90`. La divergencia aparece solo con planes desparejos, que es justo el caso que hoy se mide mal.

**Los tres planes de la tabla son fixtures obligatorios del test**, con brecha 0 el día 30.

### 3.2 Las acciones pasan de binario a tres estados

`pendiente` → `en_curso` → `ejecutado`.

Motivo: "Armar el tablero en Sheets con las columnas mínimas" es trabajo de varios días. Hoy vale 0 hasta que vale 1, así que un alumno puede estar dos semanas trabajando en serio y mostrar 0 % de avance.

> **Solo `ejecutado` cuenta para el semáforo.** Si `en_curso` sumara medio punto, el alumno marca las 30 acciones "en curso" en una tarde, muestra 50 % de avance y no terminó nada. No hace falta mala fe: "en curso" es el estado cómodo y todo tiende a quedarse ahí.

El estado intermedio no puntúa: sirve para distinguir **trabado** de **inactivo**, que hoy en el panel se ven idénticos.

| | Ejecutadas | En curso | Pendientes | Lectura |
|---|---|---|---|---|
| Alumno A | 4 | 9 | 17 | Trabajando y trabado en algo puntual |
| Alumno B | 4 | 0 | 26 | Se despegó del plan |

Es la misma distinción que `ultimo_acceso_link` hace a nivel alumno, ahora a nivel tarea — y además dice **en cuál** se trabó.

### 3.3 El estado vive en `checkins`, extendido ▲ rev2

**No se agrega `acciones.estado`, ni `accion_historial`, ni `marcado_por`.** Los tres quedan descartados: introducían una columna mutable, un log de auditoría y una tabla append-only preexistente compitiendo por el mismo dato, sin jerarquía declarada.

`checkins` ya es append-only, ya distingue `origen` y ya es de donde `estadoAcciones()` deriva el estado actual. Se extiende:

- `estado` — el estado que se está declarando (reemplaza al booleano `marcado`).
- `nota` — opcional, la nota que acompaña ese cambio.
- `usuario_id` — quién lo hizo cuando `origen = 'consultor'` (null cuando es el alumno).

Consecuencias buenas y gratis:
- **El historial de estados ya existe**: es la tabla. `accion_historial` sobraba.
- **Las notas no se pisan.** Cada nota es una fila nueva, con su fecha y su autor. Resuelve el riesgo de `acciones.nota` mutable sin trabajo extra.
- **La alerta de inactividad no se toca.** `ultimaActividadAlumno` sigue filtrando `origen === 'alumno'` y sigue funcionando tal cual.

Escribir solo una nota, sin cambiar de estado, crea igual una fila (con el mismo `estado` que la anterior). Es coherente con append-only.

### 3.4 Las métricas NO entran en el semáforo

El semáforo mide ritmo de ejecución; las métricas miden resultado. Mezclarlas reintroduce exactamente el problema que este ticket resuelve. Se muestran juntas, se calculan por separado.

### 3.5 Cada KR lleva un tipo

| Tipo | Cómo se cierra | Ejemplo (plan de Darío) |
|---|---|---|
| `entregable` | **Sola**, cuando todas sus acciones están en `ejecutado` | "Protocolo de cobranza escrito por tramo" |
| `metrica` | Con un **valor numérico** contra metas 30/60/90 | "Bajar la mora por debajo del 10 %" |

**Los planes ya cargados** tienen KRs sin tipo. Default `entregable` (comportamiento conservador: cierran solas). Las de tipo métrica se corrigen a mano — son 2 o 3 por plan.

---

## 4. Fuera de alcance

- Calibrar los umbrales del semáforo. Queda para después, con datos del nuevo cálculo.
- Notificaciones de cualquier tipo.
- El canal de consultas del alumno — **ticket 10 completo, el botón incluido**. En 9D no se renderiza nada de eso. ▲ rev2
- El snapshot de cierre a los 90 días.
- Serie histórica diaria de semáforos. El paralelo de 9C es on-read. ▲ rev2

---

## 5. Bloque 9A — Modelo de datos

**Aditivo puro. Cero cambio de comportamiento visible.**

```sql
-- tipo de KR y metas por tramo
ALTER TABLE krs ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entregable'
  CHECK (tipo IN ('entregable','metrica'));
ALTER TABLE krs ADD COLUMN IF NOT EXISTS valor_inicial DOUBLE PRECISION;   -- REAL en SQLite
ALTER TABLE krs ADD COLUMN IF NOT EXISTS meta_30 DOUBLE PRECISION;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS meta_60 DOUBLE PRECISION;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS meta_90 DOUBLE PRECISION;
ALTER TABLE krs ADD COLUMN IF NOT EXISTS unidad TEXT;                       -- '%' | '$' | 'clientes' | 'dias'
ALTER TABLE krs ADD COLUMN IF NOT EXISTS direccion TEXT
  CHECK (direccion IS NULL OR direccion IN ('sube','baja'));

-- checkins extendido: el estado y la nota viven acá ▲ rev2
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS estado TEXT
  CHECK (estado IS NULL OR estado IN ('pendiente','en_curso','ejecutado'));
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS nota TEXT;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS usuario_id TEXT REFERENCES usuarios(id);

-- mediciones, append-only (mismo patrón que checkins y contactos)
CREATE TABLE IF NOT EXISTS mediciones (
  id           TEXT PRIMARY KEY,
  kr_id        TEXT NOT NULL REFERENCES krs(id) ON DELETE CASCADE,
  valor        DOUBLE PRECISION NOT NULL,          -- REAL en SQLite
  origen       TEXT NOT NULL CHECK (origen IN ('alumno','consultor')),
  usuario_id   TEXT REFERENCES usuarios(id),       -- null cuando origen = 'alumno'
  cargado_en   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mediciones_kr ON mediciones(kr_id);
```

### 5.1 Por qué `estado` entra NULLABLE ▲ rev2

`checkins.marcado` es `NOT NULL` y tiene seis sitios de lectura. Si `estado` entrara con `NOT NULL DEFAULT 'pendiente'`, las filas históricas quedarían todas en `'pendiente'` en el mismo `ALTER` y se perdería la posibilidad de distinguir "no migrada" de "pendiente de verdad".

Entra nullable, se hace backfill idempotente, y el dominio lee con fallback:

```
estadoDe(checkin) = checkin.estado ?? (checkin.marcado ? 'ejecutado' : 'pendiente')
```

`marcado` **se sigue escribiendo** durante toda la transición, derivado del estado (`ejecutado → 1`, resto `→ 0`). Eso hace que 9A sea **reversible con un revert de código**: el código viejo sigue leyendo `marcado` y funcionando. Se borra un ticket después del switch, junto con `krs.cumplido_en`.

### 5.2 Migración de datos (dentro de 9A, presupuestada) ▲ rev2

No es solo esquema: hay que backfillear los checkins existentes.

```sql
UPDATE checkins
   SET estado = CASE WHEN marcado = 1 THEN 'ejecutado' ELSE 'pendiente' END
 WHERE estado IS NULL;
```

Idempotente por construcción (`WHERE estado IS NULL`). Corre en el arranque, con los dos motores, y lleva **test de idempotencia**: correrla dos veces deja exactamente el mismo resultado y no toca filas ya migradas.

### 5.3 Otros ajustes de 9A

- `direccion` no es cosmético: sin ella el sistema no sabe si 14 % está mejor o peor que 20 %. La mora *baja*, los clientes *suben*. Enum en Zod, `CHECK` en la base.
- `valor` numérico, no TEXT: con TEXT, `'9' > '10'` lexicográficamente y el cumplimiento da al revés.
- `mediciones` entra en `TABLAS_SENSIBLES` y en `TABLAS_NO_COPIADAS` (`server/scripts/tablas.ts`), como el resto del módulo.

### Criterios de aceptación 9A

- [ ] Migración corre sola al arrancar, en los dos motores, sin intervención manual.
- [ ] Todas las KRs existentes quedan en `tipo = 'entregable'`.
- [ ] Todos los checkins existentes quedan con `estado` coherente con su `marcado`.
- [ ] **La migración de datos es idempotente**, con test que la corre dos veces.
- [ ] `marcado` se sigue escribiendo: revertir el código de 9A deja la app funcionando.
- [ ] **Producción se ve exactamente igual que antes del deploy.** El semáforo de cada alumno da el mismo valor.
- [ ] `mediciones` queda dentro de `TABLAS_SENSIBLES` y de `TABLAS_NO_COPIADAS`.

---

## 6. Bloque 9B — Cierre automático y carga de métricas

**El tilde manual de KRs desaparece como forma de registrar avance.** El consultor no tiene cómo saber si una KR está cumplida salvo por lo que ejecutó el alumno — pedirle que lo registre aparte es duplicar el dato y volver a mezclar avance con diligencia del consultor.

Queda **una sola superficie de marcado: la acción**, y la pueden marcar los dos. De ahí se deriva todo lo demás.

> **Excepción de transición:** hasta el switch de 9C, el semáforo viejo sigue leyendo `krs.cumplido_en`. Por eso el campo no se borra en 9B — se deja de usar como entrada en el switch y se elimina un ticket después.

### 6.1 KRs entregables

- Una KR `entregable` es **puramente derivada**: está cumplida cuando todas sus acciones (las que la referencian por `kr_id`) están en `ejecutado`. No tiene estado propio ni casilla que tildar.
- Si una acción vuelve a `pendiente` o `en_curso`, la KR **se reabre** sola. El cierre es un cálculo, no un estado pegado.
- Una KR entregable **sin ninguna acción vinculada** nunca puede cerrar. Se muestra en el panel con el aviso `sin acciones vinculadas`. Se corrige agregando la acción que falta, no tildando la KR. Ver §9: el control se agrega también al contrato de la skill, donde hoy **no existe**.

### 6.2 Corrección: se hace sobre la acción, no sobre la KR

El alumno marca con optimismo — a veces "ya lo hice" significa "lo empecé". La corrección ocurre **en la acción**:

- El consultor puede cambiar el estado de cualquier acción desde el panel. Cada cambio es un **checkin nuevo** con `origen = 'consultor'` y `usuario_id`.
- Es una acción de excepción, no de rutina: se usa en la consultoría, cuando repasando el plan aparece algo que figura ejecutado y no está hecho.
- Sirve también para el caso inverso: el alumno avisa por WhatsApp que hizo algo y no lo marcó.

Una sola superficie, dos direcciones, todo auditado por la propia tabla.

### 6.3 KRs métrica

- Muestran valor inicial, metas por tramo y valor actual.
- El valor actual se carga desde el panel (consultor) o desde el link (alumno, ver 9D). Cada carga es una fila en `mediciones` — nunca se pisa la anterior.
- Se considera cumplida cuando el valor actual alcanza `meta_90` **en la dirección correcta**.
- Sin ninguna medición cargada: muestra `sin datos`. No se asume que arrancó ni que fracasó.

### 6.4 En el panel

Ficha del alumno: cada KR con su tipo y su estado derivado, y —si es métrica— la serie de valores cargados con fecha. Las KRs se muestran, **no se tildan**. Lo único operable son las acciones (cambiar estado) y la carga de mediciones.

### Criterios de aceptación 9B

- [ ] Poner en `ejecutado` la última acción de una KR entregable la cierra sin intervención.
- [ ] Sacar una acción de `ejecutado` reabre su KR.
- [ ] **No existe ninguna casilla para tildar una KR entregable a mano.**
- [ ] El consultor puede cambiar el estado de acciones desde el panel; cada cambio queda como checkin con `origen='consultor'` y `usuario_id`.
- [ ] **Un checkin con `origen = 'consultor'` NO silencia la alerta de inactividad**, aunque sea el más reciente de la acción. ▲ rev2
- [ ] Una KR entregable sin acciones vinculadas aparece señalada en el panel y no puede cerrarse por otra vía.
- [ ] Cargar una medición no pisa la anterior: quedan las dos, con fecha y autor.
- [ ] Una métrica con `direccion = 'baja'` y `meta_90 = 10` se cumple con 9, no con 11.
- [ ] Una métrica con `direccion = 'sube'` y `meta_90 = 30` se cumple con 31, no con 29.
- [ ] **El semáforo sigue calculándose sobre `krs.cumplido_en`.** Este bloque no lo toca.

---

## 7. Bloque 9C — El cambio de semáforo

El bloque delicado. Dos commits separados por una semana de calendario.

### 7.1 Tiempo uno — Cálculo en paralelo, on-read ▲ rev2

**Sin scheduler.** El repo no tiene ninguno (verificado: no hay cron, ni `setInterval`, ni dependencia de jobs), y montar uno para esto sería infraestructura nueva por una semana de uso.

- Se implementa el cálculo nuevo (sobre acciones, con la agenda del plan) **sin exponerlo**. El semáforo que se muestra sigue siendo el viejo.
- `panelAlumnos` ya recorre plan, KRs y checkins de cada alumno: calcular los dos semáforos ahí tiene **costo marginal cero**.
- Se expone en un **export ADMIN**: `GET /api/alumnos/comparacion-semaforo`, con `requiere('ver_alumnos')` + `exigirAmbitoTotal(alcanceDe(res), …)` — el mecanismo que el repo ya usa para "solo ámbito total", o sea ADMIN. Devuelve por alumno: color viejo, color nuevo, brecha vieja, brecha nueva, acciones ejecutadas/totales, KRs cumplidas/totales.
- El valor nuevo **no viaja** en la respuesta de `/api/alumnos/panel` que consumen los consultores.

Se pierde la serie histórica diaria. Para la pregunta que este bloque tiene que responder alcanza con ver los dos valores lado a lado al final de la semana.

### 7.2 La semana de observación

No se comprime: el insumo son días reales de actividad de alumnos reales. Por eso **la migración de los planes en curso va antes que este ticket** — sin cartera cargada y activa no hay nada que comparar. **Es la dependencia dura del cronograma, no el desarrollo.**

Al final de la semana, la pregunta por cada alumno es una sola:

> ¿Qué color describe mejor cómo viene este alumno, el viejo o el nuevo?

Si el nuevo acierta donde el viejo fallaba, el switch está justificado. Si falla en algún caso, se decide con ese caso concreto delante si el problema es el cálculo o el umbral.

> **Si la semana da CERO divergencia, el switch es seguro — no es un test que no corrió.** ▲ rev2
> Está verificado que en planes de reparto parejo la fórmula nueva es idéntica a
> `días/90` en los 91 días del trimestre. Si toda la cartera cargada tiene reparto
> parejo, la coincidencia total es el **resultado esperado**, y confirma que el
> switch no mueve ningún color. La divergencia solo puede aparecer con planes
> desparejos; si no hay ninguno cargado, no hay nada que diverger.
> Lo que sí hay que verificar en ese caso es que el export haya devuelto los dos
> valores por alumno (o sea: que el cálculo nuevo efectivamente corrió), no que
> los números sean distintos.

### 7.3 Tiempo dos — El switch

Un commit chico: el panel pasa a mostrar el semáforo nuevo y **deja de leer `krs.cumplido_en`**. El estado de las KRs queda 100 % derivado (entregables) o cargado como valor (métricas), y funciona como contador de resultado, sin color.

**La columna NO se borra en este commit.** ▲ rev2 Un revert de código no devuelve una columna borrada ni sus datos: si el switch sale mal, el semáforo viejo tiene que tener de dónde leer. `krs.cumplido_en` y `checkins.marcado` se eliminan **un ticket después**, con semanas de rodaje del cálculo nuevo.

Revertible con un revert de ese commit solo. Por eso va aparte de todo lo demás.

### Criterios de aceptación 9C

- [ ] Durante la semana de paralelo, el color mostrado **no cambia para ningún alumno**.
- [ ] El export ADMIN permite ver, por alumno, ambos colores y ambas brechas.
- [ ] Un CONSULTOR recibe 403 en el export de comparación.
- [ ] Después del switch, un alumno con el 60 % de sus acciones ejecutadas cuando la agenda esperaba el 60 % da verde.
- [ ] Un alumno con 10 % de acciones ejecutadas cuando la agenda esperaba 50 % da rojo.
- [ ] **Los tres planes de la tabla §3.1 dan brecha 0 el día 30.**
- [ ] **En un plan de reparto parejo, el tiempo nuevo es idéntico a `días/90`.**
- [ ] Un alumno cuyas acciones fueron marcadas solo por el consultor sigue disparando la alerta de inactividad.
- [ ] El switch es un commit aislado y revertible sin tocar 9A, 9B ni 9D, y **sin pérdida de datos**.

---

## 8. Bloque 9D — La vista del alumno

### 8.1 Orden vertical de la pantalla

Cada bloque responde **una sola pregunta**. Nada se repite entre bloques.

| # | Bloque | Pregunta que responde |
|---|---|---|
| 1 | Saludo + `Día 37 de 90 · te quedan 53` + barra neutra | ¿Dónde estoy? |
| 2 | Aviso de desfase (solo si hay deuda de fases vencidas) | ¿Estoy atrasado? |
| 3 | **Esta semana** — 3 acciones | ¿Qué hago ahora? |
| 4 | **Tus números** — las métricas | ¿Cómo voy? |
| 5 | **Tu plan completo** — fases con acciones agrupadas por KR | ¿Qué falta? |
| 6 | "Guardá este link" | — |

▲ rev2 — El botón "Tengo una consulta" **no se renderiza en 9D**. Es del ticket 10 completo, botón incluido.

> **"Esta semana" va antes que "Tus números".** El link existe para que el alumno ejecute: una motivación que requiere scrollear sigue funcionando, una llamada a la acción que requiere scrollear no. El criterio del ticket 8 —"Esta semana entra completo en la primera pantalla sin scroll"— **se mantiene intacto**.

### 8.2 Un solo gesto por elemento

- **El círculo de la izquierda marca `ejecutado`.** Un toque, exactamente como hoy. Es el 90 % de los casos y no cambia.
- **El texto de la acción abre el detalle**, donde viven el selector de estado y la nota.

Los estados y las notas no agregan **ni un elemento** a la pantalla principal. Área táctil del círculo: mínimo 44 × 44 px, separada de la del texto.

### 8.3 `en_curso` en el bloque "Esta semana" ▲ rev2

Una acción `en_curso` **sigue apareciendo** en el bloque de 3, y **va primero**.

Si desapareciera, el bloque escondería trabajo empezado y sin cerrar — que es
justo el perfil que más hay que vigilar: el alumno que abre muchos frentes y no
termina ninguno.

Reglas:

- Dentro de los 3 cupos, las `en_curso` van **antes** que las pendientes.
- **Si hay más de 3 en curso, se muestran solo esas** (las que entren), con una
  línea arriba del bloque:
  > `Tenés N acciones a medias. Cerrá algunas antes de arrancar otra.`
  El tono es el del ticket 8: describe, no reprocha. Sin rojo.
- Una acción `en_curso` de una **fase vencida sigue contando como deuda**, igual
  que una pendiente: para `deudaVencida` lo único que cierra es `ejecutado`.

### 8.4 Un solo lenguaje visual nuevo

- `ejecutado` — tachado con check, como hoy
- `en_curso` — dorado suave, con la etiqueta "En curso" debajo del texto
- `pendiente` — sin tratamiento

Tres estados, **dos tratamientos visuales**. Si cada estado tuviera color propio, con 30 acciones la pantalla se convierte en un semáforo — y eso rompe la regla dura del ticket 8.

### 8.5 El detalle de la acción

Se abre al tocar el texto. Contiene:

- El texto de la acción
- Selector de estado: `Pendiente` · `En curso` · `Ejecutado`
- Campo de nota: *"¿Qué pasó con esta acción?"* — opcional, siempre

Cada guardado crea un **checkin nuevo** con su estado y su nota: las notas se acumulan, no se pisan. La última se muestra en la ficha del panel junto a la acción. En este ticket es solo una nota: no se deriva ni espera respuesta. El interruptor *"quiero que me respondan"* y el flujo de derivación son del **ticket 10** — prometer una respuesta que nadie va a contestar es peor que no ofrecerla.

### 8.6 Las métricas

```
Mora de tu cartera
20 %  →  14 %  →  meta 10 %
```

- **Nunca rojo**, nunca "no llegaste", nunca porcentaje de atraso.
- Si el valor se movió en la dirección correcta: *"bajó 6 puntos desde que arrancaste"*. Si no se movió, el número solo, sin comentario.
- Una métrica sin mediciones **no se muestra**. No se deja un hueco vacío.
- Van agrupadas en su propio bloque, no dentro de las fases.

**Carga por el alumno:** un campo para que cargue él mismo el valor del mes. Es un dato que necesita para su propio negocio, no un reporte que le pedimos. Crea una fila en `mediciones` con `origen = 'alumno'`.

### Criterios de aceptación 9D

- [ ] El bloque "Esta semana" entra completo en la primera pantalla de un iPhone en vertical, sin scroll.
- [ ] Tocar el círculo marca `ejecutado` sin abrir nada.
- [ ] Tocar el texto abre el detalle con estado y nota; no marca la acción.
- [ ] Una acción en `en_curso` se ve distinta de una pendiente y de una ejecutada, en dorado, sin rojo.
- [ ] Una acción en `en_curso` aparece en "Esta semana" y **antes** que las pendientes.
- [ ] Con 4+ acciones en `en_curso`, el bloque muestra solo esas y el aviso de "acciones a medias".
- [ ] Una acción en `en_curso` de una fase vencida cuenta como deuda.
- [ ] Guardar una nota crea un checkin nuevo; la nota anterior no se pierde.
- [ ] La nota más reciente del alumno aparece en la ficha del panel del consultor.
- [ ] Una métrica sin mediciones no aparece en la vista del alumno.
- [ ] Cargar un valor desde el link crea una fila en `mediciones` con `origen = 'alumno'`.
- [ ] En ningún estado aparece rojo, semáforo, "trabado" ni lenguaje de incumplimiento.
- [ ] **No aparece el botón "Tengo una consulta" ni ningún interruptor de respuesta** (todo eso es del ticket 10).

---

## 9. Contrato de la skill — tercera actualización

`plan-okr-90-dias` pasa a emitir el tipo de cada KR. **El dato ya existe en el documento**: la tabla de KRs de la sección 5 tiene la meta de cada una. Es extraerlo al contrato, no inventarlo.

```json
{
  "orden": 1,
  "texto": "Bajar la mora total de la cartera",
  "meta": "por debajo del 10%",
  "tipo": "metrica",
  "valor_inicial": 20,
  "meta_30": 16,
  "meta_60": 13,
  "meta_90": 10,
  "unidad": "%",
  "direccion": "baja"
}
```

```json
{
  "orden": 3,
  "texto": "Protocolo de cobranza escrito por tramo",
  "meta": "con guiones y plazos",
  "tipo": "entregable"
}
```

Reglas de emisión a agregar en `SKILL.md`:

- `tipo` obligatorio en cada KR. Si el KR se expresa como un número que tiene que moverse, es `metrica`; si es algo que existe o no existe, es `entregable`.
- Para `metrica`: `valor_inicial`, `meta_90`, `unidad` y `direccion` obligatorios; `meta_30` y `meta_60` recomendados. Los valores van como **número**, sin comillas ni símbolo (el símbolo va en `unidad`).
- `direccion` es `"sube"` o `"baja"`, exactamente.
- El `valor_inicial` sale del diagnóstico. Si el diagnóstico no lo trae, el KR se emite como `entregable` y el dato va a la sección 12 del documento como pendiente. **No inventar valores de partida.**
- **Toda KR `entregable` tiene que tener al menos una acción que la referencie** (`okr` + `kr`). Una entregable sin acciones no puede cerrarse nunca: el plan la declara pero no la ejecuta. ▲ rev2
- Regla de proporción: la mayoría de las KRs de un plan son entregables. Si más de la mitad salen `metrica`, revisar.

Del lado de la app: `tipo` es aditivo (sin él, todo entra como `entregable`), pero se agrega **una advertencia nueva en la previa** — hoy `advertenciasDe` avisa por OKR sin acciones, no por KR: ▲ rev2

> `El KR "…" del OKR N es entregable y ninguna acción lo referencia: no va a poder cerrarse nunca.`

---

## 10. Notas de implementación

- **Commits separados por bloque.** 9C se parte en dos commits propios (paralelo / switch), con la semana de por medio.
- **El cálculo vive en el dominio**, puro y testeable, como el del ticket 7. La UI solo pinta.
- Migraciones en `SCHEMA_SQL_PG` y su espejo SQLite, aditivas e idempotentes.
- `checkins` y `mediciones` son **append-only**, como contactos.
- Tests verdes antes de cada commit. Los tests del ticket 7 que fijan valores del semáforo viejo **se conservan** hasta el switch; en el switch se actualizan en el mismo commit, no antes.
- Rama `desarrollo`. Promover = merge a `produccion`.

---

## 11. Estados de borde

| Situación | Comportamiento |
|---|---|
| Plan sin acciones cargadas | Sin semáforo (neutro, motivo "sin plan"), como hoy |
| Primeros 7 días | Neutro, como hoy |
| Alumno pausado / finalizado / abandonado | Sin semáforo, como hoy |
| Pasado el día 90 | Fase "Vencido"; `tiempo` se clava en 1; las casillas siguen marcables (ticket 8) |
| Fase con 0 acciones | Aporta 0 a `esperadas`. No rompe el cálculo |
| KR entregable sin acciones vinculadas | No cierra nunca; aviso en el panel y en la previa del plan |
| KR métrica sin mediciones | "Sin datos". No cuenta como cumplida ni como incumplida |
| Acción sin `kr_id` | Cuenta para el semáforo; no cierra ninguna KR |
| Acción en `en_curso` | No cuenta para el semáforo. Solo `ejecutado` puntúa |
| Acción en `en_curso` en "Esta semana" | Se queda y va primero de los 3 |
| Más de 3 acciones en `en_curso` | El bloque muestra solo esas, con el aviso de "acciones a medias" |
| Acción en `en_curso` de una fase vencida | Cuenta como deuda, igual que una pendiente |
| Checkin sin `estado` (previo a 9A) | Se lee con fallback desde `marcado` |
| Checkin con `origen='consultor'` | Cuenta para el estado de la acción; **no** para la alerta de inactividad |
| Todas las acciones ejecutadas antes del día 90 | Verde. El adelanto no penaliza |

---

## 12. Orden de ejecución

1. **Migrar los planes en curso** — antes de todo. 9C necesita cartera real y activa para comparar. **Es la dependencia dura del cronograma.**
2. **Backups automáticos con restauración probada** — antes de tocar el cálculo. Es medio día y elimina el riesgo más grande de la plataforma.
3. 9A → 9B → actualización de la skill → 9C paralelo → **semana de observación** → 9C switch → 9D.
4. Un ticket después del switch: borrar `krs.cumplido_en` y `checkins.marcado`.
