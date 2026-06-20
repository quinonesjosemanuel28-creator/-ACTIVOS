import { metrics } from '@/config/site';

// Barra de métricas reales en monoespaciada, sobre navy profundo.
export function MetricsBar() {
  return (
    <section className="border-y border-line-navy bg-navy-deep" aria-label="Métricas de Activos Academy">
      <div className="container-site grid grid-cols-2 md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="px-3 py-9 text-center">
            <div className="mx-auto mb-3 h-px w-8 bg-gold/50" aria-hidden="true" />
            <div className="font-mono text-3xl font-semibold text-gold-light sm:text-4xl">
              {m.value}
            </div>
            <div className="mt-2 text-xs uppercase tracking-wide text-cream/60">{m.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
