/**
 * Ticket 10A · Integración: el ciclo de vida de la nota punta a punta.
 * El alumno escribe desde su link; el consultor la ve abierta (contador en el
 * panel incluido), la responde o archiva; la devolución baja al link SOLO si
 * se resolvió; corregir es re-resolver (append-only); y la nota ajena no
 * existe para otro consultor.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { infraestructuraDesdeDb } from '../db/conexion';
import * as uauth from '../../application/auth/useCases';
import * as ua from '../../application/alumnos/useCases';
import { alcanceDeUsuario } from '../../domain/auth/permisos';
import type { Hasher } from '../../application/auth/ports';

const hasherFake: Hasher = { hash: async (p) => `fake:${p}`, verificar: async (p, h) => h === `fake:${p}` };

async function armar() {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);
  const admin = (await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234'))!;
  const { usuario: otro } = await uauth.crearUsuario(infra.reposAuth, {
    email: 'otro@activos.com', nombre: 'Otro', rol: 'CONSULTOR', password: 'Clave1234',
  });
  const alcance = alcanceDeUsuario({ id: admin.id, rol: 'ADMIN' });
  const alcanceOtro = alcanceDeUsuario({ id: otro.id, rol: 'CONSULTOR' });
  const alumno = await ua.crearAlumno(infra.reposAlumnos, admin, {
    nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS',
  });
  const inicio = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const plan = await ua.cargarPlan(infra.reposAlumnos, alcance, alumno.id, JSON.stringify({
    version: 1, alumno: 'Gonzalo', fecha_inicio: inicio,
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [{ texto: 'Tablero al día' }] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'A', okr: 1, kr: 1 }, { texto: 'B' }, { texto: 'C' }] },
      { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
      { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
    ],
  }));
  const { token } = await ua.emitirLinkSeguimiento(infra.reposAlumnos, alcance, plan.plan.id);
  return { infra, admin, alcance, alcanceOtro, alumno, plan, token: token.token };
}

/** El checkin de la nota más reciente del plan (para resolverla). */
async function checkinDeNota(infra: Awaited<ReturnType<typeof armar>>['infra'], planId: string) {
  const avance = await ua.avancePlan(infra.reposAlumnos, alcanceDeUsuario({ id: 'x', rol: 'ADMIN' }), planId);
  return avance.notas[0]!.checkinId;
}

describe('Ticket 10A · responder', () => {
  it('la nota nace abierta (contador del panel incluido), la devolución baja al link y el semáforo no se mueve', async () => {
    const { infra, admin, alcance, alumno, plan, token } = await armar();
    const accion = plan.acciones[0]!;
    await ua.marcarAccion(infra.reposAlumnos, token, accion.id, { estado: 'en_curso', nota: 'No sé qué columnas van en el tablero' });

    // Abierta: en el avance, en el contador del panel, y sin devolución en el link.
    let filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    let fila = filas.find((f) => f.alumno.id === alumno.id)!;
    expect(fila.notasAbiertas).toBe(1);
    const saludAntes = fila.salud;
    let avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    expect(avance.notas[0]).toMatchObject({ estado: 'abierta', texto: 'No sé qué columnas van en el tablero', devolucion: null });
    let abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token);
    let enLink = abierto.fases[0]!.acciones.find((a) => a.id === accion.id)!;
    expect(enLink).toMatchObject({ nota: 'No sé qué columnas van en el tablero', devolucion: null });

    // Responder con área: sale de las abiertas y la devolución llega al alumno.
    const checkinId = avance.notas[0]!.checkinId;
    await ua.resolverNota(infra.reposAlumnos, alcance, admin.id, checkinId, {
      estado: 'resuelta', area: 'estructura', devolucion: 'Con monto, vencimiento y estado alcanza para arrancar.',
    });
    filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    fila = filas.find((f) => f.alumno.id === alumno.id)!;
    expect(fila.notasAbiertas).toBe(0);
    expect(fila.salud).toEqual(saludAntes); // el ciclo de vida no toca el semáforo
    avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    expect(avance.notas[0]).toMatchObject({ estado: 'resuelta', area: 'estructura', resueltaPor: admin.id });
    abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token);
    enLink = abierto.fases[0]!.acciones.find((a) => a.id === accion.id)!;
    expect(enLink.devolucion).toBe('Con monto, vencimiento y estado alcanza para arrancar.');
  });

  it('corregir una devolución es re-resolver: la nueva gana en la ficha y en el link, la historia queda', async () => {
    const { infra, admin, alcance, plan, token } = await armar();
    const accion = plan.acciones[0]!;
    await ua.marcarAccion(infra.reposAlumnos, token, accion.id, { estado: 'en_curso', nota: 'consulta' });
    const checkinId = await checkinDeNota(infra, plan.plan.id);

    await ua.resolverNota(infra.reposAlumnos, alcance, admin.id, checkinId, { estado: 'resuelta', devolucion: 'con errata' }, '2026-08-26T10:00:00.000Z');
    await ua.resolverNota(infra.reposAlumnos, alcance, admin.id, checkinId, { estado: 'resuelta', devolucion: 'corregida' }, '2026-08-26T11:00:00.000Z');

    const abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token);
    expect(abierto.fases[0]!.acciones.find((a) => a.id === accion.id)!.devolucion).toBe('corregida');
    const resoluciones = await infra.reposAlumnos.notaResoluciones.listarPorPlan(plan.plan.id);
    expect(resoluciones).toHaveLength(2); // nada se pisó
  });
});

describe('Ticket 10A · archivar y guardas', () => {
  it('archivar cierra sin respuesta: el alumno no ve nada nuevo', async () => {
    const { infra, admin, alcance, alumno, plan, token } = await armar();
    const accion = plan.acciones[1]!;
    await ua.marcarAccion(infra.reposAlumnos, token, accion.id, { estado: 'en_curso', nota: 'aviso menor' });
    const checkinId = await checkinDeNota(infra, plan.plan.id);
    await ua.resolverNota(infra.reposAlumnos, alcance, admin.id, checkinId, { estado: 'archivada', area: 'otra' });

    const filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    expect(filas.find((f) => f.alumno.id === alumno.id)!.notasAbiertas).toBe(0);
    const abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token);
    expect(abierto.fases[0]!.acciones.find((a) => a.id === accion.id)!.devolucion).toBeNull();
  });

  it('el schema custodia las audiencias: resolver exige devolución, archivar la prohíbe', async () => {
    const { infra, admin, alcance, plan, token } = await armar();
    await ua.marcarAccion(infra.reposAlumnos, token, plan.acciones[0]!.id, { estado: 'en_curso', nota: 'consulta' });
    const checkinId = await checkinDeNota(infra, plan.plan.id);
    await expect(ua.resolverNota(infra.reposAlumnos, alcance, admin.id, checkinId, { estado: 'resuelta' })).rejects.toThrow(/devolución/i);
    await expect(ua.resolverNota(infra.reposAlumnos, alcance, admin.id, checkinId, { estado: 'archivada', devolucion: 'x' })).rejects.toThrow(/archivar/i);
  });

  it('la nota ajena no existe; un checkin sin nota del alumno no se puede resolver', async () => {
    const { infra, admin, alcance, alcanceOtro, plan, token } = await armar();
    await ua.marcarAccion(infra.reposAlumnos, token, plan.acciones[0]!.id, { estado: 'en_curso', nota: 'consulta' });
    const checkinId = await checkinDeNota(infra, plan.plan.id);
    await expect(ua.resolverNota(infra.reposAlumnos, alcanceOtro, 'quien-sea', checkinId, { estado: 'archivada' }))
      .rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });

    // Un tilde pelado (sin nota) no es una nota; la anotación del consultor tampoco.
    await ua.marcarAccion(infra.reposAlumnos, token, plan.acciones[2]!.id, { marcado: true });
    const checkins = await infra.reposAlumnos.checkins.listarPorPlan(plan.plan.id);
    const sinNota = checkins.find((c) => c.nota === null)!;
    await expect(ua.resolverNota(infra.reposAlumnos, alcance, admin.id, sinNota.id, { estado: 'archivada' }))
      .rejects.toMatchObject({ codigo: 'VALIDACION' });
  });
});
