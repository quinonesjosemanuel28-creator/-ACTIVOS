import { ArrowRight } from 'lucide-react';
import { site, heroStats } from '@/config/site';
import { Cta } from '@/components/ui/Cta';
import { Reveal } from '@/components/ui/Reveal';

// Héroe según el mockup "Web institucional" del Manual de Marca (p. 33).
export function Hero() {
  // Claim con el acento dorado al final ("Latinoamérica.").
  const base = site.tagline.slice(0, site.tagline.length - site.taglineAccent.length);

  return (
    <section id="top" aria-label="Presentación" className="bg-impact relative overflow-hidden">
      {/* Resplandor sutil superior, como en las portadas del manual */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
        style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(63,101,166,.25), transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="container-site relative py-20 sm:py-24 lg:py-28">
        <Reveal>
          <span className="eyebrow eyebrow-dash text-gold-light">{site.eyebrow}</span>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-black leading-[1.08] text-warm sm:text-5xl lg:text-6xl">
            {base}
            <span className="text-gold-light">{site.taglineAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-warm/70">{site.subtitle}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Cta href="#marca" variant="hero">
              Conoce el holding
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Cta>
            <Cta href="#ecosistema" variant="secondary">
              Ver el ecosistema
            </Cta>
          </div>
        </Reveal>

        {/* Franja de datos del héroe (4 unidades · LATAM · software propio) */}
        <Reveal delay={150}>
          <dl className="mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-line-navy pt-7">
            {heroStats.map((s) => (
              <div key={s.label}>
                <dt className="order-2 mt-1 block text-xs text-warm/60">{s.label}</dt>
                <dd className="order-1 font-display text-2xl font-bold text-warm sm:text-3xl">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
