import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearEgresosAdminRepo } from '../sqlite/egresosRepos';
import * as uce from '../../application/egresos/useCases';

function setup() {
  return crearEgresosAdminRepo(getDbMemoria());
}

describe('Egresos · CRUD + doble moneda', () => {
  it('crea un egreso derivando la cotización y el tipo por categoría', () => {
    const repo = setup();
    const e = uce.crearEgreso(repo, {
      fecha: '2026-05-03', categoria: 'Marketing y publicidad', concepto: 'IG Ads',
      montoUsd: 1000, montoArs: 1_300_000,
    });
    expect(e.cotizacion).toBeCloseTo(1300);
    expect(e.tipo).toBe('Directo'); // derivado de la categoría (bajo el capó)
    expect(repo.obtener(e.idEgreso)!.montoArs).toBe(1_300_000);
  });

  it('editar y eliminar', () => {
    const repo = setup();
    const e = uce.crearEgreso(repo, { fecha: '2026-05-03', categoria: 'Sueldos', montoUsd: 4000 });
    uce.editarEgreso(repo, e.idEgreso, { fecha: '2026-05-03', categoria: 'Sueldos', montoUsd: 4200 });
    expect(repo.obtener(e.idEgreso)!.montoUsd).toBe(4200);
    uce.eliminarEgreso(repo, e.idEgreso);
    expect(repo.obtener(e.idEgreso)).toBeNull();
  });

  it('rechaza categoría fuera de la lista de 8', () => {
    const repo = setup();
    expect(() => uce.crearEgreso(repo, { fecha: '2026-05-03', categoria: 'Cualquiera', montoUsd: 100 })).toThrow();
  });
});

describe('Egresos · resumen del período (operativo vs retiros, recurrentes)', () => {
  function sembrar(repo: ReturnType<typeof setup>) {
    uce.crearEgreso(repo, { fecha: '2026-05-02', categoria: 'Sueldos', montoUsd: 4000 });
    uce.crearEgreso(repo, { fecha: '2026-05-05', categoria: 'Marketing y publicidad', montoUsd: 1500, montoArs: 1_950_000 });
    uce.crearEgreso(repo, { fecha: '2026-05-25', categoria: 'Retiros de socios', montoUsd: 3000 }); // distribución
    uce.crearEgreso(repo, { fecha: '2026-03-01', categoria: 'Gastos fijos', montoUsd: 900, recurrente: true }); // alquiler recurrente
  }

  it('separa costo operativo de retiros de socios', () => {
    const repo = setup();
    sembrar(repo);
    const r = uce.resumenEgresos(repo, '2026-05');
    // operativo mayo = Sueldos 4000 + Marketing 1500 + Alquiler proyectado 900 = 6400
    expect(r.costoOperativoUsd).toBe(6400);
    expect(r.distribucionUsd).toBe(3000);
    expect(r.totalUsd).toBe(9400);
  });

  it('proyecta el recurrente a un mes posterior sin recargarlo', () => {
    const repo = setup();
    sembrar(repo);
    const lista = uce.listarEgresos(repo, { mes: '2026-06' });
    expect(lista.some((e) => e.categoria === 'Gastos fijos')).toBe(true); // alquiler proyectado a junio
    expect(lista.some((e) => e.categoria === 'Sueldos')).toBe(false); // sueldo de mayo no
  });

  it('desglose por categoría con %', () => {
    const repo = setup();
    sembrar(repo);
    const r = uce.resumenEgresos(repo, '2026-05');
    const retiro = r.porCategoria.find((l) => l.categoria === 'Retiros de socios')!;
    expect(retiro.pctUsd).toBeCloseTo(3000 / 9400);
    expect(retiro.esDistribucion).toBe(true);
  });

  it('filtro por tipo recurrente y por categoría', () => {
    const repo = setup();
    sembrar(repo);
    expect(uce.listarEgresos(repo, { mes: '2026-05', tipo: 'recurrente' }).every((e) => e.recurrente)).toBe(true);
    expect(uce.listarEgresos(repo, { mes: '2026-05', categoria: 'Sueldos' })).toHaveLength(1);
  });
});
