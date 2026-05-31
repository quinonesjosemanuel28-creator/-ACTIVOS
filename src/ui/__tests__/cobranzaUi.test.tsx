import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar, MobileNav } from '../components/Sidebar';

describe('Navegación · Cobranza', () => {
  it('el sidebar y la barra mobile incluyen "Cobranza"', () => {
    expect(renderToStaticMarkup(<Sidebar />)).toContain('Cobranza');
    expect(renderToStaticMarkup(<MobileNav />)).toContain('Cobranza');
  });
});
