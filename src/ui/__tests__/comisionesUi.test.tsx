import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar, MobileNav } from '../components/Sidebar';

describe('Navegación · Comisiones', () => {
  it('el sidebar y la barra mobile incluyen "Comisiones"', () => {
    expect(renderToStaticMarkup(<Sidebar />)).toContain('Comisiones');
    expect(renderToStaticMarkup(<MobileNav />)).toContain('Comisiones');
  });
});
