import { ecosystem } from '@/config/site';
import { Icon } from './Icon';

// Visual memorable del héroe: comunica el ecosistema INTEGRADO —
// una cabecera ("Activos Academy") de la que dependen las 4 áreas conectadas.
// Responsive: las áreas pasan de 4 columnas a 2 y a 1 según el ancho.
export function EcosystemDiagram() {
  return (
    <div className="relative rounded-md border border-line-navy bg-white/[0.03] p-5 sm:p-6">
      {/* Cabecera del ecosistema */}
      <div className="mx-auto flex max-w-xs flex-col items-center rounded-md border border-gold-light/30 bg-navy-deep/60 px-5 py-3 text-center">
        <span className="eyebrow text-gold-light">Cabecera del ecosistema</span>
        <span className="mt-1 font-display text-lg font-semibold text-cream">Activos Academy</span>
      </div>

      {/* Conector vertical hacia las áreas */}
      <div className="mx-auto h-6 w-px bg-gold-light/40" aria-hidden="true" />

      {/* Las 4 áreas, conectadas y numeradas */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ecosystem.map((area, i) => (
          <li
            key={area.id}
            className="group relative rounded-md border border-line-navy bg-navy-deep/40 p-3.5 transition-colors duration-200 hover:border-gold-light/50"
          >
            {/* Tick superior dorado: refuerza la idea de "conectado a la cabecera" */}
            <span
              className="absolute -top-3 left-1/2 hidden h-3 w-px -translate-x-1/2 bg-gold-light/40 lg:block"
              aria-hidden="true"
            />
            <div className="flex items-center justify-between">
              <Icon name={area.icon} className="h-5 w-5 text-gold-light" />
              <span className="font-mono text-[11px] text-cream/40">0{i + 1}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-tight text-cream">{area.title}</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-gold-light/80">
              {area.role}
            </p>
          </li>
        ))}
      </ul>

      {/* Pie: el recorrido integrado */}
      <p className="mt-5 text-center text-xs leading-relaxed text-cream/60">
        Un mismo cliente recorre todo el ecosistema:
        <span className="text-cream/80"> educación → legal → tecnología → cobranzas.</span>
      </p>
    </div>
  );
}
