/**
 * SERVER · Arranque: carga el .env, arma la infraestructura según DB_DRIVER,
 * asegura el ADMIN inicial y levanta la app (rutas + guardias en app.ts).
 *
 * - Desarrollo: Vite sirve la UI y proxea /api → :8787.
 * - Producción (NODE_ENV=production): este mismo proceso sirve el frontend
 *   compilado (dist/) Y la API, en el puerto que asigna Railway (PORT).
 */
import 'dotenv/config'; // carga .env (ANTHROPIC_API_KEY, DB_DRIVER, etc.) antes de todo
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { crearInfraestructura } from '../src/infrastructure/db/conexion';
import { asegurarAdminInicial, listarUsuarios } from '../src/application/auth/useCases';
import { crearApp } from './app';

const esProduccion = process.env.NODE_ENV === 'production';

const infra = await crearInfraestructura();

// ADMIN inicial: si la base no tiene usuarios y hay credenciales en el .env
// (ADMIN_EMAIL / ADMIN_PASSWORD), se crea una única vez. Idempotente.
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const creado = await asegurarAdminInicial(infra.reposAuth, adminEmail, adminPassword);
  if (creado) console.log(`[auth] ADMIN inicial creado: ${creado.email}`);
} else if ((await listarUsuarios(infra.reposAuth)).length === 0) {
  console.warn(
    '[auth] ⚠ No hay usuarios y faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno: nadie va a poder iniciar sesión.',
  );
}

// En producción servimos el build de Vite desde dist/ (mismo origen que la
// API → sin CORS, cookie Secure). Si falta el build, avisamos claro.
const dirEstaticos = resolve(process.cwd(), 'dist');
const sirveFrontend = esProduccion && existsSync(resolve(dirEstaticos, 'index.html'));
if (esProduccion && !sirveFrontend) {
  console.warn(`[web] ⚠ NODE_ENV=production pero no encontré ${dirEstaticos}/index.html. ¿Corriste "npm run build"?`);
}

const app = crearApp(infra, {
  cookieSegura: esProduccion, // HTTPS en Railway → cookie Secure
  dirEstaticos: sirveFrontend ? dirEstaticos : undefined,
});

// Detrás del proxy de Railway: confiar en X-Forwarded-* (IP real para el
// rate-limit, https para la cookie Secure).
if (esProduccion) app.set('trust proxy', 1);

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  const modo = sirveFrontend ? 'frontend + API' : 'solo API';
  console.log(`[+Activos] escuchando en http://localhost:${PORT} · ${modo} · base: ${infra.driver}`);
});
