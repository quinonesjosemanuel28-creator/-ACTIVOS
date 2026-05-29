/** Modal accesible liviano (sin dependencias): overlay, Esc y click-afuera. */
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'card my-8 w-full max-w-lg animate-fade-up p-0 shadow-card-hover',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4 dark:border-navy-700">
          <h3 className="font-display text-lg font-700 text-navy-900 dark:text-navy-50">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-700 dark:hover:bg-navy-700"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-navy-100 px-5 py-4 dark:border-navy-700">{footer}</div>}
      </div>
    </div>
  );
}
