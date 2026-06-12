/**
 * CAPA 4 — INFRAESTRUCTURA · Auth · Repos PostgreSQL de usuarios y sesiones.
 * Espejo de src/infrastructure/sqlite/authRepos.ts (pg, $1..$n, ON CONFLICT).
 */
import type { Pool } from 'pg';
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

export function crearUsuariosRepoPg(pool: Pool): UsuariosRepo {
  return {
    async obtenerPorId(id) {
      const r = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
      const row = r.rows[0] as UsuarioRow | undefined;
      return row ? toUsuario(row) : null;
    },
    async obtenerPorEmail(email) {
      const r = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
      const row = r.rows[0] as UsuarioRow | undefined;
      return row ? toUsuario(row) : null;
    },
    async listar() {
      const r = await pool.query('SELECT * FROM usuarios ORDER BY creado_en');
      return (r.rows as UsuarioRow[]).map(toUsuario);
    },
    async guardar(u) {
      await pool.query(
        `INSERT INTO usuarios
         (id, email, nombre, rol, password_hash, activo, debe_cambiar_password, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
          email=EXCLUDED.email, nombre=EXCLUDED.nombre, rol=EXCLUDED.rol,
          password_hash=EXCLUDED.password_hash, activo=EXCLUDED.activo,
          debe_cambiar_password=EXCLUDED.debe_cambiar_password`,
        [u.id, u.email, u.nombre, u.rol, u.passwordHash, u.activo ? 1 : 0, u.debeCambiarPassword ? 1 : 0, u.creadoEn],
      );
    },
    async contarAdminsActivos() {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'ADMIN' AND activo = 1");
      return (r.rows[0] as { n: number }).n;
    },
  };
}

export function crearSesionesRepoPg(pool: Pool): SesionesRepo {
  return {
    async crear(s) {
      await pool.query('INSERT INTO sesiones (token, id_usuario, expira_en, creada_en) VALUES ($1,$2,$3,$4)', [
        s.token,
        s.idUsuario,
        s.expiraEn,
        s.creadaEn,
      ]);
    },
    async obtener(token) {
      const r = await pool.query('SELECT * FROM sesiones WHERE token = $1', [token]);
      const row = r.rows[0] as SesionRow | undefined;
      return row ? toSesion(row) : null;
    },
    async eliminar(token) {
      await pool.query('DELETE FROM sesiones WHERE token = $1', [token]);
    },
    async eliminarDeUsuario(idUsuario) {
      await pool.query('DELETE FROM sesiones WHERE id_usuario = $1', [idUsuario]);
    },
    async limpiarVencidas(ahoraIso) {
      const r = await pool.query('DELETE FROM sesiones WHERE expira_en <= $1', [ahoraIso]);
      return r.rowCount ?? 0;
    },
  };
}
