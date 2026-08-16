/**
 * Teléfono y WhatsApp (ticket 7C).
 *
 * Lo que se protege acá: el 9 argentino (WhatsApp lo exige entre país y área
 * para celulares, y el resto de LATAM no lo lleva), que el parseo NO adivine
 * (adivinar mal es escribirle a un desconocido), y que el mensaje pregunte
 * por el KR pendiente cuando lo hay.
 */
import { describe, it, expect } from 'vitest';
import { linkWhatsapp, mensajeSeguimiento, numeroWhatsapp, parsearTelefono } from '../telefono';

describe('Teléfono · el número de wa.me', () => {
  it('criterio de aceptación: el celular argentino lleva el 9 intercalado; el colombiano no', () => {
    expect(numeroWhatsapp('54', '3515551234')).toBe('5493515551234');
    expect(numeroWhatsapp('57', '3001234567')).toBe('573001234567');
  });

  it('si el 9 ya está, no se duplica; el 0 de discado local se saca', () => {
    expect(numeroWhatsapp('54', '93515551234')).toBe('5493515551234');
    expect(numeroWhatsapp('54', '03515551234')).toBe('5493515551234');
  });

  it('el link arma wa.me con el mensaje URL-encodeado', () => {
    const url = linkWhatsapp('54', '1155556666', 'Hola Gonzalo, ¿cómo venís?');
    expect(url).toBe(`https://wa.me/5491155556666?text=${encodeURIComponent('Hola Gonzalo, ¿cómo venís?')}`);
  });
});

describe('Teléfono · parseo con confianza (migración)', () => {
  it('con marca internacional explícita parsea: +, 00 o el 549 inconfundible', () => {
    expect(parsearTelefono('+54 9 351 555-1234')).toEqual({ pais: '54', numero: '93515551234' });
    expect(parsearTelefono('005493515551234')).toEqual({ pais: '54', numero: '93515551234' });
    expect(parsearTelefono('5493515551234')).toEqual({ pais: '54', numero: '93515551234' });
    expect(parsearTelefono('+57 300 123 4567')).toEqual({ pais: '57', numero: '3001234567' });
    expect(parsearTelefono('+593 99 123 4567')).toEqual({ pais: '593', numero: '991234567' });
  });

  it('sin marca clara NO adivina: número local, texto, vacío o código desconocido → null', () => {
    expect(parsearTelefono('351 555 1234')).toBeNull(); // local pelado
    expect(parsearTelefono('541234')).toBeNull(); // parece 54 pero es demasiado corto para ser AR completo
    expect(parsearTelefono('me escribe él')).toBeNull();
    expect(parsearTelefono('')).toBeNull();
    expect(parsearTelefono('+999 123456789')).toBeNull();
  });
});

describe('Teléfono · el mensaje precargado', () => {
  it('con KR pendiente pregunta por ESO; sin KR cae a la versión genérica', () => {
    expect(mensajeSeguimiento('Gonzalo Pérez', 'el tablero de créditos')).toBe(
      'Hola Gonzalo, ¿cómo venís con el tablero de créditos? Quería ver si te trabaste en algo.',
    );
    expect(mensajeSeguimiento('Gonzalo Pérez', null)).toBe(
      'Hola Gonzalo, ¿cómo venís con el plan? Quería ver si te trabaste en algo.',
    );
  });
});
