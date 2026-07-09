import { arquitectura, unidades, cobranzas, contact } from '@/config/site';
import { Isotype } from '@/components/ui/Logo';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Reveal } from '@/components/ui/Reveal';

// El ecosistema (manual, pp. 12–13): la marca madre arriba y las cuatro
// unidades conectadas, cada una con su color de acento exacto.
export function Ecosistema() {
  return (
    <section id="ecosistema" aria-label="El ecosistema" className="bg-warm py-20 sm:py-24">
      <div className="container-site">
        <SectionHeader
          eyebrow="Arquitectura · El ecosistema"
          title={arquitectura.title}
          titleAccent="cuatro unidades."
          intro={arquitectura.intro}
        />

        {/* Marca madre */}
        <Reveal className="mt-12">
          <div className="mx-auto flex max-w-sm items-center justify-center gap-3.5 rounded-lg bg-navy px-7 py-5 shadow-sm">
            <Isotype size={38} />
            <span className="flex flex-col leading-none">
              <span className="font-display text-xl font-black text-warm">
                {arquitectura.madre.nombre}
              </span>
              <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.3em] text-gold-light">
                {arquitectura.madre.rol}
              </span>
            </span>
          </div>
          {/* Conector hacia las unidades */}
          <div className="mx-auto h-7 w-px bg-gold/50" aria-hidden="true" />
          <div className="mx-auto hidden h-px max-w-4xl bg-gold/30 lg:block" aria-hidden="true" />
        </Reveal>

        {/* Las 4 unidades */}
        <ul className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {unidades.map((u, i) => (
            <Reveal
              as="li"
              key={u.id}
              delay={i * 90}
              className="overflow-hidden rounded-lg border border-line-warm bg-warm-card shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <article id={u.id} className="scroll-mt-24">
                {/* Barra superior con el color de la unidad */}
                <div className="h-1.5" style={{ backgroundColor: u.accent }} aria-hidden="true" />
                <div className="p-6">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: u.accent }}
                    aria-hidden="true"
                  />
                  <h3 className="mt-3 font-display text-xl font-black text-navy">{u.nombre}</h3>
                  <p
                    className="mt-1 text-xs font-medium uppercase tracking-[0.18em]"
                    style={{ color: u.accent }}
                  >
                    {u.rol}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-navy/70">{u.descripcion}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>

        {/* Servicio transversal: gestión de cobranzas (se conserva del sitio anterior) */}
        <Reveal delay={200}>
          <aside className="mt-8 flex flex-col items-start justify-between gap-4 rounded-lg border border-line-warm bg-warm-card p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-display text-base font-bold text-navy">{cobranzas.titulo}</h3>
              <p className="mt-1 text-sm text-navy/70">{cobranzas.texto}</p>
            </div>
            <a
              href={contact.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md bg-gold px-4 py-2.5 text-sm font-bold text-navy-deep transition-colors hover:bg-gold-light"
            >
              {cobranzas.cta}
            </a>
          </aside>
        </Reveal>
      </div>
    </section>
  );
}
