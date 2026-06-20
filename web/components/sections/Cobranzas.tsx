import { cobranza, contact } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Cta } from '@/components/ui/Cta';

export function Cobranzas() {
  return (
    <section id="cobranzas" aria-label="Servicio de cobranzas" className="bg-cream py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader
          eyebrow="Cobranzas"
          title="Cobranza extrajudicial con respaldo legal."
          intro={cobranza.intro}
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cobranza.items.map((item, i) => (
            <article key={item.title} className="rounded-md border border-line-cream bg-cream-card p-6">
              <span className="font-mono text-xs text-gold">0{i + 1}</span>
              <h3 className="mt-3 font-display text-lg font-semibold text-navy">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy/70">{item.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-10">
          <Cta href={contact.whatsapp} external variant="primary">
            Hablar con cobranzas
          </Cta>
        </div>
      </div>
    </section>
  );
}
