import { Check, ArrowRight } from 'lucide-react';
import { ecosystem, ecosystemIntegration } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/ui/Icon';

export function Ecosistema() {
  return (
    <section id="ecosistema" aria-label="El ecosistema integrado" className="bg-navy py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader
          tone="dark"
          eyebrow="El ecosistema"
          title="Un ecosistema integrado, no servicios sueltos."
          intro={ecosystemIntegration}
        />

        {/* Las 4 áreas */}
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {ecosystem.map((area, i) => (
            <article
              key={area.id}
              className="rounded-md border border-line-navy bg-white/[0.03] p-7 transition-colors duration-200 hover:border-gold-light/50"
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-gold-light/30 bg-gold/10">
                  <Icon name={area.icon} className="h-5 w-5 text-gold-light" />
                </span>
                <span className="font-mono text-xs text-cream/40">0{i + 1}</span>
              </div>

              <h3 className="mt-5 font-display text-xl font-semibold text-cream">{area.title}</h3>
              <p className="mt-1 font-mono text-xs uppercase tracking-wide text-gold-light">
                {area.role}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-cream/70">{area.description}</p>

              <ul className="mt-4 space-y-2">
                {area.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-cream/75">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-light" aria-hidden="true" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {/* Recorrido integrado: refuerza que es un sistema conectado */}
        <div className="mt-8 rounded-md border border-line-navy bg-navy-deep/50 px-6 py-5">
          <p className="eyebrow mb-4 text-center text-gold-light">El recorrido del cliente</p>
          <ol className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-2">
            {ecosystem.map((area, i) => (
              <li key={area.id} className="flex items-center gap-2 sm:gap-3">
                <span className="text-sm font-medium text-cream">{area.title}</span>
                {i < ecosystem.length - 1 && (
                  <ArrowRight className="h-4 w-4 rotate-90 text-gold-light/60 sm:rotate-0" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
