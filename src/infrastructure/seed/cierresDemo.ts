/**
 * CAPA 4 — INFRAESTRUCTURA · Seed demo del módulo Cierres y Clientes.
 *
 * Dataset rico multi-mes (Nov 2025 → May 2026). Como con el adaptador los
 * cierres/pagos alimentan TAMBIÉN el dashboard, este seed está dimensionado
 * para que el cash quede en escala sana frente a los egresos demo (márgenes,
 * runway, etc. con sentido). Todos los pagos llevan ARS + cotización por mes.
 *
 * IDs con prefijo DEMO- para que "Borrar datos de demostración" sea preciso.
 */
import type { Cierre, MedioPago, Pago, ProgramaCierre } from '../../domain/cierres/types';
import type { ReposCierres } from '../../application/cierres/ports';
import { DEMO_PREFIX } from '../sqlite/cierresRepos';

const MESES = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
const CLOSERS = ['Ana', 'Bruno', 'Caro'];
const SETTERS = ['Diego', 'Eva'];
const FUNNELS = ['IG Ads', 'Webinar', 'Referido'];
const MEDIOS: MedioPago[] = ['Transferencia Lemon', 'Transferencia BBVA', 'Transferencia MP', 'CRYPTO', 'Hotmart', 'Dólares'];

/** Cotización ARS/USD por mes (creciente y realista). */
const COTIZACION: Record<string, number> = {
  '2025-11': 980,
  '2025-12': 1010,
  '2026-01': 1060,
  '2026-02': 1120,
  '2026-03': 1180,
  '2026-04': 1240,
  '2026-05': 1300,
};

const NOMBRES = [
  'Lucía Fernández', 'Marcos Pérez', 'Sofía Gómez', 'Diego Romero', 'Valentina Díaz', 'Tomás Acosta',
  'Camila Ruiz', 'Joaquín Silva', 'Martina López', 'Nicolás Sosa', 'Julieta Castro', 'Federico Moyano',
  'Agustina Vega', 'Ramiro Ledesma', 'Florencia Imoff', 'Bruno Cabrera', 'Carla Ponce', 'Iván Quiroga',
  'Paula Méndez', 'Gonzalo Ferreyra', 'Daniela Ríos', 'Matías Bravo', 'Rocío Herrera', 'Lautaro Vidal',
  'Micaela Suárez', 'Emiliano Paz', 'Brenda Ojeda', 'Santiago Núñez', 'Abril Medina', 'Franco Aguirre',
  'Pilar Domínguez', 'Hernán Cáceres', 'Tatiana Vera', 'Maximiliano Roldán', 'Guadalupe Ferrari',
  'Ezequiel Maidana', 'Antonella Pérez', 'Cristian Ávalos', 'Renata Salas', 'Bautista Correa',
];

// PRNG determinista para reproducibilidad.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const TICKET: Record<ProgramaCierre, number> = { Empresario: 3000, 'Cero a Gestor': 1200 };

const dosDec = (n: number) => Math.round(n * 100) / 100;

export function generarCierresDemo(): { cierres: Cierre[]; pagos: Pago[] } {
  const rand = rng(7);
  const cierres: Cierre[] = [];
  const pagos: Pago[] = [];
  let nombreIdx = 0;

  MESES.forEach((mes, idx) => {
    const cotiz = COTIZACION[mes] ?? 1300;
    const dia = (n: number) => `${mes}-${String((n % 27) + 1).padStart(2, '0')}`;
    const cierresEmp = 3 + Math.floor(rand() * 2) + Math.floor(idx / 3); // 3..6
    const cierresGes = 3 + Math.floor(rand() * 3); // 3..5

    const generar = (programa: ProgramaCierre, cantidad: number) => {
      for (let i = 0; i < cantidad; i++) {
        const idCierre = `${DEMO_PREFIX}CL-${mes}-${programa[0]}${i}`;
        const ticket = Math.round(TICKET[programa] * (0.85 + rand() * 0.4));
        const closer = programa === 'Empresario' && idx < 2 ? 'Ana' : CLOSERS[Math.floor(rand() * CLOSERS.length)]!;
        const nombre = NOMBRES[nombreIdx % NOMBRES.length]!;
        nombreIdx++;
        cierres.push({
          idCierre,
          fechaCierre: dia(i * 3 + 2),
          clienteNombre: nombre,
          clienteMail: `${nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.')}@mail.com`,
          clienteTelefono: `+54 9 11 ${4000 + nombreIdx}-${5000 + i}`,
          programa,
          ticketTotalUsd: ticket,
          closer,
          setter: SETTERS[Math.floor(rand() * SETTERS.length)],
          funnel: FUNNELS[Math.floor(rand() * FUNNELS.length)],
          unidadNegocio: 'ACADEMY',
          estado: 'Activo',
        });

        // Anticipo (cash nuevo, mismo mes)
        const fracAnticipo = 0.5 + rand() * 0.2;
        const anticipoUsd = Math.round(ticket * fracAnticipo);
        const esCompleto = fracAnticipo > 0.66;
        pagos.push({
          idPago: `${DEMO_PREFIX}PG-${idCierre}-0`,
          idCierre,
          fechaPago: dia(i * 3 + 4),
          montoUsd: anticipoUsd,
          montoArs: dosDec(anticipoUsd * cotiz),
          cotizacion: cotiz,
          tipoPago: esCompleto ? 'Pago Completo' : 'Reserva/Seña',
          medioPago: MEDIOS[Math.floor(rand() * MEDIOS.length)]!,
        });

        // Saldo en el mes siguiente (cohorte), a la cotización de ESE mes
        const restoUsd = ticket - anticipoUsd;
        const sig = MESES[idx + 1];
        if (sig && restoUsd > 0) {
          const cotizSig = COTIZACION[sig] ?? cotiz;
          pagos.push({
            idPago: `${DEMO_PREFIX}PG-${idCierre}-1`,
            idCierre,
            fechaPago: `${sig}-12`,
            montoUsd: restoUsd,
            montoArs: dosDec(restoUsd * cotizSig),
            cotizacion: cotizSig,
            tipoPago: 'Cuota',
            numeroCuota: '2/2',
            medioPago: MEDIOS[Math.floor(rand() * MEDIOS.length)]!,
          });
        }
      }
    };

    generar('Empresario', cierresEmp);
    generar('Cero a Gestor', cierresGes);
  });

  // Ejemplo MIXTO (estilo Cristhian Marín): un cierre cuyos pagos los cobran
  // closers distintos. La seña la cobra Julian; la cuota de mayo, Ayrton.
  // Sirve para ver la atribución por closer del PAGO (no del cierre).
  const idMix = `${DEMO_PREFIX}CL-MIX-01`;
  cierres.push({
    idCierre: idMix,
    fechaCierre: '2026-03-31',
    clienteNombre: 'Cristhian Marín',
    clienteMail: 'cristhian.marin@mail.com',
    programa: 'Empresario',
    ticketTotalUsd: 1000,
    closer: 'Julian', // closer de la VENTA (default)
    setter: 'Diego',
    funnel: 'Referido',
    unidadNegocio: 'ACADEMY',
    estado: 'Activo',
  });
  pagos.push(
    {
      idPago: `${DEMO_PREFIX}PG-MIX-01-0`,
      idCierre: idMix,
      fechaPago: '2026-03-31',
      montoUsd: 100,
      montoArs: dosDec(100 * (COTIZACION['2026-03'] ?? 1180)),
      cotizacion: COTIZACION['2026-03'],
      tipoPago: 'Reserva/Seña',
      medioPago: 'Transferencia Lemon',
      // sin closer propio → hereda Julian (cobró la seña)
    },
    {
      idPago: `${DEMO_PREFIX}PG-MIX-01-1`,
      idCierre: idMix,
      fechaPago: '2026-05-04',
      montoUsd: 900,
      montoArs: dosDec(900 * (COTIZACION['2026-05'] ?? 1300)),
      cotizacion: COTIZACION['2026-05'],
      tipoPago: 'Cuota',
      numeroCuota: '2/2',
      medioPago: 'Transferencia BBVA',
      closer: 'Ayrton', // ESTE pago lo cobró Ayrton
      aplicaSetting: true, // demo: además genera 2% de setting (setter Diego del cierre)
    },
  );

  return { cierres, pagos };
}

/** Carga idempotente del demo de cierres/pagos. */
export function sembrarCierresDemo(repos: ReposCierres): { cierres: number; pagos: number } {
  const { cierres, pagos } = generarCierresDemo();
  cierres.forEach((c) => repos.cierres.guardar(c));
  pagos.forEach((p) => repos.pagos.guardar(p));
  return { cierres: cierres.length, pagos: pagos.length };
}
