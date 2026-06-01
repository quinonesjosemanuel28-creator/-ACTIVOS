import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar, MobileNav } from '../components/Sidebar';

describe('Navegación · Asistente IA', () => {
  it('el sidebar y la barra mobile incluyen "Asistente IA"', () => {
    expect(renderToStaticMarkup(<Sidebar />)).toContain('Asistente IA');
    expect(renderToStaticMarkup(<MobileNav />)).toContain('Asistente IA');
  });
});
