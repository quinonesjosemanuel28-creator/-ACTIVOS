/**
 * Migración de teléfonos (ticket 7C §7): una pasada, idempotente, y SIN
 * adivinar — lo dudoso queda listado para revisión manual, no migrado.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../../../infrastructure/sqlite/db';
import { infraestructuraDesdeDb } from '../../../infrastructure/db/conexion';
import * as uauth from '../../auth/useCases';
import { crearAlumno, editarAlumno, migrarTelefonos } from '../useCases';
import { alcanceDeUsuario } from '../../../domain/auth/permisos';
import type { Hasher } from '../../auth/ports';

const hasherFake: Hasher = {
  hash: async (p) => `fake:${p}`,
  verificar: async (p, h) => h === `fake:${p}`,
};

async function armar() {
  const infra = infraestructuraDesdeDb(getDbMemoria(), hasherFake);
  const admin = (await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234'))!;
  const alcance = alcanceDeUsuario({ id: admin.id, rol: 'ADMIN' });
  const alta = (nombre: string, whatsapp?: string) =>
    crearAlumno(infra.reposAlumnos, admin, {
      nombre, programa: 'Prestamista a Empresario', moneda: 'ARS', whatsapp,
    });
  return { infra, alcance, alta };
}

describe('Migración de teléfonos (una pasada)', () => {
  it('parte lo parseable, lista lo dudoso y no toca lo ya migrado', async () => {
    const { infra, alcance, alta } = await armar();

    const claro = await alta('Clara', '+54 9 351 555-1234');
    const dudoso = await alta('Dudoso', '351 555 1234'); // local pelado: NO se adivina
    await alta('Sin Dato'); // sin whatsapp: ni migrar ni revisar
    const manual = await alta('Manual', '+57 300 123 4567');
    // A "Manual" ya le cargaron el teléfono a mano: la migración no lo pisa.
    await editarAlumno(infra.reposAlumnos, alcance, manual.id, { telefonoPais: '57', telefonoNumero: '3009999999' });

    const r1 = await migrarTelefonos(infra.reposAlumnos);
    expect(r1.migrados).toBe(1);
    expect(r1.yaMigrados).toBe(1);
    expect(r1.sinMigrar).toEqual([{ id: dudoso.id, nombre: 'Dudoso', whatsapp: '351 555 1234' }]);

    const clara = await infra.reposAlumnos.alumnos.obtener(claro.id);
    expect(clara!.telefonoPais).toBe('54');
    expect(clara!.telefonoNumero).toBe('93515551234');
    expect(clara!.whatsapp).toBe('+54 9 351 555-1234'); // el texto libre no se borra

    const manualDespues = await infra.reposAlumnos.alumnos.obtener(manual.id);
    expect(manualDespues!.telefonoNumero).toBe('3009999999'); // lo cargado a mano manda

    // Idempotente: la segunda pasada no migra nada nuevo ni pisa nada.
    const r2 = await migrarTelefonos(infra.reposAlumnos);
    expect(r2.migrados).toBe(0);
    expect(r2.yaMigrados).toBe(2);
    expect(r2.sinMigrar).toHaveLength(1);
  });
});
