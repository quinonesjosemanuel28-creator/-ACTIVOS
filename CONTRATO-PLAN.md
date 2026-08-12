# Contrato del plan de 90 días — skill ↔ app

Cómo vuelve a la app el plan que la skill `plan-okr-90-dias` genera fuera de ella.

Este documento tiene **los dos lados del contrato**: lo que la app va a leer y el
texto que hay que agregarle a la skill para que lo emita. Están juntos a
propósito — cuando cada lado vive en un lugar distinto, se separan en silencio.
Ya nos pasó: la especificación del formulario decía que sus nombres de campo
eran "los que consume la skill", y al ir a verificarlo la skill esperaba otras
30 preguntas en otros tres bloques.

---

## Por qué hace falta

Del plan generado, la app necesita **datos estructurados**, no el `.docx`:

- los **5 OKRs** con sus KRs, para el tablero del consultor y la comparación a
  los 90 días;
- las **acciones por fase** (1-30 / 31-60 / 61-90), que son el checklist que el
  alumno tilda desde su link.

Si eso hay que tipearlo a mano después de cada consultoría, a la tercera se deja
de hacer y el módulo queda muerto. Un solo copiar-pegar lo resuelve.

---

## Cómo funciona, de punta a punta

1. El consultor exporta el diagnóstico desde el panel (botón **Exportar para el plan**).
2. Lo pega en Claude y la skill genera el plan con su criterio encima.
3. La skill devuelve **dos cosas**: el `.docx` branded para el cliente y un
   **bloque JSON** en el chat.
4. El consultor copia el bloque y lo pega en el panel → la app crea el plan, sus
   OKRs y las acciones por fase.
5. Se emite el link de seguimiento y se manda por WhatsApp.

El bloque JSON va **en el chat, nunca dentro del documento del cliente**.

---

## El bloque que la skill debe emitir

Un único bloque ` ```json ` al final de la respuesta, después de entregar el
documento.

```json
{
  "version": 1,
  "alumno": "Gonzalo Pérez",
  "fecha_inicio": "2026-08-18",
  "etapa": "Prestamista Operativo",
  "objetivo_90d": "Ordenar la administración y la cobranza para poder crecer sin sumar mora.",
  "okrs": [
    {
      "orden": 1,
      "objetivo": "Ordenar la administración financiera",
      "krs": [
        { "texto": "Tablero único con todos los créditos cargados", "meta": "100% de la cartera" },
        { "texto": "Separar la caja del negocio de la personal", "meta": "2 cuentas distintas" }
      ]
    },
    {
      "orden": 2,
      "objetivo": "Profesionalizar las cobranzas",
      "krs": [
        { "texto": "Protocolo de cobranza por tramos", "meta": "escrito y aplicado" },
        { "texto": "Bajar la mora de la cartera", "meta": "por debajo del 10%" }
      ]
    },
    {
      "orden": 3,
      "objetivo": "Escalar la cartera de forma controlada",
      "krs": [
        { "texto": "Sumar clientes nuevos por referido calificado", "meta": "28 clientes nuevos" }
      ]
    }
  ],
  "fases": [
    {
      "fase": 1,
      "titulo": "Ordenar",
      "acciones": [
        { "texto": "Armar el tablero en Sheets con las columnas mínimas", "okr": 1 },
        { "texto": "Abrir una cuenta bancaria solo para el negocio", "okr": 1 },
        { "texto": "Cargar los créditos vigentes en el tablero", "okr": 1 }
      ]
    },
    {
      "fase": 2,
      "titulo": "Optimizar",
      "acciones": [
        { "texto": "Escribir el protocolo de cobranza por tramos", "okr": 2 },
        { "texto": "Llamar a todos los morosos de más de 30 días", "okr": 2 },
        { "texto": "Hacer el cierre financiero todos los viernes", "okr": 1 }
      ]
    },
    {
      "fase": 3,
      "titulo": "Escalar",
      "acciones": [
        { "texto": "Pedir referidos a los 10 mejores clientes", "okr": 3 },
        { "texto": "Definir el monto máximo por cliente nuevo", "okr": 3 },
        { "texto": "Revisar la mora antes de colocar capital nuevo", "okr": 2 }
      ]
    }
  ]
}
```

### Campos

| Campo | Obligatorio | Qué es |
|---|---|---|
| `version` | sí | Siempre `1` por ahora. Permite cambiar el formato sin romper lo cargado. |
| `alumno` | sí | Nombre tal cual está en la ficha. **La app compara y avisa si no coincide** — evita cargarle el plan de una persona a otra. |
| `fecha_inicio` | sí | `YYYY-MM-DD`. Arranque del trimestre: de acá salen las fechas de las tres fases. El consultor puede corregirla antes de guardar. |
| `etapa` | no | Una de las 4 etapas evolutivas. Contexto para el panel. |
| `objetivo_90d` | no | El objetivo maestro (sección 4 del plan). |
| `okrs[]` | sí | Entre 1 y 8. `orden` (1..n), `objetivo` (título), `krs[]`. |
| `okrs[].krs[]` | sí | `texto` obligatorio, `meta` opcional. |
| `fases[]` | sí | **Exactamente 3**, con `fase` 1, 2 y 3. `titulo` opcional. |
| `fases[].acciones[]` | sí | `texto` obligatorio; `okr` opcional (número de `orden` del OKR al que pertenece, para agrupar en el panel). Si viene, **tiene que existir** en `okrs[]`. |

### Reglas de redacción de las acciones

Son lo que el alumno ve como checklist **en el celular**, así que:

- **En imperativo y una sola cosa por acción.** "Armar el tablero en Sheets",
  no "Ordenar la administración financiera del negocio".
- **Concretas y verificables.** Tiene que poder responder sí o no.
- **Cortas** — hasta unos 120 caracteres. Si no entra, son dos acciones.
- **Entre 3 y 8 por fase.** Menos de 3 es un trimestre vacío; más de 8 abruma y
  no se tilda ninguna.

---

## Texto para agregar a la skill

Copiar tal cual en `SKILL.md` de `plan-okr-90-dias`, como **Paso 6** del flujo de
trabajo (después de "Paso 5 — Entregar"):

> **Paso 6 — Emitir el bloque de carga para la app.** Después de entregar el
> documento, cerrar la respuesta con un único bloque ` ```json ` con la
> estructura de abajo. El consultor lo copia y lo pega en el panel de +Activos
> para cargar el plan, sus OKRs y las acciones de cada fase sin tipear nada.
>
> Reglas:
> - El bloque va **en el chat, nunca dentro del `.docx`**: el cliente no lo ve.
> - `alumno` va con el nombre exacto con el que el consultor lo tiene cargado.
> - `fecha_inicio` en `YYYY-MM-DD`. Si no está claro cuándo arranca el
>   trimestre, preguntarlo antes de emitir el bloque.
> - `fases` son siempre 3 (días 1-30, 31-60, 61-90).
> - Las `acciones` son el checklist que el alumno tilda desde el celular: en
>   imperativo, una sola cosa por acción, verificables con un sí o un no, hasta
>   unos 120 caracteres, entre 3 y 8 por fase. Salen de la sección 6 del plan
>   (Plan de acción por fases), no de las descripciones estratégicas.
> - No inventar datos para completar el bloque: si algo falta, preguntarlo.
>
> ```json
> { …estructura del ejemplo… }
> ```

*(Reemplazar la última línea por el JSON de ejemplo completo de este documento.)*

---

## Qué queda FUERA del contrato (decidido, no volver a discutir)

- **Los modelos económicos / escenarios del plan NO se cargan al panel**
  (decisión de José, agosto 2026). Son análisis de la consultoría y viven en el
  `.docx`. Lo que hay que *seguir* de ellos ya entra como KRs (ej.: recargo
  aplicado, mora bajo 8%, ventas financiadas medidas). Si la skill los emite
  dentro del bloque, la previa los lista como ignorados — y eso es lo correcto,
  no un bug.

## Del lado de la app (ticket 6)

- Zod valida el bloque en el borde, con los mismos criterios de la tabla.
- Si `alumno` no coincide con la ficha, **se avisa y se pide confirmación**; no
  se bloquea (el consultor puede haberlo escrito distinto).
- El consultor ve una **previsualización** antes de guardar: cuántos OKRs,
  cuántas acciones por fase y la fecha de inicio, que puede corregir.
- Cargar un plan nuevo no borra el anterior: un alumno puede tener más de un
  trimestre y hay que poder compararlos.
