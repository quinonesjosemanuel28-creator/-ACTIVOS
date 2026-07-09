# +Activos Holding — Sitio institucional

Web pública de **+Activos Holding**: holding financiero con presencia en
Latinoamérica. Una casa monolítica con cuatro unidades — Academy (formación),
Financiera (capital), Legal & Contable (estructura) y Software (tecnología).

Construida al 100% según el **Manual de Marca v1.0** (colores, Satoshi,
logotipo, voz en español neutro y estructura de la web institucional, p. 33).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · lucide-react ·
**Satoshi** variable self-hosted (`next/font/local`).

## Arranque

```bash
npm install
cp .env.example .env.local   # completá los valores (ver abajo)
npm run dev                  # http://localhost:3000
```

Otros comandos: `npm run build`, `npm run start`, `npm run typecheck`.

## Configuración

Todo el contenido institucional y los datos de contacto viven en un solo lugar:
**`config/site.ts`** (email, WhatsApp, redes, métricas, esencia, historia,
misión/visión, unidades, valores). Es la única fuente de verdad.

Variables de entorno (`.env.local`, ver `.env.example`):

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL pública (canonical, sitemap, Open Graph) |
| `NEXT_PUBLIC_FORMSPREE_ENDPOINT` | Endpoint de Formspree del formulario de contacto |

## Estructura

```
.
├── app/              layout (Satoshi + metadata), page, globals (tokens),
│   ├── fonts/        Satoshi variable (web) + estáticas (imagen OG)
│   └── …             sitemap, robots, opengraph-image, icon, apple-icon
├── components/
│   ├── layout/       Navbar, Footer
│   ├── sections/     Hero, MetricsBar, Esencia, Ecosistema, Posicionamiento,
│   │                 Historia, MisionVision, Valores, Contacto
│   └── ui/           Logo (isotipo + wordmark), Cta, SectionHeader, Reveal
├── config/site.ts    ← contenido + contacto (única fuente de verdad)
├── lib/              utils, jsonld (Schema.org)
└── public/           logo.svg (isotipo), fundador.jpg
```

## Estado

- **Imagen institucional** ✅ tokens exactos del manual, Satoshi, logo real.
- **SEO** ✅ JSON-LD `Organization`/`WebSite`, OG 1200×630 con Satoshi,
  `sitemap.xml`, `robots.txt`, favicon + apple-touch-icon.
- **Animaciones** ✅ entrada al hacer scroll (IntersectionObserver), respetando
  `prefers-reduced-motion` — como pide el manual (p. 33).

## Pendiente de confirmación

- Email real del dominio en `config/site.ts` (`contact.email`).
- URLs de redes sociales en `config/site.ts` (`social`).
- `NEXT_PUBLIC_FORMSPREE_ENDPOINT` para activar el formulario.
- Dominio definitivo (`NEXT_PUBLIC_SITE_URL`).
