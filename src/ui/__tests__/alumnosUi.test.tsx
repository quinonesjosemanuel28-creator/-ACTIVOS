/**
 * Panel de alumnos · navegación + las funciones puras de la corrección.
 *
 * `armarPatch` decide QUÉ viaja en el PUT: si manda de más, pisa respuestas
 * que el consultor no tocó; si manda de menos, la corrección se pierde. Es la
 * pieza más delicada del panel y se testea pura.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { armarPatch, cargaPorConsultor, faltantesDe } from '../views/VistaAlumnos';
import { estadoDesdeRespuestas } from '../views/VistaFormulario';

describe('Navegación · Alumnos', () => {
  it('el sidebar y la barra mobile incluyen "Alumnos"', () => {
    expect(renderToStaticMarkup(<Sidebar />)).toContain('Alumnos');
    expect(renderToStaticMarkup(<MobileNav />)).toContain('Alumnos');
  });
});

describe('Panel · estadoDesdeRespuestas (guardado → formulario)', () => {
  it('números a texto de input, multi de JSON a array, casillas a su mapa', () => {
    const { valores, sinDato } = estadoDesdeRespuestas({
      capital_colocado: 13_000_000,
      capital_colocado_sin_dato: false,
      mora_clientes: null,
      mora_clientes_sin_dato: true,
      perfil_cliente: '["Comerciantes","Jubilados"]',
      equipo: 'Solo yo',
    });
    expect(valores.capital_colocado).toBe('13000000');
    expect(valores.perfil_cliente).toEqual(['Comerciantes', 'Jubilados']);
    expect(valores.equipo).toBe('Solo yo');
    expect(sinDato.mora_clientes).toBe(true);
    expect(sinDato.capital_colocado).toBe(false);
  });
});

describe('Panel · armarPatch (solo viaja lo tocado)', () => {
  const base = () => estadoDesdeRespuestas({
    capital_colocado: 13_000_000,
    mora_clientes: null,
    mora_clientes_sin_dato: true,
    perfil_cliente: '["Comerciantes"]',
    equipo: 'Solo yo',
  });

  it('sin cambios, el patch queda VACÍO', () => {
    expect(armarPatch(base(), base())).toEqual({});
  });

  it('cargar el dato que faltaba viaja como número; lo no tocado NO viaja', () => {
    const original = base();
    const editado = base();
    editado.valores.mora_clientes = '12';
    editado.sinDato.mora_clientes = false;

    const patch = armarPatch(original, editado);
    expect(patch).toEqual({ mora_clientes: 12, mora_clientes_sin_dato: false });
    expect('capital_colocado' in patch).toBe(false);
    expect('equipo' in patch).toBe(false);
  });

  it('marcar la casilla viaja solo el flag (el server borra el valor)', () => {
    const original = base();
    const editado = base();
    editado.sinDato.capital_colocado = true;
    expect(armarPatch(original, editado)).toEqual({ capital_colocado_sin_dato: true });
  });

  it('vaciar un texto viaja null (borrado explícito, no omisión)', () => {
    const original = base();
    const editado = base();
    editado.valores.equipo = '';
    expect(armarPatch(original, editado)).toEqual({ equipo: null });
  });

  it('un multi corregido viaja como array', () => {
    const original = base();
    const editado = base();
    editado.valores.perfil_cliente = ['Comerciantes', 'Informales'];
    expect(armarPatch(original, editado)).toEqual({ perfil_cliente: ['Comerciantes', 'Informales'] });
  });

  it('un número ilegible NO viaja (antes muerto que pisar con basura)', () => {
    const original = base();
    const editado = base();
    editado.valores.capital_colocado = 'mucho';
    expect(armarPatch(original, editado)).toEqual({});
  });
});

describe('Panel · faltantes con el texto de la pregunta (guion de la llamada)', () => {
  it('lista las que quedaron sin dato, con su label', () => {
    const faltantes = faltantesDe({
      respuestas: {
        // solo mora respondida: el resto de las 19 queda faltante
        mora_clientes: 10,
        mora_clientes_sin_dato: false,
      },
    });
    expect(faltantes).toContain('¿Con cuánto capital estás trabajando actualmente?');
    expect(faltantes).not.toContain('¿Qué porcentaje de tus clientes está atrasado hoy?');
    expect(faltantes).toHaveLength(18);
  });
});

describe('Panel · cargaPorConsultor (vista de reasignación, 11C)', () => {
  const fila = (consultorId: string, salud: 'VERDE' | 'NARANJA' | 'ROJO' | 'NEUTRO') =>
    ({ alumno: { consultorId }, salud: { salud } }) as Parameters<typeof cargaPorConsultor>[0][number];

  it('cuenta alumnos y rojos por consultor, sobre los datos que ya viajan al panel', () => {
    const carga = cargaPorConsultor([
      fila('matias', 'VERDE'),
      fila('matias', 'ROJO'),
      fila('matias', 'NARANJA'),
      fila('ale', 'ROJO'),
      fila('ale', 'ROJO'),
    ]);
    expect(carga.get('matias')).toEqual({ total: 3, rojos: 1 });
    expect(carga.get('ale')).toEqual({ total: 2, rojos: 2 });
    expect(carga.get('nadie')).toBeUndefined();
  });

  it('con el panel vacío devuelve un mapa vacío (asignar a un consultor sin alumnos es válido)', () => {
    expect(cargaPorConsultor([]).size).toBe(0);
  });
});
