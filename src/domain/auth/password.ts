/**
 * CAPA 3 — DOMINIO · Auth · Política de contraseñas (pura).
 *
 * Reglas mínimas de robustez. No hashea (eso es infraestructura: bcrypt);
 * solo valida que una contraseña en texto plano cumpla el mínimo antes de
 * aceptarla. Cero dependencias.
 */

export const LARGO_MINIMO_PASSWORD = 8;

export interface ResultadoPassword {
  ok: boolean;
  motivo?: string;
}

/** Valida la robustez mínima de una contraseña nueva. */
export function validarPassword(password: unknown): ResultadoPassword {
  if (typeof password !== 'string' || password === '') {
    return { ok: false, motivo: 'La contraseña es obligatoria.' };
  }
  if (password.length < LARGO_MINIMO_PASSWORD) {
    return { ok: false, motivo: `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.` };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, motivo: 'La contraseña debe combinar letras y números.' };
  }
  return { ok: true };
}

/** Genera una contraseña temporal legible (para altas y resets del ADMIN). */
export function generarPasswordTemporal(aleatorio: () => number = Math.random): string {
  // Sin caracteres ambiguos (0/O, 1/l). 10 chars, letras + números: cumple la política.
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const num = '23456789';
  const pick = (s: string) => s[Math.floor(aleatorio() * s.length)]!;
  let out = '';
  for (let i = 0; i < 6; i++) out += pick(abc);
  for (let i = 0; i < 4; i++) out += pick(num);
  return out;
}
