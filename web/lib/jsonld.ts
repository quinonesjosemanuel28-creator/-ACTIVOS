import { site, contact, socialLinks, historia, unidades } from '@/config/site';

// Datos estructurados Schema.org para descubribilidad.
// Se inyectan como JSON-LD en el <head> desde app/layout.tsx.

export function organizationJsonLd() {
  const socials = socialLinks().map((s) => s.url);

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    alternateName: 'Activos Holding',
    url: site.url,
    logo: `${site.url}/logo.svg`,
    description: site.description,
    founder: {
      '@type': 'Person',
      name: historia.fundador.nombre,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: contact.city,
      addressRegion: contact.region,
      addressCountry: 'AR',
    },
    areaServed: 'Latinoamérica',
    email: contact.email,
    // Las cuatro unidades del ecosistema, como departamentos de la casa madre.
    department: unidades.map((u) => ({
      '@type': 'Organization',
      name: `Activos ${u.nombre}`,
      description: u.descripcion,
    })),
  };

  // sameAs solo si hay redes cargadas (evita un array vacío).
  if (socials.length > 0) data.sameAs = socials;

  return data;
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
    inLanguage: 'es',
    description: site.description,
  };
}
