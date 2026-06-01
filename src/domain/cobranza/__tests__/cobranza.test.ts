import { describe, it, expect } from 'vitest';
import { cobranzaDeCierre, proyeccionPorMes, addMeses, ticketComprometido, DIAS_CUOTA } from '../calculo';
import { cierre as mkCierre, pago as mkPago } from '../../cierres/__tests__/fixtures';

const plan = (over = {}) =>
  mkCierre({ idCierre: 'V', fechaCierre: '2026-01-10', ticketTotalUsd: 4000, cantidadCuotas: 4, montoCuotaUsd: 1000, ...over });

describe('Cobranza · plan y FIFO', () => {
  it('cierre sin plan = Saldado, fuera del sistema de cuotas (legacy intactos)', () => {
    const cb = cobranzaDeCierre(mkCierre({ idCierre: 'L', ticketTotalUsd: 3000 }), [], '2026-06-01');
    expect(cb.tieneePlan).toBe(false);
    expect(cb.estado).toBe('Saldado');
    expect(cb.cuotas).toHaveLength(0);
  });

  it('saldo pendiente = total − abonado', () => {
    const cb = cobranzaDeCierre(plan(), [mkPago({ idCierre: 'V', montoUsd: 1500, fechaPago: '2026-01-10' })], '2026-01-15');
    expect(cb.abonadoUsd).toBe(1500);
    expect(cb.saldoPendienteUsd).toBe(2500);
  });

  it('FIFO: seña de cuota + completar; el reloj de la cuota 2 arranca al COMPLETAR la 1', () => {
    const cb = cobranzaDeCierre(
      plan(),
      [
        mkPago({ idPago: 'a', idCierre: 'V', montoUsd: 400, fechaPago: '2026-01-10' }), // parcial cuota 1
        mkPago({ idPago: 'b', idCierre: 'V', montoUsd: 600, fechaPago: '2026-01-25' }), // completa cuota 1
      ],
      '2026-02-01',
    );
    expect(cb.cuotas[0]!.completa).toBe(true);
    expect(cb.cuotas[0]!.fechaCompletada).toBe('2026-01-25');
    // cuota 2 vence 30 días después de completar la 1 (25/01 + 30)
    expect(cb.cuotas[1]!.vencimiento).toBe('2026-02-24');
    expect(cb.cuotas[1]!.vencimientoEstimado).toBe(false);
  });

  it('cuota 1 vence a fechaCierre + 30', () => {
    const cb = cobranzaDeCierre(plan(), [], '2026-01-11');
    expect(cb.cuotas[0]!.vencimiento).toBe('2026-02-09'); // 10/01 + 30
  });

  it('pago inicial completo (paga el total) → todas completas, sin pendiente, Saldado', () => {
    const cb = cobranzaDeCierre(plan(), [mkPago({ idCierre: 'V', montoUsd: 4000, fechaPago: '2026-01-10' })], '2026-06-01');
    expect(cb.cuotas.every((c) => c.completa)).toBe(true);
    expect(cb.saldoPendienteUsd).toBe(0);
    expect(cb.estado).toBe('Saldado');
  });
});

describe('Cobranza · estados por fecha', () => {
  it('Al día: cuota 1 aún no vencida', () => {
    expect(cobranzaDeCierre(plan(), [], '2026-01-20').estado).toBe('Al día'); // vence 09/02
  });
  it('Atrasado: cuota vencida 1–30 días', () => {
    expect(cobranzaDeCierre(plan(), [], '2026-02-20').estado).toBe('Atrasado'); // 11 días de atraso
  });
  it('Morosidad: cuota vencida +30 días', () => {
    expect(cobranzaDeCierre(plan(), [], '2026-03-20').estado).toBe('Morosidad'); // >30 días
    expect(cobranzaDeCierre(plan(), [], '2026-03-20').diasAtraso).toBeGreaterThan(DIAS_CUOTA);
  });
  it('una cuota cuyo reloj aún no arrancó (previa incompleta) no genera atraso', () => {
    // sin pagos: solo la cuota 1 tiene reloj; las demás son estimadas → no atrasan
    const cb = cobranzaDeCierre(plan(), [], '2026-02-20');
    const atrasanEstimadas = cb.cuotas.filter((c) => c.vencimientoEstimado && !c.completa);
    expect(atrasanEstimadas.length).toBeGreaterThan(0); // existen, pero no cuentan para el estado
    expect(cb.estado).toBe('Atrasado'); // solo por la cuota 1
  });
});

describe('Cobranza · proyección (solo visual)', () => {
  it('agrupa el pendiente por mes de vencimiento', () => {
    const cb = cobranzaDeCierre(plan(), [mkPago({ idCierre: 'V', montoUsd: 1000, fechaPago: '2026-01-10' })], '2026-01-15');
    const proy = proyeccionPorMes([cb]);
    // 3 cuotas pendientes de 1000; la cuota 1 está completa
    expect(Object.values(proy).reduce((a, b) => a + b, 0)).toBe(3000);
  });
});

describe('Cobranza · calendario mensual fijo (fechaPrimeraCuota)', () => {
  it('addMeses suma meses con clamp de fin de mes', () => {
    expect(addMeses('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMeses('2026-01-31', 1)).toBe('2026-02-28'); // clamp febrero
    expect(addMeses('2026-05-10', 3)).toBe('2026-08-10');
  });

  it('cuota N vence en fechaPrimeraCuota + (N-1) meses (no estimado)', () => {
    const c = plan({ fechaPrimeraCuota: '2026-05-10' });
    const cb = cobranzaDeCierre(c, [], '2026-05-01');
    expect(cb.cuotas[0]!.vencimiento).toBe('2026-05-10');
    expect(cb.cuotas[1]!.vencimiento).toBe('2026-06-10');
    expect(cb.cuotas[3]!.vencimiento).toBe('2026-08-10');
    expect(cb.cuotas.every((q) => !q.vencimientoEstimado)).toBe(true);
  });

  it('color del cierre = peor nivel entre cuotas (una cuota morosa → cierre rojo)', () => {
    // primera cuota vence 2026-05-10; hoy 2026-05-25 → 15 días de atraso → rojo
    const c = plan({ fechaPrimeraCuota: '2026-05-10' });
    const cb = cobranzaDeCierre(c, [], '2026-05-25');
    expect(cb.cuotas[0]!.nivel).toBe('rojo');
    expect(cb.nivel).toBe('rojo');
  });
});

describe('Cobranza · estado negro y marcado Inactivo', () => {
  it('cuota a +61 días → cierre negro (lista negra)', () => {
    // cuota 1 vence 2026-05-10; hoy 2026-07-12 → 63 días de atraso → negro
    const c = plan({ fechaPrimeraCuota: '2026-05-10' });
    const cb = cobranzaDeCierre(c, [], '2026-07-12');
    expect(cb.cuotas[0]!.nivel).toBe('negro');
    expect(cb.nivel).toBe('negro');
  });

  it('ticketComprometido: activo = ticket original; inactivo = lo pagado', () => {
    const activo = plan();
    expect(ticketComprometido(activo, 1500)).toBe(4000); // ticket original
    const inactivo = plan({ inactivo: true });
    expect(ticketComprometido(inactivo, 1500)).toBe(1500); // ajustado a lo pagado
  });

  it('marcar Inactivo: ticket = pagado, saldo 0, estado Inactivo, sin semáforo', () => {
    const c = plan({ fechaPrimeraCuota: '2026-05-10', inactivo: true });
    const cb = cobranzaDeCierre(c, [mkPago({ idCierre: 'V', montoUsd: 1500, fechaPago: '2026-05-02' })], '2026-08-01');
    expect(cb.estado).toBe('Inactivo');
    expect(cb.totalUsd).toBe(1500); // comprometido ajustado a lo pagado
    expect(cb.abonadoUsd).toBe(1500);
    expect(cb.saldoPendienteUsd).toBe(0); // pendiente cancelado
    expect(cb.nivel).toBeNull(); // fuera del semáforo
    expect(cb.cuotas).toHaveLength(0);
  });

  it('reactivar (inactivo=false) vuelve al plan original', () => {
    const c = plan({ fechaPrimeraCuota: '2026-05-10', inactivo: false });
    const cb = cobranzaDeCierre(c, [mkPago({ idCierre: 'V', montoUsd: 1500, fechaPago: '2026-05-02' })], '2026-08-01');
    expect(cb.estado).not.toBe('Inactivo');
    expect(cb.totalUsd).toBe(4000); // ticket original restaurado
    expect(cb.saldoPendienteUsd).toBe(2500);
  });
});
