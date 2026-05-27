# Deploy en Render — paso a paso

Patrón **manual** (igual que Chatia): se crea primero la base de datos en el dashboard de Render, se copia su `Internal Database URL` y se pega como envvar al crear el web service. Más transparente y permite validar la DB antes de arrancar la app.

---

## Paso 1 · Crear la Base de Datos PostgreSQL

1. Entrar a **Render Dashboard** → `New +` → **PostgreSQL**.
2. Configurar:
   - **Name:** `cobranzasegurossuda-db`
   - **Database:** `cobranzasegurossuda`
   - **User:** `cobranzasegurossuda_user` (default)
   - **Region:** `oregon` (importante: la misma región que tendrá el web service)
   - **Plan:** `Starter` ($7/mes) o `Free` para pruebas
   - **PostgreSQL Version:** 16 (default)
3. **Create Database** y esperar a estado `Available`.
4. En la página de la DB, ir a sección **Connections** y copiar:
   - **Internal Database URL** ← este es el que vamos a usar (formato: `postgresql://user:pass@host/db`)

> ⚠️ Usar **Internal Database URL** (no External). El web service en la misma región se conectará por red interna sin costo de egress.
>
> ℹ️ El backend convierte automáticamente `postgresql://` → `postgresql+asyncpg://` y remueve `?sslmode=require` para que asyncpg lo entienda.

---

## Paso 2 · Generar el hash del superadmin

En local, con Python:

```bash
cd backend
../.venv/Scripts/python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('TuPassword123!'))"
```

Esto imprime algo como `$2b$12$...` — copiar para el paso 3.

También generar el secret key:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Paso 3 · Crear el Web Service

1. Render Dashboard → `New +` → **Web Service**.
2. Conectar repositorio GitHub: `alemart87/cobranzasuda`.
3. Configurar:
   - **Name:** `cobranzasegurossuda`
   - **Region:** `oregon` (misma que la DB)
   - **Branch:** `main`
   - **Runtime:** `Docker` (autodetecta el `Dockerfile`)
   - **Plan:** `Starter` ($7/mes mínimo)
   - **Auto-Deploy:** `Yes`
   - **Health Check Path:** `/health`

4. En **Advanced**, agregar **Disk**:
   - **Name:** `uploads`
   - **Mount Path:** `/var/data`
   - **Size:** `10 GB`

5. **Environment Variables** (todas obligatorias salvo aclaración):

   | Key | Value | Notas |
   |---|---|---|
   | `DATABASE_URL` | *(pegar Internal Database URL del paso 1)* | secret |
   | `SECRET_KEY` | *(generado en paso 2)* | secret |
   | `SUPERADMIN_EMAIL` | `admin@voicenter.com.py` | |
   | `SUPERADMIN_PASSWORD_HASH` | *(bcrypt del paso 2)* | secret |
   | `SUPERADMIN_NAME` | `Administrador Voicenter` | |
   | `ENV` | `production` | |
   | `UPLOAD_DIR` | `/var/data/uploads` | |
   | `BACKEND_URL` | `http://127.0.0.1:8000` | |
   | `JWT_ALGORITHM` | `HS256` | |
   | `JWT_ACCESS_EXPIRE_MINUTES` | `60` | |
   | `JWT_REFRESH_EXPIRE_DAYS` | `7` | |
   | `MAX_UPLOAD_SIZE_MB` | `20` | |
   | `LOG_LEVEL` | `INFO` | |
   | `BRAND_PRIMARY_COLOR` | `#0066B3` | |
   | `CORS_ORIGINS` | `https://cobranzasegurossuda.onrender.com` | después del primer deploy, actualizar con el dominio real |

6. **Create Web Service** → Render arranca el build de Docker.

---

## Paso 4 · Validar el deploy

1. Esperar al build (5-10 min la primera vez por Docker multi-stage).
2. Una vez `Live`, abrir el dominio asignado (ej. `https://cobranzasegurossuda.onrender.com`).
3. Verificar:
   - `GET /health` → `{"status":"ok","env":"production"}`
   - Frontend en `/` redirige a `/login`
   - Login con `SUPERADMIN_EMAIL` + password del paso 2 → entra al dashboard
4. En `/admin/users`, crear el primer viewer para Sudameris Seguros.
5. En `/upload`, subir los 3 archivos del mes y verificar el procesamiento.

---

## Paso 5 (opcional) · Usar render.yaml como Blueprint

Alternativa al flujo manual: el `render.yaml` del repo está preparado para deploy declarativo:

1. Render Dashboard → `New +` → **Blueprint**.
2. Conectar `alemart87/cobranzasuda` → autodetecta `render.yaml`.
3. Render crea automáticamente el web service + disk.
4. **NOTA:** la base de datos sigue siendo manual — el blueprint omite `databases:` a propósito para mantener el patrón Chatia.
5. Después del blueprint deploy, agregar env vars secretos: `DATABASE_URL`, `SECRET_KEY`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_HASH`.

---

## Costos mensuales estimados (Render)

| Recurso | Plan | Costo |
|---|---|---:|
| Web Service Starter | 0.5 CPU, 512 MB RAM | $7 |
| PostgreSQL Starter | 1 GB storage, shared | $7 |
| Persistent Disk | 10 GB | $0.25 × 10 = $2.50 |
| **Total** | | **~$16.50/mes** |

(Sin Redis = ahorro de $10/mes vs setup con cola externa.)

---

## Troubleshooting

**"Connection refused" en el frontend al hacer fetch a /api/v1/...**
- Verificar que `BACKEND_URL=http://127.0.0.1:8000` está seteado.
- Verificar que `start.sh` arranca ambos procesos (`docker logs`).

**"could not translate host name" en logs de la DB**
- Pegaste la *External* URL en lugar de la *Internal*. Cambiar a Internal.

**"asyncpg requires SSL" o similar**
- Revisar el log al boot del backend: la normalización de `database_url` quita `?sslmode=require` automáticamente, pero si Render cambia el formato puede fallar.
- Solución: setear `DATABASE_URL` removiendo manualmente cualquier query string `?...`.

**"Permission denied" al guardar uploads**
- Verificar que el Disk está montado en `/var/data` y `UPLOAD_DIR=/var/data/uploads`.

**Build de Docker timeout**
- El Starter plan tiene 90 min de build. Si tarda más, considerar pre-construir y subir imagen a Render Registry.
