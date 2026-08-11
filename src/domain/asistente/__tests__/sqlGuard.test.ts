import { describe, it, expect } from 'vitest';
import { esSoloLectura, conLimite } from '../sqlGuard';

describe('sqlGuard · acepta solo lectura', () => {
  it('acepta SELECT simple', () => {
    expect(esSoloLectura('SELECT * FROM cierres').ok).toBe(true);
  });
  it('acepta WITH … SELECT (CTE)', () => {
    expect(esSoloLectura('WITH t AS (SELECT 1 AS n) SELECT n FROM t').ok).toBe(true);
  });
  it('acepta SELECT con ; final', () => {
    expect(esSoloLectura('SELECT count(*) FROM pagos;').ok).toBe(true);
  });
  it('case-insensitive y con espacios iniciales', () => {
    expect(esSoloLectura('   select  1').ok).toBe(true);
  });
});

describe('sqlGuard · rechaza escritura / DDL', () => {
  it.each([
    ['INSERT', "INSERT INTO cierres (id_cierre) VALUES ('x')"],
    ['UPDATE', "UPDATE cierres SET estado='X'"],
    ['DELETE', 'DELETE FROM pagos'],
    ['DROP', 'DROP TABLE cierres'],
    ['ALTER', 'ALTER TABLE cierres ADD COLUMN x TEXT'],
    ['CREATE', 'CREATE TABLE t (a int)'],
    ['REPLACE', "REPLACE INTO cierres VALUES ('x')"],
    ['TRUNCATE', 'TRUNCATE cierres'],
    ['PRAGMA', 'PRAGMA table_info(cierres)'],
    ['ATTACH', "ATTACH DATABASE 'x.db' AS y"],
    ['VACUUM', 'VACUUM'],
  ])('rechaza %s', (_kw, sql) => {
    expect(esSoloLectura(sql).ok).toBe(false);
  });
});

describe('sqlGuard · multi-sentencia e inyección', () => {
  it('rechaza SELECT seguido de DROP (inyección de segundo statement)', () => {
    const r = esSoloLectura('SELECT * FROM cierres; DROP TABLE cierres');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/una sentencia/i);
  });
  it('rechaza dos SELECT separados por ;', () => {
    expect(esSoloLectura('SELECT 1; SELECT 2').ok).toBe(false);
  });
  it('rechaza DELETE escondido tras comentario de línea', () => {
    expect(esSoloLectura('SELECT 1 -- inocente\n; DELETE FROM pagos').ok).toBe(false);
  });
  it('un DROP comentado NO habilita ejecución (sigue siendo SELECT válido)', () => {
    // El comentario se stripea; queda "SELECT 1" → válido y seguro.
    expect(esSoloLectura('SELECT 1 /* DROP TABLE cierres */').ok).toBe(true);
  });
});

describe('sqlGuard · entradas inválidas', () => {
  it('rechaza vacío', () => {
    expect(esSoloLectura('').ok).toBe(false);
  });
  it('rechaza solo comentarios', () => {
    expect(esSoloLectura('-- nada').ok).toBe(false);
  });
  it('rechaza algo que no arranca con SELECT/WITH', () => {
    expect(esSoloLectura('EXPLAIN SELECT 1').ok).toBe(false);
  });
});

describe('sqlGuard · bloquea tablas sensibles (auth)', () => {
  it('rechaza leer la tabla usuarios (hashes de contraseña)', () => {
    const r = esSoloLectura('SELECT email, password_hash FROM usuarios');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/usuarios/i);
  });
  it('rechaza leer la tabla sesiones (tokens)', () => {
    expect(esSoloLectura('SELECT token FROM sesiones').ok).toBe(false);
  });
  it('rechaza un JOIN escondido contra usuarios', () => {
    expect(esSoloLectura('SELECT c.* FROM cierres c, usuarios u').ok).toBe(false);
  });
  it('no bloquea por subcadena (p. ej. una columna "usuarios_totales")', () => {
    expect(esSoloLectura('SELECT usuarios_totales FROM metricas').ok).toBe(true);
  });

  it('rechaza las tablas del módulo de alumnos (exclusión temporal, ticket 6)', () => {
    expect(esSoloLectura('SELECT * FROM alumnos').ok).toBe(false);
    expect(esSoloLectura('SELECT capital_colocado FROM diagnosticos').ok).toBe(false);
    expect(esSoloLectura('SELECT token FROM diagnostico_tokens').ok).toBe(false);
    expect(esSoloLectura('SELECT * FROM alumno_consultor_historial').ok).toBe(false);
    // un consultor pidiendo la cartera de otro vía JOIN escondido, tampoco
    expect(esSoloLectura('SELECT c.* FROM cierres c, alumnos a').ok).toBe(false);
  });
});

describe('conLimite', () => {
  it('agrega LIMIT si falta', () => {
    expect(conLimite('SELECT * FROM cierres', 50)).toBe('SELECT * FROM cierres LIMIT 50');
  });
  it('respeta LIMIT existente', () => {
    expect(conLimite('SELECT * FROM cierres LIMIT 5', 50)).toBe('SELECT * FROM cierres LIMIT 5');
  });
  it('quita el ; final antes de agregar LIMIT', () => {
    expect(conLimite('SELECT 1;', 50)).toBe('SELECT 1 LIMIT 50');
  });
});
