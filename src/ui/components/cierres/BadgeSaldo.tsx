/** Badge de estado de saldo del cierre (verde/amarillo/rojo + neutro). */
import type { EstadoSaldo } from '@domain/cierres/types';
import { Badge } from '../ui/primitives';

const MAP: Record<EstadoSaldo, { tone: 'green' | 'amber' | 'red' | 'neutral'; label: string }> = {
  saldado: { tone: 'green', label: 'Saldado' },
  parcial: { tone: 'amber', label: 'Parcial' },
  'solo-seña': { tone: 'red', label: 'Solo seña' },
  'sin-pagos': { tone: 'neutral', label: 'Sin pagos' },
};

export function BadgeSaldo({ estado }: { estado: EstadoSaldo }) {
  const { tone, label } = MAP[estado];
  return <Badge tone={tone}>{label}</Badge>;
}
