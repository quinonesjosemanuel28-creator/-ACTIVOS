# +ACTIVOS — contexto para Claude

Dashboard financiero CFO-grade de +Activos Academy (módulo contable, **en producción y en uso**) + módulo interno de gestión de alumnos (en construcción).

---

## ⚠️ Antes de tocar nada

**1. Ramas.** No trabajes sobre la rama que te toque por defecto sin verificar:

| Rama | Rol |
|---|---|
| `desarrollo` | **Rama de desarrollo y rama por defecto del repo. Acá se trabaja.** |
| `produccion` | Producción. **Railway despliega solo de acá.** No pushear sin pedirlo. |
| `claude/frontend-developer-setup-pDsEf` | Vieja rama por defecto, **obsoleta**: le faltan ~18 commits. No trabajar acá. |
| `claude/epic-carson-7520ho`, `claude/margin-calculator-closers-er6dqd` | Proyectos aparte (web institucional, calculadora de márgenes), sobre base vieja. |

Si caíste en otra rama:

```bash
git fetch origin desarrollo
git checkout -B trabajo origin/desarrollo
```

**2. Si vas a tocar el módulo de alumnos, leé `MODULO-ALUMNOS.md` primero.** Está solo en la rama de desarrollo. Tiene el modelo de datos, las decisiones ya cerradas y el orden de construcción por tickets. No lo saltees: la mitad de las decisiones de diseño ya están tomadas ahí y volver atrás cuesta caro.

**3. `README.md` está desactualizado.** Describe la v1 local (SQLite, sin auth, 8 pantallas). Hoy hay Postgres, login con roles, y módulos de cierres, cobranza, comisiones, egresos y funnel. Para arquitectura sí sirve; para alcance, no le creas.

---

## Reglas duras

1. **No tocar el módulo contable** sin avisar. Es la única parte que hoy usa gente de verdad.
2. **Los permisos se aplican en la consulta a la base, no en la interfaz.** Ocultar un botón no es control de acceso: si la API no lo corta, no está protegido.
3. **Los consultores no ven NADA de contabilidad.** De ninguna unidad del holding.
4. **Los diagnósticos no se sobrescriben.** Cada envío es una fila nueva.
5. **Un ticket, un commit.** Que se pueda revertir sin arrastrar el resto.
6. **Ganan las convenciones que ya existen** en el repo por sobre cualquier documento. Si algo choca, avisá.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Suite Vitest completa. **Tiene que quedar en verde antes de commitear.** |
| `npm run typecheck` | TypeScript estricto (no hay ESLint en el repo: este es el linter). |
| `npm run build` | Build de producción (`tsc -b && vite build`). |
| `npm run dev` | API (:8787) + frontend (:5173). |
| `npm run seed` | Datos demo. |

Las dependencias las instala solo el hook de inicio (`.claude/hooks/session-start.sh`).

---

## Arquitectura

Regla de oro: **las dependencias apuntan hacia adentro.** El dominio no sabe que existen React, Express ni SQLite. `ui` nunca importa `infrastructure`.

```
src/domain/          TypeScript puro, cero dependencias. Toda la lógica y las reglas.
src/application/     Casos de uso + puertos (interfaces) + validación Zod en los bordes.
src/infrastructure/  Implementa los puertos: sqlite/, postgres/, excel/, anthropic/.
src/ui/              React. Solo muestra.
server/              Express: cablea aplicación + infraestructura y custodia las rutas.
```

**Doble motor de base.** Todo cambio de esquema va en los DOS lados, con el mismo tipo de columna:

- `src/infrastructure/sqlite/schema.ts` (desarrollo y tests)
- `src/infrastructure/postgres/schema.ts` (producción)

Las migraciones son aditivas e idempotentes (`ADD COLUMN IF NOT EXISTS`), porque corren contra tablas vivas.

---

## Autorización (dos ejes)

En `src/domain/auth/permisos.ts` — fuente de verdad única.

**Eje 1 · acciones.** Dos familias que NO se cruzan:

- Contable/admin: `ver`, `editar`, `importar`, `gestionar_usuarios`
- Alumnos: `ver_alumnos`, `editar_alumnos`, `eliminar_alumnos`

| Rol | Acciones |
|---|---|
| `LECTOR` | `ver` |
| `EDITOR` | `ver`, `editar` |
| `ADMIN` | todas |
| `CONSULTOR` | `ver_alumnos`, `editar_alumnos` — **sin `ver`: cero contabilidad. Sin `eliminar_alumnos`: gestiona su cartera, no la borra** |

`CONSULTOR` no es un escalón más de la escalera del contable. `puede()` es lista blanca por rol, no comparación de nivel.

**Eje 2 · ámbito por fila.** `todos` / `solo_los_mios`. Sale de la sesión vía `alcanceDe(res)`, **nunca de la query string**:

- `titularSegunAlcance(pedido, alcance)` — en listados. El filtro del cliente puede achicar el resultado, jamás ensancharlo.
- `alcanzaFila(alcance, titular)` — en la fila suelta. Si no la alcanza, responder como si no existiera.

Toda ruta declara su acción con `requiere(...)`, **incluidas las de lectura**. Tener sesión no alcanza para leer.

---

## Estado

**Contable:** en producción. Cierres, pagos, cobranza con cuotas y semáforo, comisiones, egresos, funnel por canal, asistente IA (text-to-SQL de solo lectura), auth con login y roles.

**Módulo de alumnos** (ver `MODULO-ALUMNOS.md` para el detalle):

| # | Ticket | Estado |
|---|---|---|
| 0–6 | Exploración · migraciones · rol y ámbito · formulario · panel · exportación · plan + seguimiento | hecho |
| 7 | Panel de control: estado y salud (7A) · documento del plan (7B) · seguimiento activo (7C) | hecho |
| 8 | El link del alumno: "Esta semana", copy sin castigo, último acceso, agrupado por KR | hecho |
| 9 | Cierre por acciones: 9A modelo · 9B cierre y métricas · contrato v3 · 9C paralelo · 9D vista del alumno · **9C switch** | hecho — el switch está en `desarrollo`, sin promover. Queda el ticket de limpieza (borrar `cumplido_en` + `marcado`), tras semanas de rodaje |
| 10 | Notas y bitácora: ciclo de vida de las notas (10A) · bitácora con traba actual (10B) | hecho (en `desarrollo`, sin promover) |
| — | Asistente IA sobre el módulo | **descartado** |

El seguimiento va **por fases 30/60/90, no por semanas** (el plan ya viene así de la skill). El contrato del bloque JSON que emite la skill vive en `CONTRATO-PLAN.md` (los dos lados).

Con el ticket 7 el módulo es un **panel operativo**: estado del alumno (ACTIVO/PAUSADO/FINALIZADO/ABANDONADO), semáforo de salud por brecha avance−tiempo, orden por riesgo, alerta de inactividad (>8 días sin check-in, la apaga un contacto registrado), WhatsApp con mensaje precargado (regla del 9 argentino), documento del plan versionado en la base (bytea/BLOB) y papelera con borrado lógico (`eliminar_alumnos`, solo ADMIN — el filtro `eliminado_en IS NULL` vive en la consulta).

Las tablas del módulo están TODAS en `TABLAS_SENSIBLES` (excluidas del asistente IA) — **permanente**: el asistente sobre el módulo quedó descartado.

Con el ticket 8, la vista del alumno (`/seguimiento/:token`) **orienta en vez de alarmar**: bloque "Esta semana" (3 acciones), día del plan explícito, acciones agrupadas bajo su KR, y nunca rojo ni "trabado" — esa regla es dura. Una reversa a saber: pasado el día 90 las casillas siguen marcables (revierte el ticket 6).

Con el ticket 9 (TICKET-9.md es la especificación): checkins extendido como única fuente del estado de las acciones (tres estados, solo `ejecutado` puntúa), KRs tipadas (`entregable` cierra sola por sus acciones, `metrica` por valor contra metas — sin casilla manual), `mediciones` append-only, y la skill emite el tipado (contrato v3, ya aplicado). El alumno marca los tres estados desde su link (círculo = ejecutado; el texto abre el detalle con nota), lo empezado va primero en "Esta semana", y "Tus números" muestra sus métricas sin juicio, con carga propia. ⚠️ **El switch de 9C está hecho** (25/08, tras la semana de observación: 2 divergencias, ambas mejoras): el semáforo del panel y la ficha miden **acciones ejecutadas contra la agenda del plan**. `cumplido_en` ya no se lee fuera del lado "viejo" del export de comparación (`GET /api/alumnos/comparacion-semaforo`, ámbito total), que queda como monitor de rodaje. La columna y `checkins.marcado` se borran en un ticket de limpieza posterior — hasta entonces, un revert del switch tiene de dónde volver a leer. Backup nocturno con ensayo de restauración: workflow de GitHub Actions + `npm run db:restaurar` (DEPLOY.md paso 7).

Con el ticket 10 (TICKET-10.md rev2): las notas del alumno tienen ciclo de vida DERIVADO (`nota_resoluciones` append-only — abierta sin resolución, la más nueva gana; responder exige devolución que VE el alumno, archivar la prohíbe), contador de abiertas en el panel, y área etiquetada al cerrar (la medición de qué le falta a la Academy). La bitácora del consultor es interna (el alumno JAMÁS la ve — test centinela sobre el payload público), append-only, registra contacto al cargar (apaga la alerta) y su traba vigente encabeza la ficha. Las consultas se resuelven por WhatsApp: la plataforma es el registro, no el canal.

⚠️ `npm run db:sembrar-desde-sqlite` (ex `db:migrar`): NO migra esquema — **siembra datos vaciando el destino**. Contra producción pisa datos reales. El esquema migra solo al arrancar la app; el que valida sin escribir es `db:validar`.

El flujo de fase 1 está completo punta a punta: alta → link → el alumno envía → ficha con índice de claridad y faltantes → corrección del consultor en la llamada (marca `editado_por_consultor`, recalcula el índice; la corrección NO crea fila — "fila nueva" es solo para envíos del formulario). El CONSULTOR tiene shell propio sin contable; ADMIN entra por la vista "Alumnos" del dashboard.

Las 4 tablas del módulo están en `TABLAS_SENSIBLES` (excluidas del asistente IA) a propósito, hasta el ticket 6.
