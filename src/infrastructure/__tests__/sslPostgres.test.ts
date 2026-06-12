import { describe, it, expect } from 'vitest';
import { sslPostgres } from '../db/factory';

describe('factory · TLS de Postgres', () => {
  it('sin PGSSL ni sslmode → sin TLS (local / red interna de Railway)', () => {
    expect(sslPostgres({})).toBe(false);
    expect(sslPostgres({ DATABASE_URL: 'postgresql://u:p@localhost:5432/activos' })).toBe(false);
  });

  it('PGSSL=true fuerza TLS sin verificar la cadena (cert de plataforma)', () => {
    expect(sslPostgres({ PGSSL: 'true' })).toEqual({ rejectUnauthorized: false });
    expect(sslPostgres({ PGSSL: '1' })).toEqual({ rejectUnauthorized: false });
    expect(sslPostgres({ PGSSL: 'require' })).toEqual({ rejectUnauthorized: false });
  });

  it('PGSSL=false desactiva TLS aunque la URL pida sslmode', () => {
    expect(sslPostgres({ PGSSL: 'false', DATABASE_URL: 'postgres://h/db?sslmode=require' })).toBe(false);
    expect(sslPostgres({ PGSSL: '0' })).toBe(false);
  });

  it('sslmode=require/verify-* en la URL activa TLS', () => {
    expect(sslPostgres({ DATABASE_URL: 'postgres://h/db?sslmode=require' })).toEqual({ rejectUnauthorized: false });
    expect(sslPostgres({ DATABASE_URL: 'postgres://h/db?sslmode=verify-full' })).toEqual({ rejectUnauthorized: false });
  });
});
