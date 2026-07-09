import { MapPin, Mail, MessageCircle } from 'lucide-react';
import { contact } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Reveal } from '@/components/ui/Reveal';
import { ContactForm } from './ContactForm';

export function Contacto() {
  return (
    <section id="contacto" aria-label="Contacto" className="bg-warm pb-20 pt-4 sm:pb-24">
      <div className="container-site">
        <SectionHeader
          eyebrow="Contacto"
          title="De prestamista a empresario financiero."
          titleAccent="empresario financiero."
          intro="Cuéntanos en qué etapa estás y te mostramos cómo el ecosistema te ayuda a formalizar, escalar y gestionar tu cartera."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* Datos de contacto */}
          <div className="space-y-4">
            <Reveal>
              <a
                href={contact.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 rounded-lg border border-line-warm bg-warm-card p-5 transition-colors hover:border-gold"
              >
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold text-navy">WhatsApp</span>
                  <span className="block text-sm text-navy/70">Respuesta directa del equipo</span>
                </span>
              </a>
            </Reveal>

            <Reveal delay={80}>
              <a
                href={`mailto:${contact.email}`}
                className="flex items-start gap-4 rounded-lg border border-line-warm bg-warm-card p-5 transition-colors hover:border-gold"
              >
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold text-navy">Email</span>
                  <span className="block text-sm text-navy/70">{contact.email}</span>
                </span>
              </a>
            </Reveal>

            <Reveal delay={160}>
              <div className="flex items-start gap-4 rounded-lg border border-line-warm bg-warm-card p-5">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold text-navy">Sede</span>
                  <span className="block text-sm text-navy/70">{contact.addressFull}</span>
                </span>
              </div>
            </Reveal>
          </div>

          {/* Formulario */}
          <Reveal delay={120}>
            <ContactForm />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
