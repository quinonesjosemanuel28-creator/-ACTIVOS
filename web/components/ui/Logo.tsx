import { cn } from '@/lib/utils';

/**
 * Isotipo oficial: el signo «+» navy dentro del cuadrado redondeado dorado.
 * Es el elemento más reconocible; se usa reducido en avatar, favicon y marca de agua.
 */
export function Isotype({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="iso-gold" x1="10" y1="4" x2="38" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9A961" />
          <stop offset="1" stopColor="#B8902F" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#iso-gold)" />
      {/* Signo + */}
      <rect x="21" y="12" width="6" height="24" rx="1.5" fill="#0A1F44" />
      <rect x="12" y="21" width="24" height="6" rx="1.5" fill="#0A1F44" />
    </svg>
  );
}

/**
 * Logotipo completo según la anatomía del manual:
 * isotipo + «Activos» (Satoshi Black) + bajada «HOLDING» en dorado con tracking amplio.
 * @param variant 'dark' = sobre fondo navy · 'light' = sobre fondo claro
 * @param withBajada muestra la bajada debajo del logotipo (footer, piezas formales)
 */
export function Logo({
  variant = 'dark',
  withBajada = false,
  className,
}: {
  variant?: 'light' | 'dark';
  withBajada?: boolean;
  className?: string;
}) {
  const wordColor = variant === 'dark' ? 'text-warm' : 'text-navy';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Isotype size={30} />
      <span className="flex flex-col leading-none">
        <span className={cn('font-display text-xl font-black tracking-tight', wordColor)}>
          Activos
        </span>
        {withBajada && (
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.34em] text-gold-light">
            Holding
          </span>
        )}
      </span>
    </span>
  );
}
