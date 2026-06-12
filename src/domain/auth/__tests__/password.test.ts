import { describe, it, expect } from 'vitest';
import { generarPasswordTemporal, validarPassword, LARGO_MINIMO_PASSWORD } from '../password';

describe('Auth · política de contraseñas', () => {
  it('rechaza vacías o no-string', () => {
    expect(validarPassword('').ok).toBe(false);
    expect(validarPassword(undefined).ok).toBe(false);
    expect(validarPassword(12345678 as unknown).ok).toBe(false);
  });

  it('exige el largo mínimo', () => {
    expect(validarPassword('Ab3').ok).toBe(false);
    // 7 caracteres (uno menos que el mínimo de 8) → inválida aunque tenga letra+número
    expect(validarPassword('a'.repeat(LARGO_MINIMO_PASSWORD - 2) + '1').ok).toBe(false);
    // exactamente el mínimo con letra+número → válida
    expect(validarPassword('a'.repeat(LARGO_MINIMO_PASSWORD - 1) + '1').ok).toBe(true);
  });

  it('exige combinar letras y números', () => {
    expect(validarPassword('sololetras').ok).toBe(false);
    expect(validarPassword('12345678').ok).toBe(false);
    expect(validarPassword('Clave1234').ok).toBe(true);
  });

  it('la contraseña temporal generada cumple la política y no tiene ambiguos', () => {
    for (let i = 0; i < 50; i++) {
      const p = generarPasswordTemporal();
      expect(validarPassword(p).ok).toBe(true);
      expect(p).not.toMatch(/[0O1lI]/); // sin caracteres confusos
    }
  });
});
