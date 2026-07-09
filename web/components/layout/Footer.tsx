import Link from 'next/link';
import { Mail, MapPin } from 'lucide-react';
import { nav, contact, site, socialLinks } from '@/config/site';
import { Logo } from '@/components/ui/Logo';

export function Footer() {
  const socials = socialLinks();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line-navy bg-navy-deep">
      <div className="container-site grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        {/* Marca + descripción */}
        <div>
          <Logo variant="dark" withBajada />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-warm/60">
            Holding financiero con presencia en Latinoamérica: formación, capital, estructura y
            tecnología en un solo ecosistema.
          </p>
        </div>

        {/* Navegación */}
        <nav aria-label="Navegación del pie">
          <h2 className="eyebrow text-gold-light">Secciones</h2>
          <ul className="mt-4 space-y-2.5">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-warm/70 transition-colors hover:text-gold-light"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Contacto */}
        <div>
          <h2 className="eyebrow text-gold-light">Contacto</h2>
          <ul className="mt-4 space-y-3 text-sm text-warm/70">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-light/70" aria-hidden="true" />
              <span>{contact.addressFull}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-light/70" aria-hidden="true" />
              <a href={`mailto:${contact.email}`} className="hover:text-gold-light">
                {contact.email}
              </a>
            </li>
          </ul>

          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-warm/70 hover:text-gold-light"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-line-navy">
        <div className="container-site flex flex-col items-center justify-between gap-2 py-5 text-xs text-warm/50 sm:flex-row">
          <p>© {year} {site.name}</p>
          <p>Holding financiero · Latinoamérica</p>
        </div>
      </div>
    </footer>
  );
}
