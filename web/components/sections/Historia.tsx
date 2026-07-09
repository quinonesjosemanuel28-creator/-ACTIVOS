import Image from 'next/image';
import { historia } from '@/config/site';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Reveal } from '@/components/ui/Reveal';

// Historia y fundador (manual, pp. 5–6): narrativa + línea de tiempo + cita.
export function Historia() {
  const { fundador } = historia;
  const citaIdx = fundador.cita.indexOf(fundador.citaAccent);

  return (
    <section id="marca" aria-label="La marca" className="bg-warm py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader
          eyebrow="Marca · La historia"
          title={historia.title}
          titleAccent="pregunta."
          intro={historia.lead}
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          {/* Columna izquierda: narrativa + tarjeta del fundador */}
          <div>
            <Reveal>
              <p className="border-l-2 border-gold pl-5 text-base leading-relaxed text-navy/80">
                {historia.body}
              </p>
            </Reveal>

            <Reveal delay={120}>
              <figure className="mt-8 overflow-hidden rounded-lg border border-line-warm bg-warm-card shadow-sm sm:flex">
                <div className="relative aspect-[4/5] sm:aspect-auto sm:w-2/5">
                  <Image
                    src={fundador.foto}
                    alt={fundador.fotoAlt}
                    fill
                    sizes="(min-width: 1024px) 220px, (min-width: 640px) 40vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="flex flex-col justify-center p-6 sm:w-3/5">
                  <span className="eyebrow text-gold">El fundador</span>
                  <blockquote className="mt-3 font-display text-lg font-bold leading-snug text-navy">
                    “{fundador.cita.slice(0, citaIdx)}
                    <span className="text-gold">{fundador.citaAccent}</span>
                    {fundador.cita.slice(citaIdx + fundador.citaAccent.length)}”
                  </blockquote>
                  <div className="mt-4 h-px w-8 bg-gold" aria-hidden="true" />
                  <p className="mt-3 text-sm font-bold text-navy">{fundador.nombre}</p>
                  <p className="text-xs text-navy/60">{fundador.cargo}</p>
                </figcaption>
              </figure>
            </Reveal>
          </div>

          {/* Columna derecha: línea de tiempo */}
          <ol className="divide-y divide-line-warm border-y border-line-warm">
            {historia.timeline.map((hito, i) => (
              <Reveal as="li" key={hito.etapa} delay={i * 80} className="grid grid-cols-[92px_1fr] gap-4 py-5">
                <span className="pt-0.5 text-xs font-bold uppercase tracking-wide text-gold">
                  {hito.etapa}
                </span>
                <p className="text-sm leading-relaxed text-navy/75">
                  <strong className="font-bold text-navy">{hito.titulo}</strong> {hito.texto}
                </p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
