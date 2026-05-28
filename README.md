# Cobranzas Voicenter · Sudameris Seguros

Plataforma web monorepo para análisis mensual de cobranzas y operativo de contact center. Procesa archivos Excel (DXP, Boca de Cobranzas, Cobrado 186, Reporte de Llamadas) y entrega dashboards corporativos con KPIs, tramos de mora, top deudores, recupero efectivo, proyecciones y métricas operativas de llamadas.

**Diseño:** identidad visual oficial Voicenter (Manual de Identidad Visual, paleta Pantone + tipografías DIN / Gilroy).

---

## ✨ Funcionalidades principales

### Módulos de reportes independientes
| Módulo | Archivos | Output |
|---|---|---|
| **Cobranzas (DXP)** | DXP + Boca + Cobrado 186 (3 xlsx) | KPIs cartera, tramos, top 10 deudores, recupero total, proyección al cierre, ranking organizadores |
| **Llamadas** | Reporte Cobranzas con hoja `Bsse de llamadas` (xlsx/xls) | Total equipo, talk time, AHT, llamadas por día por asesor, detalle por operador |
| **Gestiones** | Reporte_Gestiones xlsx | Funnel CRM, % contactos efectivos, promesas, cumplimiento, ranking por asesor + por campaña |
| **Bases Adicionales** | `BASE A GESTIONAR - COBRADOR BANCA.xlsx` y `BASE A GESTIONAR - COBRADOR BANCARD.xlsx` | KPIs por base (pólizas, asegurados, saldo, tramos, top 20). NO recibe pagos; las pólizas se guardan para futuro cruce con gestiones |
| **Carteras Totales** | (vista agregada — sin upload propio) | Consolidación gerencial DXP + Débitos Automáticos + Bancard lado a lado, totales, comparativa por tramo |

### Sistema de roles
| Rol | Origen | Permisos |
|---|---|---|
| **Superadmin** | `.env` (no en DB) | Todo + crear/editar/desactivar usuarios + resetear contraseñas + subir fotos + auditoría completa + analytics de uso |
| **Analista** | DB | Subir archivos, publicar/despublicar reportes, eliminar reportes, ver todo |
| **Cliente** | DB | **Solo ver reportes publicados.** No puede cargar archivos ni ver borradores |

### Flujo de publicación
- Reportes nacen como **borrador** después del procesamiento.
- **Analistas** los marcan como publicados (botón "Publicar" en la lista).
- **Clientes** solo ven los publicados.
- Analistas pueden eliminar reportes desde la lista.

### Auditoría y analytics de uso
- Todo evento (login, vista de reporte, upload, cambio de rol, etc.) queda en `audit_log`.
- Superadmin ve:
  - Serie temporal de actividad por rol (gráfico apilado)
  - Tendencia general de eventos
  - Ranking de usuarios con permanencia promedio por sesión
  - Top de acciones más frecuentes
  - Filtros por rango de días (7/30/90)

### Personalización
- Cada usuario puede tener **foto de perfil** (PNG/JPEG/WEBP hasta 5 MB)
- Logo Voicenter aplicado según manual de marca (área de seguridad, colores institucionales)

---

## 🎨 Identidad visual aplicada

Tomada directamente del **Manual de Identidad Visual Voicenter** (paleta cromática página 6):

| Color | HEX | Pantone | Uso |
|---|---|---|---|
| Rojo principal | `#E6332A` | 485C | Branding, CTAs, alertas |
| Cyan/Turquesa | `#00B2BF` | 7466C | Indicadores positivos, recupero |
| Púrpura | `#662483` | 526C | Tendencias, analítica |
| Naranja | `#F39200` | 144C | Métricas operativas |

**Tipografías:** Manrope (≈ Gilroy, body) + Barlow Condensed (≈ DIN, titulares). Fallbacks oficiales Arial.

**Logo:** integridad preservada según manual — sin deformaciones, área de seguridad respetada, contraste correcto sobre fondos institucionales.

---

## 🏗️ Stack

| Capa | Tecnología |
|---|---|
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2.0 async + Postgres/SQLite |
| **Frontend** | Next.js 14 + React 18 + Tailwind CSS + Recharts |
| **Jobs** | FastAPI BackgroundTasks (in-process, sin Redis) + recovery al boot |
| **Auth** | JWT HS256 + bcrypt. Superadmin desde `.env`, viewers en DB |
| **Excel** | openpyxl (xlsx) + xlrd (xls) — auto-detección por magic bytes |
| **Deploy** | Render.com — un solo servicio Docker (web) + Postgres + disco persistente 10 GB |

---

## 📁 Estructura del monorepo

```
cobranzasegurossuda/
├── backend/
│   ├── app/
│   │   ├── api/v1/             # auth, uploads, reports, calls, users, audit
│   │   ├── core/               # config, security, database, logging
│   │   ├── jobs/               # background runners + recovery
│   │   ├── models/             # User, Upload, Report, CallUpload, CallReport, AuditLog
│   │   ├── schemas/            # Pydantic v2
│   │   └── services/
│   │       ├── parsers/        # dxp, boca, cobrado, llamadas + _excel_loader (xls/xlsx)
│   │       ├── analyzers/      # cartera, recupero, proyección, llamadas
│   │       └── matchers/       # policy matcher (nombre + póliza)
│   ├── tests/                  # smoke tests con fixtures reales
│   └── requirements.txt
│
├── frontend/
│   ├── public/                 # logo Voicenter + assets
│   ├── src/
│   │   ├── app/                # rutas Next.js 14 app router
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   ├── upload/ + reports/[id]
│   │   │   ├── calls/upload + calls/reports/[id]
│   │   │   └── admin/users + admin/audit
│   │   ├── components/         # AppShell, Brand, Avatar, KpiCard + charts/
│   │   ├── lib/                # api fetch wrapper, format helpers
│   │   └── app/globals.css     # design system + fonts
│   ├── tailwind.config.js      # paleta + tipografías oficiales
│   └── next.config.js          # rewrites /api → backend
│
├── Dockerfile                  # multi-stage build (Node + Python)
├── start.sh                    # arranca uvicorn :8000 + next :$PORT
├── render.yaml                 # blueprint Render (1 web service + disk)
├── docker-compose.yml          # dev local con Postgres
├── docs/deployment-render.md   # guía detallada paso a paso
└── README.md
```

---

## 🚀 Deploy en Render (flujo manual)

### Paso 1 — Crear Postgres
Render Dashboard → `New +` → **PostgreSQL** → `cobranzasegurossuda-db` · region `oregon` · plan Starter.
Copiar el **Internal Database URL**.

### Paso 2 — Crear Web Service
Render Dashboard → `New +` → **Web Service** → conectar `alemart87/cobranzasuda`.
- Runtime: Docker · Region: oregon · Plan: Starter
- Disk: `uploads` montado en `/var/data` (10 GB)

### Paso 3 — Env vars
| Key | Value | Notas |
|---|---|---|
| `DATABASE_URL` | *(Internal URL del paso 1)* | secret |
| `SECRET_KEY` | `openssl rand -hex 32` | secret |
| `SUPERADMIN_EMAIL` | `admin@voicenter.com.py` | |
| `SUPERADMIN_PASSWORD` | *tu password en plano* | secret (auto-comparación constant-time) |
| `SUPERADMIN_NAME` | `Administrador Voicenter` | |
| `UPLOAD_DIR` | `/var/data/uploads` | |
| `ENV` | `production` | |
| `BACKEND_URL` | `http://127.0.0.1:8000` | |
| `JWT_ALGORITHM` | `HS256` | |
| `BRAND_PRIMARY_COLOR` | `#E6332A` | |

> El backend **auto-convierte** `postgresql://` (formato Render) → `postgresql+asyncpg://` y limpia `?sslmode=require`. No tocás la URL.

### Paso 4 — Validar
1. Esperar build (5-10 min).
2. Abrir `https://cobranzasegurossuda.onrender.com/login`
3. Login con `SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD`
4. En `/admin/users` crear analistas y clientes.
5. En `/upload` subir los 3 Excel del mes.

Guía completa con troubleshooting en [`docs/deployment-render.md`](docs/deployment-render.md).

**Costo estimado:** ~$14-17/mes (Web Starter $7 + Postgres Starter $7 + Disk 10 GB $2.50).

---

## 💻 Desarrollo local

```bash
# Setup
git clone https://github.com/alemart87/cobranzasuda
cd cobranzasuda
cp .env.example .env
# Editar SUPERADMIN_PASSWORD en .env

# Backend
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
.venv\Scripts\uvicorn app.main:app --reload --app-dir backend

# Frontend (otra terminal)
cd frontend
npm install
npm run dev

# Abrir http://localhost:3000
```

### Stack completo con Docker
```bash
export SUPERADMIN_PASSWORD='TuPassword123!'
docker-compose up --build
# Abrir http://localhost:8080
```

---

## 🧪 Tests

```bash
cd backend
../.venv/Scripts/python -m pytest tests/ -v
```

**Cobertura actual (11 tests):**
- ✅ Parsers reales (DXP, Boca, Cobrado, Llamadas) con archivos fixtures
- ✅ Analyzers (cartera, recupero sobre mora, proyección, llamadas)
- ✅ API end-to-end: login multi-rol, upload + procesamiento, listados, detalle
- ✅ Loader xls/xlsx universal (auto-detección)
- ✅ Permisos: cliente NO puede subir archivos, analista NO puede crear usuarios

---

## 🔐 Endpoints API

### Auth
- `POST /api/v1/auth/login` — email + password → JWT
- `POST /api/v1/auth/refresh` — refresh token → nuevo access
- `GET  /api/v1/auth/me` — datos del usuario actual + capabilities

### Cobranzas
- `POST   /api/v1/uploads` — 3 archivos (analista/admin)
- `GET    /api/v1/uploads` · `GET /api/v1/uploads/{id}` — listado/detalle + polling
- `GET    /api/v1/reports` — listado (cliente ve solo publicados)
- `GET    /api/v1/reports/{id}` — detalle completo
- `POST   /api/v1/reports/{id}/publish` — publicar/despublicar (analista/admin)
- `DELETE /api/v1/reports/{id}` — eliminar (analista/admin)

### Llamadas
- `POST   /api/v1/calls/uploads` — 1 archivo (analista/admin)
- `GET    /api/v1/calls/reports` · `GET /api/v1/calls/reports/{id}`
- `POST   /api/v1/calls/reports/{id}/publish` (analista/admin)
- `DELETE /api/v1/calls/reports/{id}` (analista/admin)

### Usuarios (superadmin only)
- `GET    /api/v1/users`
- `POST   /api/v1/users` — crear analista o cliente
- `PATCH  /api/v1/users/{id}` — actualizar nombre, estado, etc.
- `POST   /api/v1/users/{id}/reset-password` — resetear PWD
- `POST   /api/v1/users/{id}/photo` — subir foto (PNG/JPEG/WEBP, 5 MB max)
- `DELETE /api/v1/users/{id}` — desactivar (soft delete)

### Auditoría (superadmin only)
- `GET /api/v1/audit` — log raw filtrable por acción/usuario
- `GET /api/v1/audit/usage?days=30` — analytics agregado (gráficos)

### Sistema
- `GET /health` — health check para Render

---

## 🚧 Pendientes inmediatos

### Bases Adicionales (Débitos Automáticos / Bancard) — entregado

**Estado actual (28/05/2026):** sección operativa nueva bajo Cobranzas para cargar dos carteras que se gestionan pero NO reciben pagos. Backend completo, frontend completo, smoke test validado contra archivos reales.

**Backend (lo que existe):**
- Modelos `BaseAdicionalUpload` + `BaseAdicionalReport` con campo `tipo ∈ {debitos_automaticos, bancard}`.
- Parser reutiliza `dxp_parser` (estructura idéntica al DXP).
- Analyzer `analyze_base_adicional`: pólizas, asegurados, saldo, 7 tramos de mora, top 20 deudores. Match tolerante a headers con encoding roto (`Hasta 30 D�as`).
- Job runner + recovery al boot.
- Endpoints: `POST/GET/DELETE /api/v1/bases-adicionales/uploads`, `.../reports`, `.../publish` y `.../carteras-totales` (consolidado gerencial).
- Schema healing extendido para las nuevas columnas.

**Frontend (lo que existe):**
- `/cobranzas/bases-adicionales` — hub con dos cards (último reporte por tipo).
- `/cobranzas/bases-adicionales/upload/{tipo}` — pantalla de subida con polling.
- `/cobranzas/bases-adicionales/reports/{id}` — detalle con banners *"Sudameris no enviará pagos"* + *"Cruce con gestiones en desarrollo"*, KPIs, tramos, top deudores.
- `/cobranzas/carteras-totales` — vista gerencial con DXP + Débitos + Bancard lado a lado, comparativa de tramos en barras, tabla numérica + totales.
- 2 cards nuevas en hub de Cobranzas: "Carteras Totales" y "Bases Adicionales".

**Smoke test validado** contra los .xlsx reales:
- Banca: 1.839 pólizas · 1.483 asegurados · Gs 3.436.502.677 (todos los tramos OK).
- Bancard: 159 pólizas · 136 asegurados · Gs 193.787.839 (todos los tramos OK).

**Pendiente cuando se quiera retomar:**
- [ ] Implementar el cruce real de pólizas DXP/Banca/Bancard ↔ gestiones (ya están guardadas las pólizas en `data.polizas_detalle`).
- [ ] Filtro por período en `Carteras Totales`.
- [ ] Test E2E del flujo de upload de bases adicionales con archivos fixture.

---

### Cruce Gestiones ↔ Carteras por Póliza (work in progress)

**Estado actual (28/05/2026):** parser de Gestiones reescrito para extraer y normalizar la columna `Póliza` que ahora viene en el export del CRM. Soporta los 5 formatos heterogéneos detectados:
- entero suelto (Excel guarda como número): `27810`
- 3 tokens con espacios: `'0201   27810 0'`
- 3 tokens con puntos: `'0501.162382.0'`
- pegado sin separador: `'01049601084'` (detecta sección por prefijo conocido)
- entero corto suelto: `'1496'`

Por cada gestión el parser ahora expone: `poliza_raw`, `poliza_sec`, `poliza_num`, `poliza_end`, `poliza_key` (`SSSS-PPPPPP` canónica para join con DXP), y `has_value`.

KPIs nuevos en el reporte: `gestiones_con_poliza`, `pct_gestiones_con_poliza`, `gestiones_poliza_normalizada`, `polizas_unicas`.

**Validado contra `Reporte_Gestiones_Nuevo.xlsx` (6.094 filas)**: 4.663 con dato (76.5 %), 1.501 con `(sec, pol)` completa, 3.162 con solo número.

**Por verificar / decidir antes de avanzar al cruce:**
- [ ] Regla de desambiguación cuando una gestión trae solo `poliza_num` (sin sección): ¿matchear contra DXP por `Pol.` aunque haya colisión entre secciones? ¿Asumir sección dominante por asegurado?
- [ ] Regla de corte para pólizas pegadas sin separador (`01049601084` → ¿`0104 + 960 + 1084` o `0104 + 9601084`?). Hoy se guarda como `0104 + 9601084` y se cruzará por substring.
- [ ] Lista completa de prefijos de sección válidos. Hoy hardcodeada: `0101, 0104, 0201, 0301, 0401, 0501, 0601, 0701, 0801, 0901, 1001, 1006, 1021, 1101, 1110, 1201, 1301, 1401`. Falta confirmar si están todas.
- [ ] Carteras adicionales que se sumarán para cruzar (a definir por usuario).
- [ ] Cobrado / Boca: hoy NO traen póliza, solo nombre de asegurado y recibo. Para cruzar pagos con gestión por póliza, hay que agregar la columna a esos archivos o cruzar por asegurado (fuzzy match).

**Próximos pasos cuando estos puntos estén definidos:**
- [ ] Implementar `matcher gestion ↔ cartera DXP` por `poliza_key`.
- [ ] Tabla detalle fila-a-fila (`gestion_rows`) para poder exportar el cruce.
- [ ] UI en el reporte de Gestiones: tarjeta "Pólizas identificadas" + tabla detalle con saldo, tramo, organizador (cuando exista cruce).

---

## 📋 Roadmap futuro

- [ ] Export PDF de reportes para distribuir a clientes
- [ ] Notificaciones por email al publicar un reporte
- [ ] Comparativo mes-a-mes en dashboard
- [ ] Webhooks para integrar con otros sistemas
- [ ] 2FA para superadmin y analistas
- [ ] Logo Voicenter responsive según breakpoint (manual p.2)

---

*Operado por **Voicenter S.A.** · Cliente: **Sudameris Seguros** · 2026*
