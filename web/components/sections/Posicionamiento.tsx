import { posicionamiento } from '@/config/site';
import { Reveal } from '@/components/ui/Reveal';

/** Pinta en dorado las frases acentuadas dentro del claim (estilo manual, p. 10). */
function withAccents(text: string, accents: readonly string[]) {
  let parts: (string | JSX.Element)[] = [text];
  accents.forEach((accent, ai) => {
    parts = parts.flatMap((part) => {
      if (typeof part !== 'string' || !part.includes(accent)) return [part];
      const [before, ...rest] = part.split(accent);
      return [
        before,
        <span key={`${ai}-${accent}`} className="text-gold-light">
          {accent}
        </span>,
        rest.join(accent),
      ];
    });
  });
  return parts;
}

// Declaración de posicionamiento (manual, p. 10): banda navy de impacto.
export function Posicionamiento() {
  return (
    <section aria-label="Posicionamiento" className="bg-impact py-20 sm:py-24">
      <div className="container-site">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="eyebrow text-gold-light">Posicionamiento</span>
          <p className="mt-5 font-display text-2xl font-black leading-snug text-warm sm:text-3xl lg:text-4xl">
            {withAccents(posicionamiento.claim, posicionamiento.accents)}
          </p>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-warm/60">
            {posicionamiento.support}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
