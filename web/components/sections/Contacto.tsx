import { MapPin, Mail, MessageCircle } from 'lucide-react';
import { contact } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ContactForm } from './ContactForm';

export function Contacto() {
  return (
    <section id="contacto" aria-label="Contacto" className="bg-cream py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader
          eyebrow="Contacto"
          title="Ordená tu actividad como prestamista."
          intro="Contanos en qué estás y te mostramos cómo el ecosistema te ayuda a formalizar, escalar y gestionar tu cartera."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* Datos de contacto */}
          <div className="space-y-4">
            <a
              href={contact.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-4 rounded-md border border-line-cream bg-cream-card p-5 transition-colors hover:border-gold"
            >
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-navy">WhatsApp</span>
                <span className="block text-sm text-navy/70">Respuesta directa con el equipo</span>
              </span>
            </a>

            <a
              href={`mailto:${contact.email}`}
              className="flex items-start gap-4 rounded-md border border-line-cream bg-cream-card p-5 transition-colors hover:border-gold"
            >
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-navy">Email</span>
                <span className="block text-sm text-navy/70">{contact.email}</span>
              </span>
            </a>

            <div className="flex items-start gap-4 rounded-md border border-line-cream bg-cream-card p-5">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-navy">Sede</span>
                <span className="block text-sm text-navy/70">{contact.addressFull}</span>
              </span>
            </div>
          </div>

          {/* Formulario */}
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
