import type { Metadata } from 'next';
import { Poppins, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { site } from '@/config/site';
import { organizationJsonLd, websiteJsonLd } from '@/lib/jsonld';

// Tipografía institucional: Poppins (display + cuerpo) e IBM Plex Mono (datos).
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const TITLE = 'Activos Academy | Profesionalizamos a los prestamistas de LATAM';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: TITLE,
    template: '%s · Activos Academy',
  },
  description: site.description,
  // Términos reales que busca el público (sin keyword stuffing).
  keywords: [
    'formalizar préstamos',
    'profesionalizar prestamista',
    'software de gestión de préstamos',
    'constituir SAS para prestar',
    'cobranza extrajudicial',
    'crédito en LATAM',
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
    <html lang="es" className={`${poppins.variable} ${mono.variable}`}>
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-navy-deep"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
