/**
 * Ticket 10B · Integración: la bitácora es la historia del alumno — interna,
 * append-only, con ámbito por fila. Lo crítico fijado acá: cargar una
 * entrada APAGA la alerta de inactividad (registra contacto en la misma
 * operación), la traba vigente es la última CON traba, ningún dato de
 * bitácora sale por el endpoint público, y la purga definitiva no falla
 * con bitácora cargada.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { infraestructuraDesdeDb } from '../db/conexion';
import * as uauth from '../../application/auth/useCases';
import * as ua from '../../application/alumnos/useCases';
import { alcanceDeUsuario } from '../../domain/auth/permisos';
import type { Hasher } from '../../application/auth/ports';

const hasherFake: Hasher = { hash: async (p) => `fake:${p}`, verificar: async (p, h) => h === `fake:${p}` };

async function armar(diasAtras = 15) {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);
  const admin = (await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234'))!;
  const { usuario: matias } = await uauth.crearUsuario(infra.reposAuth, {
    email: 'matias@activos.com', nombre: 'Matías Liberati', rol: 'CONSULTOR', password: 'Clave1234',
  });
  const { usuario: otro } = await uauth.crearUsuario(infra.reposAuth, {
    email: 'otro@activos.com', nombre: 'Otro', rol: 'CONSULTOR', password: 'Clave1234',
  });
  const alcanceAdmin = alcanceDeUsuario({ id: admin.id, rol: 'ADMIN' });
  const alcanceMatias = alcanceDeUsuario({ id: matias.id, rol: 'CONSULTOR' });
  const alcanceOtro = alcanceDeUsuario({ id: otro.id, rol: 'CONSULTOR' });
  const alumno = await ua.crearAlumno(infra.reposAlumnos, matias.id, {
    nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS',
  });
  const inicio = new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
  const plan = await ua.cargarPlan(infra.reposAlumnos, alcanceMatias, alumno.id, JSON.stringify({
    version: 1, alumno: 'Gonzalo', fecha_inicio: inicio,
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [{ texto: 'Tablero al día' }] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'A' }, { texto: 'B' }, { texto: 'C' }] },
      { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
      { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
    ],
  }));
  return { infra, admin, matias, alcanceAdmin, alcanceMatias, alcanceOtro, alumno, plan };
}

describe('Ticket 10B · cargar y leer', () => {
  it('la entrada queda con autor, tipo y fecha — y APAGA la alerta de inactividad', async () => {
    const { infra, matias, alcanceMatias, alumno } = await armar(15); // 15 días sin señales

    let filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcanceMatias);
    expect(filas.find((f) => f.alumno.id === alumno.id)!.alerta.activa).toBe(true);

    await ua.cargarBitacora(infra.reposAlumnos, alcanceMatias, matias.id, alumno.id, {
      texto: 'Sesión 1a1. Repasamos el tablero: lo tiene a medio armar y le da vergüenza mostrarlo.',
      tipoContacto: 'consultoria_1a1',
      trabaActual: 'No consigue que el contador le arme la SAS.',
    });

    // Un gesto, dos efectos: la entrada existe Y el contacto apagó la alerta.
    filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcanceMatias);
    expect(filas.find((f) => f.alumno.id === alumno.id)!.alerta.activa).toBe(false);

    const bitacora = await ua.bitacoraDeAlumno(infra.reposAlumnos, infra.reposAuth.usuarios, alcanceMatias, alumno.id);
    expect(bitacora.entradas).toHaveLength(1);
    expect(bitacora.entradas[0]).toMatchObject({ tipoContacto: 'consultoria_1a1', autorNombre: 'Matías Liberati' });
    expect(bitacora.traba).toMatchObject({ texto: 'No consigue que el contador le arme la SAS.', autorNombre: 'Matías Liberati' });
  });

  it('la traba vigente es la última CON traba: una entrada sin traba no la pisa', async () => {
    const { infra, matias, alcanceMatias, alumno } = await armar();
    await ua.cargarBitacora(infra.reposAlumnos, alcanceMatias, matias.id, alumno.id, {
      texto: 'x', tipoContacto: 'llamada_seguimiento', trabaActual: 'Trabado con la SAS',
    }, '2026-08-20T10:00:00.000Z');
    await ua.cargarBitacora(infra.reposAlumnos, alcanceMatias, matias.id, alumno.id, {
      texto: 'seguimiento corto, sin novedades de fondo', tipoContacto: 'whatsapp',
    }, '2026-08-24T10:00:00.000Z');

    const b = await ua.bitacoraDeAlumno(infra.reposAlumnos, infra.reposAuth.usuarios, alcanceMatias, alumno.id);
    expect(b.entradas).toHaveLength(2); // append-only: nada se pisó
    expect(b.traba!.texto).toBe('Trabado con la SAS'); // la vigente sigue siendo la del 20/08

    await ua.cargarBitacora(infra.reposAlumnos, alcanceMatias, matias.id, alumno.id, {
      texto: 'destrabó la SAS; ahora el freno es la cobranza', tipoContacto: 'llamada_seguimiento', trabaActual: 'Cobranza sin protocolo',
    }, '2026-08-26T10:00:00.000Z');
    const b2 = await ua.bitacoraDeAlumno(infra.reposAlumnos, infra.reposAuth.usuarios, alcanceMatias, alumno.id);
    expect(b2.traba!.texto).toBe('Cobranza sin protocolo');
  });

  it('ámbito por fila: la bitácora ajena no existe, ni para leer ni para cargar; ADMIN ve todas', async () => {
    const { infra, matias, alcanceMatias, alcanceOtro, alcanceAdmin, alumno } = await armar();
    await ua.cargarBitacora(infra.reposAlumnos, alcanceMatias, matias.id, alumno.id, { texto: 'x', tipoContacto: 'otro' });

    await expect(ua.bitacoraDeAlumno(infra.reposAlumnos, infra.reposAuth.usuarios, alcanceOtro, alumno.id))
      .rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    await expect(ua.cargarBitacora(infra.reposAlumnos, alcanceOtro, 'quien-sea', alumno.id, { texto: 'x', tipoContacto: 'otro' }))
      .rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect((await ua.bitacoraDeAlumno(infra.reposAlumnos, infra.reposAuth.usuarios, alcanceAdmin, alumno.id)).entradas).toHaveLength(1);
  });
});

describe('Ticket 10B · la bitácora NO sale al público, y la purga no falla', () => {
  it('el payload completo del link no contiene ni un texto de bitácora', async () => {
    const { infra, matias, alcanceMatias, alumno, plan } = await armar();
    const SECRETO = 'BITACORA_INTERNA_no_esta_ejecutando_XYZ';
    await ua.cargarBitacora(infra.reposAlumnos, alcanceMatias, matias.id, alumno.id, {
      texto: SECRETO, tipoContacto: 'consultoria_1a1', trabaActual: SECRETO,
    });
    const { token } = await ua.emitirLinkSeguimiento(infra.reposAlumnos, alcanceMatias, plan.plan.id);
    const abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token.token);
    expect(JSON.stringify(abierto)).not.toContain(SECRETO);
    expect(JSON.stringify(abierto)).not.toContain('bitacora');
  });

  it('la purga definitiva de la papelera borra al alumno CON bitácora sin fallar (cascade)', async () => {
    const { infra, admin, matias, alcanceMatias, alcanceAdmin, alumno } = await armar();
    await ua.cargarBitacora(infra.reposAlumnos, alcanceMatias, matias.id, alumno.id, { texto: 'historia', tipoContacto: 'otro' });
    await ua.eliminarAlumno(infra.reposAlumnos, alcanceAdmin, admin.id, alumno.id);
    await expect(ua.eliminarAlumnoDefinitivo(infra.reposAlumnos, alumno.id, 'Gonzalo')).resolves.not.toThrow();
    expect(await infra.reposAlumnos.bitacora.listarPorAlumno(alumno.id)).toHaveLength(0);
  });
});
