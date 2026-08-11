# +ACTIVOS — contexto para Claude

Dashboard financiero CFO-grade de +Activos Academy (módulo contable, **en producción y en uso**) + módulo interno de gestión de alumnos (en construcción).

---

## ⚠️ Antes de tocar nada

**1. Ramas.** No trabajes sobre la rama que te toque por defecto sin verificar:

| Rama | Rol |
|---|---|
| `claude/festive-sagan-yXyjY` | **Rama de desarrollo. Acá se trabaja.** |
| `produccion` | Producción. **Railway despliega solo de acá.** No pushear sin pedirlo. |
| `claude/frontend-developer-setup-pDsEf` | Rama por defecto de GitHub, **obsoleta**: le faltan ~18 commits. No trabajar acá. |
| `claude/epic-carson-7520ho`, `claude/margin-calculator-closers-er6dqd` | Proyectos aparte (web institucional, calculadora de márgenes), sobre base vieja. |

Si caíste en otra rama:

```bash
git fetch origin claude/festive-sagan-yXyjY
git checkout -B trabajo origin/claude/festive-sagan-yXyjY
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
- Alumnos: `ver_alumnos`, `editar_alumnos`

| Rol | Acciones |
|---|---|
| `LECTOR` | `ver` |
| `EDITOR` | `ver`, `editar` |
| `ADMIN` | todas |
| `CONSULTOR` | `ver_alumnos`, `editar_alumnos` — **sin `ver`: cero contabilidad** |

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
| 0–2 | Exploración · migraciones · rol consultor y ámbito por fila | hecho |
| 3 | Formulario público con token por alumno | siguiente |
| 4 | Panel del consultor: ficha, diagnóstico, índice de claridad | pendiente |
| 5 | Exportación del diagnóstico para la skill | pendiente |
| 6 | Asistente IA sobre el módulo | pendiente |

**Pendiente que arrastra el ticket 4:** el mecanismo de ámbito por fila está listo y testeado, pero todavía no hay endpoints ni repos de alumnos. Quien construya el panel tiene que aplicarlo **en la consulta** — no alcanza con exigir `ver_alumnos`.

Las 4 tablas del módulo están en `TABLAS_SENSIBLES` (excluidas del asistente IA) a propósito, hasta el ticket 6.
