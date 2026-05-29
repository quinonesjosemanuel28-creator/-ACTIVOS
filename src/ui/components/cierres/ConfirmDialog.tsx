/**
 * Diálogo de confirmación. Variante normal (eliminar) y variante de doble
 * confirmación (requiere escribir una palabra clave, ej. "BORRAR", para
 * habilitar el botón) — usada por "Reiniciar todo a cero".
 */
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button, Input } from '../ui/primitives';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  mensaje: React.ReactNode;
  textoConfirmar?: string; // label del botón
  loading?: boolean;
  /** Si se define, exige escribir exactamente esta palabra para habilitar. */
  palabraClave?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  mensaje,
  textoConfirmar = 'Confirmar',
  loading = false,
  palabraClave,
}: ConfirmDialogProps) {
  const [texto, setTexto] = useState('');
  useEffect(() => {
    if (open) setTexto('');
  }, [open]);

  const habilitado = palabraClave ? texto === palabraClave : true;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm} disabled={!habilitado || loading}>
            {loading ? 'Procesando…' : textoConfirmar}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-signal-red" size={20} />
        <div className="text-sm text-navy-600 dark:text-navy-200">{mensaje}</div>
      </div>
      {palabraClave && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-navy-400">
            Escribí <span className="font-mono text-signal-red">{palabraClave}</span> para confirmar
          </label>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={palabraClave} autoFocus />
        </div>
      )}
    </Dialog>
  );
}
