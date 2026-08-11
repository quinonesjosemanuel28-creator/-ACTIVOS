# Formulario de diagnóstico — Especificación funcional

**Programa:** Prestamista a Empresario / De Cero a Gestor Financiero
**Destino:** módulo de gestión de alumnos, app interna del holding (Railway)
**Versión:** 1.0 — Agosto 2026

---

## 1. Criterios de diseño

Cinco reglas que ordenan todo el formulario:

1. **Todo lo que sea plata, porcentaje o cantidad es campo numérico, no texto.** Un rango ("de $600.000 a $1.000.000") no se puede graficar, ni comparar entre alumnos, ni usar para medir avance a los 90 días. Un solo número, aunque sea estimado.
2. **Toda pregunta métrica tiene la salida "No lo tengo claro".** Ver sección 2 — es una decisión de producto, no de formulario.
3. **Dos momentos de carga.** El alumno completa antes de la consultoría; el consultor completa o corrige desde el panel durante la llamada. Mismo formulario, dos accesos.
4. **Las obligatorias son pocas y son las duras.** Marcadas abajo. El resto puede quedar vacío sin bloquear el envío.
5. **Cada pregunta tiene un nombre de campo estable.** Es lo que después consume la skill del plan de 90 días. No cambiar los nombres una vez en producción.

---

## 2. Mecánica de "No lo tengo claro"

### Cómo se comporta

En cada pregunta métrica, debajo del campo, va un checkbox:

> ☐ No lo tengo claro — lo vemos en la consultoría

Al tildarlo, el campo numérico se deshabilita y se envía vacío. En el formulario, arriba de todo, un texto fijo:

> Si algún número no lo tenés exacto, poné tu mejor estimación. Solo marcá "no lo tengo claro" si realmente no tenés idea — no pasa nada, lo resolvemos juntos en la llamada.

Ese empujón importa: sin él, mucha gente marca la casilla por comodidad y te quedás sin diagnóstico. Con él, la mayoría estima — y una estimación aproximada vale mucho más que un vacío.

### Cómo se guarda

Cada pregunta métrica son **dos campos** en la base:

| Campo | Tipo | Contenido |
|---|---|---|
| `<nombre>` | numeric, nullable | El valor, o `null` |
| `<nombre>_sin_dato` | boolean | `true` si marcó "no lo tengo claro" |

Nunca uses `0` ni `null` solo para representar "no sabe" — son cosas distintas. Mora en `0` es una cartera sana; mora sin dato es un alumno que no mide.

### Para qué sirve el dato

Tres usos concretos:

**a) Alimenta la sección 12 del plan.** El documento de 90 días ya tiene una sección de "Información pendiente para afinar el plan". Hoy la armo a mano; con este campo se genera sola: cada pregunta con `_sin_dato = true` entra automáticamente en esa tabla con su prioridad.

**b) Genera el índice de claridad.** Es el porcentaje de métricas duras que el alumno conoce sobre el total. Un alumno que sabe 4 de 18 tiene un índice del 22%. Ese número te dice, antes de la llamada, si vas a una consultoría de estrategia o a una de ordenamiento básico.

**c) Es una métrica de resultado del programa.** El mismo formulario, repetido a los 90 días, te muestra el índice subiendo. Es la prueba más limpia de que el alumno se profesionalizó: no que ganó más, sino que ahora sabe cuánto gana. Sirve para el seguimiento y sirve como testimonio.

### Dónde NO va la casilla

En las preguntas de intención, contexto o preferencia (bloques 0, 1 y 8, y las cualitativas del resto). Ahí no hay un dato que el alumno pueda desconocer — hay una opinión, y siempre la tiene.

---

## 3. Bloques y preguntas

Referencias de las columnas:
- **Tipo:** `texto` / `texto largo` / `número` / `moneda` / `porcentaje` / `opción` / `multi` / `sí-no`
- **Obl.:** obligatoria para poder enviar el formulario
- **NLC:** admite la casilla "No lo tengo claro"

---

### Bloque 0 — Identificación

Datos de cabecera. Arman la ficha del alumno en el panel. Rápidos de completar.

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 0.1 | Nombre y apellido | `nombre` | texto | Sí | — |
| 0.2 | Edad | `edad` | número | Sí | — |
| 0.3 | Ciudad y provincia donde operás | `zona` | texto | Sí | — |
| 0.4 | WhatsApp de contacto | `whatsapp` | texto | Sí | — |
| 0.5 | ¿Tenés una marca comercial? ¿Cómo se llama? | `marca_comercial` | texto | No | — |
| 0.6 | ¿Qué programa estás cursando? | `programa` | opción | Sí | — |
| 0.7 | ¿Cómo conociste Más Activos? | `canal_origen` | opción | Sí | — |

*Opciones 0.6:* De Cero a Gestor Financiero / Prestamista a Empresario / Prestamista a Empresario Elite
*Opciones 0.7:* Instagram / TikTok / YouTube / Referido de un alumno / Publicidad / Otro

---

### Bloque 1 — Diagnóstico general

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 1.1 | ¿Hace cuánto tiempo estás trabajando con préstamos personales? | `antiguedad_meses` | número | Sí | — |
| 1.2 | ¿Hoy lo tomás como ingreso extra, negocio principal o proyecto en crecimiento? | `tipo_dedicacion` | opción | Sí | — |
| 1.3 | ¿Cuál es tu objetivo principal con este negocio en los próximos 6 meses? | `objetivo_6m` | texto largo | Sí | — |
| 1.4 | ¿Qué querés construir: seguir prestando individualmente o armar una empresa financiera? | `vision_negocio` | opción | Sí | — |
| 1.5 | ¿Cuál sentís que es hoy tu mayor problema o bloqueo? | `bloqueo_principal` | texto largo | Sí | — |

*Opciones 1.2:* Ingreso extra / Negocio principal / Proyecto en crecimiento / Negocio principal y en crecimiento
*Opciones 1.4:* Seguir prestando individualmente / Armar una empresa financiera / Todavía no lo tengo definido

---

### Bloque 2 — Capital y rentabilidad

Bloque de mayor densidad numérica. Es donde más aparece la casilla, y donde más importa el empujón a estimar.

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 2.1 | ¿Con cuánto capital estás trabajando actualmente? (total colocado en la calle) | `capital_colocado` | moneda | Sí | Sí |
| 2.2 | ¿Ese capital es propio, de terceros o mixto? | `origen_capital` | opción | Sí | — |
| 2.3 | Si trabajás con capital de terceros, ¿cuánto pagás por ese dinero al mes? | `costo_capital_mensual` | porcentaje | No | Sí |
| 2.4 | ¿Cuánto capital disponible tenés hoy para seguir prestando? | `capital_disponible` | moneda | Sí | Sí |
| 2.5 | ¿Cuánto capital recuperás por mes entre todas las cuotas que cobrás? | `recupero_mensual` | moneda | No | Sí |
| 2.6 | ¿Tenés separado el dinero personal del dinero del negocio? | `separacion_dinero` | opción | Sí | — |
| 2.7 | ¿Cuánto ganás realmente por mes con tu cartera? (un número, no un rango) | `ganancia_mensual` | moneda | Sí | Sí |
| 2.8 | ¿Cuánto retirás por mes para uso personal? | `retiro_mensual` | moneda | No | Sí |
| 2.9 | ¿Cuánto gastás por mes en el negocio? (herramientas, comisiones, movilidad, personal) | `gastos_operativos` | moneda | No | Sí |

*Opciones 2.2:* Propio / De terceros / Mixto
*Opciones 2.6:* Sí, totalmente separado / Parcialmente / No, es la misma caja

> **Nota sobre 2.5.** Es la pregunta nueva más importante del bloque. El recupero mensual de capital es la fuente real de crecimiento de casi todos los alumnos — casi nunca es capital nuevo. Sin este dato no se puede proyectar ningún objetivo de cantidad de clientes.

---

### Bloque 3 — Clientes y cartera

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 3.1 | ¿Cuántos clientes activos tenés actualmente? | `clientes_activos` | número | Sí | Sí |
| 3.2 | ¿Cuántos clientes nuevos sumás por mes en promedio? | `clientes_nuevos_mes` | número | No | Sí |
| 3.3 | ¿Cuál es el monto promedio que prestás por cliente? | `ticket_promedio` | moneda | Sí | Sí |
| 3.4 | ¿En cuántas cuotas prestás habitualmente? Detallá los tramos si tenés varios. | `estructura_plazos` | texto largo | Sí | — |
| 3.5 | ¿Cuál es el plazo promedio de tus créditos, en meses? | `plazo_promedio_meses` | número | No | Sí |
| 3.6 | ¿Qué tipo de cliente atendés principalmente? | `perfil_cliente` | multi | Sí | — |
| 3.7 | ¿Qué porcentaje de tus clientes renueva o vuelve a pedir? | `recurrencia` | porcentaje | No | Sí |

*Opciones 3.6:* Empleados en relación de dependencia / Monotributistas / Comerciantes / Jubilados / Empleados públicos / Informales / Otro

---

### Bloque 4 — Precio y condiciones *(bloque nuevo)*

El hueco más grande del formulario actual. Sin estos datos no se puede modelar ninguna mejora de margen.

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 4.1 | ¿Qué interés o recargo cobrás? Indicá el porcentaje y si es mensual o sobre el total. | `tasa_declarada` | texto | Sí | Sí |
| 4.2 | Sobre un préstamo de $100.000 a 6 cuotas, ¿cuánto termina devolviendo el cliente en total? | `ejemplo_total_100k` | moneda | Sí | Sí |
| 4.3 | ¿Cobrás punitorio por atraso? ¿Cuánto? | `punitorio` | texto | Sí | Sí |
| 4.4 | ¿Sabés qué están cobrando otros prestamistas en tu zona? | `tasa_competencia` | texto | No | Sí |

> **Nota sobre 4.2.** Es la pregunta clave del bloque y por eso está redactada como un caso concreto en vez de pedir una tasa. Muchos alumnos no saben decir "cobro 10% mensual" pero sí saben perfectamente que por $100.000 les devuelven $150.000. De ese número se deriva la tasa efectiva sin que el alumno tenga que calcularla. Es la pregunta que en la consultoría de Gonzalo faltó y que obligó a dejar el modelo de margen como pendiente.

---

### Bloque 5 — Aprobación y riesgo

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 5.1 | ¿Qué documentación pedís antes de aprobar un préstamo? | `documentacion_solicitada` | multi | Sí | — |
| 5.2 | ¿Firmás contrato y pagaré con tus clientes? | `firma_documentacion` | opción | Sí | — |
| 5.3 | Si firmás, ¿en qué porcentaje de tus operaciones? | `porcentaje_documentado` | porcentaje | No | Sí |
| 5.4 | ¿Cómo decidís cuánto dinero prestarle a cada cliente? | `criterio_monto` | texto largo | Sí | — |
| 5.5 | ¿Tenés criterios claros y escritos para aprobar o rechazar? | `criterios_aprobacion` | opción | Sí | — |
| 5.6 | ¿Consultás Veraz, Nosis, BCRA, Equifax u otra herramienta? ¿Cuál? | `herramienta_consulta` | texto | Sí | — |
| 5.7 | ¿En qué casos pedís garante o garantía? | `politica_garantias` | texto largo | Sí | — |

*Opciones 5.1:* DNI / Recibo de sueldo / Constancia de monotributo / Comprobante de domicilio / Verificación de redes sociales / Referencias personales / Ninguna
*Opciones 5.2:* Sí, contrato y pagaré / Solo contrato / Solo pagaré / No, presto de palabra
*Opciones 5.5:* Sí, escritos / Los tengo en la cabeza pero no escritos / No tengo criterios definidos

> **Nota sobre 5.2.** Es la pregunta que en el diagnóstico de Gonzalo cambió todo el orden del plan, y no estaba en el cuestionario: salió de charla. "Presto de palabra" con $13.000.000 en la calle es el riesgo estructural más grave que aparece en este segmento, y tiene que salir del formulario, no de la suerte de que surja en la llamada.

---

### Bloque 6 — Cobranza y mora

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 6.1 | ¿Qué porcentaje de tus clientes está atrasado hoy? | `mora_clientes` | porcentaje | Sí | Sí |
| 6.2 | ¿Cuánto dinero tenés hoy atrasado o en riesgo de cobro? | `monto_en_mora` | moneda | Sí | Sí |
| 6.3 | ¿Tenés un proceso definido para cobrar antes, durante y después del vencimiento? | `proceso_cobranza` | opción | Sí | — |
| 6.4 | Contame cómo cobrás hoy: qué hacés y cuándo. | `descripcion_cobranza` | texto largo | Sí | — |
| 6.5 | ¿Cuál es tu mayor dificultad al momento de cobrar? | `dificultad_cobranza` | texto largo | Sí | — |

*Opciones 6.3:* Sí, con pasos definidos / Solo aviso el día del vencimiento / Solo reclamo cuando ya se atrasó / No tengo proceso

---

### Bloque 7 — Procesos, ventas y escala

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 7.1 | ¿Cómo registrás hoy tus préstamos? | `sistema_registro` | multi | Sí | — |
| 7.2 | ¿Cómo conseguís clientes actualmente? | `canales_captacion` | multi | Sí | — |
| 7.3 | ¿Trabajás solo o tenés equipo? Si tenés, ¿quién hace qué? | `equipo` | texto largo | Sí | — |
| 7.4 | ¿Estás formalizado? | `situacion_fiscal` | opción | Sí | — |
| 7.5 | ¿Vendés productos financiados además de prestar dinero? | `unidad_ventas` | opción | Sí | — |
| 7.6 | Si tuvieras que ordenar una sola área esta semana, ¿cuál sería? | `prioridad_declarada` | multi | Sí | — |

*Opciones 7.1:* Cuaderno / Excel o Sheets / App de préstamos / Controla / Otro sistema
*Opciones 7.2:* Referidos de clientes / Vendedores comisionistas / WhatsApp e historias / Instagram / Folletos y volantes / Publicidad paga / Comerciantes aliados
*Opciones 7.4:* Sin formalizar / Monotributo / SAS o SRL constituida / En trámite
*Opciones 7.5:* No, solo presto dinero / Sí, ya vendo productos / No, pero me interesa arrancar
*Opciones 7.6:* Ventas / Aprobación / Cobranza / Capital / Procesos / Formalización

---

### Bloque 8 — Proyección

| # | Pregunta | Campo | Tipo | Obl. | NLC |
|---|---|---|---|---|---|
| 8.1 | ¿Dónde querés estar con este negocio dentro de 12 meses? | `vision_12m` | texto largo | Sí | — |
| 8.2 | ¿Qué es lo que más te frena para llegar ahí? | `freno_percibido` | texto largo | Sí | — |

---

## 4. Resumen de la estructura

| Bloque | Preguntas | Obligatorias | Con casilla "No lo tengo claro" |
|---|---|---|---|
| 0 — Identificación | 7 | 6 | 0 |
| 1 — Diagnóstico general | 5 | 5 | 0 |
| 2 — Capital y rentabilidad | 9 | 5 | 7 |
| 3 — Clientes y cartera | 7 | 4 | 5 |
| 4 — Precio y condiciones | 4 | 3 | 4 |
| 5 — Aprobación y riesgo | 7 | 6 | 1 |
| 6 — Cobranza y mora | 5 | 5 | 2 |
| 7 — Procesos, ventas y escala | 6 | 6 | 0 |
| 8 — Proyección | 2 | 2 | 0 |
| **Total** | **52** | **42** | **19** |

De las 52, solo 19 son numéricas duras. El resto se responde rápido: opciones, multi-selección y cinco campos de texto largo. Tiempo estimado de completado: 12 a 15 minutos.

---

## 5. Índice de claridad

**Definición:** porcentaje de las 19 métricas duras que el alumno respondió con un número, sobre el total de las que le corresponden.

```
indice_claridad = (métricas respondidas / métricas aplicables) × 100
```

Las que no aplican no cuentan en el denominador. Ejemplo: si el capital es propio, la pregunta 2.3 (costo del capital de terceros) no entra en el cálculo.

**Escala de lectura para el consultor:**

| Índice | Lectura | Qué consultoría dar |
|---|---|---|
| 0–30% | El alumno no mide nada | Ordenamiento básico. El plan arranca por tablero y separación de caja. |
| 31–60% | Mide de forma parcial e intuitiva | Estándar. Se puede diagnosticar, con datos a confirmar en la llamada. |
| 61–85% | Conoce su negocio | Se puede ir directo a estrategia y optimización de margen. |
| 86–100% | Opera con tablero real | Candidato a escalamiento, delegación o segunda unidad de negocio. |

Se calcula al enviar el formulario y se muestra en la ficha del alumno, junto al listado de qué métricas concretas faltan. El consultor entra a la llamada sabiendo exactamente qué tiene que sacar.

**Medición a los 90 días:** el mismo formulario se reenvía al cierre del trimestre. La diferencia entre los dos índices es el indicador más limpio de profesionalización que puede mostrar el programa.

---

## 6. Notas de implementación

- Cada respuesta se guarda en `diagnosticos`, con `alumno_id` y `fecha`. **No se sobrescribe**: cada envío es un registro nuevo, para poder comparar el diagnóstico inicial contra el de los 90 días.
- El link del formulario lleva un token por alumno, para que la respuesta se asocie sola y el alumno no tenga que identificarse dos veces.
- El panel del consultor tiene que permitir editar cualquier respuesta durante la consultoría, dejando registro de que fue modificada por el consultor y no por el alumno.
- Todas las preguntas con `_sin_dato = true` se exportan armadas como la tabla de la sección 12 del plan de 90 días.
- Los nombres de campo de este documento son los que consume la skill `plan-okr-90-dias`. Cualquier cambio hay que hacerlo en los dos lados a la vez.
