/**
 * Ticket 9C (paralelo) · Integración: los dos semáforos se calculan lado a
 * lado y NO se ven entre sí. El que se muestra sigue siendo el viejo (KRs
 * tildados); el candidato (acciones contra la agenda) vive solo en el export
 * de comparación. La foto que este archivo fija es la de la transición: un
 * alumno con todo ejecutado y nada tildado da ROJO en el viejo y VERDE en el
 * nuevo — esa divergencia es exactamente lo que la semana de observación
 * tiene que poder ver.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { infraestructuraDesdeDb } from '../db/conexion';
import * as uauth from '../../application/auth/useCases';
import * as ua from '../../application/alumnos/useCases';
import { alcanceDeUsuario } from '../../domain/auth/permisos';
import type { Hasher } from '../../application/auth/ports';

const hasherFake: Hasher = { hash: async (p) => `fake:${p}`, verificar: async (p, h) => h === `fake:${p}` };

async function armar(diasAtras = 46) {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);
  const admin = (await uauth.asegurarAdminInicial(infra.reposAuth, 'admin@activos.com', 'Clave1234'))!;
  const alcance = alcanceDeUsuario({ id: admin.id, rol: 'ADMIN' });
  const alumno = await ua.crearAlumno(infra.reposAlumnos, admin, {
    nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS',
  });
  const inicio = new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
  const plan = await ua.cargarPlan(infra.reposAlumnos, alcance, alumno.id, JSON.stringify({
    version: 1, alumno: 'Gonzalo', fecha_inicio: inicio,
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [{ texto: 'Tablero al día' }, { texto: 'Caja separada' }] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'A', okr: 1, kr: 1 }, { texto: 'B', okr: 1, kr: 2 }, { texto: 'C' }] },
      { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
      { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
    ],
  }));
  return { infra, admin, alcance, alumno, plan };
}

describe('Ticket 9C · comparación en paralelo', () => {
  it('la foto de la transición: todo ejecutado y nada tildado → viejo ROJO, nuevo VERDE; el tilde legado los reconcilia', async () => {
    const { infra, admin, alcance, alumno, plan } = await armar(46);
    for (const a of plan.acciones) {
      await ua.corregirAccion(infra.reposAlumnos, alcance, admin.id, a.id, { estado: 'ejecutado' });
    }

    let cmp = await ua.comparacionSemaforo(infra.reposAlumnos);
    expect(cmp.divergencias).toBe(1);
    let fila = cmp.alumnos.find((f) => f.alumnoId === alumno.id)!;
    expect(fila.viejo.salud).toBe('ROJO'); // 0/2 KRs tildados al día 46
    expect(fila.nuevo.salud).toBe('VERDE'); // 9/9 acciones contra la agenda
    expect(fila.coinciden).toBe(false);
    expect(fila.acciones).toEqual({ ejecutadas: 9, totales: 9 });
    expect(fila.krs).toEqual({ cumplidas: 0, totales: 2 }); // la ENTRADA del viejo, no el contador derivado
    expect(fila.nuevo.brecha!).toBeGreaterThan(0);
    expect(fila.viejo.brecha!).toBeLessThan(-0.25);

    // El consultor tilda las KRs en la llamada (legado): el viejo alcanza al nuevo.
    for (const k of plan.okrs[0]!.krs) {
      await ua.editarKr(infra.reposAlumnos, alcance, k.id, { cumplido: true });
    }
    cmp = await ua.comparacionSemaforo(infra.reposAlumnos);
    fila = cmp.alumnos.find((f) => f.alumnoId === alumno.id)!;
    expect(fila.viejo.salud).toBe('VERDE');
    expect(fila.coinciden).toBe(true);
    expect(cmp.divergencias).toBe(0);
  });

  it('un alumno pausado queda neutro en los dos, con motivo, y no cuenta como divergencia', async () => {
    const { infra, alcance, alumno } = await armar(46);
    await ua.cambiarEstadoAlumno(infra.reposAlumnos, alcance, alumno.id, { estado: 'PAUSADO' });
    const cmp = await ua.comparacionSemaforo(infra.reposAlumnos);
    const fila = cmp.alumnos.find((f) => f.alumnoId === alumno.id)!;
    expect(fila.viejo).toMatchObject({ salud: null, motivo: 'estado' });
    expect(fila.nuevo).toMatchObject({ salud: null, motivo: 'estado' });
    expect(fila.coinciden).toBe(true);
    expect(cmp.divergencias).toBe(0);
  });

  it('tras el switch, el panel muestra EL MISMO color que el lado nuevo del export', async () => {
    const { infra, admin, alcance, alumno, plan } = await armar(46);
    for (const a of plan.acciones) {
      await ua.corregirAccion(infra.reposAlumnos, alcance, admin.id, a.id, { estado: 'ejecutado' });
    }
    const filas = await ua.panelAlumnos(infra.reposAlumnos, infra.reposAuth.usuarios, alcance);
    const fila = filas.find((f) => f.alumno.id === alumno.id)!;
    const cmp = await ua.comparacionSemaforo(infra.reposAlumnos);
    const comparado = cmp.alumnos.find((c) => c.alumnoId === alumno.id)!;
    // Una sola verdad en pantalla: el panel y el lado nuevo del export coinciden.
    expect(fila.salud.salud).toBe('VERDE'); // 9/9 ejecutadas al día 46
    expect(fila.salud.salud).toBe(comparado.nuevo.salud);
    expect(fila.salud.brecha).toBeCloseTo(comparado.nuevo.brecha!, 12);
    // La COMPARACIÓN sigue sin viajar al panel: ni el lado viejo ni el veredicto.
    const crudo = JSON.stringify(filas);
    expect(crudo).not.toContain('"viejo"');
    expect(crudo).not.toContain('"nuevo"');
    expect(crudo).not.toContain('"coinciden"');
  });
});
