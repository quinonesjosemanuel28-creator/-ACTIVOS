import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { ResumenEgresos } from '../components/egresos/ResumenEgresos';
import type { ResumenEgresos as Resumen } from '@domain/egresos/metrics';

/** Egresos alcanzable en la navegación (desktop y mobile) + resumen visible. */
describe('Navegación · Egresos', () => {
  it('el sidebar y la barra mobile incluyen "Egresos"', () => {
    expect(renderToStaticMarkup(<Sidebar />)).toContain('Egresos');
    expect(renderToStaticMarkup(<MobileNav />)).toContain('Egresos');
  });
});

describe('ResumenEgresos · render', () => {
  const resumen: Resumen = {
    totalUsd: 9400,
    totalArs: 12_220_000,
    cotizacionPonderada: 1300,
    costoOperativoUsd: 6400,
    costoOperativoArs: 8_320_000,
    distribucionUsd: 3000,
    distribucionArs: 3_900_000,
    porCategoria: [
      { categoria: 'Retiros de socios', usd: 3000, ars: 3_900_000, pctUsd: 3000 / 9400, esDistribucion: true },
      { categoria: 'Sueldos', usd: 4000, ars: 5_200_000, pctUsd: 4000 / 9400, esDistribucion: false },
    ],
    cantidad: 3,
  };

  it('muestra total, costo operativo, retiros y desglose', () => {
    const html = renderToStaticMarkup(<ResumenEgresos resumen={resumen} />);
    expect(html).toContain('Total egresos USD');
    expect(html).toContain('Costo operativo USD');
    expect(html).toContain('Retiros de socios');
    expect(html).toContain('por categoría');
  });
});
