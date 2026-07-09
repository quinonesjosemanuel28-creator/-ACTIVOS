import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { MetricsBar } from '@/components/sections/MetricsBar';
import { Esencia } from '@/components/sections/Esencia';
import { Ecosistema } from '@/components/sections/Ecosistema';
import { Posicionamiento } from '@/components/sections/Posicionamiento';
import { Historia } from '@/components/sections/Historia';
import { MisionVision } from '@/components/sections/MisionVision';
import { Valores } from '@/components/sections/Valores';
import { Contacto } from '@/components/sections/Contacto';

// Recorrido: qué hacemos → cómo se estructura → por qué creernos → hacia dónde
// vamos → con qué valores → hablemos.
export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <MetricsBar />
        <Esencia />
        <Ecosistema />
        <Posicionamiento />
        <Historia />
        <MisionVision />
        <Valores />
        <Contacto />
      </main>
      <Footer />
    </>
  );
}
