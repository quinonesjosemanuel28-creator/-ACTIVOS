/** Composición del Cash Flow: barras apiladas Cash Nuevo vs Cohortes. */
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useHistorico, useDashboard } from '../hooks';
import { Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { PALETA, RichTooltip } from '../components/ChartTooltip';
import { fmtMesCorto, fmtPct, fmtUsd } from '../lib/format';

export function VistaCashFlow() {
  const { data: hist, isLoading } = useHistorico();
  const { data: dash } = useDashboard();
  if (isLoading || !hist)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const conc = dash?.snapshot.concentracionCohortes ?? null;
  const motorApagado = conc !== null && conc > 0.5;
  const data = hist.map((h) => ({ mes: h.mes, cashNuevo: h.cashNuevo, cohortes: h.cohortes }));

  return (
    <div>
      <SectionHeader
        titulo="Composición del Cash Flow"
        descripcion="Cash Nuevo (motor nuevo) vs Cohortes (cobros de meses anteriores)."
      />
      {motorApagado && (
        <div className="mb-4 rounded-xl border-l-4 border-l-signal-red bg-red-50 px-4 py-3 text-sm text-signal-red dark:bg-red-900/20">
          ⚠️ Cohortes representan {fmtPct(conc)} del cash del mes seleccionado: el motor nuevo está apagado.
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Cash mensual por origen</CardTitle></CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETA.grid} vertical={false} />
              <XAxis dataKey="mes" tickFormatter={fmtMesCorto} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tickFormatter={(v) => fmtUsd(v)} tick={{ fontSize: 12, fill: '#64748b' }} width={70} />
              <Tooltip content={<RichTooltip />} cursor={{ fill: 'rgba(21,42,99,0.04)' }} />
              <Legend />
              <Bar dataKey="cashNuevo" name="Cash Nuevo" stackId="c" fill={PALETA.teal} radius={[0, 0, 0, 0]} />
              <Bar dataKey="cohortes" name="Cohortes" stackId="c" fill={PALETA.gold} radius={[6, 6, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.cohortes > d.cashNuevo ? PALETA.red : PALETA.gold} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  );
}
