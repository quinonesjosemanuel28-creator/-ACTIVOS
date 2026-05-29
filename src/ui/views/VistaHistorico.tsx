/** Evolución Histórica: líneas de Cash, Utilidad, Caja y Cierres (6+ meses). */
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useHistorico } from '../hooks';
import { Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { PALETA, RichTooltip } from '../components/ChartTooltip';
import { fmtMesCorto, fmtUsd } from '../lib/format';

export function VistaHistorico() {
  const { data, isLoading } = useHistorico();
  if (isLoading || !data)
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  return (
    <div>
      <SectionHeader titulo="Evolución Histórica" descripcion="Tendencia de los indicadores clave mes a mes." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Cash, Utilidad y Caja</CardTitle></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETA.grid} vertical={false} />
                <XAxis dataKey="mes" tickFormatter={fmtMesCorto} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickFormatter={(v) => fmtUsd(v)} tick={{ fontSize: 12, fill: '#64748b' }} width={70} />
                <Tooltip content={<RichTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="cashCollected" name="Cash Collected" stroke={PALETA.teal} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke={PALETA.gold} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cajaFinal" name="Caja Final" stroke={PALETA.navy} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cierres por mes</CardTitle></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETA.grid} vertical={false} />
                <XAxis dataKey="mes" tickFormatter={fmtMesCorto} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} width={36} />
                <Tooltip content={<RichTooltip />} />
                <Line type="monotone" dataKey="cierres" name="Cierres" stroke={PALETA.navy} strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
