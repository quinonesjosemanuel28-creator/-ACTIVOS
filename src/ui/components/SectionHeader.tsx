import type { ReactNode } from 'react';

export function SectionHeader({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl font-700 text-navy-900 dark:text-navy-50">{titulo}</h2>
        {descripcion && <p className="mt-1 text-sm text-navy-500 dark:text-navy-300">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
