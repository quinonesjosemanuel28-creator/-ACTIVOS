/** Barra de resumen del período: cobrado USD/ARS, cotización, desglose
 * nuevo vs cohortes y cierres nuevos por programa. */
import { Briefcase, GraduationCap } from 'lucide-react';
import { Card } from '../ui/primitives';
import { fmtArs, fmtMes, fmtNum, fmtPct, fmtUsd } from '../../lib/format';

interface ResumenShape {
  totalCobradoUsd: number;
  totalCobradoArs: number;
  cotizacionPonderada: number | null;
  cantidadCierres: number;
  cantidadPagos: number;
  cashNuevoUsd: number;
  cohortesUsd: number;
  cashNuevoArs: number;
  cohortesArs: number;
  cierresPorPrograma: { empresario: number; ceroGestor: number };
}

export function ResumenCierres({ mes, resumen }: { mes: string; resumen: ResumenShape }) {
  const periodo = mes === 'TODOS' ? 'todo el período' : fmtMes(mes);
  const { cashNuevoUsd, cohortesUsd } = resumen;
  const totalCash = cashNuevoUsd + cohortesUsd;
  const pctNuevo = totalCash > 0 ? cashNuevoUsd / totalCash : null;

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Cobrado USD · ${periodo}`} valor={fmtUsd(resumen.totalCobradoUsd)} hint={mes === 'TODOS' ? `${resumen.cantidadCierres} cierres` : 'incluye cohortes del mes'} />
        <Stat label={`Cobrado ARS · ${periodo}`} valor={fmtArs(resumen.totalCobradoArs)} acento hint="dinero real cobrado" />
        <Stat label="Cotización ponderada" valor={resumen.cotizacionPonderada ? fmtNum(Math.round(resumen.cotizacionPonderada)) : '—'} hint="Σ ARS / Σ USD" />
        <Stat label="Pagos / Cierres con cobro" valor={`${fmtNum(resumen.cantidadPagos)} / ${fmtNum(resumen.cantidadCierres)}`} hint="cierres que cobraron este mes (incluye cohortes)" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Mejora 1 — cierres nuevos por programa */}
        <Card className="p-4">
          <p className="text-xs font-600 uppercase tracking-wide text-navy-400">Cierres nuevos por programa</p>
          <p className="mb-2 text-xs text-navy-400">cierres nacidos (cerrados) este mes</p>
          <div className="grid grid-cols-2 gap-3">
            <Programa icono={<GraduationCap size={16} />} label="De Cero a Gestor" n={resumen.cierresPorPrograma.ceroGestor} />
            <Programa icono={<Briefcase size={16} />} label="Prestamista Empresario" n={resumen.cierresPorPrograma.empresario} />
          </div>
        </Card>

        {/* Mejora 2 — desglose cash nuevo vs cohortes */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-600 uppercase tracking-wide text-navy-400">Cash Collected · nuevo vs cohortes</p>
            <span className="text-xs text-navy-400">{fmtPct(pctNuevo)} nuevo</span>
          </div>
          {/* Mini-barra de proporción */}
          <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-navy-100 dark:bg-navy-700">
            <div className="h-full bg-teal-500" style={{ width: `${(pctNuevo ?? 0) * 100}%` }} title="Cash nuevo" />
            <div className="h-full bg-gold-400" style={{ width: `${(1 - (pctNuevo ?? 0)) * 100}%` }} title="Cohortes" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Componente color="bg-teal-500" label="Cash nuevo" usd={resumen.cashNuevoUsd} ars={resumen.cashNuevoArs} />
            <Componente color="bg-gold-400" label="Cohortes" usd={resumen.cohortesUsd} ars={resumen.cohortesArs} />
          </div>
        </Card>
      </div>

      <p className="text-xs text-navy-400">
        Nota: <b>“con cobro este mes”</b> cuenta cierres que recibieron un pago en el período (incluye cohortes de meses
        anteriores); <b>“cierres nuevos”</b> cuenta los que se cerraron este mes. Por eso pueden no coincidir.
      </p>
    </div>
  );
}

function Stat({ label, valor, hint, acento }: { label: string; valor: string; hint?: string; acento?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-600 uppercase tracking-wide text-navy-400">{label}</p>
      <p className={`mt-1 font-display text-2xl font-700 tnum ${acento ? 'text-teal-600' : 'text-navy-900 dark:text-navy-50'}`}>{valor}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-400">{hint}</p>}
    </Card>
  );
}

function Programa({ icono, label, n }: { icono: React.ReactNode; label: string; n: number }) {
  return (
    <div className="rounded-xl bg-navy-50 px-3 py-2 dark:bg-navy-800">
      <div className="flex items-center gap-1.5 text-xs text-navy-500 dark:text-navy-300">{icono}{label}</div>
      <p className="mt-0.5 font-display text-2xl font-700 tnum text-navy-900 dark:text-navy-50">{fmtNum(n)}</p>
    </div>
  );
}

function Componente({ color, label, usd, ars }: { color: string; label: string; usd: number; ars: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-navy-500 dark:text-navy-300">
        <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}
      </div>
      <p className="font-display text-lg font-700 tnum text-navy-900 dark:text-navy-50">{fmtUsd(usd)}</p>
      <p className="text-xs text-teal-600 tnum">{fmtArs(ars)}</p>
    </div>
  );
}
