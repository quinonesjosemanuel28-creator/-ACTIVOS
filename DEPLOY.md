# Deploy en Railway — Guía de la Fase 5.5

Checklist para la sesión de deploy. Todo el código ya está listo (Fases
5.1–5.4): este documento es **ejecución**, no desarrollo. Tiempo estimado:
30–45 minutos.

## Flujo de ramas (recordatorio)

```
desarrollo  → rama de desarrollo (NO se despliega)
produccion  → Railway despliega SOLO esta rama
```

El paso 0 de la sesión será promover el estado aprobado a `produccion`
(merge explícito). Después, cada subida a producción es un merge deliberado.

---

## Paso 0 — Promover a `produccion` (lo hace Claude cuando lo pidas)

```bash
git checkout produccion
git merge desarrollo
npm test                      # 349 verdes también acá
git push -u origin produccion
```

## Paso 1 — Cuenta y proyecto en Railway (vos, en el navegador)

1. [railway.app](https://railway.app) → **Login with GitHub** (queda conectado al repo).
2. Plan **Hobby** (USD 5/mes con USD 5 de uso incluido; esta app + un PG
   chico suelen quedar en USD 5–15/mes — lo ves en vivo en *Usage*).
3. **New Project → Deploy from GitHub repo** → elegí el repo del dashboard.
4. En el servicio creado: **Settings → Source → Branch: `produccion`** ←
   ¡el paso más importante! (si no, desplegaría la rama default).
5. El `railway.json` del repo ya define build (`npm run build`), start
   (`npm start`), healthcheck (`/api/health`) y reintentos. Railway lo lee solo.

## Paso 2 — Base PostgreSQL

1. En el mismo proyecto: **+ New → Database → PostgreSQL**.
2. No hace falta crear tablas: el server corre las migraciones al arrancar.

## Paso 3 — Variables del servicio Node (Settings → Variables)

| Variable | Valor |
|---|---|
| `DB_DRIVER` | `postgres` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio PG) |
| `ANTHROPIC_API_KEY` | tu clave (pegala en el panel, jamás en el repo) |
| `ASISTENTE_MODELO` | `claude-haiku-4-5` (opcional) |
| `ADMIN_EMAIL` | tu email (crea tu ADMIN la primera vez) |
| `ADMIN_PASSWORD` | contraseña inicial (≥8, letras y números; cambiala al entrar) |

Notas:
- `PORT` lo inyecta Railway; `NODE_ENV=production` lo setea `npm start`.
- Red interna Railway→PG no necesita `PGSSL` (la referencia usa la URL interna).
- Tras el primer login, **cambiá la contraseña desde la app** y podés borrar
  `ADMIN_PASSWORD` del panel (el bootstrap es idempotente: ya no hace nada).

## Paso 4 — Primer deploy

1. Deploy automático al guardar variables (o **Deploy** manual).
2. En *Deployments* → logs: esperar
   `[+Activos] escuchando … · frontend + API · base: postgres`.
3. **Settings → Networking → Generate Domain** → URL `https://….up.railway.app`.
4. Abrir la URL → tiene que aparecer **el login**. Entrar con `ADMIN_EMAIL` /
   `ADMIN_PASSWORD`. (La base está vacía: es lo esperado.)

## Paso 5 — Migrar tus datos reales (desde tu Mac)

La URL **pública** de la base está en el servicio Postgres → *Connect* →
"Public Network" (`…proxy.rlwy.net:PUERTO/railway`).

```bash
# 1. Copiar (lee tu SQLite local, NO la modifica; idempotente)
#    ⚠ VACÍA las tablas contables destino antes de copiar. Solo para el pasaje
#    inicial — hoy Postgres es la fuente de verdad. (Antes se llamaba db:migrar.)
PGSSL=true DATABASE_URL="postgresql://…proxy.rlwy.net:PUERTO/railway" npm run db:sembrar-desde-sqlite

# 2. Validar contra la nube: la misma vara que usaste en local
PGSSL=true DATABASE_URL="postgresql://…proxy.rlwy.net:PUERTO/railway" npm run db:validar
#    → tiene que decir "✔ IDÉNTICOS"
```

Reversible siempre: tu SQLite y tu Postgres local quedan intactos como
respaldo completo; si algo sale mal se vacía la base de Railway y se vuelve
a copiar.

## Paso 6 — Usuarios del equipo

Desde la vista **Usuarios** (logueado como ADMIN): creá los EDITORes y
LECTORes. A cada uno pasale su contraseña temporal por un canal seguro; al
primer ingreso el sistema les exige elegir la propia.

## Paso 7 — Backups

1. **Plataforma**: servicio Postgres → pestaña *Backups* → activar/verificar
   los backups automáticos y su retención (según plan).
2. **Backup automático nocturno con ensayo de restauración** (GitHub Actions,
   `.github/workflows/backup.yml`). Configurarlo una sola vez:
   - En GitHub: repo → *Settings → Secrets and variables → Actions* →
     *New repository secret* → nombre `BACKUP_DATABASE_URL`, valor la URL
     **pública** de Postgres de Railway
     (`postgresql://postgres:CLAVE@xxxx.proxy.rlwy.net:PUERTO/railway`).
   - Probarlo en el momento: pestaña *Actions* → *Backup de producción* →
     *Run workflow*. Verde = backup hecho **y restauración ensayada**.

   Cada noche (03:00 AR) el workflow hace `pg_dump` de producción, **restaura
   ese mismo dump en un Postgres descartable**, corre las migraciones encima
   y compara fila por tabla contra lo que el dump declara. Si algo no cierra,
   el workflow falla y GitHub avisa por mail: un backup irrestaurable se
   detecta esa noche, no el día del desastre. El `.sql` queda como *artifact*
   del run (pestaña Actions → el run → Artifacts), con 30 días de retención.
3. **Tu copia local** (fuera de Railway y de GitHub, recomendado antes de
   cada import grande):
   ```bash
   DATABASE_URL="postgresql://…proxy.rlwy.net:PUERTO/railway" npm run db:backup
   # → backups/activos-FECHA.sql
   ```
   Tu `pg_dump` tiene que ser **≥ que el servidor** o se niega a volcar.
   Railway corre PostgreSQL 18: `brew install postgresql@18` y, si tenés
   varias, poné la 18 primero en el PATH
   (`export PATH="$(brew --prefix postgresql@18)/bin:$PATH"`).
   Verificalo con `pg_dump --version`.
4. **Restaurar de verdad** (desastre o mudanza): apuntar `DATABASE_URL` a la
   base destino **vacía** y correr
   ```bash
   npm run db:restaurar -- backups/activos-FECHA.sql
   ```
   El script se niega si la base destino tiene tablas (`--pisar` la vacía
   primero — es la maniobra de "se vacía la base y se vuelve a copiar" de
   arriba, ahora automatizada y con verificación al final).

## Paso 8 — Verificación final (checklist)

- [ ] La URL pública muestra el login (y `/api/meses` sin sesión da 401).
- [ ] Login ADMIN funciona y el dashboard muestra **tus números reales**
      (compará 2–3 KPIs contra tu local).
- [ ] Un EDITOR puede cargar un pago; un LECTOR no ve botones de edición.
- [ ] El Asistente IA responde (la API key quedó bien cargada).
- [ ] `db:backup` corrió y tenés el `.sql` en tu Mac.
- [ ] El secreto `BACKUP_DATABASE_URL` está cargado y el workflow *Backup de
      producción* corrió en verde al menos una vez (Actions → Run workflow).
- [ ] (Opcional) Dominio propio: Settings → Networking → Custom Domain.

## Operatoria posterior

- **Subir cambios a producción**: pedirle a Claude el merge
  `desarrollo → produccion` + push. Railway redespliega solo.
- **Experimentar sin riesgo**: todo lo que pase en `desarrollo` no llega
  a la nube hasta ese merge.
- **Rescate de contraseña del ADMIN**: si te quedás afuera, en Railway →
  Variables seteá de nuevo `ADMIN_PASSWORD`… solo sirve si la base no tiene
  usuarios; el camino real es: otro ADMIN te resetea, o (último recurso)
  conectarse con `psql` a la base y borrar tu fila de `usuarios` para que el
  bootstrap te recree (pedile el comando exacto a Claude llegado el caso).
