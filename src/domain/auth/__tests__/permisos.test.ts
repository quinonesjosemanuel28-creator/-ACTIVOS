import { describe, it, expect } from 'vitest';
import {
  alcanceDeUsuario,
  alcanzaFila,
  ambitoDe,
  aUsuarioPublico,
  accionesDe,
  esRol,
  normalizarEmail,
  puede,
  ROLES,
  TABLAS_SENSIBLES,
  titularForzado,
  titularSegunAlcance,
  type Alcance,
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

  it('ADMIN puede todo, incluido el módulo de alumnos', () => {
    for (const accion of ['ver', 'editar', 'importar', 'gestionar_usuarios', 'ver_alumnos', 'editar_alumnos'] as const) {
      expect(puede('ADMIN', accion)).toBe(true);
    }
  });

  it('la escalera del contable es acumulativa: LECTOR ⊂ EDITOR ⊂ ADMIN', () => {
    expect(accionesDe('LECTOR')).toEqual(['ver']);
    expect(accionesDe('EDITOR')).toEqual(['ver', 'editar']);
    expect(accionesDe('ADMIN')).toEqual([
      'ver', 'editar', 'importar', 'gestionar_usuarios', 'ver_alumnos', 'editar_alumnos',
    ]);
  });

  it('esRol valida entradas', () => {
    expect(ROLES).toEqual(['LECTOR', 'EDITOR', 'ADMIN', 'CONSULTOR']);
    expect(esRol('ADMIN')).toBe(true);
    expect(esRol('CONSULTOR')).toBe(true);
    expect(esRol('root')).toBe(false);
    expect(esRol(undefined)).toBe(false);
  });
});

describe('Auth · CONSULTOR (regla dura: cero contabilidad)', () => {
  it('NO puede nada del contable, ni siquiera ver', () => {
    expect(puede('CONSULTOR', 'ver')).toBe(false);
    expect(puede('CONSULTOR', 'editar')).toBe(false);
    expect(puede('CONSULTOR', 'importar')).toBe(false);
    expect(puede('CONSULTOR', 'gestionar_usuarios')).toBe(false);
  });

  it('puede ver y editar alumnos', () => {
    expect(puede('CONSULTOR', 'ver_alumnos')).toBe(true);
    expect(puede('CONSULTOR', 'editar_alumnos')).toBe(true);
    expect(accionesDe('CONSULTOR')).toEqual(['ver_alumnos', 'editar_alumnos']);
  });

  it('NO es un escalón de la escalera del contable: no contiene a LECTOR', () => {
    // Si algún día CONSULTOR heredara 'ver', esto se cae: es exactamente la
    // regresión que hay que evitar.
    for (const accion of accionesDe('LECTOR')) {
      expect(puede('CONSULTOR', accion)).toBe(false);
    }
  });

  it('los roles del contable no tocan el módulo de alumnos', () => {
    for (const rol of ['LECTOR', 'EDITOR'] as const) {
      expect(puede(rol, 'ver_alumnos')).toBe(false);
      expect(puede(rol, 'editar_alumnos')).toBe(false);
    }
  });
});

describe('Auth · eje 2: ámbito por fila', () => {
  const consultor: Alcance = { ambito: 'solo_los_mios', idUsuario: 'usr-consu' };
  const admin: Alcance = { ambito: 'todos', idUsuario: 'usr-jose' };

  it('solo CONSULTOR está acotado; ADMIN ve todas las carteras', () => {
    expect(ambitoDe('CONSULTOR')).toBe('solo_los_mios');
    expect(ambitoDe('ADMIN')).toBe('todos');
    expect(ambitoDe('LECTOR')).toBe('todos');
    expect(ambitoDe('EDITOR')).toBe('todos');
  });

  it('alcanceDeUsuario sale del usuario, no de la request', () => {
    expect(alcanceDeUsuario({ id: 'usr-1', rol: 'CONSULTOR' })).toEqual({
      ambito: 'solo_los_mios',
      idUsuario: 'usr-1',
    });
  });

  it('titularForzado fija el titular con ámbito acotado y no restringe con ámbito total', () => {
    expect(titularForzado(consultor)).toBe('usr-consu');
    expect(titularForzado(admin)).toBeUndefined();
  });

  it('el filtro del cliente NO puede ensanchar el ámbito (el server manda)', () => {
    // Un consultor pidiendo la cartera de otro: se le devuelve la suya.
    expect(titularSegunAlcance('usr-otro', consultor)).toBe('usr-consu');
    // Y sin pedir nada, tampoco se le abre todo.
    expect(titularSegunAlcance(undefined, consultor)).toBe('usr-consu');
  });

  it('con ámbito total el filtro del cliente es cosmético y se respeta', () => {
    expect(titularSegunAlcance('usr-otro', admin)).toBe('usr-otro');
    expect(titularSegunAlcance(undefined, admin)).toBeUndefined();
  });

  it('alcanzaFila: una fila ajena no se alcanza con ámbito acotado', () => {
    expect(alcanzaFila(consultor, 'usr-consu')).toBe(true);
    expect(alcanzaFila(consultor, 'usr-otro')).toBe(false);
    // Sin titular (dato huérfano) tampoco: falla cerrado.
    expect(alcanzaFila(consultor, null)).toBe(false);
    expect(alcanzaFila(consultor, undefined)).toBe(false);
    expect(alcanzaFila(consultor, '')).toBe(false);
  });

  it('alcanzaFila: con ámbito total alcanza cualquier fila, incluso sin titular', () => {
    expect(alcanzaFila(admin, 'usr-quien-sea')).toBe(true);
    expect(alcanzaFila(admin, null)).toBe(true);
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
