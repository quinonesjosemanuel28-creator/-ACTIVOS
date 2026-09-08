/**
 * Ticket 9B · Integración: la corrección del consultor es un checkin auditado
 * que NO silencia la alerta de inactividad; el cierre derivado viaja por
 * avancePlan; las mediciones exigen tipo métrica; y — el criterio que manda —
 * el semáforo sigue leyendo el tilde legado, intacto.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { infraestructuraDesdeDb } from '../db/conexion';
import * as uauth from '../../application/auth/useCases';
import * as ua from '../../application/alumnos/useCases';
import { alcanceDeUsuario } from '../../domain/auth/permisos';
import { estadoDe } from '../../domain/alumnos/plan';
import type { Hasher } from '../../application/auth/ports';

const hasherFake: Hasher = { hash: async (p) => `fake:${p}`, verificar: async (p, h) => h === `fake:${p}` };

async function armar(diasAtras = 15) {
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
  const inicio = new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
  const plan = await ua.cargarPlan(infra.reposAlumnos, alcance, alumno.id, JSON.stringify({
    version: 1, alumno: 'Gonzalo', fecha_inicio: inicio,
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [
      { texto: 'Tablero al día' },
      // Contrato v3: la skill emite el tipo. La métrica llega con su paquete.
      { texto: 'Bajar la mora', tipo: 'metrica', valor_inicial: 20, meta_90: 10, unidad: '%', direccion: 'baja' },
    ] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'A', okr: 1, kr: 1 }, { texto: 'B', okr: 1, kr: 1 }, { texto: 'C' }] },
      { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
      { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
    ],
  }));
  return { db, infra, admin, alcance, alcanceOtro, alumno, plan };
}

describe('Ticket 9B · corrección del consultor', () => {
  it('cerrar la última acción cierra el KR; destildar lo reabre; todo queda auditado', async () => {
    const { infra, admin, alcance, plan } = await armar();
    const [a1, a2] = plan.acciones; // A y B referencian el KR 1

    await ua.corregirAccion(infra.reposAlumnos, alcance, admin.id, a1!.id, { estado: 'ejecutado' });
    let avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    const krTablero = () => avance.estadoKrs.find((k) => k.totalAcciones === 2)!;
    expect(krTablero()).toMatchObject({ cumplida: false, ejecutadas: 1 });

    await ua.corregirAccion(infra.reposAlumnos, alcance, admin.id, a2!.id, { estado: 'ejecutado', nota: 'Lo vimos en la llamada' });
    avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    expect(krTablero()).toMatchObject({ cumplida: true, motivo: 'derivada' });

    // La nota quedó en la acción, visible en el tablero.
    const accionB = avance.fases[0]!.acciones.find((x) => x.id === a2!.id)!;
    expect(accionB.nota).toBe('Lo vimos en la llamada');
    expect(accionB.estado).toBe('ejecutado');

    // Destildar reabre — el cierre es un cálculo, no un estado pegado.
    await ua.corregirAccion(infra.reposAlumnos, alcance, admin.id, a2!.id, { estado: 'en_curso' });
    avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    expect(krTablero().cumplida).toBe(false);
    expect(avance.fases[0]!.acciones.find((x) => x.id === a2!.id)!.estado).toBe('en_curso');

    // Auditado por la propia tabla: origen consultor + usuario + marcado coherente.
    const checkins = await infra.reposAlumnos.checkins.listarPorPlan(plan.plan.id);
    expect(checkins).toHaveLength(3);
    for (const c of checkins) {
      expect(c.origen).toBe('consultor');
      expect(c.usuarioId).toBe(admin.id);
      expect(c.marcado).toBe(estadoDe(c) === 'ejecutado');
    }
  });

  it('criterio que pediste fijado: un checkin origen consultor NO silencia la alerta de inactividad', async () => {
    const { infra, admin, alcance, alumno, plan } = await armar(15); // 15 días sin señales del alumno
    await ua.corregirAccion(infra.reposAlumnos, alcance, admin.id, plan.acciones[0]!.id, { estado: 'ejecutado' });

    const filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    const fila = filas.find((f) => f.alumno.id === alumno.id)!;
    expect(fila.alerta.activa).toBe(true); // el alumno sigue sin dar señales
    expect(fila.ultimaActividad).toBeNull(); // la señal es del ALUMNO, no del panel
    expect(fila.krs).toMatchObject({ totales: 2 }); // y el contador ahora es el derivado
  });

  it('la acción ajena no existe para otro consultor (ámbito hasta la fila)', async () => {
    const { infra, alcanceOtro, plan } = await armar();
    await expect(
      ua.corregirAccion(infra.reposAlumnos, alcanceOtro, 'quien-sea', plan.acciones[0]!.id, { estado: 'ejecutado' }),
    ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });
});

describe('Ticket 9B · mediciones', () => {
  it('un entregable rechaza mediciones; una métrica las acumula y cumple por dirección', async () => {
    const { infra, admin, alcance, alumno, plan } = await armar();
    const [krEntregable, krMora] = plan.okrs[0]!.krs;

    // El tipado del contrato v3 sobrevive el viaje bloque → base → relectura.
    const [releido] = await infra.reposAlumnos.planes.listarPorAlumno(alumno.id);
    const mora9 = releido!.okrs[0]!.krs.find((k) => k.id === krMora!.id)!;
    expect(mora9).toMatchObject({ tipo: 'metrica', valorInicial: 20, meta90: 10, unidad: '%', direccion: 'baja' });
    expect(releido!.okrs[0]!.krs.find((k) => k.id === krEntregable!.id)).toMatchObject({ tipo: 'entregable' });

    await expect(
      ua.cargarMedicion(infra.reposAlumnos, alcance, admin.id, krEntregable!.id, { valor: 10 }),
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });

    await ua.cargarMedicion(infra.reposAlumnos, alcance, admin.id, krMora!.id, { valor: 14 }, '2026-08-10T00:00:00.000Z');
    await ua.cargarMedicion(infra.reposAlumnos, alcance, admin.id, krMora!.id, { valor: 9 }, '2026-08-16T00:00:00.000Z');

    const avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    const mora = avance.estadoKrs.find((k) => k.krId === krMora!.id)!;
    expect(mora).toMatchObject({ tipo: 'metrica', cumplida: true, motivo: 'valor', valorActual: 9 });
    expect(avance.mediciones).toHaveLength(2); // nada se pisó
    expect(avance.mediciones.every((m) => m.origen === 'consultor' && m.usuarioId === admin.id)).toBe(true);
  });
});

describe('Ticket 9C (switch) · el semáforo mide acciones', () => {
  it('ejecutar las acciones lo mueve; el tilde legado de KRs ya NO', async () => {
    const { infra, admin, alcance, alumno, plan } = await armar(45); // día 46
    // Día 46 sin nada ejecutado: brecha −0.51 → ROJO (el tiempo es la agenda,
    // que con reparto parejo 3/3/3 es idéntico a días/90 — propiedad fijada).
    let filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    let fila = filas.find((f) => f.alumno.id === alumno.id)!;
    expect(fila.salud.salud).toBe('ROJO');

    // El tilde legado (cumplido_en) ya no alimenta ningún color: sigue ROJO.
    for (const k of plan.okrs[0]!.krs) {
      await ua.editarKr(infra.reposAlumnos, alcance, k.id, { cumplido: true });
    }
    filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    fila = filas.find((f) => f.alumno.id === alumno.id)!;
    expect(fila.salud.salud).toBe('ROJO');

    // Ejecutar TODAS las acciones: avance 1 contra tiempo 0.51 → VERDE.
    for (const a of plan.acciones) {
      await ua.corregirAccion(infra.reposAlumnos, alcance, admin.id, a.id, { estado: 'ejecutado' });
    }
    filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    fila = filas.find((f) => f.alumno.id === alumno.id)!;
    expect(fila.salud.salud).toBe('VERDE'); // 9/9 ejecutadas, día 46 → brecha +0.49
  });
});
