/**
 * CAPA 4 — INFRAESTRUCTURA · Auth · Hasher bcrypt.
 *
 * Implementa el puerto Hasher con bcryptjs (costo 12). El costo hace el hash
 * deliberadamente lento (~250 ms) para frenar la fuerza bruta offline si
 * alguna vez se filtrara la tabla. El texto plano nunca se persiste.
 */
import bcrypt from 'bcryptjs';
import type { Hasher } from '../../application/auth/ports';

export const COSTO_BCRYPT = 12;

export const hasherBcrypt: Hasher = {
  hash: (plano) => bcrypt.hash(plano, COSTO_BCRYPT),
  verificar: (plano, hash) => bcrypt.compare(plano, hash),
};
