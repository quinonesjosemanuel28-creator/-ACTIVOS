/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exportación 100% estática: `next build` genera `out/` listo para subir a
  // cualquier hosting de archivos (Hostinger, Vercel, Netlify, etc.).
  // El sitio no usa API routes ni ISR, así que no se pierde nada.
  output: 'export',
  images: {
    // El optimizador runtime necesita servidor; en export se sirve el archivo
    // tal cual (la única foto ya está optimizada a ~120 KB).
    unoptimized: true,
  },
};

export default nextConfig;
