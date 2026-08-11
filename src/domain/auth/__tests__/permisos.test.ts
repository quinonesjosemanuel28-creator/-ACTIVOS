import { describe, it, expect } from 'vitest';
import {
  aUsuarioPublico,
  accionesDe,
  esRol,
  normalizarEmail,
  puede,
  ROLES,
  TABLAS_SENSIBLES,
  type Usuario,
} from '../permisos';

describe('Auth · matriz de permisos (mínimo privilegio)', () => {
  it('LECTOR solo ve', () => {
    expect(puede('LECTOR', 'ver')).toBe(true);
    expect(puede('LECTOR', 'editar')).toBe(false);
    expect(puede('LECTOR', 'importar')).toBe(false);
    expect(puede('LECTOR', 'gestionar_usuarios')).toBe(false);
  });

  it('EDITOR ve y edita, pero NO importa ni gestiona usuarios', () => {
    expect(puede('EDITOR', 'ver')).toBe(true);
    expect(puede('EDITOR', 'editar')).toBe(true);
    expect(puede('EDITOR', 'importar')).toBe(false);
    expect(puede('EDITOR', 'gestionar_usuarios')).toBe(false);
  });

  it('ADMIN puede todo', () => {
    for (const accion of ['ver', 'editar', 'importar', 'gestionar_usuarios'] as const) {
      expect(puede('ADMIN', accion)).toBe(true);
    }
  });

  it('los permisos son acumulativos: LECTOR ⊂ EDITOR ⊂ ADMIN', () => {
    expect(accionesDe('LECTOR')).toEqual(['ver']);
    expect(accionesDe('EDITOR')).toEqual(['ver', 'editar']);
    expect(accionesDe('ADMIN')).toEqual(['ver', 'editar', 'importar', 'gestionar_usuarios']);
  });

  it('esRol valida entradas', () => {
    expect(ROLES).toEqual(['LECTOR', 'EDITOR', 'ADMIN']);
    expect(esRol('ADMIN')).toBe(true);
    expect(esRol('root')).toBe(false);
    expect(esRol(undefined)).toBe(false);
  });
});

describe('Auth · helpers de usuario', () => {
  const u: Usuario = {
    id: 'usr-1',
    email: 'a@b.com',
    nombre: 'Ana',
    rol: 'ADMIN',
    passwordHash: '$2a$12$secreto',
    activo: true,
    debeCambiarPassword: false,
    creadoEn: '2026-01-01T00:00:00.000Z',
  };

  it('aUsuarioPublico NUNCA expone el passwordHash', () => {
    const pub = aUsuarioPublico(u);
    expect(pub).not.toHaveProperty('passwordHash');
    expect(pub.email).toBe('a@b.com');
    expect(pub.rol).toBe('ADMIN');
  });

  it('normalizarEmail recorta y baja a minúsculas', () => {
    expect(normalizarEmail('  Quien.ES@Mail.COM ')).toBe('quien.es@mail.com');
  });

  it('usuarios y sesiones están marcadas como tablas sensibles', () => {
    expect(TABLAS_SENSIBLES).toContain('usuarios');
    expect(TABLAS_SENSIBLES).toContain('sesiones');
  });

  it('las tablas del módulo de alumnos están excluidas del asistente (temporal, ticket 6)', () => {
    for (const t of ['alumnos', 'diagnosticos', 'diagnostico_tokens', 'alumno_consultor_historial']) {
      expect(TABLAS_SENSIBLES).toContain(t);
    }
  });
});
