import { describe, it, expect } from 'vitest';
import { cumpleObjetivo } from '../objetivos';

describe('cumpleObjetivo (gauge verde/rojo con objetivo editable)', () => {
  it('CAC (menor es mejor): verde si está bajo el tope editado', () => {
    expect(cumpleObjetivo(300, 350, true)).toBe(true); // bajo tope → verde
    expect(cumpleObjetivo(400, 350, true)).toBe(false); // supera tope → rojo
  });

  it('si bajo el tope a 250, un CAC de 300 pasa a rojo', () => {
    expect(cumpleObjetivo(300, 250, true)).toBe(false);
  });

  it('ROAS/MER (mayor es mejor): verde si alcanza el objetivo editado', () => {
    expect(cumpleObjetivo(3.2, 3, false)).toBe(true);
    expect(cumpleObjetivo(2.5, 3, false)).toBe(false);
  });

  it('si subo el objetivo de ROAS a 5, un ROAS de 4 pasa a rojo', () => {
    expect(cumpleObjetivo(4, 3, false)).toBe(true);
    expect(cumpleObjetivo(4, 5, false)).toBe(false);
  });

  it('valor null (no calculable) → no cumple', () => {
    expect(cumpleObjetivo(null, 3, false)).toBe(false);
  });
});
