/**
 * Pantalla de login (sin sesión no se ve nada más). Si el usuario entra con
 * una contraseña temporal (debeCambiarPassword), se le exige cambiarla acá
 * mismo antes de pasar al dashboard; tras el cambio se reloguea solo.
 */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogIn } from 'lucide-react';
import { useCambiarPassword, useLogin } from '../hooks';
import { Button, Card, Input, Spinner } from '../components/ui/primitives';

export function VistaLogin() {
  const qc = useQueryClient();
  const login = useLogin();
  const cambiar = useCambiarPassword();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Si el login devolvió debeCambiarPassword, pedimos la nueva acá. */
  const [pidiendoNueva, setPidiendoNueva] = useState(false);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordNueva2, setPasswordNueva2] = useState('');

  const ocupado = login.isPending || cambiar.isPending;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await login.mutateAsync({ email, password });
      if (r.usuario.debeCambiarPassword) {
        setPidiendoNueva(true); // contraseña temporal: obligamos a cambiarla
        return;
      }
      await qc.invalidateQueries({ queryKey: ['sesion'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    }
  };

  const confirmarNueva = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passwordNueva !== passwordNueva2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    try {
      await cambiar.mutateAsync({ passwordActual: password, passwordNueva });
      // El cambio invalida las sesiones: relogueamos con la nueva en el acto.
      await login.mutateAsync({ email, password: passwordNueva });
      await qc.invalidateQueries({ queryKey: ['sesion'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50 p-4 dark:bg-navy-950">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 font-display text-2xl font-700 text-gold-400">+</span>
          <div>
            <p className="font-display text-lg font-700 leading-none text-navy-900 dark:text-navy-50">Activos</p>
            <p className="text-xs text-navy-400">Academy · Dashboard CFO</p>
          </div>
        </div>

        {!pidiendoNueva ? (
          <form onSubmit={entrar} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Contraseña</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            {error && <p className="text-sm text-signal-red">{error}</p>}
            <Button type="submit" className="w-full" disabled={ocupado}>
              {ocupado ? <Spinner className="h-4 w-4" /> : <LogIn size={16} />} Entrar
            </Button>
          </form>
        ) : (
          <form onSubmit={confirmarNueva} className="space-y-3">
            <p className="text-sm text-navy-600 dark:text-navy-200">
              <KeyRound className="mr-1 inline" size={14} />
              Entraste con una contraseña temporal. Elegí la tuya (mínimo 8 caracteres, letras y números).
            </p>
            <div>
              <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Nueva contraseña</label>
              <Input type="password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} autoComplete="new-password" autoFocus required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-600 text-navy-500 dark:text-navy-300">Repetir nueva contraseña</label>
              <Input type="password" value={passwordNueva2} onChange={(e) => setPasswordNueva2(e.target.value)} autoComplete="new-password" required />
            </div>
            {error && <p className="text-sm text-signal-red">{error}</p>}
            <Button type="submit" className="w-full" disabled={ocupado}>
              {ocupado ? <Spinner className="h-4 w-4" /> : <KeyRound size={16} />} Cambiar y entrar
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
