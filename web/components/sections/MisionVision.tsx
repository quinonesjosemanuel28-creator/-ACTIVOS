import { mision, vision } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';

export function MisionVision() {
  return (
    <section id="mision" className="bg-cream py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader
          eyebrow="Quiénes somos"
          title="Ordenamos lo que hoy se hace de manera informal."
          intro="Activos Academy es la cabecera de un ecosistema fintech con base en La Plata, Argentina, que profesionaliza y formaliza la actividad de los prestamistas en Latinoamérica."
        />

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="rounded-md border border-line-cream bg-cream-card p-7">
            <span className="eyebrow text-gold">Misión</span>
            <p className="mt-3 text-lg leading-relaxed text-navy/85">{mision}</p>
          </article>
          <article className="rounded-md border border-line-cream bg-cream-card p-7">
            <span className="eyebrow text-gold">Visión</span>
            <p className="mt-3 text-lg leading-relaxed text-navy/85">{vision}</p>
          </article>
        </div>
      </div>
    </section>
  );
}
