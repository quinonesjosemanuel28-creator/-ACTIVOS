/**
 * CAPA 4 — INFRAESTRUCTURA · Auth · Repos SQLite de usuarios y sesiones.
 * Implementan los puertos de la aplicación (async sobre better-sqlite3 sync).
 */
import type Database from 'better-sqlite3';
import type { Rol, Sesion, Usuario } from '../../domain/auth/permisos';
import type { SesionesRepo, UsuariosRepo } from '../../application/auth/ports';

interface UsuarioRow {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  password_hash: string;
  activo: number;
  debe_cambiar_password: number;
  creado_en: string;
}
const toUsuario = (r: UsuarioRow): Usuario => ({
  id: r.id,
  email: r.email,
  nombre: r.nombre,
  rol: r.rol as Rol,
  passwordHash: r.password_hash,
  activo: r.activo === 1,
  debeCambiarPassword: r.debe_cambiar_password === 1,
  creadoEn: r.creado_en,
});

interface SesionRow {
  token: string;
  id_usuario: string;
  expira_en: string;
  creada_en: string;
}
const toSesion = (r: SesionRow): Sesion => ({
  token: r.token,
  idUsuario: r.id_usuario,
  expiraEn: r.expira_en,
  creadaEn: r.creada_en,
});

export function crearUsuariosRepo(db: Database.Database): UsuariosRepo {
  return {
    async obtenerPorId(id) {
      const row = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as UsuarioRow | undefined;
      return row ? toUsuario(row) : null;
    },
    async obtenerPorEmail(email) {
      const row = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email) as UsuarioRow | undefined;
      return row ? toUsuario(row) : null;
    },
    async listar() {
      return (db.prepare('SELECT * FROM usuarios ORDER BY creado_en').all() as UsuarioRow[]).map(toUsuario);
    },
    async guardar(u) {
      db.prepare(
        `INSERT INTO usuarios
         (id, email, nombre, rol, password_hash, activo, debe_cambiar_password, creado_en)
         VALUES (@id,@email,@nombre,@rol,@passwordHash,@activo,@debeCambiarPassword,@creadoEn)
         ON CONFLICT(id) DO UPDATE SET
          email=excluded.email, nombre=excluded.nombre, rol=excluded.rol,
          password_hash=excluded.password_hash, activo=excluded.activo,
          debe_cambiar_password=excluded.debe_cambiar_password`,
      ).run({
        ...u,
        activo: u.activo ? 1 : 0,
        debeCambiarPassword: u.debeCambiarPassword ? 1 : 0,
      });
    },
    async contarAdminsActivos() {
      const row = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'ADMIN' AND activo = 1").get() as {
        n: number;
      };
      return row.n;
    },
  };
}

export function crearSesionesRepo(db: Database.Database): SesionesRepo {
  return {
    async crear(s) {
      db.prepare(
        'INSERT INTO sesiones (token, id_usuario, expira_en, creada_en) VALUES (?,?,?,?)',
      ).run(s.token, s.idUsuario, s.expiraEn, s.creadaEn);
    },
    async obtener(token) {
      const row = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token) as SesionRow | undefined;
      return row ? toSesion(row) : null;
    },
    async eliminar(token) {
      db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    },
    async eliminarDeUsuario(idUsuario) {
      db.prepare('DELETE FROM sesiones WHERE id_usuario = ?').run(idUsuario);
    },
    async limpiarVencidas(ahoraIso) {
      return db.prepare('DELETE FROM sesiones WHERE expira_en <= ?').run(ahoraIso).changes;
    },
  };
}
