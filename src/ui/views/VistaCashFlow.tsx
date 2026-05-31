/** Composición del Cash Flow: entradas (nuevo/cohortes) vs egresos + neto. */
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useHistorico, useDashboard } from '../hooks';
import { Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { PALETA, RichTooltip } from '../components/ChartTooltip';
import { fmtMesCorto, fmtPct, fmtUsd } from '../lib/format';

export function VistaCashFlow() {
  const { data: hist, isLoading } = useHistorico();
  const { data: dash } = useDashboard();
  const [incluirRetiros, setIncluirRetiros] = useState(false);

  if (isLoading || !hist)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const conc = dash?.snapshot.concentracionCohortes ?? null;
  const motorApagado = conc !== null && conc > 0.5;
  const data = hist.map((h) => ({ mes: h.mes, cashNuevo: h.cashNuevo, cohortes: h.cohortes }));

  // Entradas vs salidas + neto (operativo por defecto; total con retiros si se activa).
  const flujo = hist.map((h) => ({
    mes: h.mes,
    entradas: h.cashCollected,
    egresos: incluirRetiros ? h.egresosTotales : h.egresosOperativos,
    neto: incluirRetiros ? h.netoTotal : h.netoOperativo,
  }));

  return (
    <div>
      <SectionHeader
        titulo="Composición del Cash Flow"
        descripcion="Entradas (cash nuevo + cohortes) vs egresos del mes, y el cash flow neto."
      />
      {motorApagado && (
        <div className="mb-4 rounded-xl border-l-4 border-l-signal-red bg-red-50 px-4 py-3 text-sm text-signal-red dark:bg-red-900/20">
          ⚠️ Cohortes representan {fmtPct(conc)} del cash del mes seleccionado: el motor nuevo está apagado.
        </div>
      )}

      {/* Entradas vs Salidas + Neto */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Entradas vs Egresos · Cash flow neto</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-navy-400">{incluirRetiros ? 'Neto total (con retiros)' : 'Neto operativo (sin retiros)'}</span>
              <Button variant="outline" size="sm" onClick={() => setIncluirRetiros((v) => !v)}>
                {incluirRetiros ? 'Ver operativo' : 'Incluir retiros'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={flujo} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETA.grid} vertical={false} />
              <XAxis dataKey="mes" tickFormatter={fmtMesCorto} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tickFormatter={(v) => fmtUsd(v)} tick={{ fontSize: 12, fill: '#64748b' }} width={70} />
              <Tooltip content={<RichTooltip />} cursor={{ fill: 'rgba(21,42,99,0.04)' }} />
              <Legend />
              <Bar dataKey="entradas" name="Entradas (cash)" fill={PALETA.teal} radius={[6, 6, 0, 0]} />
              <Bar dataKey="egresos" name="Egresos" fill={PALETA.red} radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="neto" name="Cash flow neto" stroke={PALETA.navy} strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-navy-400">
            Neto = entradas − egresos {incluirRetiros ? 'totales (incluye retiros de socios)' : 'operativos (categorías 1–7, sin retiros de socios)'}.
            Línea sobre 0 = mes positivo. Solo meses con datos reales (sin proyección).
          </p>
        </CardBody>
      </Card>

      {/* Composición de entradas por origen (existente) */}
      <Card className="mt-4">
        <CardHeader><CardTitle>Cash mensual por origen</CardTitle></CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={320}>
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
