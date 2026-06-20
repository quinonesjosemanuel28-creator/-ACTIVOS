import { cn } from '@/lib/utils';

// NOTA: isotipo provisorio (barras ascendentes = activos / crecimiento).
// Reemplazar por el SVG del kit institucional cuando esté disponible.
function Isotype({ variant }: { variant: 'light' | 'dark' }) {
  const tileFill = variant === 'dark' ? 'rgba(245,241,232,0.08)' : '#0A1F44';
  const tileStroke = variant === 'dark' ? '#C9A961' : 'transparent';
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="27" height="27" rx="6" fill={tileFill} stroke={tileStroke} />
      <rect x="7" y="15" width="3" height="6" rx="1" fill="#C9A961" />
      <rect x="12.5" y="11" width="3" height="10" rx="1" fill="#C9A961" />
      <rect x="18" y="7" width="3" height="14" rx="1" fill="#B8902F" />
    </svg>
  );
}

/**
 * Logotipo "Activos Academy".
 * @param variant 'dark' = sobre fondo navy · 'light' = sobre fondo claro
 */
export function Logo({
  variant = 'dark',
  className,
}: {
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const wordColor = variant === 'dark' ? 'text-cream' : 'text-navy';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Isotype variant={variant} />
      <span className={cn('font-display text-lg font-semibold tracking-tight', wordColor)}>
        Activos<span className="text-gold-light">&nbsp;Academy</span>
      </span>
    </span>
  );
}
