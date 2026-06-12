import { describe, it, expect } from 'vitest';
import { driverConfigurado, urlPostgres } from '../db/factory';

describe('factory de driver de base de datos', () => {
  it('default es sqlite (sin DB_DRIVER o vacío)', () => {
    expect(driverConfigurado({})).toBe('sqlite');
    expect(driverConfigurado({ DB_DRIVER: '' })).toBe('sqlite');
    expect(driverConfigurado({ DB_DRIVER: 'sqlite' })).toBe('sqlite');
  });

  it('acepta postgres con alias comunes (case-insensitive)', () => {
    expect(driverConfigurado({ DB_DRIVER: 'postgres' })).toBe('postgres');
    expect(driverConfigurado({ DB_DRIVER: 'PostgreSQL' })).toBe('postgres');
    expect(driverConfigurado({ DB_DRIVER: 'pg' })).toBe('postgres');
  });

  it('rechaza valores desconocidos con mensaje claro', () => {
    expect(() => driverConfigurado({ DB_DRIVER: 'mysql' })).toThrow(/DB_DRIVER inválido/);
  });

  it('urlPostgres exige DATABASE_URL y la devuelve recortada', () => {
    expect(() => urlPostgres({})).toThrow(/DATABASE_URL/);
    expect(urlPostgres({ DATABASE_URL: ' postgresql://u:p@localhost:5432/activos ' })).toBe(
      'postgresql://u:p@localhost:5432/activos',
    );
  });
});
