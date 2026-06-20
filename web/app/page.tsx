import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { MetricsBar } from '@/components/sections/MetricsBar';
import { MisionVision } from '@/components/sections/MisionVision';
import { Ecosistema } from '@/components/sections/Ecosistema';
import { Cobranzas } from '@/components/sections/Cobranzas';
import { Valores } from '@/components/sections/Valores';
import { Contacto } from '@/components/sections/Contacto';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <MetricsBar />
        <MisionVision />
        <Ecosistema />
        <Cobranzas />
        <Valores />
        <Contacto />
      </main>
      <Footer />
    </>
  );
}
