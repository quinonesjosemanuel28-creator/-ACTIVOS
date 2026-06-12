/**
 * SERVER · Cablea la capa de aplicación con la infraestructura SQLite y
 * expone una API REST liviana. Vite proxea /api → :8787 en desarrollo.
 *
 * Este archivo es el ÚNICO lugar donde se conocen Express + better-sqlite3
 * a la vez. El dominio sigue sin saber que existen.
 */
import 'dotenv/config'; // carga .env (ANTHROPIC_API_KEY, etc.) antes de todo
import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { getDb } from '../src/infrastructure/sqlite/db';
import { crearRepositorios } from '../src/infrastructure/sqlite/repos';
import { crearReposCierres } from '../src/infrastructure/sqlite/cierresRepos';
import { crearEgresosAdminRepo } from '../src/infrastructure/sqlite/egresosRepos';
import { crearLiquidacionRepo } from '../src/infrastructure/sqlite/comisionesRepos';
import { crearFunnelCanalRepo } from '../src/infrastructure/sqlite/funnelCanalRepos';
import * as uce from '../src/application/egresos/useCases';
import * as ucom from '../src/application/comisiones/useCases';
import * as ucf from '../src/application/funnel/useCases';
import * as ucob from '../src/application/cobranza/useCases';
import * as ucia from '../src/application/asistente/useCases';
import { asistenteDisponible } from '../src/infrastructure/anthropic/cliente';
import type { FiltrosEgresos } from '../src/application/egresos/useCases';
import { crearRepositoriosDashboard } from '../src/infrastructure/adapters/dashboardRepos';
import * as uc from '../src/application/useCases';
import * as ucc from '../src/application/cierres/useCases';
import type { Programa } from '../src/domain/types';
import type { Filtro } from '../src/application/ports';
import type { FiltrosCierres } from '../src/application/cierres/ports';

const db = getDb();
// Repo legacy: egresos, funnel, parámetros, cierre_mes e importación.
const repos = crearRepositorios(db);
// Repo del dashboard: ventas/cobros provienen de cierres/pagos (adaptador).
const reposDash = crearRepositoriosDashboard(db);
const reposCierres = crearReposCierres(db);
const reposEgresos = crearEgresosAdminRepo(db);
const reposLiquidacion = crearLiquidacionRepo(db);
const reposFunnelCanal = crearFunnelCanalRepo(db);
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: ['application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], limit: '50mb' }));

const filtroDe = (q: express.Request['query']): Filtro | undefined => {
  const u = typeof q.unidad === 'string' ? q.unidad : undefined;
  return u ? { unidadNegocio: u as Filtro['unidadNegocio'] } : undefined;
};

/** Lee un parámetro de ruta garantizando string (noUncheckedIndexedAccess). */
const param = (req: express.Request, nombre: string): string => req.params[nombre] ?? '';

// Wrapper para capturar errores (sync y async) y mapear Zod → 400.
const h =
  (fn: (req: express.Request, res: express.Response) => unknown) =>
  async (req: express.Request, res: express.Response) => {
    try {
      const out = await fn(req, res);
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

// Lecturas del dashboard: usan el adaptador (cierres/pagos → Venta/Cobro).
app.get('/api/meses', h(() => uc.obtenerMeses(reposDash)));

app.get(
  '/api/dashboard/:mes',
  h((req) =>
    uc.obtenerDashboardDelMes(reposDash, param(req, 'mes'), {
      filtro: filtroDe(req.query),
      programa: (req.query.programa as 'TODOS' | Programa) ?? 'TODOS',
    }),
  ),
);

app.get('/api/historico', h((req) => uc.obtenerHistorico(reposDash, filtroDe(req.query))));

app.get('/api/comparar/:mes', h((req) => uc.compararProgramas(reposDash, param(req, 'mes'), filtroDe(req.query))));

app.get('/api/parametros', h(() => repos.parametros.obtener()));
app.put('/api/parametros', h((req) => uc.guardarParametros(repos, req.body)));

app.post('/api/ventas', h((req) => uc.agregarVenta(repos, req.body)));
app.post('/api/cobros', h((req) => uc.agregarCobro(repos, req.body)));
// Módulo Egresos (CRUD + resumen). Una sola tabla `egresos` (la que lee el dashboard).
const filtrosEgresosDe = (q: express.Request['query']): FiltrosEgresos => ({
  mes: typeof q.mes === 'string' ? q.mes : undefined,
  categoria: typeof q.categoria === 'string' ? q.categoria : undefined,
  tipo: typeof q.tipo === 'string' ? q.tipo : undefined,
  moneda: typeof q.moneda === 'string' ? q.moneda : undefined,
  q: typeof q.q === 'string' ? q.q : undefined,
});
app.get('/api/egresos', h((req) => uce.listarEgresos(reposEgresos, filtrosEgresosDe(req.query))));
app.get('/api/egresos/resumen/:mes', h((req) => uce.resumenEgresos(reposEgresos, param(req, 'mes'), filtrosEgresosDe(req.query))));
app.post('/api/egresos', h((req) => uce.crearEgreso(reposEgresos, req.body)));
app.put('/api/egresos/:id', h((req) => uce.editarEgreso(reposEgresos, param(req, 'id'), req.body)));
app.delete('/api/egresos/:id', h((req) => uce.eliminarEgreso(reposEgresos, param(req, 'id'))));

// Comisiones (cálculo automático + liquidación idempotente)
app.get('/api/comisiones/liquidaciones', h(() => ucom.listarLiquidaciones(reposLiquidacion)));
app.get('/api/comisiones/:mes', h((req) => ucom.obtenerEstado(reposCierres, reposLiquidacion, param(req, 'mes'))));
app.post('/api/comisiones/liquidar/:mes', h((req) =>
  ucom.liquidarComisiones(reposCierres, reposEgresos, reposLiquidacion, param(req, 'mes'), { reemplazar: req.body?.reemplazar === true }),
));
app.delete('/api/comisiones/liquidar/:mes', h((req) => ucom.anularLiquidacion(reposEgresos, reposLiquidacion, param(req, 'mes'))));

app.get('/api/funnel/:mes', h((req) => ucf.obtenerFunnel(reposCierres, reposFunnelCanal, repos.funnel, param(req, 'mes'))));
app.put('/api/funnel/:mes', h((req) => ucf.guardarFunnelCanales(reposFunnelCanal, param(req, 'mes'), req.body)));

app.post('/api/cierre/:mes', h((req) => uc.cerrarMes(repos, param(req, 'mes'))));
app.delete('/api/cierre/:mes', h((req) => uc.reabrirMes(repos, param(req, 'mes'))));

app.post(
  '/api/importar',
  h((req) => {
    if (!Buffer.isBuffer(req.body)) throw new Error('Enviá el .xlsx como application/octet-stream.');
    return uc.importarExcel(repos, req.body);
  }),
);

// ───────────────────── Módulo "Cierres y Clientes" ─────────────────────
const filtrosCierresDe = (q: express.Request['query']): FiltrosCierres => ({
  mes: typeof q.mes === 'string' ? q.mes : undefined,
  programa: typeof q.programa === 'string' ? (q.programa as FiltrosCierres['programa']) : undefined,
  closer: typeof q.closer === 'string' ? q.closer : undefined,
  estado: typeof q.estado === 'string' ? (q.estado as FiltrosCierres['estado']) : undefined,
  q: typeof q.q === 'string' ? q.q : undefined,
  unidadNegocio: typeof q.unidad === 'string' ? q.unidad : undefined,
});

app.get('/api/cierres', h((req) => ucc.listarCierresConPagos(reposCierres, filtrosCierresDe(req.query))));
app.get('/api/cierres/resumen/:mes', h((req) => ucc.resumenDelMes(reposCierres, param(req, 'mes'), filtrosCierresDe(req.query))));
app.get('/api/cierres/:id', h((req) => ucc.obtenerCierre(reposCierres, param(req, 'id'))));
app.post('/api/cierres', h((req) => ucc.crearCierre(reposCierres, req.body)));
app.put('/api/cierres/:id', h((req) => ucc.editarCierre(reposCierres, param(req, 'id'), req.body)));
app.delete('/api/cierres/:id', h((req) => ucc.eliminarCierre(reposCierres, param(req, 'id'))));

app.post('/api/cierres/importar', h((req) => ucc.importarCierresPagos(reposCierres, req.body)));
app.delete('/api/cierres/:id/revisar', h((req) => ucc.quitarRevisar(reposCierres, param(req, 'id'))));

// Asistente IA (text-to-SQL de solo lectura). La pregunta se procesa async.
app.get('/api/asistente/estado', (_req, res) => res.json({ disponible: asistenteDisponible() }));
app.post('/api/asistente', (req, res) => {
  ucia
    .responderPregunta(req.body?.pregunta)
    .then((r) => res.json(r))
    .catch((e) => res.status(500).json({ disponible: true, ok: false, respuesta: e instanceof Error ? e.message : 'Error' }));
});

// Cobranza y morosidad (deriva del plan de cuotas + pagos reales)
app.get('/api/cobranza', h(() => ucob.obtenerCobranza(reposCierres)));
app.post('/api/cierres/:id/inactivar', h((req) => ucc.marcarInactivo(reposCierres, param(req, 'id'))));
app.delete('/api/cierres/:id/inactivar', h((req) => ucc.reactivar(reposCierres, param(req, 'id'))));

app.post('/api/pagos', h((req) => ucc.agregarPago(reposCierres, req.body)));
app.put('/api/pagos/:id', h((req) => ucc.editarPago(reposCierres, param(req, 'id'), req.body)));
app.delete('/api/pagos/:id', h((req) => ucc.eliminarPago(reposCierres, param(req, 'id'))));

// Reseteo seguro
app.delete('/api/cierres-demo', h(() => ucc.borrarDatosDemo(reposCierres)));
app.post('/api/cierres-reset', h((req) => ucc.reiniciarCierresYPagos(reposCierres, req.body)));

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`[+Activos API] escuchando en http://localhost:${PORT}`);
});
