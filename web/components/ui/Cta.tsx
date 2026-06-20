import Link from 'next/link';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-medium transition-colors duration-200';

const variants: Record<Variant, string> = {
  // Acento principal — usar con moderación (un CTA primario por bloque).
  primary: 'bg-gold text-navy-deep hover:bg-gold-light',
  secondary: 'border border-gold-light/40 text-cream hover:border-gold-light hover:bg-white/5',
  ghost: 'text-navy hover:text-gold underline-offset-4 hover:underline',
};

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  external?: boolean;
  className?: string;
};

/** Botón/enlace de llamada a la acción reutilizable. */
export function Cta({ href, children, variant = 'primary', external, className }: Props) {
  const cls = cn(base, variants[variant], className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
