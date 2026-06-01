/** Navegación entre pantallas: sidebar en desktop, barra superior en mobile. */
import { AlertTriangle, BarChart3, CalendarClock, Database, Filter, LayoutDashboard, LineChart, Megaphone, Percent, Receipt, TrendingDown, Users } from 'lucide-react';
import { useUI, type Vista } from '../store';
import { cn } from '../lib/utils';

const ITEMS: { id: Vista; label: string; icono: typeof LayoutDashboard }[] = [
  { id: 'ejecutiva', label: 'Vista Ejecutiva', icono: LayoutDashboard },
  { id: 'alertas', label: 'Alertas', icono: AlertTriangle },
  { id: 'cashflow', label: 'Cash Flow', icono: BarChart3 },
  { id: 'funnel', label: 'Funnel', icono: Filter },
  { id: 'historico', label: 'Histórico', icono: LineChart },
  { id: 'marketing', label: 'Marketing', icono: Megaphone },
  { id: 'programas', label: 'Empresario vs Gestor', icono: Users },
  { id: 'cierres', label: 'Cierres y Clientes', icono: Receipt },
  { id: 'cobranza', label: 'Cobranza', icono: CalendarClock },
  { id: 'egresos', label: 'Egresos', icono: TrendingDown },
  { id: 'comisiones', label: 'Comisiones', icono: Percent },
  { id: 'datos', label: 'Carga & Admin', icono: Database },
];

/** Sidebar fijo para ≥ md. */
export function Sidebar() {
  const { vista, setVista } = useUI();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-navy-100 bg-white/70 p-4 backdrop-blur md:flex dark:border-navy-700 dark:bg-navy-900/70 print:hidden">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 font-display text-xl font-700 text-gold-400">+</span>
        <div>
          <p className="font-display font-700 leading-none text-navy-900 dark:text-navy-50">Activos</p>
          <p className="text-xs text-navy-400">Academy · CFO</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {ITEMS.map(({ id, label, icono: Icono }) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-500 transition-colors',
              vista === id
                ? 'bg-navy-900 text-white dark:bg-gold-400 dark:text-navy-900'
                : 'text-navy-600 hover:bg-navy-100 dark:text-navy-200 dark:hover:bg-navy-800',
            )}
          >
            <Icono size={18} />
            {label}
          </button>
        ))}
      </nav>
      <p className="px-2 text-xs text-navy-300">v1 · 100% local</p>
    </aside>
  );
}

/** Barra de navegación horizontal, scrollable, para < md (mobile/preview). */
export function MobileNav() {
  const { vista, setVista } = useUI();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-navy-100 bg-white/80 px-2 py-2 backdrop-blur md:hidden dark:border-navy-700 dark:bg-navy-900/80 print:hidden">
      {ITEMS.map(({ id, label, icono: Icono }) => (
        <button
          key={id}
          onClick={() => setVista(id)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-500 transition-colors',
            vista === id
              ? 'bg-navy-900 text-white dark:bg-gold-400 dark:text-navy-900'
              : 'text-navy-600 hover:bg-navy-100 dark:text-navy-200 dark:hover:bg-navy-800',
          )}
        >
          <Icono size={16} />
          {label}
        </button>
      ))}
    </nav>
  );
}
