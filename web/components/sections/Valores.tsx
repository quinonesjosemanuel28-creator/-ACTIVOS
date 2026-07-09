import { valores, valoresIntro } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Reveal } from '@/components/ui/Reveal';

// Valores (manual, p. 9): los 7 oficiales, numerados, sobre fondo claro.
export function Valores() {
  return (
    <section aria-label="Nuestros valores" className="bg-warm py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader eyebrow="Marca · Valores" title="Valores." titleAccent="Valores." intro={valoresIntro} />

        <ol className="mt-12 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {valores.map((v, i) => (
            <Reveal as="li" key={v.titulo} delay={(i % 4) * 80}>
              <span className="font-display text-sm font-bold text-gold">0{i + 1}</span>
              <h3 className="mt-1.5 font-display text-lg font-black text-navy">{v.titulo}</h3>
              <p className="mt-2 border-t border-line-warm pt-2.5 text-sm leading-relaxed text-navy/70">
                {v.descripcion}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
