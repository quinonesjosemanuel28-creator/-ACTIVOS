# Activos Academy — Sitio institucional

Web pública de **Activos Academy**: la cabecera de un ecosistema integrado
(educación · legal y contable · tecnología/SaaS · cobranzas) que profesionaliza
y formaliza a los prestamistas de Latinoamérica.

> Proyecto **independiente** del dashboard financiero interno (que vive en `../src`
> y `../server`). Este sitio no toca esa app ni comparte build.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · lucide-react ·
Poppins + IBM Plex Mono (`next/font`).

## Arranque

```bash
cd web
npm install
cp .env.example .env.local   # completá los valores (ver abajo)
npm run dev                  # http://localhost:3000
```

Otros comandos: `npm run build`, `npm run start`, `npm run typecheck`.

## Configuración

Todo el contenido institucional y los datos de contacto viven en un solo lugar:
**`config/site.ts`** (email, WhatsApp, redes, métricas, misión/visión, ecosistema,
valores). Es la única fuente de verdad; los componentes no hardcodean nada.

Variables de entorno (`.env.local`, ver `.env.example`):

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL pública (canonical, sitemap, Open Graph) |
| `NEXT_PUBLIC_FORMSPREE_ENDPOINT` | Endpoint de Formspree del formulario de contacto |

## Estructura

```
web/
├── app/              layout, page, globals (tokens), metadata
├── components/
│   ├── layout/       Navbar, Footer
│   ├── sections/     Hero, MetricsBar, MisionVision, Ecosistema, Cobranzas, Valores, Contacto
│   └── ui/           Logo, Cta, Icon, SectionHeader, EcosystemDiagram
├── config/site.ts    ← contenido + contacto (única fuente de verdad)
└── lib/utils.ts
```

## Pendiente (próximas fases)

- **P1 · SEO:** JSON-LD `Organization`/`WebSite`, imagen Open Graph 1200×630,
  `sitemap.xml`, `robots.txt`, favicon/apple-touch-icon.
- **P2 · Performance:** `next/image` (WebP/AVIF), reveal on scroll, Lighthouse ≥90.
- Reemplazar el isotipo provisorio por el **SVG del kit institucional**.
- Confirmar email del dominio y URLs de redes en `config/site.ts`.
