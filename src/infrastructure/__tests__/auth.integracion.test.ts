import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearUsuariosRepo, crearSesionesRepo } from '../sqlite/authRepos';
import { hasherBcrypt } from '../auth/hasher';
import type { Hasher, ReposAuth } from '../../application/auth/ports';
import * as auth from '../../application/auth/useCases';

/** Hasher trivial para tests rápidos (no usa bcrypt salvo el test marcado). */
const hasherFake: Hasher = {
  hash: async (p) => `fake:${p}`,
  verificar: async (p, h) => h === `fake:${p}`,
};

function setup(hasher: Hasher = hasherFake): ReposAuth {
  const db = getDbMemoria();
  return { usuarios: crearUsuariosRepo(db), sesiones: crearSesionesRepo(db), hasher };
}

describe('Auth · admin inicial + login', () => {
  it('crea el ADMIN inicial solo si no hay usuarios (idempotente)', async () => {
    const repos = setup();
    const a = await auth.asegurarAdminInicial(repos, 'jefe@activos.com', 'Clave1234');
    expect(a?.rol).toBe('ADMIN');
    const b = await auth.asegurarAdminInicial(repos, 'otro@activos.com', 'Clave9999');
    expect(b).toBeNull(); // ya había usuarios
    expect(await auth.listarUsuarios(repos)).toHaveLength(1);
  });

  it('login con credenciales correctas abre sesión; incorrectas → error genérico', async () => {
    const repos = setup();
    await auth.asegurarAdminInicial(repos, 'jefe@activos.com', 'Clave1234');

    const r = await auth.login(repos, 'JEFE@activos.com', 'Clave1234'); // email case-insensitive
    expect(r.token).toBeTruthy();
    expect(r.usuario.email).toBe('jefe@activos.com');

    await expect(auth.login(repos, 'jefe@activos.com', 'mala')).rejects.toThrow(/incorrectos/i);
    await expect(auth.login(repos, 'noexiste@activos.com', 'Clave1234')).rejects.toThrow(/incorrectos/i);
  });

  it('usuarioDeSesion resuelve el token y respeta expiración', async () => {
    const repos = setup();
    await auth.asegurarAdminInicial(repos, 'jefe@activos.com', 'Clave1234');
    const ahora = Date.now();
    const r = await auth.login(repos, 'jefe@activos.com', 'Clave1234', ahora);

    expect((await auth.usuarioDeSesion(repos, r.token, ahora))?.email).toBe('jefe@activos.com');
    // tras la expiración, la sesión deja de valer (y se limpia)
    const vencido = ahora + auth.DURACION_SESION_MS + 1;
    expect(await auth.usuarioDeSesion(repos, r.token, vencido)).toBeNull();
    expect(await repos.sesiones.obtener(r.token)).toBeNull();
  });
});

describe('Auth · gestión de usuarios', () => {
  async function setupConAdmin() {
    const repos = setup();
    await auth.asegurarAdminInicial(repos, 'jefe@activos.com', 'Clave1234');
    return repos;
  }

  it('crear usuario genera contraseña temporal y exige cambiarla', async () => {
    const repos = await setupConAdmin();
    const r = await auth.crearUsuario(repos, { email: 'edi@activos.com', nombre: 'Edi', rol: 'EDITOR' });
    expect(r.passwordTemporal).toBeTruthy();
    expect(r.usuario.rol).toBe('EDITOR');
    expect(r.usuario.debeCambiarPassword).toBe(true);
    // y esa temporal sirve para loguear
    await expect(auth.login(repos, 'edi@activos.com', r.passwordTemporal!)).resolves.toBeTruthy();
  });

  it('no permite dos usuarios con el mismo email', async () => {
    const repos = await setupConAdmin();
    await auth.crearUsuario(repos, { email: 'edi@activos.com', nombre: 'Edi', rol: 'EDITOR' });
    await expect(
      auth.crearUsuario(repos, { email: 'EDI@activos.com', nombre: 'Otro', rol: 'LECTOR' }),
    ).rejects.toThrow(/ya existe/i);
  });

  it('dar de baja desactiva y EXPULSA las sesiones del usuario al instante', async () => {
    const repos = await setupConAdmin();
    const { usuario } = await auth.crearUsuario(repos, { email: 'edi@activos.com', nombre: 'Edi', rol: 'EDITOR', password: 'Clave1234' });
    const ses = await auth.login(repos, 'edi@activos.com', 'Clave1234');
    expect(await auth.usuarioDeSesion(repos, ses.token)).not.toBeNull();

    await auth.darDeBaja(repos, usuario.id);
    expect(await auth.usuarioDeSesion(repos, ses.token)).toBeNull(); // sesión muerta
    await expect(auth.login(repos, 'edi@activos.com', 'Clave1234')).rejects.toThrow(); // no puede reentrar
  });

  it('no se puede quitar ni dar de baja al último ADMIN activo', async () => {
    const repos = await setupConAdmin();
    const admin = (await auth.listarUsuarios(repos))[0]!;
    await expect(auth.cambiarRol(repos, admin.id, 'EDITOR')).rejects.toThrow(/último ADMIN/i);
    await expect(auth.darDeBaja(repos, admin.id)).rejects.toThrow(/último ADMIN/i);
  });

  it('resetear contraseña (ADMIN) genera temporal, fuerza cambio y mata sesiones', async () => {
    const repos = await setupConAdmin();
    const { usuario } = await auth.crearUsuario(repos, { email: 'edi@activos.com', nombre: 'Edi', rol: 'EDITOR', password: 'Clave1234' });
    const ses = await auth.login(repos, 'edi@activos.com', 'Clave1234');

    const { passwordTemporal } = await auth.resetearPassword(repos, usuario.id);
    expect(await auth.usuarioDeSesion(repos, ses.token)).toBeNull(); // sesión previa muerta
    await expect(auth.login(repos, 'edi@activos.com', 'Clave1234')).rejects.toThrow(); // vieja ya no va
    await expect(auth.login(repos, 'edi@activos.com', passwordTemporal)).resolves.toBeTruthy(); // la nueva sí
  });

  it('cambiarMiPassword exige la actual y valida la nueva', async () => {
    const repos = await setupConAdmin();
    const { usuario } = await auth.crearUsuario(repos, { email: 'edi@activos.com', nombre: 'Edi', rol: 'EDITOR', password: 'Clave1234' });
    await expect(auth.cambiarMiPassword(repos, usuario.id, 'incorrecta', 'Nueva1234')).rejects.toThrow(/actual/i);
    await expect(auth.cambiarMiPassword(repos, usuario.id, 'Clave1234', 'corta')).rejects.toThrow(/contraseña/i);
    await auth.cambiarMiPassword(repos, usuario.id, 'Clave1234', 'Nueva1234');
    await expect(auth.login(repos, 'edi@activos.com', 'Nueva1234')).resolves.toBeTruthy();
  });
});

describe('Auth · bcrypt real (hash seguro)', () => {
  it('el hash NO es la contraseña en texto plano y verifica correctamente', async () => {
    const repos = setup(hasherBcrypt);
    await auth.asegurarAdminInicial(repos, 'jefe@activos.com', 'Clave1234');
    const u = await repos.usuarios.obtenerPorEmail('jefe@activos.com');
    expect(u!.passwordHash).not.toContain('Clave1234');
    expect(u!.passwordHash.startsWith('$2')).toBe(true); // formato bcrypt
    await expect(auth.login(repos, 'jefe@activos.com', 'Clave1234')).resolves.toBeTruthy();
  });
});
