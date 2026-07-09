import { esencia } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Reveal } from '@/components/ui/Reveal';

// Esencia de marca (manual, p. 7): el propósito + los 5 pilares numerados.
export function Esencia() {
  return (
    <section aria-label="Esencia de marca" className="bg-warm py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader
          eyebrow="Propósito · Esencia"
          title={esencia.claim}
          titleAccent={esencia.claimAccent}
          intro={esencia.body}
        />

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {esencia.pilares.map((pilar, i) => (
            <Reveal
              as="li"
              key={pilar}
              delay={i * 80}
              className="rounded-lg border border-line-warm bg-warm-card p-5"
            >
              <span className="font-display text-sm font-bold text-gold">0{i + 1}</span>
              <p className="mt-2 text-sm leading-relaxed text-navy/85">{pilar}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
