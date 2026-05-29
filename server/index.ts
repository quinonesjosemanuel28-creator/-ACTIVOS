/**
 * SERVER · Cablea la capa de aplicación con la infraestructura SQLite y
 * expone una API REST liviana. Vite proxea /api → :8787 en desarrollo.
 *
 * Este archivo es el ÚNICO lugar donde se conocen Express + better-sqlite3
 * a la vez. El dominio sigue sin saber que existen.
 */
import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { getDb } from '../src/infrastructure/sqlite/db';
import { crearRepositorios } from '../src/infrastructure/sqlite/repos';
import * as uc from '../src/application/useCases';
import type { Programa } from '../src/domain/types';
import type { Filtro } from '../src/application/ports';

const repos = crearRepositorios(getDb());
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.raw({ type: ['application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], limit: '25mb' }));

const filtroDe = (q: express.Request['query']): Filtro | undefined => {
  const u = typeof q.unidad === 'string' ? q.unidad : undefined;
  return u ? { unidadNegocio: u as Filtro['unidadNegocio'] } : undefined;
};

// Wrapper para capturar errores y mapear Zod → 400.
const h =
  (fn: (req: express.Request, res: express.Response) => unknown) =>
  (req: express.Request, res: express.Response) => {
    try {
      const out = fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validación', detalles: err.flatten() });
      } else {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }
  };

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/meses', h(() => uc.obtenerMeses(repos)));

app.get(
  '/api/dashboard/:mes',
  h((req) =>
    uc.obtenerDashboardDelMes(repos, req.params.mes, {
      filtro: filtroDe(req.query),
      programa: (req.query.programa as 'TODOS' | Programa) ?? 'TODOS',
    }),
  ),
);

app.get('/api/historico', h((req) => uc.obtenerHistorico(repos, filtroDe(req.query))));

app.get('/api/comparar/:mes', h((req) => uc.compararProgramas(repos, req.params.mes, filtroDe(req.query))));

app.get('/api/parametros', h(() => repos.parametros.obtener()));
app.put('/api/parametros', h((req) => uc.guardarParametros(repos, req.body)));

app.post('/api/ventas', h((req) => uc.agregarVenta(repos, req.body)));
app.post('/api/cobros', h((req) => uc.agregarCobro(repos, req.body)));
app.post('/api/egresos', h((req) => uc.agregarEgreso(repos, req.body)));

app.put('/api/funnel/:mes', h((req) => uc.guardarFunnel(repos, req.params.mes, req.body, filtroDe(req.query))));

app.post('/api/cierre/:mes', h((req) => uc.cerrarMes(repos, req.params.mes)));
app.delete('/api/cierre/:mes', h((req) => uc.reabrirMes(repos, req.params.mes)));

app.post(
  '/api/importar',
  h((req) => {
    if (!Buffer.isBuffer(req.body)) throw new Error('Enviá el .xlsx como application/octet-stream.');
    return uc.importarExcel(repos, req.body);
  }),
);

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`[+Activos API] escuchando en http://localhost:${PORT}`);
});
