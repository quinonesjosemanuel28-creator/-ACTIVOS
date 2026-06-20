import { values } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/ui/Icon';

export function Valores() {
  return (
    <section className="bg-navy-deep py-20 sm:py-24" aria-label="Nuestros valores">
      <div className="container-site">
        <SectionHeader
          tone="dark"
          eyebrow="Valores"
          title="Los principios que nos ordenan."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v) => (
            <article
              key={v.title}
              className="rounded-md border border-line-navy bg-white/[0.03] p-6 transition-colors duration-200 hover:border-gold-light/50"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gold-light/30 bg-gold/10">
                <Icon name={v.icon} className="h-5 w-5 text-gold-light" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-cream">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream/70">{v.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
