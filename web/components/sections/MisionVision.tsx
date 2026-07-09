import { mision, vision } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/lib/utils';

// Misión y visión (manual, p. 8): misión como texto grande + horizontes 5/10 años.
export function MisionVision() {
  return (
    <section aria-label="Misión y visión" className="bg-warm pb-20 sm:pb-24">
      <div className="container-site">
        <SectionHeader eyebrow="Marca · Visión y misión" title="Hacia dónde vamos." titleAccent="vamos." />

        <Reveal delay={100}>
          <p className="mt-8 max-w-3xl font-display text-xl font-bold leading-relaxed text-navy sm:text-2xl">
            {mision}
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {vision.map((v, i) => (
            <Reveal
              key={v.plazo}
              delay={i * 120}
              className={cn(
                'rounded-lg p-7',
                v.dark
                  ? 'bg-navy text-warm shadow-sm'
                  : 'border border-line-warm bg-warm-card shadow-sm',
              )}
            >
              <span className="font-display text-2xl font-black text-gold">{v.plazo}</span>
              <h3 className={cn('mt-2 font-display text-lg font-bold', v.dark ? 'text-warm' : 'text-navy')}>
                {v.titulo}
              </h3>
              <p className={cn('mt-2 text-sm leading-relaxed', v.dark ? 'text-warm/70' : 'text-navy/70')}>
                {v.texto}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
