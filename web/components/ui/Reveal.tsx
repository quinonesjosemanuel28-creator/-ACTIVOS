'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Animación de entrada al hacer scroll (manual · web institucional).
 * Discreta: fade + leve desplazamiento. `prefers-reduced-motion` la anula
 * por CSS (ver globals.css), así que acá no hace falta lógica extra.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  /** Retardo en ms para escalonar tarjetas de una misma grilla. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'span';
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // @ts-expect-error — ref genérico válido para los tags permitidos
      ref={ref}
      className={cn('reveal', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
