/**
 * Integración del módulo de alumnos sobre SQLite en memoria: casos de uso
 * reales contra repos reales. Lo que se verifica acá y no se puede verificar en
 * el dominio: que el ámbito por fila llegue efectivamente a la CONSULTA, que el
 * token se consuma una sola vez, y que un diagnóstico no se pise nunca.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { infraestructuraDesdeDb } from '../db/conexion';
import type { Hasher } from '../../application/auth/ports';
import * as uauth from '../../application/auth/useCases';
import * as ua from '../../application/alumnos/useCases';
import { alcanceDeUsuario } from '../../domain/auth/permisos';
import type { ReposAlumnos } from '../../application/alumnos/ports';

const hasherFake: Hasher = { hash: async (p) => `fake:${p}`, verificar: async (p, h) => h === `fake:${p}` };

/** Respuestas que satisfacen las obligatorias: bloque 0 pendiente + bloques 1–8. */
function diagnosticoCompleto(): Record<string, unknown> {
  return {
    // Bloque 0 — lo que la ficha del test no tiene (completar-si-falta)
    edad: 38,
    zona: 'Córdoba Capital',
    whatsapp: '+5493510000000',
    canal_origen: 'Instagram',

    antiguedad_meses: 24,
    tipo_dedicacion: 'Negocio principal',
    objetivo_6m: 'Duplicar la cartera',
    vision_negocio: 'Armar una empresa financiera',
    bloqueo_principal: 'La cobranza me come el día',

    capital_colocado: 13_000_000,
    origen_capital: 'Mixto',
    costo_capital_mensual: 5,
    capital_disponible: 2_000_000,
    recupero_mensual: 3_000_000,
    separacion_dinero: 'Parcialmente',
    ganancia_mensual: 900_000,
    retiro_mensual: 400_000,
    gastos_operativos: 150_000,

    clientes_activos: 62,
    clientes_nuevos_mes: 8,
    ticket_promedio: 210_000,
    estructura_plazos: '3, 6 y 12 cuotas',
    plazo_promedio_meses: 6,
    perfil_cliente: ['Comerciantes', 'Monotributistas'],
    recurrencia: 45,

    tasa_declarada: '10% mensual sobre saldo',
    ejemplo_total_100k: 160_000,
    punitorio: '2% por semana de atraso',
    tasa_competencia: 'Entre 8 y 12',

    documentacion_solicitada: ['DNI', 'Comprobante de domicilio'],
    firma_documentacion: 'Solo pagaré',
    porcentaje_documentado: 80,
    criterio_monto: 'Según antigüedad del cliente',
    criterios_aprobacion: 'Los tengo en la cabeza pero no escritos',
    herramienta_consulta: 'Nosis',
    politica_garantias: 'Garante arriba de 500 mil',

    mora_clientes: 12,
    monto_en_mora: 1_400_000,
    proceso_cobranza: 'Solo aviso el día del vencimiento',
    descripcion_cobranza: 'Mando WhatsApp el día que vence',
    dificultad_cobranza: 'Me da vergüenza insistir',

    sistema_registro: ['Cuaderno', 'Excel o Sheets'],
    canales_captacion: ['Referidos de clientes', 'Instagram'],
    equipo: 'Solo yo',
    situacion_fiscal: 'Monotributo',
    unidad_ventas: 'No, solo presto dinero',
    prioridad_declarada: ['Cobranza'],

    meta_clientes_90d: 90,
    meta_capital_90d: 20_000_000,
    meta_ganancia_90d: 1_500_000,
    vision_12m: 'Una financiera formal con 3 empleados',
    freno_percibido: 'No tengo procesos',
  };
}

async function setup() {
  const db = getDbMemoria();
  const infra = infraestructuraDesdeDb(db, hasherFake);
  // El ADMIN inicial primero: asegurarAdminInicial es no-op si ya hay usuarios.
  const admin = await uauth.asegurarAdminInicial(infra.reposAuth, 'jose@activos.com', 'Clave1234');
  const { usuario: consu } = await uauth.crearUsuario(infra.reposAuth, {
    email: 'consu@activos.com', nombre: 'Consu', rol: 'CONSULTOR', password: 'Clave1234',
  });
  const { usuario: otro } = await uauth.crearUsuario(infra.reposAuth, {
    email: 'otro@activos.com', nombre: 'Otro', rol: 'CONSULTOR', password: 'Clave1234',
  });
  return {
    repos: infra.reposAlumnos as ReposAlumnos,
    consu,
    otro,
    alcanceConsu: alcanceDeUsuario({ id: consu.id, rol: 'CONSULTOR' }),
    alcanceOtro: alcanceDeUsuario({ id: otro.id, rol: 'CONSULTOR' }),
    alcanceAdmin: alcanceDeUsuario({ id: admin!.id, rol: 'ADMIN' }),
  };
}

const FICHA = { nombre: 'Gonzalo', programa: 'Prestamista a Empresario', moneda: 'ARS', edad: 38 };

describe('Alumnos · alta de ficha', () => {
  it('crea el alumno y abre el primer tramo de historial', async () => {
    const { repos, consu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);

    expect(alumno.nombre).toBe('Gonzalo');
    expect(alumno.consultorId).toBe(consu.id);
    expect(alumno.activo).toBe(true);

    // El historial arranca con la primera asignación, no con la primera
    // reasignación: si no, el tramo original quedaría sin registrar.
    const tramos = await repos.historial.listarPorAlumno(alumno.id);
    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.consultorId).toBe(consu.id);
    expect(tramos[0]!.hasta).toBeNull(); // vigente
  });

  it('normaliza la moneda a ISO de 3 letras en mayúscula', async () => {
    const { repos, consu } = await setup();
    const a = await ua.crearAlumno(repos, consu.id, { ...FICHA, moneda: 'cop' });
    expect(a.moneda).toBe('COP');
  });

  it('rechaza un programa que no está en la lista', async () => {
    const { repos, consu } = await setup();
    await expect(ua.crearAlumno(repos, consu.id, { ...FICHA, programa: 'Curso pirata' })).rejects.toThrow();
  });
});

describe('Alumnos · ámbito por fila aplicado en la CONSULTA', () => {
  it('un consultor solo lista su cartera', async () => {
    const { repos, consu, otro, alcanceConsu, alcanceOtro } = await setup();
    await ua.crearAlumno(repos, consu.id, FICHA);
    await ua.crearAlumno(repos, otro.id, { ...FICHA, nombre: 'Ajeno' });

    const mios = await ua.listarAlumnos(repos, alcanceConsu);
    expect(mios.map((a) => a.nombre)).toEqual(['Gonzalo']);

    const suyos = await ua.listarAlumnos(repos, alcanceOtro);
    expect(suyos.map((a) => a.nombre)).toEqual(['Ajeno']);
  });

  it('pedir explícitamente la cartera de otro devuelve la propia, no la ajena', async () => {
    const { repos, consu, otro, alcanceConsu } = await setup();
    await ua.crearAlumno(repos, consu.id, FICHA);
    await ua.crearAlumno(repos, otro.id, { ...FICHA, nombre: 'Ajeno' });

    // El filtro del cliente puede achicar, jamás ensanchar.
    const forzado = await ua.listarAlumnos(repos, alcanceConsu, { consultorId: otro.id });
    expect(forzado.map((a) => a.nombre)).toEqual(['Gonzalo']);
  });

  it('ADMIN ve todas las carteras', async () => {
    const { repos, consu, otro, alcanceAdmin } = await setup();
    await ua.crearAlumno(repos, consu.id, FICHA);
    await ua.crearAlumno(repos, otro.id, { ...FICHA, nombre: 'Ajeno' });

    const todos = await ua.listarAlumnos(repos, alcanceAdmin);
    expect(todos).toHaveLength(2);
  });

  it('la ficha ajena responde null, no un error: no revela que existe', async () => {
    const { repos, otro, alcanceConsu } = await setup();
    const ajeno = await ua.crearAlumno(repos, otro.id, { ...FICHA, nombre: 'Ajeno' });
    expect(await ua.obtenerAlumno(repos, alcanceConsu, ajeno.id)).toBeNull();
  });

  it('no se puede editar la ficha de otro consultor', async () => {
    const { repos, otro, alcanceConsu } = await setup();
    const ajeno = await ua.crearAlumno(repos, otro.id, { ...FICHA, nombre: 'Ajeno' });
    await expect(ua.editarAlumno(repos, alcanceConsu, ajeno.id, { nombre: 'Hackeado' })).rejects.toThrow(/inexistente/i);
  });

  it('no se puede emitir un link para el alumno de otro consultor', async () => {
    const { repos, otro, alcanceConsu } = await setup();
    const ajeno = await ua.crearAlumno(repos, otro.id, { ...FICHA, nombre: 'Ajeno' });
    await expect(ua.emitirToken(repos, alcanceConsu, ajeno.id)).rejects.toThrow(/inexistente/i);
  });
});

describe('Alumnos · token del formulario público', () => {
  it('abre el formulario y devuelve SOLO lo mínimo (no filtra la ficha)', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, { ...FICHA, whatsapp: '+5491100000000' });
    const t = await ua.emitirToken(repos, alcanceConsu, alumno.id);

    const abierto = await ua.abrirFormulario(repos, t.token);
    // Saludo + QUÉ falta en la ficha (nombres de campo, jamás valores).
    expect(abierto).toEqual({
      nombre: 'Gonzalo',
      programa: 'Prestamista a Empresario',
      moneda: 'ARS',
      fichaPendiente: ['zona', 'marca_comercial', 'canal_origen'], // edad y whatsapp ya están
    });
    expect(Object.keys(abierto)).toEqual(['nombre', 'programa', 'moneda', 'fichaPendiente']);
  });

  it('el token es largo y aleatorio (no secuencial: es la credencial del alumno)', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const a = await ua.crearAlumno(repos, consu.id, FICHA);
    const t1 = await ua.emitirToken(repos, alcanceConsu, a.id);
    const t2 = await ua.emitirToken(repos, alcanceConsu, a.id);
    expect(t1.token.length).toBeGreaterThanOrEqual(40);
    expect(t1.token).not.toBe(t2.token);
  });

  it('un token vencido no abre', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const a = await ua.crearAlumno(repos, consu.id, FICHA);
    const t = await ua.emitirToken(repos, alcanceConsu, a.id, '2026-01-01T00:00:00.000Z');
    // 31 días después: venció (la vigencia es de 30).
    await expect(ua.abrirFormulario(repos, t.token, '2026-02-01T00:00:00.000Z')).rejects.toMatchObject({
      motivo: 'vencido',
    });
  });

  it('reenviar el link invalida el anterior: no quedan dos formularios vivos', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const a = await ua.crearAlumno(repos, consu.id, FICHA);
    const viejo = await ua.emitirToken(repos, alcanceConsu, a.id);
    await ua.emitirToken(repos, alcanceConsu, a.id); // reenvío

    await expect(ua.abrirFormulario(repos, viejo.token)).rejects.toMatchObject({ motivo: 'vencido' });
  });

  it('un token inventado no abre', async () => {
    const { repos } = await setup();
    await expect(ua.abrirFormulario(repos, 'token-trucho')).rejects.toMatchObject({ motivo: 'inexistente' });
  });

  it('el alumno dado de baja invalida su link', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const a = await ua.crearAlumno(repos, consu.id, FICHA);
    const t = await ua.emitirToken(repos, alcanceConsu, a.id);
    await repos.alumnos.guardar({ ...a, activo: false });
    await expect(ua.abrirFormulario(repos, t.token)).rejects.toThrow();
  });
});

describe('Alumnos · envío del diagnóstico', () => {
  async function conToken() {
    const ctx = await setup();
    const alumno = await ua.crearAlumno(ctx.repos, ctx.consu.id, FICHA);
    const t = await ua.emitirToken(ctx.repos, ctx.alcanceConsu, alumno.id);
    return { ...ctx, alumno, token: t.token };
  }

  it('guarda el diagnóstico con el índice de claridad calculado', async () => {
    const { repos, token, alumno, alcanceConsu } = await conToken();
    const d = await ua.enviarDiagnostico(repos, token, diagnosticoCompleto());

    expect(d.alumnoId).toBe(alumno.id);
    expect(d.origen).toBe('alumno');
    expect(d.editadoPorConsultor).toBe(false);
    expect(d.indiceClaridad).toBe(100); // todas las duras respondidas
    expect(d.metricasAplicables).toBe(19);
    expect(d.metricasRespondidas).toBe(19);

    const guardados = await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id);
    expect(guardados).toHaveLength(1);
    expect(guardados[0]!.indiceClaridad).toBe(100);
  });

  it('fotografía programa y moneda: editar la ficha después no reinterpreta lo viejo', async () => {
    const { repos, token, alumno, alcanceConsu } = await conToken();
    const d = await ua.enviarDiagnostico(repos, token, diagnosticoCompleto());
    expect(d.moneda).toBe('ARS');

    await ua.editarAlumno(repos, alcanceConsu, alumno.id, { moneda: 'COP', programa: 'Prestamista a Empresario Elite' });

    const [guardado] = await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id);
    expect(guardado!.moneda).toBe('ARS'); // la foto no se movió
    expect(guardado!.programa).toBe('Prestamista a Empresario');
  });

  it('el token se consume: el mismo link no sirve dos veces', async () => {
    const { repos, token } = await conToken();
    await ua.enviarDiagnostico(repos, token, diagnosticoCompleto());
    await expect(ua.enviarDiagnostico(repos, token, diagnosticoCompleto())).rejects.toMatchObject({ motivo: 'usado' });
  });

  it('NUNCA se sobrescribe: dos envíos son dos filas', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);

    const t1 = await ua.emitirToken(repos, alcanceConsu, alumno.id, '2026-01-10T00:00:00.000Z');
    await ua.enviarDiagnostico(repos, t1.token, diagnosticoCompleto(), '2026-01-10T10:00:00.000Z');

    // A los 90 días, link nuevo y segundo envío con menos datos.
    const t2 = await ua.emitirToken(repos, alcanceConsu, alumno.id, '2026-04-10T00:00:00.000Z');
    const flojo = { ...diagnosticoCompleto(), mora_clientes: null, mora_clientes_sin_dato: true };
    await ua.enviarDiagnostico(repos, t2.token, flojo, '2026-04-10T10:00:00.000Z');

    const todos = await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id);
    expect(todos).toHaveLength(2);
    // Ordenados del más nuevo al más viejo: se pueden comparar.
    expect(todos[0]!.fecha > todos[1]!.fecha).toBe(true);
    expect(todos[0]!.indiceClaridad).toBe(95); // 18 de 19
    expect(todos[1]!.indiceClaridad).toBe(100);
  });

  it('la casilla marcada LIMPIA el valor: la base no guarda lo que el alumno dijo no saber', async () => {
    const { repos, token } = await conToken();
    const d = await ua.enviarDiagnostico(repos, token, {
      ...diagnosticoCompleto(),
      ganancia_mensual: 900_000,
      ganancia_mensual_sin_dato: true, // se contradice: gana la casilla
    });
    expect(d.respuestas.ganancia_mensual).toBeNull();
    expect(d.respuestas.ganancia_mensual_sin_dato).toBe(true);
    expect(d.indiceClaridad).toBe(95);
  });

  it('los multi-selección sobreviven el viaje a la base (JSON en TEXT)', async () => {
    const { repos, token, alumno, alcanceConsu } = await conToken();
    await ua.enviarDiagnostico(repos, token, diagnosticoCompleto());
    const [d] = await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id);
    expect(JSON.parse(d!.respuestas.perfil_cliente as string)).toEqual(['Comerciantes', 'Monotributistas']);
    expect(JSON.parse(d!.respuestas.canales_captacion as string)).toEqual(['Referidos de clientes', 'Instagram']);
  });

  it('las respuestas de texto y número vuelven intactas', async () => {
    const { repos, token, alumno, alcanceConsu } = await conToken();
    await ua.enviarDiagnostico(repos, token, diagnosticoCompleto());
    const [d] = await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id);
    expect(d!.respuestas.capital_colocado).toBe(13_000_000);
    expect(d!.respuestas.tasa_declarada).toBe('10% mensual sobre saldo');
    expect(d!.respuestas.clientes_activos).toBe(62);
    expect(d!.respuestas.freno_percibido).toBe('No tengo procesos');
  });

  it('un envío incompleto se rechaza y no deja fila ni consume el token', async () => {
    const { repos, token, alumno, alcanceConsu } = await conToken();
    const incompleto = { ...diagnosticoCompleto(), monto_en_mora: null };
    await expect(ua.enviarDiagnostico(repos, token, incompleto)).rejects.toThrow();

    expect(await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id)).toHaveLength(0);
    // El token sobrevive: el alumno puede corregir y reenviar con el mismo link.
    await expect(ua.abrirFormulario(repos, token)).resolves.toBeTruthy();
  });

  it('un diagnóstico ajeno no se lista', async () => {
    const { repos, token, alumno, alcanceOtro } = await conToken();
    await ua.enviarDiagnostico(repos, token, diagnosticoCompleto());
    await expect(ua.listarDiagnosticos(repos, alcanceOtro, alumno.id)).rejects.toThrow(/inexistente/i);
  });
});

describe('Alumnos · corrección del consultor sobre un diagnóstico', () => {
  async function conDiagnostico() {
    const ctx = await setup();
    const alumno = await ua.crearAlumno(ctx.repos, ctx.consu.id, FICHA);
    const t = await ua.emitirToken(ctx.repos, ctx.alcanceConsu, alumno.id);
    // El alumno no supo la mora: entra con 18/19 = 95.
    const flojo = { ...diagnosticoCompleto(), mora_clientes: null, mora_clientes_sin_dato: true };
    const d = await ua.enviarDiagnostico(ctx.repos, t.token, flojo);
    return { ...ctx, alumno, d };
  }

  it('corrige la fila, recalcula el índice y marca editadoPorConsultor — sin fila nueva', async () => {
    const { repos, alcanceConsu, alumno, d } = await conDiagnostico();
    expect(d.indiceClaridad).toBe(95);

    // En la llamada aparece el dato: el consultor lo carga.
    const editado = await ua.editarDiagnostico(repos, alcanceConsu, d.id, { mora_clientes: 12 });

    expect(editado.indiceClaridad).toBe(100);
    expect(editado.editadoPorConsultor).toBe(true);
    expect(editado.respuestas.mora_clientes).toBe(12);
    // Cargar el dato resolvió el "no lo sé".
    expect(editado.respuestas.mora_clientes_sin_dato).toBe(false);

    // Misma fila: no es un envío nuevo, y la identidad no se movió.
    const todos = await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id);
    expect(todos).toHaveLength(1);
    expect(todos[0]!.id).toBe(d.id);
    expect(todos[0]!.fecha).toBe(d.fecha);
    expect(todos[0]!.origen).toBe('alumno'); // lo cargó el alumno; el flag dice que se corrigió
    expect(todos[0]!.moneda).toBe(d.moneda);
    expect(todos[0]!.indiceClaridad).toBe(100);
  });

  it('marcar la casilla en la corrección borra el valor guardado (la casilla manda)', async () => {
    const { repos, alcanceConsu, d } = await conDiagnostico();
    const editado = await ua.editarDiagnostico(repos, alcanceConsu, d.id, { ganancia_mensual_sin_dato: true });
    expect(editado.respuestas.ganancia_mensual).toBeNull();
    expect(editado.respuestas.ganancia_mensual_sin_dato).toBe(true);
    expect(editado.indiceClaridad).toBe(89); // 17 de 19
  });

  it('lo que el patch no trae queda como estaba', async () => {
    const { repos, alcanceConsu, d } = await conDiagnostico();
    const editado = await ua.editarDiagnostico(repos, alcanceConsu, d.id, { equipo: 'Yo + un cobrador' });
    expect(editado.respuestas.equipo).toBe('Yo + un cobrador');
    expect(editado.respuestas.capital_colocado).toBe(13_000_000); // intacto
    expect(editado.respuestas.mora_clientes_sin_dato).toBe(true); // la casilla del alumno sigue
  });

  it('un multi corregido viaja como array y se guarda como JSON', async () => {
    const { repos, alcanceConsu, d } = await conDiagnostico();
    const editado = await ua.editarDiagnostico(repos, alcanceConsu, d.id, {
      perfil_cliente: ['Jubilados', 'Informales'],
    });
    expect(JSON.parse(editado.respuestas.perfil_cliente as string)).toEqual(['Jubilados', 'Informales']);
  });

  it('una opción fuera de lista se rechaza sin tocar la fila', async () => {
    const { repos, alcanceConsu, d } = await conDiagnostico();
    await expect(
      ua.editarDiagnostico(repos, alcanceConsu, d.id, { origen_capital: 'Del banco' }),
    ).rejects.toThrow();
    const intacto = await repos.diagnosticos.obtener(d.id);
    expect(intacto!.editadoPorConsultor).toBe(false);
  });

  it('el diagnóstico de un alumno ajeno no se puede corregir (inexistente); ADMIN sí', async () => {
    const { repos, alcanceOtro, alcanceAdmin, d } = await conDiagnostico();
    await expect(ua.editarDiagnostico(repos, alcanceOtro, d.id, { mora_clientes: 5 })).rejects.toThrow(/inexistente/i);
    const porAdmin = await ua.editarDiagnostico(repos, alcanceAdmin, d.id, { mora_clientes: 5 });
    expect(porAdmin.indiceClaridad).toBe(100);
  });
});

describe('Alumnos · carga del plan de 90 días', () => {
  const BLOQUE = JSON.stringify({
    version: 1,
    alumno: 'Gonzalo',
    fecha_inicio: '2026-08-18',
    etapa: 'Prestamista Operativo',
    objetivo_90d: 'Ordenar para crecer.',
    okrs: [
      { orden: 1, objetivo: 'Ordenar la administración', krs: [{ texto: 'Tablero único', meta: '100%' }, { texto: 'Separar cajas' }] },
      { orden: 2, objetivo: 'Profesionalizar cobranzas', krs: [{ texto: 'Protocolo por tramos' }] },
    ],
    fases: [
      { fase: 1, acciones: [{ texto: 'Armar el tablero', okr: 1 }, { texto: 'Separar cuentas', okr: 1 }, { texto: 'Cargar créditos' }] },
      { fase: 2, acciones: [{ texto: 'Escribir protocolo', okr: 2 }, { texto: 'Llamar morosos', okr: 2 }, { texto: 'Cierre semanal', okr: 1 }] },
      { fase: 3, acciones: [{ texto: 'Pedir referidos' }, { texto: 'Tope por cliente' }, { texto: 'Revisar mora' }] },
    ],
  });

  it('crea el agregado entero y lo devuelve completo', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);

    const cargado = await ua.cargarPlan(repos, alcanceConsu, alumno.id, BLOQUE);
    expect(cargado.okrs).toHaveLength(2);
    expect(cargado.okrs[0]!.krs).toHaveLength(2);
    expect(cargado.acciones).toHaveLength(9);

    const [leido] = await ua.listarPlanes(repos, alcanceConsu, alumno.id);
    expect(leido!.plan.fechaInicio).toBe('2026-08-18');
    expect(leido!.plan.etapa).toBe('Prestamista Operativo');
    expect(leido!.okrs.map((o) => o.objetivo)).toEqual(['Ordenar la administración', 'Profesionalizar cobranzas']);
    // Las acciones vuelven con su fase y su vínculo al OKR resuelto a id real.
    const fase2 = leido!.acciones.filter((a) => a.fase === 2);
    expect(fase2).toHaveLength(3);
    const okr1 = leido!.okrs.find((o) => o.orden === 1)!;
    expect(fase2.find((a) => a.texto === 'Cierre semanal')!.okrId).toBe(okr1.id);
    // La acción sin okr queda suelta, no inventa vínculo.
    expect(leido!.acciones.find((a) => a.texto === 'Cargar créditos')!.okrId).toBeNull();
  });

  it('el consultor corrige la fecha en la previa y la carga la respeta', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);
    const cargado = await ua.cargarPlan(repos, alcanceConsu, alumno.id, BLOQUE, '2026-09-01');
    expect(cargado.plan.fechaInicio).toBe('2026-09-01');
  });

  it('cargar otro plan NO borra el anterior, y el más nuevo queda primero', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);
    await ua.cargarPlan(repos, alcanceConsu, alumno.id, BLOQUE, '2026-05-01');
    await ua.cargarPlan(repos, alcanceConsu, alumno.id, BLOQUE, '2026-08-18');

    const planes = await ua.listarPlanes(repos, alcanceConsu, alumno.id);
    expect(planes).toHaveLength(2);
    expect(planes[0]!.plan.fechaInicio).toBe('2026-08-18');
    expect(planes[1]!.plan.fechaInicio).toBe('2026-05-01');
  });

  it('la previa junta advertencias sin escribir nada', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    // La ficha dice "Gonzalo" y el bloque también: sin aviso de nombre. Pero le
    // metemos una clave fuera de contrato y un plan previo con la misma fecha.
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);
    await ua.cargarPlan(repos, alcanceConsu, alumno.id, BLOQUE);

    const conExtra = JSON.stringify({ ...JSON.parse(BLOQUE), modelos_economicos: { escenario: 'x' } });
    const { advertencias } = await ua.previaPlan(repos, alcanceConsu, alumno.id, conExtra);
    expect(advertencias.some((a) => a.includes('modelos_economicos'))).toBe(true);
    expect(advertencias.some((a) => a.includes('Ya hay un plan cargado con inicio 2026-08-18'))).toBe(true);

    // La previa NO escribió: sigue habiendo un solo plan.
    expect(await ua.listarPlanes(repos, alcanceConsu, alumno.id)).toHaveLength(1);
  });

  it('el plan de un alumno ajeno ni se carga ni se lista', async () => {
    const { repos, otro, alcanceConsu } = await setup();
    const ajeno = await ua.crearAlumno(repos, otro.id, { ...FICHA, nombre: 'Ajeno' });
    await expect(ua.cargarPlan(repos, alcanceConsu, ajeno.id, BLOQUE)).rejects.toThrow(/inexistente/i);
    await expect(ua.listarPlanes(repos, alcanceConsu, ajeno.id)).rejects.toThrow(/inexistente/i);
  });

  it('un bloque roto no deja NADA en la base (o entra todo o no entra nada)', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);
    const roto = JSON.stringify({ ...JSON.parse(BLOQUE), fases: JSON.parse(BLOQUE).fases.slice(0, 2) });
    await expect(ua.cargarPlan(repos, alcanceConsu, alumno.id, roto)).rejects.toThrow();
    expect(await ua.listarPlanes(repos, alcanceConsu, alumno.id)).toHaveLength(0);
  });
});

describe('Alumnos · link de seguimiento y tildes', () => {
  const BLOQUE_SEG = JSON.stringify({
    version: 1,
    alumno: 'Gonzalo',
    fecha_inicio: '2026-08-18',
    okrs: [{ orden: 1, objetivo: 'Ordenar', krs: [{ texto: 'Tablero' }] }],
    fases: [
      { fase: 1, acciones: [{ texto: 'Armar tablero', okr: 1 }, { texto: 'Separar cuentas' }, { texto: 'Cargar créditos' }] },
      { fase: 2, acciones: [{ texto: 'Protocolo' }, { texto: 'Llamar morosos' }, { texto: 'Cierre semanal' }] },
      { fase: 3, acciones: [{ texto: 'Referidos' }, { texto: 'Tope' }, { texto: 'Revisar mora' }] },
    ],
  });

  async function conPlan() {
    const ctx = await setup();
    const alumno = await ua.crearAlumno(ctx.repos, ctx.consu.id, FICHA);
    const plan = await ua.cargarPlan(ctx.repos, ctx.alcanceConsu, alumno.id, BLOQUE_SEG);
    return { ...ctx, alumno, plan };
  }

  it('emitir es ESTABLE: dos veces devuelve el MISMO token (vive en WhatsApp)', async () => {
    const { repos, alcanceConsu, plan } = await conPlan();
    const a = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    const b = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    expect(a.nuevo).toBe(true);
    expect(b.nuevo).toBe(false);
    expect(b.token.token).toBe(a.token.token);
  });

  it('revocar + volver a emitir da un token nuevo, y el viejo dice "revocado"', async () => {
    const { repos, alcanceConsu, plan } = await conPlan();
    const viejo = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    const { revocados } = await ua.revocarLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    expect(revocados).toBe(1);

    await expect(ua.abrirSeguimiento(repos, viejo.token.token)).rejects.toMatchObject({ motivo: 'revocado' });
    const nuevo = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    expect(nuevo.nuevo).toBe(true);
    expect(nuevo.token.token).not.toBe(viejo.token.token);
  });

  it('abrir devuelve SOLO las acciones por fase (ni OKRs, ni diagnóstico, ni índice)', async () => {
    const { repos, alcanceConsu, plan } = await conPlan();
    const { token } = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);

    const abierto = await ua.abrirSeguimiento(repos, token.token, '2026-08-20T12:00:00.000Z');
    // dia/restantes son derivados del plan (ticket 8): datos del propio alumno.
    expect(Object.keys(abierto).sort()).toEqual(['alumno', 'dia', 'faseActual', 'fases', 'fechaInicio', 'restantes', 'vencido']);
    expect(abierto.alumno).toBe('Gonzalo');
    expect(abierto.faseActual).toBe(1);
    expect(abierto.vencido).toBe(false);
    expect(abierto.dia + abierto.restantes).toBe(90);
    expect(abierto.fases.map((f) => f.acciones.length)).toEqual([3, 3, 3]);
    expect(abierto.fases[0]!.acciones.every((a) => !a.hecha)).toBe(true);
  });

  it('el tilde crea un checkin y el estado se refleja; destildar es OTRA fila', async () => {
    const { repos, alcanceConsu, plan } = await conPlan();
    const { token } = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    const accion = plan.acciones[0]!;

    await ua.marcarAccion(repos, token.token, accion.id, true, '2026-08-20T10:00:00.000Z');
    let abierto = await ua.abrirSeguimiento(repos, token.token, '2026-08-20T12:00:00.000Z');
    expect(abierto.fases[0]!.acciones.find((a) => a.id === accion.id)!.hecha).toBe(true);

    await ua.marcarAccion(repos, token.token, accion.id, false, '2026-08-21T10:00:00.000Z');
    abierto = await ua.abrirSeguimiento(repos, token.token, '2026-08-21T12:00:00.000Z');
    expect(abierto.fases[0]!.acciones.find((a) => a.id === accion.id)!.hecha).toBe(false);

    // Append-only: quedaron DOS filas, no una editada.
    const checkins = await repos.checkins.listarPorPlan(plan.plan.id);
    expect(checkins).toHaveLength(2);
  });

  it('pasado el día 90 el link se LEE pero no acepta tildes', async () => {
    const { repos, alcanceConsu, plan } = await conPlan(); // inicio 2026-08-18
    const { token } = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    const DIA_91 = '2026-11-17T10:00:00.000Z';

    const abierto = await ua.abrirSeguimiento(repos, token.token, DIA_91);
    expect(abierto.vencido).toBe(true);

    await expect(
      ua.marcarAccion(repos, token.token, plan.acciones[0]!.id, true, DIA_91),
    ).rejects.toThrow(/trimestre ya terminó/i);
  });

  it('una acción de OTRO plan no se puede tildar con este token', async () => {
    const { repos, alcanceConsu, consu, plan } = await conPlan();
    const otroAlumno = await ua.crearAlumno(repos, consu.id, { ...FICHA, nombre: 'Marta' });
    const otroPlan = await ua.cargarPlan(repos, alcanceConsu, otroAlumno.id, BLOQUE_SEG);
    const { token } = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);

    await expect(
      ua.marcarAccion(repos, token.token, otroPlan.acciones[0]!.id, true),
    ).rejects.toThrow(/inexistente/i);
  });

  it('el avance del consultor: conteos, última actividad y el link vigente', async () => {
    const { repos, alcanceConsu, plan } = await conPlan();
    const { token } = await ua.emitirLinkSeguimiento(repos, alcanceConsu, plan.plan.id);
    const [a1, a2] = plan.acciones;
    await ua.marcarAccion(repos, token.token, a1!.id, true, '2026-08-20T10:00:00.000Z');
    await ua.marcarAccion(repos, token.token, a2!.id, true, '2026-08-22T10:00:00.000Z');

    const avance = await ua.avancePlan(repos, alcanceConsu, plan.plan.id, '2026-08-25T12:00:00.000Z');
    expect(avance.fases[0]!.hechas).toBe(2);
    expect(avance.fases[0]!.total).toBe(3);
    expect(avance.ultimaActividad).toBe('2026-08-22T10:00:00.000Z');
    expect(avance.link?.token).toBe(token.token);
    expect(avance.faseActual).toBe(1);
    // La acción con OKR trae su orden para agrupar en el panel.
    expect(avance.fases[0]!.acciones.find((a) => a.texto === 'Armar tablero')!.okrOrden).toBe(1);
  });

  it('el plan ajeno no emite link ni muestra avance', async () => {
    const { repos, alcanceOtro, plan } = await conPlan();
    await expect(ua.emitirLinkSeguimiento(repos, alcanceOtro, plan.plan.id)).rejects.toThrow(/inexistente/i);
    await expect(ua.avancePlan(repos, alcanceOtro, plan.plan.id)).rejects.toThrow(/inexistente/i);
  });
});

describe('Alumnos · bloque 0 por el link público (completar-si-falta)', () => {
  it('el envío llena los huecos de la ficha', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA); // sin zona/whatsapp/canal
    const t = await ua.emitirToken(repos, alcanceConsu, alumno.id);

    await ua.enviarDiagnostico(repos, t.token, diagnosticoCompleto());

    const ficha = await ua.obtenerAlumno(repos, alcanceConsu, alumno.id);
    expect(ficha!.zona).toBe('Córdoba Capital');
    expect(ficha!.whatsapp).toBe('+5493510000000');
    expect(ficha!.canalOrigen).toBe('Instagram');
  });

  it('lo que el consultor ya cargó NO se pisa desde el link', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, { ...FICHA, zona: 'Salta', whatsapp: '+5490000000000' });
    const t = await ua.emitirToken(repos, alcanceConsu, alumno.id);

    await ua.enviarDiagnostico(repos, t.token, diagnosticoCompleto()); // trae otra zona y otro whatsapp

    const ficha = await ua.obtenerAlumno(repos, alcanceConsu, alumno.id);
    expect(ficha!.zona).toBe('Salta');
    expect(ficha!.whatsapp).toBe('+5490000000000');
    expect(ficha!.canalOrigen).toBe('Instagram'); // el hueco sí se llenó
  });

  it('nombre y programa son intocables desde la ruta pública', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA);
    const t = await ua.emitirToken(repos, alcanceConsu, alumno.id);

    await ua.enviarDiagnostico(repos, t.token, {
      ...diagnosticoCompleto(),
      nombre: 'Hacker', // ni el esquema del diagnóstico ni el de ficha los aceptan
      programa: 'De Cero a Gestor Financiero',
      moneda: 'USD',
    });

    const ficha = await ua.obtenerAlumno(repos, alcanceConsu, alumno.id);
    expect(ficha!.nombre).toBe('Gonzalo');
    expect(ficha!.programa).toBe('Prestamista a Empresario');
    expect(ficha!.moneda).toBe('ARS');
  });

  it('una obligatoria del bloque 0 que falta en ficha Y en envío → rechazo sin consumir nada', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, FICHA); // sin zona
    const t = await ua.emitirToken(repos, alcanceConsu, alumno.id);

    const { zona: _, ...sinZona } = diagnosticoCompleto();
    await expect(ua.enviarDiagnostico(repos, t.token, sinZona)).rejects.toThrow(/ciudad y provincia/i);

    expect(await ua.listarDiagnosticos(repos, alcanceConsu, alumno.id)).toHaveLength(0);
    await expect(ua.abrirFormulario(repos, t.token)).resolves.toBeTruthy(); // token vivo
  });

  it('si la ficha YA tiene la obligatoria, el envío no necesita traerla', async () => {
    const { repos, consu, alcanceConsu } = await setup();
    const alumno = await ua.crearAlumno(repos, consu.id, {
      ...FICHA, zona: 'Salta', whatsapp: '+5490000000000', canalOrigen: 'TikTok',
    });
    const t = await ua.emitirToken(repos, alcanceConsu, alumno.id);

    const { edad: _e, zona: _z, whatsapp: _w, canal_origen: _c, ...soloRespuestas } = diagnosticoCompleto();
    await expect(ua.enviarDiagnostico(repos, t.token, soloRespuestas)).resolves.toBeTruthy();
  });
});
