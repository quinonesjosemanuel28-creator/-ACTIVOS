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
| 2 | Rol consultor y reglas de acceso | pendiente |
| 3 | Formulario público con token por alumno | pendiente |
| 4 | Panel del consultor: ficha, diagnóstico, índice de claridad | pendiente |
| 5 | Exportación del diagnóstico para la skill | pendiente |
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
