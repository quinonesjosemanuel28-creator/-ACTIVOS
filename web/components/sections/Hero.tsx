import { contact } from '@/config/site';
import { Cta } from '@/components/ui/Cta';
import { EcosystemDiagram } from '@/components/ui/EcosystemDiagram';

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-navy">
      <div className="absolute inset-0 bg-gradient-to-b from-navy to-navy-deep" aria-hidden="true" />

      <div className="container-site relative grid gap-12 py-16 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-24">
        {/* Copy */}
        <div>
          <span className="eyebrow text-gold-light">Presentes en +5 países de LATAM</span>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] text-cream sm:text-5xl">
            Profesionalizamos a los <span className="text-gold-light">prestamistas</span> de
            Latinoamérica.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-cream/70">
            Llevamos la actividad prestamista informal hacia un negocio ordenado, legal y escalable:
            educación, blindaje legal y contable, tecnología y cobranzas en un solo ecosistema
            integrado.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Cta href={contact.whatsapp} external variant="primary">
              Quiero profesionalizarme
            </Cta>
            <Cta href="#ecosistema" variant="secondary">
              Conocé el ecosistema
            </Cta>
          </div>
        </div>

        {/* Pieza memorable: diagrama del ecosistema */}
        <div className="lg:pl-4">
          <EcosystemDiagram />
        </div>
      </div>
    </section>
  );
}
