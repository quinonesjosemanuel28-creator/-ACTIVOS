/** Zona de administración: borrar datos demo y reiniciar todo (doble confirmación). */
import { useState } from 'react';
import { Eraser, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, CardTitle } from '../ui/primitives';
import { ConfirmDialog } from './ConfirmDialog';
import { useBorrarDemo, useReiniciarCierres } from '../../hooks';

export function ZonaAdmin() {
  const borrarDemo = useBorrarDemo();
  const reiniciar = useReiniciarCierres();
  const [demoOpen, setDemoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <Card className="mt-6 border-red-200 dark:border-red-900/50">
      <CardHeader><CardTitle>Administración · Zona peligrosa</CardTitle></CardHeader>
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-600 text-navy-900 dark:text-navy-50">Borrar datos de demostración</p>
            <p className="text-sm text-navy-500 dark:text-navy-300">Limpia solo lo sembrado (prefijo DEMO-). No toca tus datos reales.</p>
          </div>
          <Button variant="outline" onClick={() => setDemoOpen(true)} disabled={borrarDemo.isPending}>
            <Eraser size={16} /> Borrar demo
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-4 border-t border-navy-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-navy-700">
          <div>
            <p className="font-600 text-signal-red">Reiniciar todo a cero</p>
            <p className="text-sm text-navy-500 dark:text-navy-300">Vacía TODOS los cierres y pagos (reales incluidos). Irreversible.</p>
          </div>
          <Button variant="danger" onClick={() => setResetOpen(true)} disabled={reiniciar.isPending}>
            <Trash2 size={16} /> Reiniciar todo
          </Button>
        </div>

        {aviso && <p className="mt-3 text-sm text-signal-green">{aviso}</p>}
      </CardBody>

      <ConfirmDialog
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title="Borrar datos de demostración"
        mensaje="Se eliminarán únicamente los cierres y pagos de demostración (DEMO-). Tus datos cargados a mano quedan intactos. ¿Continuar?"
        textoConfirmar="Borrar demo"
        loading={borrarDemo.isPending}
        onConfirm={() =>
          borrarDemo.mutate(undefined, {
            onSuccess: (r) => {
              setAviso(`Demo borrado: ${r.cierresBorrados} cierres y ${r.pagosBorrados} pagos.`);
              setDemoOpen(false);
            },
          })
        }
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reiniciar todo a cero"
        mensaje={
          <>
            Esto <b>vacía todos los cierres y pagos</b>, incluidos los reales, y <b>no se puede deshacer</b>.
            Para confirmar, escribí la palabra clave abajo.
          </>
        }
        textoConfirmar="Reiniciar todo"
        palabraClave="BORRAR"
        loading={reiniciar.isPending}
        onConfirm={() =>
          reiniciar.mutate('BORRAR', {
            onSuccess: (r) => {
              setAviso(`Reiniciado: ${r.cierresBorrados} cierres y ${r.pagosBorrados} pagos eliminados.`);
              setResetOpen(false);
            },
          })
        }
      />
    </Card>
  );
}
