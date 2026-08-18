/**
 * Ticket 9D · Integración: los tres estados y las mediciones DESDE EL LINK.
 * Lo que se fija acá: el detalle crea checkins origen alumno con nota que se
 * acumula (nunca se pisa) y la más reciente llega a la ficha del consultor;
 * el círculo binario de siempre sigue funcionando tal cual; una métrica sin
 * mediciones NO viaja al link; y la carga del alumno es una fila nueva con
 * origen 'alumno', que además ENCIENDE la métrica en su vista.
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
  const alcance = alcanceDeUsuario({ id: admin.id, rol: 'ADMIN' });
  const alumno = await ua.crearAlumno(infra.reposAlumnos, admin.id, {
    nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS',
  });
  const inicio = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const plan = await ua.cargarPlan(infra.reposAlumnos, alcance, alumno.id, JSON.stringify({
    version: 1, alumno: 'Gonzalo', fecha_inicio: inicio,
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [
      { texto: 'Tablero al día' },
      { texto: 'Bajar la mora', tipo: 'metrica', valor_inicial: 20, meta_90: 10, unidad: '%', direccion: 'baja' },
    ] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'A', okr: 1, kr: 1 }, { texto: 'B' }, { texto: 'C' }] },
      { fase: 2, acciones: [{ texto: 'D' }, { texto: 'E' }, { texto: 'F' }] },
      { fase: 3, acciones: [{ texto: 'G' }, { texto: 'H' }, { texto: 'I' }] },
    ],
  }));
  const { token } = await ua.emitirLinkSeguimiento(infra.reposAlumnos, alcance, plan.plan.id);
  return { infra, admin, alcance, alumno, plan, token: token.token };
}

describe('Ticket 9D · los tres estados desde el link', () => {
  it('el detalle guarda estado y nota; las notas se acumulan y la última llega a la ficha del consultor', async () => {
    const { infra, alcance, plan, token } = await armar();
    const accion = plan.acciones[0]!;

    let r = await ua.marcarAccion(infra.reposAlumnos, token, accion.id, { estado: 'en_curso', nota: 'Arranqué con las columnas' }, '2026-08-19T10:00:00.000Z');
    expect(r).toEqual({ hecha: false, estado: 'en_curso' });
    r = await ua.marcarAccion(infra.reposAlumnos, token, accion.id, { estado: 'en_curso', nota: 'Me falta cargar los créditos viejos' }, '2026-08-20T10:00:00.000Z');
    expect(r.estado).toBe('en_curso');

    // Append-only: dos filas, las dos del alumno, ninguna nota pisada.
    const checkins = await infra.reposAlumnos.checkins.listarPorPlan(plan.plan.id);
    expect(checkins).toHaveLength(2);
    expect(checkins.every((c) => c.origen === 'alumno' && c.usuarioId === null && !c.marcado)).toBe(true);
    expect(checkins.map((c) => c.nota).sort()).toEqual(['Arranqué con las columnas', 'Me falta cargar los créditos viejos']);

    // La ficha del consultor muestra la nota MÁS RECIENTE junto a la acción.
    const avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    const enFicha = avance.fases[0]!.acciones.find((x) => x.id === accion.id)!;
    expect(enFicha.estado).toBe('en_curso');
    expect(enFicha.nota).toBe('Me falta cargar los créditos viejos');

    // Y el link lo devuelve como en_curso, sin tacharlo.
    const abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token);
    const enLink = abierto.fases[0]!.acciones.find((x) => x.id === accion.id)!;
    expect(enLink).toMatchObject({ estado: 'en_curso', hecha: false });
  });

  it('el círculo de siempre sigue igual: {marcado} binario, y en_curso cuenta como actividad del alumno', async () => {
    const { infra, alcance, plan, token } = await armar();
    const [a1, a2] = plan.acciones;

    const r = await ua.marcarAccion(infra.reposAlumnos, token, a1!.id, { marcado: true });
    expect(r).toEqual({ hecha: true, estado: 'ejecutado' });
    await ua.marcarAccion(infra.reposAlumnos, token, a2!.id, { estado: 'en_curso' }, '2026-08-21T09:00:00.000Z');

    // La señal de ritmo: también un en_curso del alumno la mueve.
    const avance = await ua.avancePlan(infra.reposAlumnos, alcance, plan.plan.id);
    expect(avance.ultimaActividad).not.toBeNull();

    // Un cuerpo sin marcado ni estado → validación, no fila fantasma.
    await expect(ua.marcarAccion(infra.reposAlumnos, token, a1!.id, {})).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });
});

describe('Ticket 9D · "Tus números" desde el link', () => {
  it('una métrica sin mediciones NO viaja; la carga del alumno la enciende con origen alumno', async () => {
    const { infra, plan, token } = await armar();
    const mora = plan.okrs[0]!.krs[1]!;

    // Sin mediciones: el bloque no la muestra — no se deja un hueco vacío.
    let abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token);
    expect(abierto.metricas).toEqual([]);

    // El alumno carga el valor del mes desde su link.
    const r = await ua.cargarMedicionDesdeLink(infra.reposAlumnos, token, mora.id, { valor: 14 });
    expect(r.valor).toBe(14);
    const filas = await infra.reposAlumnos.mediciones.listarPorKr(mora.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ origen: 'alumno', usuarioId: null, valor: 14 });

    // Ahora sí: los números pelados, sin juicio — el copy lo arma la vista.
    abierto = await ua.abrirSeguimiento(infra.reposAlumnos, token);
    expect(abierto.metricas).toEqual([{
      krId: mora.id, texto: 'Bajar la mora', unidad: '%', direccion: 'baja',
      valorInicial: 20, meta90: 10, valorActual: 14,
    }]);
  });

  it('un entregable rechaza la carga, y el KR que no es de este plan no existe para este token', async () => {
    const { infra, plan, token } = await armar();
    const tablero = plan.okrs[0]!.krs[0]!;
    await expect(ua.cargarMedicionDesdeLink(infra.reposAlumnos, token, tablero.id, { valor: 5 }))
      .rejects.toMatchObject({ codigo: 'VALIDACION' });
    await expect(ua.cargarMedicionDesdeLink(infra.reposAlumnos, token, 'kr-de-otro-plan', { valor: 5 }))
      .rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });
});
