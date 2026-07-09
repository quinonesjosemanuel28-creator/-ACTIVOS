# +Activos Holding — Web institucional v2.0

Sitio institucional one-page para inversores, partners y prensa.
Copy aprobado (julio 2026) · Manual de Marca v1.0 · Vite + vanilla JS.

## Stack

- **Vite** (build estático en `/dist`)
- **HTML/CSS/JS vanilla** — sin frameworks de UI
- **GSAP + ScrollTrigger** (motion 2D) · **Three.js** (solo la escena del hero)
- **Satoshi** variable self-hosted (`public/fonts/`, un solo woff2 cubre 300–900)

## Comandos

```bash
npm install
npm run dev       # desarrollo → http://localhost:5173
npm run build     # producción → /dist
npm run preview   # sirve /dist localmente
```

## Deployment a Hostinger

1. `npm run build` → se genera la carpeta **`/dist`**.
2. hPanel → **Archivos → Administrador de archivos** → `public_html`.
3. **Backup**: descargar/comprimir el contenido actual de `public_html` antes de borrarlo.
4. Vaciar `public_html` y subir **TODO el contenido de `/dist`** (no la carpeta
   `dist`, su contenido) a `public_html`.
5. Verificar que `index.html` quede en la **raíz** de `public_html`.

## Cambio de dominio (temporal → definitivo)

Hoy el sitio vive en `yellowgreen-zebra-591519.hostingersite.com`. Al migrar a
`masactivosholding.com`, reemplazar el dominio en estos 3 lugares y rebuildear:

- `index.html` (canonical + og:/twitter: + JSON-LD — bloque comentado en el `<head>`)
- `public/robots.txt`
- `public/sitemap.xml`

`grep -r "yellowgreen-zebra" .` no debe devolver nada después del cambio.

## Escena 3D del hero (la única del sitio)

- Isotipo «+» extruido (geometría procedural, sin GLTF ni texturas) con material
  físico dorado + 4 nodos orbitando (uno por unidad) conectados por líneas.
- Carga **diferida** después de `load`; nunca bloquea el primer render (el LCP es
  el texto del hero).
- Render pausado fuera del viewport y con la pestaña sin foco.
- **Fallbacks**: `prefers-reduced-motion` → isotipo SVG estático y sin GSAP;
  mobile (<768px) o sin WebGL → SVG estático; desktop con ≤4 núcleos → escena
  reducida (solo el «+»).

## Contenido

Todo el texto proviene del documento *Copy Web Institucional — +Activos Holding
v1.0 (julio 2026)*. No agregar secciones ni claims que no estén ahí. Los únicos
números publicables: **+3** años validando · **1** año de escala · **+200**
gestores · **4** unidades.

## Checklist de QA

- [ ] Anclas del menú llegan a su sección (`#ecosistema` `#academy` `#financiera` `#legal` `#software` `#quienes-somos` `#contacto`)
- [ ] Copy idéntico al aprobado
- [ ] 3D en desktop · fallback en mobile y con reduced-motion
- [ ] Count-ups una sola vez: +3 · 1 · +200 · 4
- [ ] `grep -r "blanchedalmond" dist/` → sin resultados
- [ ] Lighthouse mobile ≥ 85 · desktop ≥ 90
- [ ] Formulario maquetado y deshabilitado, con consentimiento visible
- [ ] Probado en 375 / 768 / 1440
