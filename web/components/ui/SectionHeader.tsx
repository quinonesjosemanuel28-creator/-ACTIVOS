import { cn } from '@/lib/utils';

type Props = {
  eyebrow: string;
  title: string;
  intro?: string;
  /** 'cream' = sección sobre fondo claro · 'dark' = sobre fondo navy */
  tone?: 'cream' | 'dark';
  align?: 'left' | 'center';
};

export function SectionHeader({ eyebrow, title, intro, tone = 'cream', align = 'left' }: Props) {
  const titleColor = tone === 'dark' ? 'text-cream' : 'text-navy';
  const introColor = tone === 'dark' ? 'text-cream/70' : 'text-navy/70';
  const eyebrowColor = tone === 'dark' ? 'text-gold-light' : 'text-gold';

  return (
    <div className={cn(align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl')}>
      <span className={cn('eyebrow', eyebrowColor)}>{eyebrow}</span>
      <h2 className={cn('mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl', titleColor)}>
        {title}
      </h2>
      {intro && <p className={cn('mt-4 text-base leading-relaxed', introColor)}>{intro}</p>}
    </div>
  );
}
