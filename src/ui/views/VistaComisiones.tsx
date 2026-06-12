/**
 * Sección "Comisiones": cálculo automático por persona (closer 10% + setter
 * 2% si aplica), sobre el ARS cobrado por pago. Siempre al día (derivado).
 * Botón de liquidación idempotente (egreso COMI-<mes>, protección anti-dup).
 */
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, CheckCircle2, Coins } from 'lucide-react';
import { useUI, usePuede } from '../store';
import { useComisiones, useLiquidarComisiones, useAnularLiquidacion } from '../hooks';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '../components/ui/primitives';
import { SectionHeader } from '../components/SectionHeader';
import { ConfirmDialog } from '../components/cierres/ConfirmDialog';
import type { ComisionPersona } from '@domain/comisiones/calculo';
import { fmtArs, fmtMes, fmtPct } from '../lib/format';
import { cn } from '../lib/utils';

const TH = 'px-3 py-2.5 text-left text-xs font-600 uppercase tracking-wide text-navy-400';
const TD = 'px-3 py-2.5 align-middle';

export function VistaComisiones() {
  const { mes } = useUI();
  const { data, isLoading, error } = useComisiones(mes);
  const puedeEditar = usePuede('editar');
  const liquidar = useLiquidarComisiones();
  const anular = useAnularLiquidacion();
  const [reliqOpen, setReliqOpen] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!mes) return <Centro><p className="text-navy-400">Seleccioná un mes.</p></Centro>;
  if (isLoading) return <Centro><Spinner className="h-8 w-8" /></Centro>;
  if (error) return <Centro><p className="text-signal-red">Error: {(error as Error).message}</p></Centro>;
  if (!data) return null;

  const liquidarMes = (reemplazar: boolean) =>
    liquidar.mutate(
      { mes, reemplazar },
      {
        onSuccess: (r) => {
          setAviso(`${r.reemplazado ? 'Re-liquidado' : 'Liquidado'}: ${fmtArs(r.totalArs)} registrado como egreso de Comisiones.`);
          setReliqOpen(false);
        },
        onError: (e: Error) => setAviso(e.message),
      },
    );

  return (
    <div>
      <SectionHeader
        titulo={`Comisiones · ${fmtMes(mes)}`}
        descripcion="10% al closer del pago + 2% al setter (si aplica), sobre el ARS cobrado. Derivado de los pagos, siempre al día."
        accion={
          !puedeEditar ? undefined : data.liquidado ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setReliqOpen(true)} disabled={liquidar.isPending}>Re-liquidar</Button>
              <Button variant="ghost" onClick={() => anular.mutate(mes, { onSuccess: () => setAviso('Liquidación anulada.') })} disabled={anular.isPending}>Anular</Button>
            </div>
          ) : (
            <Button onClick={() => liquidarMes(false)} disabled={liquidar.isPending}>
              <Coins size={16} /> Liquidar comisiones de {fmtMes(mes)}
            </Button>
          )
        }
      />

      {/* Estado de liquidación */}
      {data.liquidado && data.liquidacion ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border-l-4 border-l-signal-green bg-green-50 px-4 py-2.5 text-sm text-signal-green dark:bg-green-900/20">
          <CheckCircle2 size={16} /> Liquidado el {data.liquidacion.fechaLiquidacion} por {fmtArs(data.liquidacion.totalArs)} (egreso {data.liquidacion.idEgreso}).
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-navy-100 px-4 py-2.5 text-sm text-navy-600 dark:bg-navy-800 dark:text-navy-200">
          Pendiente de liquidar. El cálculo se muestra al día; liquidar lo registra como egreso una vez.
        </div>
      )}

      {data.pagosSinArs > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border-l-4 border-l-signal-amber bg-amber-50 px-4 py-2.5 text-sm text-signal-amber dark:bg-amber-900/20">
          <AlertTriangle size={16} /> {data.pagosSinArs} pago(s) del mes sin ARS cargado: comisionan 0 hasta completar el monto.
        </div>
      )}

      {/* Total */}
      <Card className="mb-4 p-4">
        <p className="text-xs font-600 uppercase tracking-wide text-navy-400">Total comisiones del mes</p>
        <p className="mt-1 font-display text-3xl font-700 tnum text-navy-900 dark:text-navy-50">{fmtArs(data.totalArs)}</p>
      </Card>

      {data.porPersona.length === 0 ? (
        <p className="text-sm text-navy-500 dark:text-navy-300">No hay comisiones en {fmtMes(mes)}.</p>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Por persona</CardTitle></CardHeader>
          <CardBody className="px-0 pb-0">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH} aria-label="expandir" />
                  <th className={TH}>Persona</th>
                  <th className={`${TH} text-right`}>Closer (10%)</th>
                  <th className={`${TH} text-right`}>Setter (2%)</th>
                  <th className={`${TH} text-right`}>Total ARS</th>
                </tr>
              </thead>
              <tbody>
                {data.porPersona.map((p) => <FilaPersona key={p.persona} persona={p} />)}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {aviso && <p className="mt-3 text-sm text-navy-600 dark:text-navy-200">{aviso}</p>}

      <ConfirmDialog
        open={reliqOpen}
        onClose={() => setReliqOpen(false)}
        title="Re-liquidar comisiones"
        mensaje={
          <>
            {fmtMes(mes)} ya fue liquidado{data.liquidacion ? ` por ${fmtArs(data.liquidacion.totalArs)}` : ''}.
            Re-liquidar <b>reemplaza</b> ese egreso por el cálculo actual ({fmtArs(data.totalArs)}). No suma encima. ¿Confirmás?
          </>
        }
        textoConfirmar="Re-liquidar (reemplazar)"
        loading={liquidar.isPending}
        onConfirm={() => liquidarMes(true)}
      />
    </div>
  );
}

function FilaPersona({ persona }: { persona: ComisionPersona }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-t border-navy-100 hover:bg-navy-50 dark:border-navy-700 dark:hover:bg-navy-800/50" onClick={() => setAbierto((v) => !v)}>
        <td className={cn(TD, 'text-navy-400')}>{abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
        <td className={cn(TD, 'font-600 text-navy-900 dark:text-navy-50')}>{persona.persona}</td>
        <td className={cn(TD, 'text-right tnum text-navy-700 dark:text-navy-100')}>{persona.comisionCloserArs > 0 ? fmtArs(persona.comisionCloserArs) : '—'}</td>
        <td className={cn(TD, 'text-right tnum text-navy-700 dark:text-navy-100')}>{persona.comisionSetterArs > 0 ? fmtArs(persona.comisionSetterArs) : '—'}</td>
        <td className={cn(TD, 'text-right font-700 tnum text-navy-900 dark:text-navy-50')}>{fmtArs(persona.totalArs)}</td>
      </tr>
      {abierto && (
        <tr className="bg-navy-50/60 dark:bg-navy-900/40">
          <td />
          <td colSpan={4} className="px-4 py-3">
            <div className="overflow-hidden rounded-xl border border-navy-100 dark:border-navy-700">
              <table className="w-full text-xs">
                <thead className="bg-navy-100/70 text-navy-500 dark:bg-navy-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-600">Fecha</th>
                    <th className="px-3 py-2 text-left font-600">Cliente</th>
                    <th className="px-3 py-2 text-left font-600">Rol</th>
                    <th className="px-3 py-2 text-right font-600">Base ARS</th>
                    <th className="px-3 py-2 text-right font-600">%</th>
                    <th className="px-3 py-2 text-right font-600">Comisión ARS</th>
                  </tr>
                </thead>
                <tbody>
                  {persona.lineas.map((l, i) => (
                    <tr key={i} className="border-t border-navy-100 dark:border-navy-700">
                      <td className="px-3 py-1.5 whitespace-nowrap text-navy-500 dark:text-navy-300">{l.fechaPago}</td>
                      <td className="px-3 py-1.5 text-navy-700 dark:text-navy-100">{l.cliente ?? l.idCierre}</td>
                      <td className="px-3 py-1.5"><Badge tone={l.rol === 'closer' ? 'gold' : 'neutral'}>{l.rol}</Badge></td>
                      <td className="px-3 py-1.5 text-right tnum">{fmtArs(l.baseArs)}</td>
                      <td className="px-3 py-1.5 text-right tnum">{fmtPct(l.pct)}</td>
                      <td className="px-3 py-1.5 text-right tnum font-600">{fmtArs(l.montoArs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[40vh] items-center justify-center">{children}</div>;
}
