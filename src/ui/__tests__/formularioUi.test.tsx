/**
 * Formulario público · armado del payload y render inicial.
 *
 * `armarPayload` es donde la UI puede mentirle al server: un número que viaja
 * como texto, una casilla marcada que igual manda el valor, un vacío que viaja
 * como cadena. Se testea pura, sin montar nada.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BLOQUES, PREGUNTAS_FICHA } from '@domain/alumnos/formulario';
import { armarPayload, preguntasFichaPendiente, VistaFormulario } from '../views/VistaFormulario';

const PREGUNTAS = BLOQUES.flatMap((b) => b.preguntas);

describe('Formulario UI · armarPayload', () => {
  it('convierte números (y acepta coma decimal)', () => {
    const p = armarPayload(PREGUNTAS, { capital_colocado: '13000000', mora_clientes: '12,5' }, {});
    expect(p.capital_colocado).toBe(13_000_000);
    expect(p.mora_clientes).toBe(12.5);
  });

  it('la casilla marcada viaja como _sin_dato:true y SIN valor, aunque haya quedado tipeado', () => {
    const p = armarPayload(PREGUNTAS, { ganancia_mensual: '900000' }, { ganancia_mensual: true });
    expect(p.ganancia_mensual_sin_dato).toBe(true);
    expect('ganancia_mensual' in p).toBe(false);
  });

  it('sin marcar, la casilla viaja en false y el valor entra', () => {
    const p = armarPayload(PREGUNTAS, { ganancia_mensual: '900000' }, {});
    expect(p.ganancia_mensual_sin_dato).toBe(false);
    expect(p.ganancia_mensual).toBe(900_000);
  });

  it('omite vacíos en vez de mandar cadenas: el server distingue "no vino" de "vino mal"', () => {
    const p = armarPayload(PREGUNTAS, { capital_colocado: '', equipo: '   ', perfil_cliente: [] }, {});
    expect('capital_colocado' in p).toBe(false);
    expect('equipo' in p).toBe(false);
    expect('perfil_cliente' in p).toBe(false);
  });

  it('recorta textos y respeta los multi como array', () => {
    const p = armarPayload(PREGUNTAS, { equipo: '  Solo yo  ', perfil_cliente: ['Comerciantes', 'Jubilados'] }, {});
    expect(p.equipo).toBe('Solo yo');
    expect(p.perfil_cliente).toEqual(['Comerciantes', 'Jubilados']);
  });

  it('un número no parseable no viaja (el server lo pedirá como faltante)', () => {
    const p = armarPayload(PREGUNTAS, { capital_colocado: 'mucho' }, {});
    expect('capital_colocado' in p).toBe(false);
  });

  it('incluye el bloque 0 pendiente cuando se le pasa', () => {
    const p = armarPayload([...PREGUNTAS_FICHA, ...PREGUNTAS], { edad: '38', zona: 'Córdoba' }, {});
    expect(p.edad).toBe(38);
    expect(p.zona).toBe('Córdoba');
  });
});

describe('Formulario UI · bloque 0 pendiente', () => {
  it('muestra solo lo que la ficha no tiene', () => {
    const preguntas = preguntasFichaPendiente({ fichaPendiente: ['zona', 'canal_origen'] });
    expect(preguntas.map((p) => p.campo)).toEqual(['zona', 'canal_origen']);
  });

  it('con la ficha completa no se pregunta nada', () => {
    expect(preguntasFichaPendiente({ fichaPendiente: [] })).toEqual([]);
  });
});

describe('Formulario UI · render', () => {
  it('el estado inicial (cargando) renderiza sin sesión ni datos', () => {
    // Sin efecto de red en render estático: queda el spinner. Lo que prueba es
    // que la vista monta sin store, sin QueryClient y sin sesión — es pública.
    const html = renderToStaticMarkup(<VistaFormulario token="tok-1" />);
    expect(html).toContain('status');
  });
});
