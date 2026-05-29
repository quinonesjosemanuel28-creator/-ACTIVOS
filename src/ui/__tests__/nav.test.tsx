import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar, MobileNav } from '../components/Sidebar';

/**
 * Smoke de navegación: garantiza que "Cierres y Clientes" (y el resto de
 * las vistas) sea alcanzable TANTO en el sidebar de desktop COMO en la
 * barra mobile. Cubre el bug de Fase 3 en que el sidebar `hidden md:flex`
 * dejaba el ítem inalcanzable en viewports angostos.
 */
const VISTAS = [
  'Vista Ejecutiva',
  'Alertas',
  'Cash Flow',
  'Funnel',
  'Histórico',
  'Marketing',
  'Empresario vs Gestor',
  'Cierres y Clientes',
  'Carga &amp; Admin', // el & se renderiza escapado en HTML
];

describe('Navegación', () => {
  it('el sidebar de desktop lista todas las vistas, incluida Cierres y Clientes', () => {
    const html = renderToStaticMarkup(<Sidebar />);
    for (const v of VISTAS) expect(html, `falta "${v}" en el sidebar`).toContain(v);
    expect(html).toContain('md:flex');
  });

  it('la barra mobile también ofrece Cierres y Clientes (reachability en viewports angostos)', () => {
    const html = renderToStaticMarkup(<MobileNav />);
    expect(html).toContain('Cierres y Clientes');
    expect(html).toContain('md:hidden');
  });
});
