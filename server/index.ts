/**
 * SERVER · Arranque: carga el .env, arma la infraestructura según DB_DRIVER,
 * asegura el ADMIN inicial y levanta la app (rutas + guardias en app.ts).
 * Vite proxea /api → :8787 en desarrollo.
 */
import 'dotenv/config'; // carga .env (ANTHROPIC_API_KEY, DB_DRIVER, etc.) antes de todo
import { crearInfraestructura } from '../src/infrastructure/db/conexion';
import { asegurarAdminInicial, listarUsuarios } from '../src/application/auth/useCases';
import { crearApp } from './app';

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
    '[auth] ⚠ No hay usuarios y faltan ADMIN_EMAIL / ADMIN_PASSWORD en el .env: nadie va a poder iniciar sesión.',
  );
}

const app = crearApp(infra);

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`[+Activos API] escuchando en http://localhost:${PORT} (base de datos: ${infra.driver})`);
});
