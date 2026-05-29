/**
 * Importador de cierres/pagos desde Excel (hoja "PAGOS").
 * Flujo seguro: elegir archivo → VISTA PREVIA (cuántos cierres/pagos, cuántos
 * a revisar, filas con error) → recién al Confirmar escribe en la base.
 */
import { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/primitives';
import { leerExcelPagos } from '../../lib/leerExcelPagos';
import { construirImportacion, type ResultadoImportacion } from '@domain/cierres/importacion';
import { useImportarCierres } from '../../hooks';
import { fmtUsd } from '../../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportarDialog({ open, onClose }: Props) {
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const importar = useImportarCierres();

  const reset = () => {
    setPrevia(null);
    setNombreArchivo(null);
    setError(null);
    setHecho(null);
  };
  const cerrar = () => {
    reset();
    onClose();
  };

  const elegir = async (file: File) => {
    setError(null);
    setHecho(null);
    setLeyendo(true);
    try {
      const filas = await leerExcelPagos(file);
      if (filas.length === 0) {
        setError('La hoja "PAGOS" está vacía o no se encontró.');
        setPrevia(null);
      } else {
        setPrevia(construirImportacion(filas));
        setNombreArchivo(file.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setLeyendo(false);
    }
  };

  const confirmar = () => {
    if (!previa || previa.cierres.length === 0) return;
    importar.mutate(
      { cierres: previa.cierres, pagos: previa.pagos },
      {
        onSuccess: (r) => {
          setHecho(`Importados ${r.cierres} cierres y ${r.pagos} pagos.`);
          setPrevia(null);
        },
        onError: (e: Error) => setError(e.message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={cerrar}
      title="Importar cierres desde Excel"
      footer={
        previa && !hecho ? (
          <>
            <Button variant="ghost" onClick={reset} disabled={importar.isPending}>Elegir otro</Button>
            <Button onClick={confirmar} disabled={importar.isPending || previa.cierres.length === 0}>
              {importar.isPending ? 'Importando…' : `Confirmar e importar`}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={cerrar}>Cerrar</Button>
        )
      }
    >
      {!previa && !hecho && (
        <div className="text-sm text-navy-600 dark:text-navy-200">
          <p className="mb-3">
            Elegí un <b>.xlsx</b> con una hoja <b>PAGOS</b> (una fila por pago, agrupadas por <code>id_cierre</code>).
            Te muestro una vista previa antes de guardar; no se escribe nada hasta que confirmes.
          </p>
          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && elegir(e.target.files[0])}
            />
            <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-gold-400 px-4 text-sm font-500 text-navy-900 hover:bg-gold-300">
              {leyendo ? 'Leyendo…' : <><Upload size={16} /> Elegir archivo</>}
            </span>
          </label>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-signal-red"><AlertTriangle size={16} /> {error}</p>
      )}
      {hecho && <p className="text-sm text-signal-green">{hecho} El dashboard se actualizó.</p>}

      {previa && !hecho && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-navy-500 dark:text-navy-300">
            <FileSpreadsheet size={16} /> {nombreArchivo}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Resumen n={previa.resumen.cierres} label="Cierres" />
            <Resumen n={previa.resumen.pagos} label="Pagos" />
            <Resumen n={previa.resumen.aRevisar} label="A revisar" tono={previa.resumen.aRevisar > 0 ? 'amber' : undefined} />
          </div>
          <p className="text-sm text-navy-600 dark:text-navy-200">
            Voy a importar <b>{previa.resumen.cierres} cierres</b> y <b>{previa.resumen.pagos} pagos</b>
            {previa.resumen.aRevisar > 0 && <> ({previa.resumen.aRevisar} a revisar)</>}. Re-importar el mismo archivo no duplica.
          </p>

          {previa.errores.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-600 text-signal-amber">
                <AlertTriangle size={15} /> {previa.errores.length} fila(s) con problemas — no se importan:
              </p>
              <ul className="max-h-40 overflow-y-auto text-xs text-navy-600 dark:text-navy-200">
                {previa.errores.slice(0, 50).map((e, i) => (
                  <li key={i} className="py-0.5">Fila {e.fila} ({e.idCierre}): {e.motivo}</li>
                ))}
              </ul>
            </div>
          )}

          {previa.cierres.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-navy-100 dark:border-navy-700">
              <table className="w-full text-xs">
                <thead className="bg-navy-100/70 text-navy-500 dark:bg-navy-800">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-600">Cierre</th>
                    <th className="px-2 py-1.5 text-left font-600">Cliente</th>
                    <th className="px-2 py-1.5 text-right font-600">Ticket USD</th>
                    <th className="px-2 py-1.5 text-center font-600">Pagos</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.cierres.map((c) => (
                    <tr key={c.idCierre} className="border-t border-navy-100 dark:border-navy-700">
                      <td className="px-2 py-1 text-navy-500">{c.idCierre}{c.revisar && <span className="ml-1 text-signal-amber">⚠</span>}</td>
                      <td className="px-2 py-1 text-navy-900 dark:text-navy-50">{c.clienteNombre}</td>
                      <td className="px-2 py-1 text-right tnum">{fmtUsd(c.ticketTotalUsd)}</td>
                      <td className="px-2 py-1 text-center tnum">{previa.pagos.filter((p) => p.idCierre === c.idCierre).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Resumen({ n, label, tono }: { n: number; label: string; tono?: 'amber' }) {
  return (
    <div className="rounded-xl bg-navy-50 p-3 text-center dark:bg-navy-800">
      <p className={`font-display text-2xl font-700 tnum ${tono === 'amber' ? 'text-signal-amber' : 'text-navy-900 dark:text-navy-50'}`}>{n}</p>
      <p className="text-xs text-navy-400">{label}</p>
    </div>
  );
}
