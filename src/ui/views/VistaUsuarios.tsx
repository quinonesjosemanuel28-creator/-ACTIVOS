/**
 * Vista "Usuarios" (solo ADMIN): alta con contraseña temporal, cambio de rol,
 * baja/reactivación (expulsión inmediata) y reseteo de contraseña.
 * La contraseña temporal se muestra UNA vez: comunicala vos por canal seguro.
 */
import { useState, type FormEvent } from 'react';
import { Copy, KeyRound, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { ROLES, type Rol, type UsuarioPublico } from '@domain/auth/permisos';
import { useBajaUsuario, useCambiarRol, useCrearUsuario, useResetearPassword, useUsuarios } from '../hooks';
import { useUI } from '../store';
import { SectionHeader } from '../components/SectionHeader';
import { Badge, Button, Card, Input, Select, Spinner } from '../components/ui/primitives';

const DESCRIPCION_ROL: Record<Rol, string> = {
  LECTOR: 'Solo ve dashboards y métricas',
  EDITOR: 'Ve todo y carga/edita el día a día',
  ADMIN: 'Todo + importar/resetear + usuarios',
};

export function VistaUsuarios() {
  const { data: usuarios, isLoading } = useUsuarios();
  const usuarioActual = useUI((s) => s.usuario);

  const [temporal, setTemporal] = useState<{ email: string; password: string } | null>(null);

  return (
    <div className="space-y-6">
      <SectionHeader
        titulo="Usuarios"
        descripcion="Roles: LECTOR (solo ve) · EDITOR (carga el día a día) · ADMIN (todo). Mínimo permiso necesario."
      />

      <FormAlta onTemporal={(email, password) => setTemporal({ email, password })} />

      {temporal && (
        <Card className="border-gold-400 bg-gold-400/10 p-4">
          <p className="text-sm font-600 text-navy-900 dark:text-navy-50">
            <KeyRound className="mr-1 inline" size={14} /> Contraseña temporal de <strong>{temporal.email}</strong> (se muestra UNA sola vez):
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-navy-900 px-3 py-1.5 font-mono text-base text-gold-400">{temporal.password}</code>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(temporal.password)}>
              <Copy size={14} /> Copiar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setTemporal(null)}>Listo, la guardé</Button>
          </div>
          <p className="mt-2 text-xs text-navy-500 dark:text-navy-300">
            Al entrar por primera vez, el sistema le exige elegir su propia contraseña.
          </p>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-10"><Spinner className="h-6 w-6" /></div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-navy-400">
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(usuarios ?? []).map((u) => (
                <FilaUsuario key={u.id} usuario={u} esYo={u.id === usuarioActual?.id} onTemporal={(p) => setTemporal({ email: u.email, password: p })} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function FormAlta({ onTemporal }: { onTemporal: (email: string, password: string) => void }) {
  const crear = useCrearUsuario();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('LECTOR');
  const [error, setError] = useState<string | null>(null);

  const alta = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await crear.mutateAsync({ email, nombre, rol });
      if (r.passwordTemporal) onTemporal(r.usuario.email, r.passwordTemporal);
      setEmail(''); setNombre(''); setRol('LECTOR');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    }
  };

  return (
    <Card className="p-4">
      <form onSubmit={alta} className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Nombre</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Rol · {DESCRIPCION_ROL[rol]}</label>
          <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <Button type="submit" disabled={crear.isPending}>
          <UserPlus size={16} /> {crear.isPending ? 'Creando…' : 'Crear usuario'}
        </Button>
        {error && <p className="w-full text-sm text-signal-red">{error}</p>}
      </form>
    </Card>
  );
}

function FilaUsuario({ usuario: u, esYo, onTemporal }: { usuario: UsuarioPublico; esYo: boolean; onTemporal: (password: string) => void }) {
  const cambiarRol = useCambiarRol();
  const baja = useBajaUsuario();
  const reset = useResetearPassword();
  const [error, setError] = useState<string | null>(null);

  const conError = (p: Promise<unknown>) => p.catch((err) => setError(err instanceof Error ? err.message : 'Error'));

  return (
    <>
      <tr className="border-t border-navy-100 dark:border-navy-700">
        <td className="px-4 py-3">
          <p className="font-600 text-navy-900 dark:text-navy-50">{u.nombre} {esYo && <Badge tone="gold">vos</Badge>}</p>
          <p className="text-xs text-navy-400">{u.email}</p>
        </td>
        <td className="px-4 py-3">
          <Select
            value={u.rol}
            disabled={cambiarRol.isPending}
            onChange={(e) => { setError(null); void conError(cambiarRol.mutateAsync({ id: u.id, rol: e.target.value as Rol })); }}
            title={DESCRIPCION_ROL[u.rol]}
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </td>
        <td className="px-4 py-3">
          {u.activo ? <Badge tone="green"><ShieldCheck size={12} /> Activo</Badge> : <Badge tone="red">De baja</Badge>}
          {u.debeCambiarPassword && <p className="mt-1 text-xs text-navy-400">Debe cambiar contraseña</p>}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost" size="sm" title="Resetear contraseña (genera una temporal)"
              disabled={reset.isPending}
              onClick={() => { setError(null); void conError(reset.mutateAsync(u.id).then((r) => onTemporal(r.passwordTemporal))); }}
            >
              <KeyRound size={14} /> Resetear
            </Button>
            {u.activo ? (
              <Button
                variant="ghost" size="sm" title="Dar de baja (expulsa sus sesiones al instante)"
                disabled={baja.isPending || esYo}
                onClick={() => {
                  setError(null);
                  if (confirm(`¿Dar de baja a ${u.nombre}? Pierde el acceso al instante. Es reversible.`))
                    void conError(baja.mutateAsync({ id: u.id, reactivar: false }));
                }}
              >
                <UserMinus size={14} /> Baja
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled={baja.isPending}
                onClick={() => { setError(null); void conError(baja.mutateAsync({ id: u.id, reactivar: true })); }}>
                Reactivar
              </Button>
            )}
          </div>
        </td>
      </tr>
      {error && (
        <tr><td colSpan={4} className="px-4 pb-2 text-right text-xs text-signal-red">{error}</td></tr>
      )}
    </>
  );
}
