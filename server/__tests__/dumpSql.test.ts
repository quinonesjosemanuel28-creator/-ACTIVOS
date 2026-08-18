/**
 * El parser del dump (dumpSql.ts): la vara del ensayo de restauración. Si
 * esto cuenta mal, el ensayo aprueba backups rotos o rechaza backups sanos —
 * las dos cosas son peores que no tener ensayo.
 */
import { describe, it, expect } from 'vitest';
import { filasPorTablaDelDump } from '../scripts/dumpSql';

const DUMP = `--
-- PostgreSQL database dump
--

CREATE TABLE public.alumnos (
    id text NOT NULL,
    nombre text NOT NULL
);

COPY public.alumnos (id, nombre) FROM stdin;
a1	Gonzalo
a2	Marta
\\.

COPY public.checkins (id, accion_id, marcado) FROM stdin;
c1	x1	1
c2	x2	0
c3	x3	1
\\.

COPY public.mediciones (id, kr_id, valor) FROM stdin;
\\.

-- fin
`;

describe('db:restaurar · filasPorTablaDelDump', () => {
  it('cuenta las filas de cada bloque COPY, incluidas las tablas vacías', () => {
    const filas = filasPorTablaDelDump(DUMP);
    expect(filas.get('alumnos')).toBe(2);
    expect(filas.get('checkins')).toBe(3);
    expect(filas.get('mediciones')).toBe(0); // vacía pero PRESENTE: si faltara, hay que notarlo
    expect(filas.size).toBe(3);
  });

  it('un dato que contiene la palabra COPY no abre un bloque nuevo', () => {
    const conTrampa = `COPY public.notas (id, texto) FROM stdin;
n1	COPY public.falsa (x) FROM stdin;
n2	texto normal
\\.
`;
    const filas = filasPorTablaDelDump(conTrampa);
    expect(filas.get('notas')).toBe(2);
    expect(filas.size).toBe(1);
  });

  it('identificadores entre comillas y sin esquema también cuentan', () => {
    const raro = `COPY "usuarios" (id) FROM stdin;
u1
\\.
COPY public."cierres" (id) FROM stdin;
z1
z2
\\.
`;
    const filas = filasPorTablaDelDump(raro);
    expect(filas.get('usuarios')).toBe(1);
    expect(filas.get('cierres')).toBe(2);
  });

  it('un texto sin bloques COPY devuelve el mapa vacío', () => {
    expect(filasPorTablaDelDump('SELECT 1;\n').size).toBe(0);
  });
});
