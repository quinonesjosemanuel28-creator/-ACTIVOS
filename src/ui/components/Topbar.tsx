/** Barra superior: selector de mes (driver maestro) + filtros + tema + export. */
import { Download, FileText, Moon, Sun } from 'lucide-react';
import { useMeses, useDashboard } from '../hooks';
import { useUI, type FiltroPrograma, type FiltroUnidad, type Vista } from '../store';
import { Button, Select } from './ui/primitives';
import { fmtMes } from '../lib/format';
import { exportarPdf, exportarXlsx } from '../lib/export';

const TITULOS: Record<Vista, string> = {
  ejecutiva: 'Vista Ejecutiva',
  alertas: 'Alertas',
  cashflow: 'Cash Flow',
  funnel: 'Funnel',
  historico: 'Histórico',
  marketing: 'Marketing',
  programas: 'Empresario vs Gestor',
  cierres: 'Cierres y Clientes',
  cobranza: 'Cobranza',
  egresos: 'Egresos',
  comisiones: 'Comisiones',
  datos: 'Carga & Admin',
};

export function Topbar() {
  const { data } = useMeses();
  const { data: dash } = useDashboard();
  const { mes, setMes, programa, setPrograma, unidad, setUnidad, tema, toggleTema, vista } = useUI();
  const meses = data?.meses ?? [];

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 bg-navy-50/85 px-4 py-3 backdrop-blur md:px-6 dark:border-navy-700 dark:bg-navy-950/85 print:hidden">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-700 text-navy-900 dark:text-navy-50">{TITULOS[vista]}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={mes ?? ''} onChange={(e) => setMes(e.target.value)} className="font-600">
          {meses.map((m) => (
            <option key={m} value={m}>{fmtMes(m)}</option>
          ))}
        </Select>
        <Select value={programa} onChange={(e) => setPrograma(e.target.value as FiltroPrograma)}>
          <option value="TODOS">Todos los programas</option>
          <option value="Empresario">Empresario</option>
          <option value="Gestor">Gestor</option>
        </Select>
        <Select value={unidad} onChange={(e) => setUnidad(e.target.value as FiltroUnidad)} title="Unidad de negocio">
          <option value="ACADEMY">Academy</option>
          <option value="LEGAL">Legal y Contable</option>
          <option value="TECNOLOGIA">A+ Tecnología</option>
          <option value="CONSOLIDADO">Consolidado</option>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Exportar PDF" onClick={exportarPdf}><FileText size={18} /></Button>
          <Button variant="ghost" size="icon" title="Exportar .xlsx" onClick={() => mes && dash && exportarXlsx(mes, dash)}><Download size={18} /></Button>
          <Button variant="ghost" size="icon" title="Cambiar tema" onClick={toggleTema}>
            {tema === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </Button>
        </div>
      </div>
    </header>
  );
}
