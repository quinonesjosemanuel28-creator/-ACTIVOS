/**
 * Ticket 11A — el test que recorre las DIEZ superficies de escritura de la
 * ficha, no una verificación visual. Con diez, la forma de fallar es
 * olvidarse una: un botón que se ve pero falla al clickear erosiona la
 * confianza en los permisos aunque el server esté bien.
 *
 * Render REAL de FichaAlumno (estático, con la cache de react-query
 * presembrada: useQuery lee la cache sincrónicamente y el HTML sale con
 * datos). Se afirma sobre el markup: para OBSERVADOR ninguna superficie
 * existe; para CONSULTOR vuelven las nueve de 'editar_alumnos'; para ADMIN
 * las diez. El candado REAL está en las rutas (observador.http.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { accionesDe, type Accion, type Rol } from '@domain/auth/permisos';
import type { Alumno } from '@domain/alumnos/tipos';
import type { PlanCompleto } from '@domain/alumnos/plan';
import type { AvancePlanUI, BitacoraUI } from '../lib/api';
import { FichaAlumno } from '../views/VistaAlumnos';

// En el render estático, Zustand sirve el SNAPSHOT INICIAL (sesión null) y
// puedeUI contesta true para todo. Se reemplaza solo usePuede por la matriz
// REAL del rol bajo prueba (accionesDe, del dominio): lo que este test
// verifica es que cada superficie CONSULTE el permiso — el candado de verdad
// está en las rutas (observador.http.test.ts).
const sesion = vi.hoisted(() => ({ acciones: [] as string[] }));
vi.mock('../store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../store')>();
  return { ...mod, usePuede: (accion: Accion) => sesion.acciones.includes(accion) };
});

const AHORA = new Date().toISOString();
const HOY = AHORA.slice(0, 10);

const ALUMNO: Alumno = {
  id: 'AL-1',
  consultorId: 'usr-consu',
  nombre: 'Gonzalo',
  edad: 38,
  zona: 'Córdoba',
  whatsapp: null,
  marcaComercial: null,
  programa: 'Prestamista a Empresario',
  canalOrigen: null,
  moneda: 'ARS',
  activo: true,
  estado: 'ACTIVO',
  estadoActualizadoEn: null,
  telefonoPais: '54',
  telefonoNumero: '3510000000',
  ultimoAccesoLink: null,
  idCierreVinculado: null,
  eliminadoEn: null,
  eliminadoPor: null,
  creadoEn: AHORA,
};

const PLAN: PlanCompleto = {
  plan: { id: 'PL-1', alumnoId: 'AL-1', fechaInicio: HOY, etapa: null, objetivo90d: null, version: 3, creadoEn: AHORA },
  okrs: [{
    id: 'OKR-1', planId: 'PL-1', orden: 1, objetivo: 'Ordenar la cobranza', creadoEn: AHORA,
    krs: [
      // Entregable con vencimiento → superficie 4 (input de fecha).
      { id: 'KR-1', okrId: 'OKR-1', orden: 1, texto: 'Proceso de cobranza escrito', meta: null, tipo: 'entregable', valorInicial: null, meta30: null, meta60: null, meta90: null, unidad: null, direccion: null, vencimiento: '2026-12-01', cumplidoEn: null, creadoEn: AHORA },
      // Métrica → superficie 6 (carga de mediciones).
      { id: 'KR-2', okrId: 'OKR-1', orden: 2, texto: 'Mora', meta: null, tipo: 'metrica', valorInicial: 12, meta30: null, meta60: null, meta90: 8, unidad: '%', direccion: 'baja', vencimiento: null, cumplidoEn: null, creadoEn: AHORA },
    ],
  }],
  acciones: [],
};

const AVANCE: AvancePlanUI = {
  planId: 'PL-1',
  fechaInicio: HOY,
  faseActual: 1,
  vencido: false,
  ultimaActividad: null,
  fases: [{
    fase: 1, total: 1, hechas: 0,
    // Una acción → superficie 5 (selector ☐◐☑).
    acciones: [{ id: 'AC-1', texto: 'Escribir el proceso', fase: 1, hecha: false, krId: 'KR-1', okrOrden: 1, ultimoCambio: null, estado: 'pendiente', nota: null }],
  }],
  link: null, // sin link emitido → superficie 9 es "Generar link del alumno"
  cambiosFecha: [],
  estadoKrs: [
    { krId: 'KR-1', tipo: 'entregable', cumplida: false, motivo: null, sinAcciones: false, ejecutadas: 0, totalAcciones: 1, valorActual: null },
    { krId: 'KR-2', tipo: 'metrica', cumplida: false, motivo: null, sinAcciones: false, ejecutadas: 0, totalAcciones: 0, valorActual: null },
  ],
  mediciones: [],
  // Una nota abierta → superficie 7 (Responder/Archivar).
  notas: [{ checkinId: 'CH-1', accionId: 'AC-1', texto: 'Me trabé con el punitorio', creadaEn: AHORA, estado: 'abierta', area: null, devolucion: null, resueltaPor: null, resueltaEn: null }],
};

const BITACORA: BitacoraUI = { entradas: [], traba: null };

function renderFicha(rol: Rol): string {
  sesion.acciones = accionesDe(rol);
  const qc = new QueryClient();
  qc.setQueryData(['alumnos', 'ficha', 'AL-1'], ALUMNO);
  qc.setQueryData(['alumnos', 'diagnosticos', 'AL-1'], []);
  qc.setQueryData(['alumnos', 'planes', 'AL-1'], [PLAN]);
  qc.setQueryData(['alumnos', 'avance', 'PL-1'], AVANCE);
  qc.setQueryData(['alumnos', 'bitacora', 'AL-1'], BITACORA);
  qc.setQueryData(['alumnos', 'documentos', 'PL-1'], []);
  qc.setQueryData(['alumnos', 'contactos', 'AL-1'], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <FichaAlumno id="AL-1" onVolver={() => {}} />
    </QueryClientProvider>,
  );
}

/** Las diez superficies del ticket, cada una con su marcador en el markup. */
const SUPERFICIES: { superficie: string; marcador: string; accion: 'editar_alumnos' | 'eliminar_alumnos' }[] = [
  { superficie: '1 · editar la ficha', marcador: '>Editar<', accion: 'editar_alumnos' },
  { superficie: '2 · cambiar estado', marcador: 'Estado del alumno: gobierna el semáforo', accion: 'editar_alumnos' },
  { superficie: '3 · fecha de inicio', marcador: 'Mover la fecha de inicio', accion: 'editar_alumnos' },
  { superficie: '4 · vencimiento de KR', marcador: 'Vencimiento del KR', accion: 'editar_alumnos' },
  { superficie: '5 · estado de acciones ☐◐☑', marcador: 'Corregir el estado (queda registrado como tuyo)', accion: 'editar_alumnos' },
  { superficie: '6 · cargar mediciones', marcador: 'placeholder="valor"', accion: 'editar_alumnos' },
  { superficie: '7 · responder/archivar notas', marcador: '>Responder<', accion: 'editar_alumnos' },
  { superficie: '8 · documento del plan', marcador: 'Subir el .pdf o .docx', accion: 'editar_alumnos' },
  { superficie: '9 · emitir link', marcador: 'Generar link', accion: 'editar_alumnos' },
  { superficie: '10 · papelera', marcador: 'Mandar a la papelera', accion: 'eliminar_alumnos' },
];

describe('Ficha · las diez superficies de escritura por rol (11A)', () => {
  it('OBSERVADOR: NINGUNA de las diez superficies existe en el markup', () => {
    const html = renderFicha('OBSERVADOR');
    for (const s of SUPERFICIES) {
      expect(html, s.superficie).not.toContain(s.marcador);
    }
    // Y las hermanas que no entran en la lista de diez pero también escriben:
    expect(html).not.toContain('Archivar');
    expect(html).not.toContain('Cargar otro plan');
    expect(html).not.toContain('Link de diagnóstico');
  });

  it('OBSERVADOR: lo que SÍ interviene queda visible — WhatsApp y bitácora', () => {
    const html = renderFicha('OBSERVADOR');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('Bitácora');
    expect(html).toContain('Interna — el alumno nunca la ve');
    // Y la lectura completa: el plan, la nota del alumno, el KR.
    expect(html).toContain('Ordenar la cobranza');
    expect(html).toContain('Me trabé con el punitorio');
  });

  it('CONSULTOR: vuelven las nueve superficies de editar_alumnos (papelera es solo ADMIN)', () => {
    const html = renderFicha('CONSULTOR');
    for (const s of SUPERFICIES) {
      if (s.accion === 'editar_alumnos') expect(html, s.superficie).toContain(s.marcador);
      else expect(html, s.superficie).not.toContain(s.marcador);
    }
  });

  it('ADMIN: las diez completas', () => {
    const html = renderFicha('ADMIN');
    for (const s of SUPERFICIES) {
      expect(html, s.superficie).toContain(s.marcador);
    }
  });
});
