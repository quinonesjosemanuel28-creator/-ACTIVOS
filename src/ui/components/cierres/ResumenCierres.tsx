/** Barra de resumen del período: cobrado USD/ARS + cotización ponderada. */
import { Card } from '../ui/primitives';
import { fmtArs, fmtMes, fmtNum, fmtUsd } from '../../lib/format';

interface Props {
  /** Mes seleccionado, o 'TODOS'. */
  mes: string;
  totalCobradoUsd: number;
  totalCobradoArs: number;
  cotizacionPonderada: number | null;
  cantidadCierres: number;
  cantidadPagos: number;
}

export function ResumenCierres({ mes, totalCobradoUsd, totalCobradoArs, cotizacionPonderada, cantidadCierres, cantidadPagos }: Props) {
  const periodo = mes === 'TODOS' ? 'todo el período' : fmtMes(mes);
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label={`Cobrado USD · ${periodo}`}
        valor={fmtUsd(totalCobradoUsd)}
        hint={mes === 'TODOS' ? `${cantidadCierres} cierres` : 'incluye cohortes del mes'}
      />
      <Stat label={`Cobrado ARS · ${periodo}`} valor={fmtArs(totalCobradoArs)} acento hint="dinero real cobrado" />
      <Stat
        label="Cotización ponderada"
        valor={cotizacionPonderada ? fmtNum(Math.round(cotizacionPonderada)) : '—'}
        hint="Σ ARS / Σ USD"
      />
      <Stat label="Pagos / cierres" valor={`${fmtNum(cantidadPagos)} / ${fmtNum(cantidadCierres)}`} hint="en el resultado" />
    </div>
  );
}

function Stat({ label, valor, hint, acento }: { label: string; valor: string; hint?: string; acento?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{label}</p>
      <p className={`mt-1 font-display text-2xl font-700 tnum ${acento ? 'text-teal-600' : 'text-navy-900 dark:text-navy-50'}`}>
        {valor}
      </p>
      {hint && <p className="mt-0.5 text-xs text-navy-400">{hint}</p>}
    </Card>
  );
}
