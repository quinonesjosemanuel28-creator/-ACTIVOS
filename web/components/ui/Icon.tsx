import {
  GraduationCap,
  ShieldCheck,
  MonitorCog,
  Handshake,
  Award,
  Lightbulb,
  HeartHandshake,
  Compass,
  Eye,
  type LucideIcon,
} from 'lucide-react';

// Registro de íconos limpios (SVG, nunca emoji). Se referencian por nombre
// desde config/site.ts para mantener el contenido desacoplado de la UI.
const registry: Record<string, LucideIcon> = {
  GraduationCap,
  ShieldCheck,
  MonitorCog,
  Handshake,
  Award,
  Lightbulb,
  HeartHandshake,
  Compass,
  Eye,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = registry[name] ?? Compass;
  return <Cmp className={className} strokeWidth={1.5} aria-hidden="true" />;
}
