# Cobranza Voicenter · Sudameris Seguros — Plataforma de Análisis
**Repo:** `cobranzasegurossuda` · **Deploy:** Render.com · **Marca:** Voicenter (cliente: Sudameris Seguros)

> Plataforma web monorepo de **un solo servicio**: recibe los 3 archivos mensuales (DXP + Boca + Cobrado 186), los procesa en background dentro del mismo proceso FastAPI y entrega los reportes interactivos en navegador.
>
> **Diseño minimalista:** sin Redis, sin worker separado, sin colas externas. Jobs en background con FastAPI BackgroundTasks + estado en Postgres.

---

## 1. Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2.0 async + asyncpg | Coherente con stack Chatia |
| **DB** | PostgreSQL gestionada en Render | Tabla por entidad + JSONB para snapshots de reporte |
| **Jobs / Background** | **FastAPI BackgroundTasks + asyncio + estado en Postgres** | Sin Redis, sin RQ, sin Celery. Más simple y sin infra extra. |
| **Frontend** | Next.js 16 + React 19 + TailwindCSS 3 + shadcn/ui | Coherente con stack Chatia |
| **Gráficos** | Recharts | Suficiente para los gráficos del MVP |
| **Procesamiento Excel** | openpyxl + xlrd + pandas | Mismas libs que ya usamos |
| **Auth** | JWT HS256 + bcrypt | Superadmin desde `.env`, viewers en DB |
| **Storage de archivos** | Render Disk persistente (10 GB) montado en `/var/data/uploads` | Versionado de uploads |
| **Cifrado** | bcrypt passwords | |
| **Deploy** | Render.com — **Dockerfile multi-stage, single container, un único servicio web** | Backend + Frontend + Job runner en el mismo proceso |
| **Logs/auditoría** | Tabla `audit_log` con todas las acciones | Trazabilidad de cada query / upload / login |

### Decisión clave: jobs sin Redis

En lugar de un broker externo, se usa el patrón **"job state en DB + worker in-process"**:

1. POST `/uploads` guarda archivos en disco, crea `upload` row con `status='pending'`.
2. Antes de responder, lanza `BackgroundTasks.add_task(process_upload, upload_id)`.
3. La función `process_upload` corre en el mismo proceso FastAPI **después** de devolver la respuesta HTTP.
4. La función actualiza `upload.status` en cada paso: `pending → processing → completed | failed`.
5. **Recuperación en reinicio:** al arrancar la app, un hook `startup` busca todos los uploads con `status='processing'` y los **re-encola** (los marca como pending y los procesa).
6. El frontend hace polling a `GET /uploads/{id}` para conocer el estado.

**Ventajas:**
- Cero infra adicional (sin Redis = $10/mes menos en Render + 1 servicio menos).
- Un solo deploy, un solo container, una sola fuente de truth (Postgres).
- Suficiente para el volumen real (1-2 uploads/mes, procesamiento ~30s).

**Limitaciones aceptables:**
- Si el server se cae mientras procesa, el job se re-ejecuta al boot (idempotencia gracias al hash SHA-256).
- No hay paralelismo masivo, pero no se necesita.

---

## 2. Estructura del Monorepo

```
cobranzasegurossuda/
├── README.md
├── PLAN.md                        ← este documento
├── .env.example
├── .gitignore
├── Dockerfile                     ← multi-stage (Node 20 + Python 3.12)
├── docker-compose.yml             ← dev local (solo Postgres + app)
├── start.sh                       ← lanza uvicorn + next en mismo container
├── render.yaml                    ← blueprint Render (1 web service + 1 DB)
│
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py                ← FastAPI app + lifespan startup hook
│   │   ├── core/
│   │   │   ├── config.py          ← Settings desde .env
│   │   │   ├── security.py        ← JWT, bcrypt, dependencies
│   │   │   ├── logging.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── upload.py          ← incluye status + retry_count + last_error
│   │   │   ├── report.py
│   │   │   └── audit.py
│   │   ├── schemas/               ← Pydantic v2
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── users.py
│   │   │   │   ├── uploads.py     ← POST encola job in-process
│   │   │   │   └── reports.py
│   │   │   └── deps.py
│   │   ├── services/
│   │   │   ├── parsers/
│   │   │   │   ├── dxp_parser.py
│   │   │   │   ├── boca_parser.py
│   │   │   │   └── cobrado_parser.py
│   │   │   ├── analyzers/
│   │   │   │   ├── cartera.py
│   │   │   │   ├── recupero.py
│   │   │   │   └── proyeccion.py
│   │   │   ├── matchers/
│   │   │   │   └── policy_matcher.py
│   │   │   └── audit_service.py
│   │   ├── jobs/
│   │   │   ├── runner.py          ← process_upload(upload_id)
│   │   │   └── recovery.py        ← resume_pending_jobs() al boot
│   │   └── utils/
│   ├── tests/
│   └── requirements.txt
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js         ← brand tokens Voicenter
│   ├── public/
│   │   ├── logo-voicenter-color.png
│   │   └── favicon.ico
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── (auth)/login/page.tsx
│   │   │   ├── (app)/
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── upload/page.tsx
│   │   │   │   ├── reports/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   └── admin/users/page.tsx
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   │   ├── CarteraDonut.tsx
│   │   │   │   ├── TramosBarChart.tsx
│   │   │   │   ├── TopDeudoresTable.tsx
│   │   │   │   ├── RecuperoFunnel.tsx
│   │   │   │   └── OrganizadorBars.tsx
│   │   │   ├── upload/UploadDropzone.tsx
│   │   │   └── ui/                ← shadcn
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── format.ts
│   │   └── styles/globals.css
│   └── tsconfig.json
│
└── docs/
    ├── architecture.md
    ├── deployment-render.md
    └── brand-guidelines.md
```

---

## 3. Modelo de Datos (PostgreSQL)

```sql
users (
  id UUID PK, email TEXT UNIQUE, hashed_password TEXT,
  role TEXT CHECK (role IN ('superadmin','viewer')),
  full_name TEXT, is_active BOOL DEFAULT true,
  created_at TIMESTAMP, created_by UUID FK users(id)
)

uploads (
  id UUID PK, uploaded_by UUID FK users(id),
  period_month DATE,
  dxp_filename TEXT, dxp_path TEXT, dxp_sha256 TEXT,
  boca_filename TEXT, boca_path TEXT, boca_sha256 TEXT,
  cobrado_filename TEXT, cobrado_path TEXT, cobrado_sha256 TEXT,
  status TEXT CHECK (status IN ('pending','processing','completed','failed')),
  retry_count INT DEFAULT 0,
  last_error TEXT,
  uploaded_at TIMESTAMP, started_at TIMESTAMP, completed_at TIMESTAMP
)

reports (
  id UUID PK, upload_id UUID FK uploads(id),
  period_month DATE, generated_at TIMESTAMP,
  asegurados_total INT, polizas_total INT,
  saldo_total NUMERIC(18,2),
  vencido_total NUMERIC(18,2),
  asegurados_en_mora INT,
  recupero_total NUMERIC(18,2),
  recupero_sobre_mora NUMERIC(18,2),
  asegurados_pagaron INT,
  data JSONB
)

audit_log (
  id BIGSERIAL PK, user_id UUID FK users(id),
  action TEXT, resource_type TEXT, resource_id TEXT,
  ip_address INET, user_agent TEXT,
  metadata JSONB,
  occurred_at TIMESTAMP DEFAULT now()
)
```

---

## 4. Flujo de Jobs sin Redis (detalle técnico)

### 4.1 POST /uploads (request síncrono)

```python
@router.post("/uploads")
async def create_upload(
    background_tasks: BackgroundTasks,
    dxp: UploadFile, boca: UploadFile, cobrado: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Validar columnas mínimas
    await validate_excel_schema(dxp, "DXP")
    await validate_excel_schema(boca, "BOCA")
    await validate_excel_schema(cobrado, "COBRADO")

    # 2. Guardar archivos en disco con SHA-256
    paths = await save_files_with_hash(dxp, boca, cobrado)

    # 3. Crear row con status=pending
    upload = Upload(
        uploaded_by=user.id,
        status='pending',
        **paths
    )
    db.add(upload); await db.commit()

    # 4. Encolar background task in-process
    background_tasks.add_task(process_upload, upload.id)

    return {"upload_id": upload.id, "status": "pending"}
```

### 4.2 process_upload (in-process worker)

```python
async def process_upload(upload_id: UUID):
    async with AsyncSessionLocal() as db:
        upload = await db.get(Upload, upload_id)
        upload.status = 'processing'
        upload.started_at = datetime.utcnow()
        await db.commit()

        try:
            dxp_data = parse_dxp(upload.dxp_path)
            boca_data = parse_boca(upload.boca_path)
            cobrado_data = parse_cobrado(upload.cobrado_path)

            cartera = analyze_cartera(dxp_data)
            recupero = analyze_recupero(dxp_data, boca_data, cobrado_data)
            proyeccion = project_recupero(recupero)

            report = Report(
                upload_id=upload.id,
                period_month=upload.period_month,
                **cartera.kpis(),
                **recupero.kpis(),
                data={
                    'cartera': cartera.full(),
                    'recupero': recupero.full(),
                    'proyeccion': proyeccion.full(),
                }
            )
            db.add(report)
            upload.status = 'completed'
            upload.completed_at = datetime.utcnow()
            await db.commit()
            await audit_log(db, user_id=upload.uploaded_by, action='upload_processed', resource_id=str(upload.id))
        except Exception as e:
            upload.status = 'failed'
            upload.last_error = str(e)[:500]
            upload.retry_count += 1
            await db.commit()
            logger.exception(f"Upload {upload_id} failed")
```

### 4.3 Recovery al boot (lifespan hook)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Al arrancar, recuperar jobs que quedaron en 'processing'
    async with AsyncSessionLocal() as db:
        stuck = await db.execute(
            select(Upload).where(Upload.status == 'processing')
        )
        for upload in stuck.scalars():
            upload.status = 'pending'
            logger.info(f"Recovering stuck upload {upload.id}")
            asyncio.create_task(process_upload(upload.id))
        await db.commit()
    yield
    # cleanup si hace falta

app = FastAPI(lifespan=lifespan)
```

### 4.4 Polling de estado desde frontend

Frontend hace `GET /api/v1/uploads/{id}` cada 3 segundos hasta que `status in ('completed','failed')`, luego redirige a `/reports/{report_id}`.

---

## 5. Variables de Entorno (.env)

```dotenv
# Core
ENV=production
SECRET_KEY=<random 64 chars>
DATABASE_URL=postgresql+asyncpg://...

# Superadmin (SIEMPRE desde .env, nunca en DB)
SUPERADMIN_EMAIL=admin@voicenter.com.py
SUPERADMIN_PASSWORD_HASH=<bcrypt hash>
SUPERADMIN_NAME=Administrador Voicenter

# JWT
JWT_ALGORITHM=HS256
JWT_ACCESS_EXPIRE_MINUTES=60
JWT_REFRESH_EXPIRE_DAYS=7

# Storage
UPLOAD_DIR=/var/data/uploads
MAX_UPLOAD_SIZE_MB=20

# Logs
LOG_LEVEL=INFO
AUDIT_RETENTION_DAYS=365

# CORS (mismo dominio, sólo por seguridad extra)
CORS_ORIGINS=https://cobranzasegurossuda.onrender.com

# Branding
BRAND_PRIMARY_COLOR=#<voicenter color del manual>
BRAND_LOGO_PATH=/logo-voicenter-color.png
```

---

## 6. Endpoints REST (MVP)

| Método | Path | Auth | Descripción |
|---|---|---|---|
| POST | `/api/v1/auth/login` | público | email + password → JWT |
| POST | `/api/v1/auth/refresh` | JWT refresh | nuevo access token |
| GET | `/api/v1/auth/me` | JWT | datos del usuario actual |
| POST | `/api/v1/uploads` | JWT | sube los 3 archivos, encola background |
| GET | `/api/v1/uploads` | JWT | listado por mes |
| GET | `/api/v1/uploads/{id}` | JWT | detalle + status (polling) |
| GET | `/api/v1/reports` | JWT | listado de reportes |
| GET | `/api/v1/reports/{id}` | JWT | reporte completo |
| GET | `/api/v1/reports/{id}/cartera` | JWT | datos cartera |
| GET | `/api/v1/reports/{id}/recupero` | JWT | datos recupero |
| POST | `/api/v1/users` | JWT superadmin | crea viewer |
| GET | `/api/v1/users` | JWT superadmin | lista usuarios |
| PATCH | `/api/v1/users/{id}` | JWT superadmin | activar/desactivar |
| GET | `/api/v1/audit` | JWT superadmin | log de auditoría |

---

## 7. Gráficos del MVP (orden de prioridad)

> Los **5 más importantes** según el análisis ya validado. El resto se agrega después.

| # | Gráfico | Datos | Tipo |
|---|---|---|---|
| 1 | **Cartera vs Vencido** | Saldo total dividido en A vencer y Vencido | Donut grande con KPI cards al lado |
| 2 | **Distribución del vencido por tramo** | 6 tramos (0-30, 30-60, ..., >150) | Pirámide horizontal |
| 3 | **Top 10 deudores en mora** | Ranking por monto vencido | Barras horizontales + tabla |
| 4 | **Recupero del mes** | Funnel: vencido → recuperado total → recupero sobre mora | Funnel vertical |
| 5 | **Recupero por organizador** | Top 10 organizadores | Barras agrupadas |

Componentes Recharts:
- `<CarteraDonut data={...} />`
- `<TramosBarChart data={...} />`
- `<TopDeudoresTable data={...} top={10} />`
- `<RecuperoFunnel data={...} />`
- `<OrganizadorBars data={...} top={10} />`

---

## 8. Branding (manual Voicenter)

Pendiente extraer del PDF `Manual de marcas Voicenter (1).pdf`:
- Paleta de colores (primario, secundario, neutros)
- Tipografías (heading + body)
- Espaciado y radios
- Usos del logo

Se cargan en `frontend/tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      brand: {
        primary: 'var(--vc-primary)',
        secondary: 'var(--vc-secondary)',
        accent: 'var(--vc-accent)',
        neutral: { 50, 100, ..., 900 }
      }
    },
    fontFamily: {
      heading: ['<font heading>', 'sans-serif'],
      body: ['<font body>', 'sans-serif']
    }
  }
}
```

Logo `Logo Voicenter_Color.png` → `frontend/public/logo-voicenter-color.png`. Header: "Cobranzas Sudameris Seguros" + footer "Operado por Voicenter S.A.".

---

## 9. Deploy en Render — UN SOLO SERVICIO

### 9.1 Servicios contratados
- **1 Web service** (Docker): backend + frontend + jobs en el mismo proceso.
- **1 PostgreSQL** gestionado (Starter $7/mes).
- **1 Persistent disk** (10 GB) montado en `/var/data` para uploads.

**Total infra:** 1 servicio web + 1 DB + 1 disk. **Sin Redis, sin worker separado.**

### 9.2 render.yaml (blueprint mínimo)

```yaml
databases:
  - name: cobranzasegurossuda-db
    plan: starter
    region: oregon

services:
  - type: web
    name: cobranzasegurossuda
    runtime: docker
    plan: starter
    region: oregon
    autoDeploy: true
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: cobranzasegurossuda-db
          property: connectionString
      - key: SECRET_KEY
        generateValue: true
      - key: SUPERADMIN_EMAIL
        sync: false
      - key: SUPERADMIN_PASSWORD_HASH
        sync: false
      - key: SUPERADMIN_NAME
        value: Administrador Voicenter
      - key: UPLOAD_DIR
        value: /var/data/uploads
      - key: ENV
        value: production
    disk:
      name: uploads
      mountPath: /var/data
      sizeGB: 10
```

### 9.3 Dockerfile multi-stage (un solo container)

```dockerfile
# === Stage 1: build frontend ===
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# === Stage 2: runtime (Python + Node) ===
FROM python:3.12-slim
WORKDIR /app

# Instalar Node 20 para el runtime de Next
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./

# Frontend build artifacts
COPY --from=frontend-builder /app/frontend/.next /app/frontend/.next
COPY --from=frontend-builder /app/frontend/public /app/frontend/public
COPY --from=frontend-builder /app/frontend/package.json /app/frontend/
COPY --from=frontend-builder /app/frontend/node_modules /app/frontend/node_modules

COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 8080
CMD ["./start.sh"]
```

### 9.4 start.sh — un solo proceso con backend interno + Next público

```bash
#!/bin/sh
set -e
# Backend FastAPI en puerto interno 8000 (jobs corren acá también)
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
# Next.js en el puerto que Render asigna ($PORT)
cd frontend && PORT=${PORT:-8080} npm start
```

Next reescribe `/api/*` → `http://localhost:8000/api/*` vía `next.config.js`:

```js
async rewrites() {
  return [{ source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' }];
}
```

---

## 10. Roadmap de Implementación (sprints)

### Sprint 1 (semana 1) — Foundation
- [ ] Crear repo `cobranzasegurossuda` en GitHub
- [ ] Estructura monorepo + Dockerfile + start.sh + render.yaml
- [ ] Postgres local con docker-compose (solo Postgres + app)
- [ ] Modelo `User` + auth JWT + bootstrap superadmin desde `.env`
- [ ] Frontend login + layout con logo Voicenter
- [ ] Deploy inicial a Render (DB + web)

### Sprint 2 (semana 2) — Parsers + Jobs in-process
- [ ] Mover scripts a `services/parsers/*` y `services/analyzers/*`
- [ ] Tests con fixtures de los Excel reales
- [ ] Endpoint `POST /api/v1/uploads` + `BackgroundTasks`
- [ ] `process_upload` async + persistencia `report`
- [ ] Lifespan hook de recovery (resume pending jobs en boot)

### Sprint 3 (semana 3) — Dashboard MVP
- [ ] Frontend `/upload` con dropzone validador
- [ ] Frontend `/reports` listado
- [ ] Frontend `/reports/{id}` con los 5 gráficos prioritarios
- [ ] Polling de `/uploads/{id}` cada 3s

### Sprint 4 (semana 4) — Multi-usuario + Auditoría
- [ ] Frontend `/admin/users` (CRUD viewers)
- [ ] `audit_log` capturando todas las acciones
- [ ] Frontend `/admin/audit` (solo superadmin)
- [ ] Hardening: rate limit en login, CSRF, refresh tokens
- [ ] Documentación final

### Posteriores
- Reporte operativo (cuando estabilicen el formato de `Reporte Cobranzas`)
- Comparativo mes-a-mes
- Export PDF
- Notificaciones por email

---

## 11. Seguridad y Cumplimiento

- **Login obligatorio** — sin rutas públicas excepto `/login`.
- **JWT con expiración corta** (60 min) + refresh tokens (7 días).
- **Passwords con bcrypt** (cost 12).
- **Superadmin sólo en `.env`** — nunca persiste en DB.
- **HTTPS forzado** por Render.
- **Headers de seguridad**: CSP, X-Frame-Options DENY, HSTS.
- **Archivos subidos guardados con SHA-256** para integridad e idempotencia.
- **Audit log inmutable** (sin DELETE permitido a nivel app).
- **CORS estricto** al dominio Render.
- **Sin datos reales en repo** — los Excel viven en el disco persistente.

---

## 12. Mantenimiento

- **Backups Postgres diarios** (Render automático).
- **Logs centralizados** en Render Dashboard.
- **Monitoring de jobs**: alerta si un upload queda en `processing` > 10 min (cronjob simple que revisa DB).
- **Versionado de schema**: migraciones idempotentes (`CREATE TABLE IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS`). **No** Alembic.

---

## 13. Próximos Pasos Operativos

1. ✅ Crear carpeta `cobranzasegurossuda/` (hecho).
2. Confirmar plan simplificado.
3. Extraer del manual de marca Voicenter: colores hex + tipografías.
4. Subir repo a GitHub (`alemart87`).
5. Crear blueprint en Render conectado al repo.
6. Provisionar Postgres + Disk en Render (sin Redis).
7. Bootstrap superadmin: generar `SUPERADMIN_PASSWORD_HASH` con bcrypt.
8. Iniciar Sprint 1.

---

## Resumen de la simplificación

| Antes (con Redis) | Ahora (sin Redis) |
|---|---|
| 2 servicios Render (web + worker) | **1 servicio web** |
| Redis gestionado ($10/mes) | — eliminado |
| RQ / Celery como broker | **FastAPI BackgroundTasks** |
| Persistencia de jobs en Redis | **Persistencia en Postgres (`uploads.status`)** |
| Recovery requiere monitoring externo | **Lifespan hook** al boot re-encola pendientes |
| 3 plans Render | **1 plan + 1 DB + 1 disk** |
| Costo aprox $24/mes | **~$14/mes** |

*Plan actualizado el 2026-05-20.*
