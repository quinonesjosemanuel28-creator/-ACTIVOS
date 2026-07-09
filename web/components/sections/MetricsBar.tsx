import { metrics } from '@/config/site';
import { Reveal } from '@/components/ui/Reveal';

// Métricas reales de tracción, sobre navy profundo.
export function MetricsBar() {
  return (
    <section className="border-y border-line-navy bg-navy-deep" aria-label="Métricas del holding">
      <div className="container-site grid grid-cols-2 md:grid-cols-4">
        {metrics.map((m, i) => (
          <Reveal key={m.label} delay={i * 90} className="px-3 py-9 text-center">
            <div className="mx-auto mb-3 h-px w-8 bg-gold/50" aria-hidden="true" />
            <div className="font-display text-3xl font-black text-gold-light sm:text-4xl">
              {m.value}
            </div>
            <div className="mt-2 text-xs uppercase tracking-wide text-warm/60">{m.label}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
