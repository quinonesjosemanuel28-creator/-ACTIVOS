# Dashboard Financiero — +Activos Academy

Software interactivo, en tiempo real y CFO-grade que reemplaza el tablero de
Excel de **+Activos Academy**. Pensado para que el founder y el rol CFO
entiendan de un vistazo las métricas críticas del negocio y decidan rápido.

Corre **100% local**. Sin nube en v1. Multi-unidad desde el día 1.

---

## ⚡ Arranque rápido

Requisitos: **Node.js ≥ 20** y npm.

```bash
npm install        # instalar dependencias
npm run seed       # cargar 7 meses de datos demo realistas (opcional)
npm run dev        # levantar API (:8787) + frontend (:5173)
```

Abrí <http://localhost:5173>. El frontend habla con la API local vía proxy `/api`.

> ¿Ya tenés el tablero `.xlsx`? Saltá el `seed` y, una vez en la app, andá a
> **Carga & Admin → Importar tablero**. La importación es idempotente.

### Otros comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Corre la suite Vitest (lógica financiera 100% testeada) |
| `npm run test:watch` | Tests en modo watch |
| `npm run typecheck` | TypeScript estricto en todo el proyecto |
| `npm run build` | Build de producción del frontend |
| `npm run seed` | Resiembra la base con datos demo |

La base SQLite vive en `data/activos.db` (ignorada por git; se regenera).

---

## 🏛️ Arquitectura — por capas, con dominio aislado

Regla de oro: **la lógica financiera no sabe que existe React ni SQLite.**
Las dependencias apuntan hacia adentro (inversión de dependencias).

```
src/
├── domain/          CAPA 3 · TypeScript puro, cero dependencias externas
│   ├── types.ts         Tipos del negocio (Venta, Cobro, Egreso, Parámetros)
│   ├── money.ts         División segura (cero NaN / #REF!)
│   ├── metrics.ts       TODAS las fórmulas (comentadas con reglas R1–R8)
│   ├── dashboard.ts     Ensamblado del snapshot + variación M/M
│   └── alerts.ts        Motor de semáforo (9 reglas configurables)
│
├── application/     CAPA 2 · Casos de uso (orquestan dominio + datos)
│   ├── ports.ts         Interfaces de repositorios (las define la app)
│   ├── schemas.ts       Validación Zod en los bordes
│   └── useCases.ts      obtenerDashboard, importarExcel, agregarVenta, cerrarMes…
│
├── infrastructure/  CAPA 4 · Implementa los puertos
│   ├── sqlite/          Esquema + repositorios better-sqlite3
│   ├── excel/           Parser .xlsx (SheetJS) para migrar el tablero
│   └── seed/            Generador de datos demo
│
└── ui/              CAPA 1 · React (solo muestra; consume el dominio)
    ├── views/           Las 8 pantallas
    ├── components/       KPIs, alertas, gráficos, gauges, layout
    └── lib/             Cliente API, formateadores, exportación

server/              Express que cablea aplicación + infraestructura
```

`ui` nunca importa `infrastructure`: better-sqlite3 jamás llega al navegador.

---

## 🧮 Motor de cálculo — fórmulas y reglas de gobierno

Cada métrica es una **función pura testeada** en `src/domain/metrics.ts`.
Las reglas de gobierno traducidas del tablero:

| Métrica | Fórmula | Regla |
|---|---|---|
| Cash Collected | Σ cobros del mes | Dinero efectivo del mes |
| Cash Nuevo | Σ cobros con `mes_cobro = mes_original_venta` | Motor nuevo |
| Cohortes | Cash Collected − Cash Nuevo | Cobros viejos |
| Ventas Nuevas | Σ ticket con `mes_venta = mes` | Comprometido |
| AOV Real | Cash Nuevo / Cierres | **R2** · excluye cohortes |
| Utilidad Operativa | Cash Collected − Egresos Totales | — |
| Margen Operativo | Utilidad / Cash Collected | meta ≥ 25% |
| Margen Contribución | (Cash − Egresos Directos) / Cash | ignora estructura |
| CAC | Inversión Marketing / Cierres | tope $350 |
| ROAS · MER | Cash / Inv · Ventas / Inv | — |
| Caja Final | Caja Inicial + Cobros acum. − Egresos acum. | **R4** · arrastre |
| Runway | Caja Final / Costos Fijos | meses de oxígeno |
| Morosidad cohorte | Comprometido cohorte − Cobrado cohorte | gestión de cartera |

**Invariantes codificados:**
- **R1** — Ventas, Cash y Caja son tipos distintos y nunca se mezclan.
- **R2** — AOV Real se calcula solo con Cash Nuevo.
- **R4** — Caja Final arrastra toda la historia hasta el mes.
- **R6** — Un mes *Cerrado* bloquea ediciones.
- **R8** — Toda métrica es filtrable por programa (Empresario / Gestor).
- **División por cero** → la métrica devuelve `null` y la UI muestra `—`
  (nunca NaN, nunca crash).

---

## 🚦 Semáforo (9 alertas)

`src/domain/alerts.ts` evalúa 9 reglas (datos configurables) y devuelve
VERDE / AMARILLO / ROJO + detalle + acción sugerida, ordenadas por severidad:
cash vs meta, margen operativo, CAC vs tope, concentración de cohortes
(>50% = "motor nuevo apagado"), empresarios nuevos, dependencia de closer,
calidad de cartera, tasa de cierre y runway.

---

## 🖥️ Pantallas

1. **Vista Ejecutiva** — 6 KPIs grandes con variación M/M + pulso del mes.
2. **Alertas** — semáforo en tarjetas, críticas primero.
3. **Cash Flow** — barras apiladas Cash Nuevo vs Cohortes.
4. **Funnel** — embudo Agendas → Asistieron → Cerrados con tasas.
5. **Histórico** — líneas de Cash, Utilidad, Caja y Cierres.
6. **Marketing** — CAC, ROAS y MER con gauges contra sus topes.
7. **Empresario vs Gestor** — comparativa lado a lado (R8).
8. **Carga & Admin** — formularios validados, importar Excel, cierre de mes,
   parámetros y exportación (PDF / .xlsx).

El **selector de mes** (arriba) es el driver maestro: cambiarlo recalcula todo.

---

## 🧮 Calculadora de Márgenes (herramienta de closers)

Herramienta **aparte del dashboard**, pensada para que el closer la use en vivo
con el lead: carga los números que el prestamista tiene hoy, mueve las palancas
del sistema +Activos y le muestra en la misma pantalla cuánta utilidad está
dejando sobre la mesa.

```bash
npm run build:calculadora
```

Genera dos archivos en `calculadora/publicar/`:

| Archivo | Para qué |
|---|---|
| `calculadora-margenes.html` | Documento completo. Se abre con doble clic o se sube a cualquier hosting. |
| `artifact.html` | El mismo contenido como fragmento, para publicar como página compartible. |

**Un solo archivo, sin internet.** La tipografía va embebida en base64 y el
JavaScript compilado se inyecta en línea: no hace una sola request externa.
Abre en la casa del cliente, en un coworking o con el wifi de un bar.

### Qué hace

- **Cuatro palancas**: mora e incobrables, tasa de interés, rotación del
  capital, y gastos + apalancamiento. Cada una con su deslizador para moverla
  delante del cliente.
- **Objetivo auto-sugerido**: con solo cargar los datos de hoy ya hay una
  propuesta arriba de la mesa (mora e incobrables a un tercio, dos puntos más
  de tasa). En cuanto el closer edita un campo, ese campo deja de sugerirse.
- **Waterfall de atribución**: cuánto aporta cada palanca por separado. La suma
  da exactamente la diferencia total, sin residuos que explicar en la llamada.
- **Modo presentación** para compartir pantalla, selector ARS/USD, resumen
  copiable para mandar por WhatsApp, e impresión a PDF para dejarle al cliente.
- Todo queda guardado en el navegador: si se recarga, no se pierde la carga.

### Motor de cálculo

La matemática vive en `src/domain/calculadora/margenes.ts` — TypeScript puro,
sin dependencias, con 30 tests. Los supuestos están declarados y son
deliberadamente conservadores: cartera constante, tasa flat mensual, la mora no
genera interés extra (solo inmoviliza capital y estira el ciclo), y el
incobrable pega dos veces (no paga interés **y** se lleva el capital).

Hereda la regla de gobierno del tablero: división por cero devuelve `null` y la
pantalla muestra "—". Cero NaN.

| Archivo | Rol |
|---|---|
| `src/domain/calculadora/margenes.ts` | El motor. Puro y testeado. |
| `calculadora/texto.ts` | Parser tolerante de lo que se tipea en vivo ("1.500", "12,5", "$ 15.000.000"). |
| `calculadora/app.ts` | Interfaz: lee del DOM, formatea y dibuja. |
| `calculadora/plantilla.html` | Markup y estilos (identidad navy/oro del tablero). |
| `calculadora/build.mjs` | Empaqueta todo en el archivo único. |

> La pantalla aclara que es una **proyección estimada** sobre los datos que
> declara el cliente, no una promesa de resultados.

## 🗄️ Modelo de datos (SQLite)

Tres tablas transaccionales (`ventas`, `cobros`, `egresos`) + `parametros`,
`funnel` y `cierre_mes`. Una fila = un evento atómico. `unidad_negocio` está
en cada tabla desde v1 para soportar la vista CONSOLIDADO sin refactor.

## 🧰 Stack

React 18 + TypeScript (strict) · Vite · Tailwind + componentes estilo shadcn ·
Recharts · better-sqlite3 · Express · SheetJS · TanStack Query + Zustand ·
Zod · Vitest.
