import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiltrosBar, FILTROS_INICIALES } from '../components/cierres/FiltrosBar';
import { ResumenCierres } from '../components/cierres/ResumenCierres';

/**
 * Smoke de render del módulo Cierres y Clientes (Fase 5): garantiza que la
 * barra de filtros y la barra de resumen emiten su contenido. Si alguien
 * los desmonta o los oculta por error, este test lo detecta.
 */
describe('Cierres · barra de filtros', () => {
  const html = renderToStaticMarkup(
    <FiltrosBar
      filtros={FILTROS_INICIALES}
      onChange={() => {}}
      meses={['2026-03', '2026-04']}
      closers={['Ana', 'Bruno']}
    />,
  );

  it('muestra los selectores propios del módulo y el buscador', () => {
    for (const t of ['Mes', 'Programa', 'Closer', 'Estado', 'Buscar cliente']) {
      expect(html, `falta "${t}"`).toContain(t);
    }
  });
  it('ofrece "Todos los meses" y las opciones de programa/closer', () => {
    expect(html).toContain('Todos los meses');
    expect(html).toContain('Cero a Gestor');
    expect(html).toContain('Ana');
  });
});

describe('Cierres · barra de resumen', () => {
  const html = renderToStaticMarkup(
    <ResumenCierres
      mes="2026-03"
      resumen={{
        totalCobradoUsd: 18799,
        totalCobradoArs: 22182820,
        cotizacionPonderada: 1180,
        cantidadCierres: 7,
        cantidadPagos: 15,
        cashNuevoUsd: 13000,
        cohortesUsd: 5799,
        cashNuevoArs: 15000000,
        cohortesArs: 7182820,
        cierresPorPrograma: { empresario: 4, ceroGestor: 3 },
      }}
    />,
  );

  it('muestra cobrado, cotización, desglose nuevo/cohortes y cierres por programa', () => {
    expect(html).toContain('Cobrado USD');
    expect(html).toContain('Cotización ponderada');
    expect(html).toContain('Cash nuevo');
    expect(html).toContain('Cohortes');
    expect(html).toContain('De Cero a Gestor');
    expect(html).toContain('Prestamista Empresario');
  });
});
