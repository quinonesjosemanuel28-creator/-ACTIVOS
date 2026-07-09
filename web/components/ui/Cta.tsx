import Link from 'next/link';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'hero';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold transition-colors duration-200';

const variants: Record<Variant, string> = {
  // Dorado: acento principal para CTA (color · marca madre).
  primary: 'bg-gold text-navy-deep hover:bg-gold-light',
  // Contorno sutil sobre navy.
  secondary: 'border border-gold-light/40 text-warm hover:border-gold-light hover:bg-white/5',
  // Botón blanco del héroe (mockup web institucional del manual).
  hero: 'bg-warm text-navy hover:bg-white',
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
