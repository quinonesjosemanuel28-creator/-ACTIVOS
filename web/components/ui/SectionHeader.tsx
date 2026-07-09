import { cn } from '@/lib/utils';
import { Reveal } from './Reveal';

type Props = {
  eyebrow: string;
  title: string;
  /** Palabra o frase final del título que se pinta en dorado (estilo del manual). */
  titleAccent?: string;
  intro?: string;
  /** 'warm' = sección sobre fondo claro · 'dark' = sobre fondo navy */
  tone?: 'warm' | 'dark';
  align?: 'left' | 'center';
};

/** Encabezado de sección: eyebrow con guión dorado + título con punto/acento dorado. */
export function SectionHeader({ eyebrow, title, titleAccent, intro, tone = 'warm', align = 'left' }: Props) {
  const titleColor = tone === 'dark' ? 'text-warm' : 'text-navy';
  const introColor = tone === 'dark' ? 'text-warm/70' : 'text-navy/70';
  const eyebrowColor = tone === 'dark' ? 'text-gold-light' : 'text-gold';

  // Si el título termina en la parte acentuada, la separamos para pintarla en dorado.
  const hasAccent = titleAccent && title.endsWith(titleAccent);
  const titleBase = hasAccent ? title.slice(0, title.length - titleAccent.length) : title;

  return (
    <Reveal className={cn(align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl')}>
      <span className={cn('eyebrow', align === 'left' && 'eyebrow-dash', eyebrowColor)}>
        {eyebrow}
      </span>
      <h2 className={cn('mt-3 font-display text-3xl font-black leading-tight sm:text-4xl', titleColor)}>
        {titleBase}
        {hasAccent ? <span className="text-gold">{titleAccent}</span> : null}
      </h2>
      {intro && <p className={cn('mt-4 text-base leading-relaxed', introColor)}>{intro}</p>}
    </Reveal>
  );
}
