import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { site } from '@/config/site';
import { organizationJsonLd, websiteJsonLd } from '@/lib/jsonld';

// Satoshi: la única familia tipográfica del sistema (manual, cap. V).
// Fuente variable 300–900, self-hosted.
const satoshi = localFont({
  src: './fonts/Satoshi-Variable.woff2',
  weight: '300 900',
  variable: '--font-satoshi',
  display: 'swap',
});

const TITLE = '+Activos Holding | Profesionalizamos el dinero en Latinoamérica';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: TITLE,
    template: '%s · +Activos Holding',
  },
  description: site.description,
  // Términos reales que busca el público (sin stuffing).
  keywords: [
    'holding financiero',
    'educación financiera aplicada',
    'profesionalizar prestamista',
    'formalizar préstamos',
    'software de gestión de préstamos',
    'constituir SAS para prestar',
    'crédito en LATAM',
    'Activos Holding',
    'Activos Academy',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: site.locale,
    url: site.url,
    siteName: site.name,
    title: TITLE,
    description: site.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={satoshi.variable}>
      <body>
        {/* Datos estructurados Schema.org (Organization + WebSite). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
        />
        {/* Accesibilidad: salto directo al contenido por teclado. */}
        <a
          href="#top"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-navy-deep"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
