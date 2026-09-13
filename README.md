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

## 📡 Facturación Televentas Claro — Modelo de liquidación y simuladores

Módulo restringido (superadmin y analistas habilitados; rol `facturacion`). Voicenter vende líneas pospago móvil
para Claro Paraguay (entidad 300383) y cobra por liquidación mensual. Esta sección documenta **cómo liquida Claro**,
**cómo lo modelan los simuladores** (mensual y anual) y **con qué datos se calibró** el modelo.

### 1. Cómo liquida Claro

Fuentes: el detalle de liquidación (archivo `.txt` con una fila por línea y concepto) y el *Manual de esquemas y
conceptos de liquidación* de Claro (canal telemarketing, marzo 2021), cuya lógica de conceptos es la misma que
aparece en las liquidaciones móviles.

**Reglas generales**

- Las gestiones de un mes se liquidan **al mes siguiente**. La liquidación cierra alrededor del día 15.
- **Chargeback**: 180 días desde la activación. Dentro de esa ventana Claro descuenta lo que pagó por la línea si la
  línea cae; fuera de ella ya no descuenta (las filas "fuera de chargeback" existen pero salen en 0).
- Cada línea tiene su propia historia de conceptos, identificada por `NroCelularGestion` y `Cabecera`.

**Conceptos de la liquidación (nombre exacto), regla y momento**

| Concepto | Regla (manual + lo observado en 7 liquidaciones) | Cuándo |
|---|---|---|
| ACTIVACIONES · cuota 1 (*upfront*) | Comisión por instalación: 204.545 (CG15G), 245.455 (CG30G), 272.727 (CG50B / C100X), 436.364 (C200X). | Mes de la venta |
| ACTIVACIONES · cuota 2 (*diferido*) | 34.091 / 81.818 / 109.091 / 136.364 / 181.818 por plan. Se paga si la línea está activa al día 90 y el legajo está completo; incompleto cobra 50%, no presentado cobra 0. Sale en 0 para las líneas caídas. | ~100 días (mes 3) |
| ACTIVACION PORTABILIDAD NUMERICA (plus porta) | 218.182 / 245.455 / 327.273 / 409.091 / 545.455 por plan, en las activaciones con portación (90% de las ventas). | Mes de la venta |
| INCENTIVO PRODUCTIVIDAD (1771) | Por línea en estado A (la observación de cada fila informa "Obj CO / %Cumpl."); monto por escala de cumplimiento del objetivo CO. Escala vigente comunicada por Claro: ≥110% 120.000 · ≥105% 115.000 · ≥100% 105.000 · ≥95% 40.000 · <95% 0. Historial liquidado: 2025 pagó 95.000 al ≥100%; ene a may 2026 pagó 110.000 al ≥100% y 50.000 entre 95 y 100%. Objetivos informados: 1.950 (nov-25), 1.750 (dic-25), 1.900 (ene a may-26). | Mes de la venta |
| RECALCULO INCENTIVO PRODUCTIVIDAD (1871) | Descuenta el bono de las líneas que no llegaron activas al día 180 (las suspendidas sin cancelar cuentan como activas). | Mes 6 |
| INCENTIVO EFECTIVIDAD DISTRIBUCION (1891) | 50.000 / 45.000 / 35.000 por venta según efectividad de entregas (≥85 / ≥82 / ≥80%). Se paga en una parte de las activaciones (87,5%). | Mes de la venta |
| DESCUENTO INCENTIVOS POR PENALIDAD | Devuelve el bono efectividad de la línea que cae dentro del chargeback. | Con la caída |
| RESIDUAL | 14,5% del **monto acreditado** (lo que el cliente pagó), durante 12 liquidaciones. Las líneas que no pagan salen con "LINEA INACTIVA" en 0. | Meses 1 a 12 |
| SUSPENSIONES | "Suspensión penalizable, primera factura impaga" (**PFI**, razón P9-735, 96% de las suspensiones): descuenta cuota 1 + un residual (214.431 en CG15G). Las suspensiones estándar salen en 0. PFI real por cohorte de venta: nov-25 26,9% · dic-25 27,3% · ene-26 26,9% · feb-26 28,5% · mar-26 34,1% → 28,7% de las ventas; el 16% se reconecta. En el modelo vive dentro de la zafra (caída del mes 1 al mes 2). | ~60 días (p50 61) |
| RECONEXIONES | Devuelve lo descontado por suspensiones y cancelaciones si la línea se reconecta dentro del chargeback. | ~130 días |
| DESCUENTO PORTABILIDAD NUMERICA | Devuelve el plus porta de la línea que cae dentro del chargeback (falta de pago, port out, primera factura impaga). | Con la caída |
| REVERSO DESCUENTO PORTABILIDAD NUMERICA | Devuelve el descuento anterior si la línea se reconecta. | ~140 días |
| PENALIZACION POR DEUDA | Presuspensión ≥45 días o cancelación por falta de pago: descuenta cuota 1 (montos parciales, ~158.000 a 247.000). | ~140 días |
| REVERSO PENALIZACION POR DEUDA | Reverso de la anterior al reconectar. | — |
| REVERSO ACTIVACION / RECUPERO ACTIVACION | Cancelación temprana (reverso de activación, falta de tráfico): descuenta la cuota 1 completa; el recupero la devuelve. | ~20 días |
| PENALIZACIÓN POR MIGRACIÓN DE NEGOCIO | La línea migra a otro negocio (prepago): pierde la cuota 1 (~207.000). | ~90 días |
| LINEA CON DOCUMENTACION FALTANTE | A los 26 días sin legajo: 100% de cuota 1 y 2; incompleto u observado: 50%; rechazado: 100%. | ~40 días |
| AJUSTE LEGAJO / DEVOLUCION DESCUENTO DOCUMENTACION ACTIVACION | Ajuste del anterior; devolución al día 365 si la línea sigue activa (menos del 1% de la facturación). | Mes 12 |
| CANCELACIONES / CONCEPTO INICIO DE PRESUSPENSION / CAMBIO DE PLAN | Cancelación estándar (0), inicio de presuspensión (0), diferencia de comisión por cambio de plan (mínimo). | — |

### 2. Las siete liquidaciones analizadas

Detalle completo, fila por fila (255.748 filas), de las liquidaciones 383 a 389. Cada una cubre las gestiones del mes
indicado y los ajustes de todas las cohortes anteriores. Importes en millones de guaraníes.

| Liq. | Mes de gestión | Filas | Activaciones cuota 1 | Créditos | Débitos | **Neto liquidado** |
|---|---|---|---|---|---|---|
| 383 | 2025-11 | 34.814 | 1.992 | 1.366,5 M | -396,0 M | **970,4 M** |
| 384 | 2025-12 | 34.033 | 1.764 | 1.243,5 M | -419,7 M | **823,8 M** |
| 385 | 2026-01 | 36.608 | 1.918 | 1.323,0 M | -540,5 M | **782,5 M** |
| 386 | 2026-02 | 36.313 | 1.825 | 1.207,8 M | -435,6 M | **772,2 M** |
| 387 | 2026-03 | 37.681 | 1.928 | 1.391,2 M | -584,3 M | **806,9 M** |
| 388 | 2026-04 | 37.489 | 1.913 | 1.450,1 M | -545,7 M | **904,4 M** |
| 389 | 2026-05 | 38.810 | 1.832 | 1.329,2 M | -728,6 M | **600,6 M** |
| **Total** | 7 meses | 255.748 | 13.172 | 9.311,3 M | -3.650,4 M | **5.660,8 M** |

Por concepto (millones de Gs; "Recuperos" = reconexiones + reversos de descuentos + recupero de incentivos y de
activación + devolución de documentación):

| Liq. | Cuota 1 + 2 | Plus porta | Bono prod. | Bono efect. | Residual | Desc. porta | Suspensiones | Recálculo bono | Desc. incent. | Deuda | Legajos | Reverso act. | Migración | Recuperos |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 383 | 496,2 | 394,9 | 188,3 | 82,1 | 134,0 | -170,7 | -90,3 | 0,0 | -35,6 | -33,2 | -41,9 | -8,8 | -14,0 | 70,9 |
| 384 | 431,5 | 375,3 | 166,8 | 76,5 | 138,7 | -180,1 | -115,6 | 0,0 | -40,1 | -33,8 | -18,8 | -13,9 | -15,5 | 54,7 |
| 385 | 486,6 | 388,9 | 210,3 | 82,8 | 140,3 | -222,4 | -121,2 | -55,5 | -39,1 | -36,5 | -19,3 | -27,8 | -14,7 | 14,1 |
| 386 | 469,6 | 398,3 | 91,0 | 79,1 | 138,6 | -190,9 | -68,9 | -59,5 | -31,6 | -32,0 | -17,9 | -19,7 | -11,7 | 31,1 |
| 387 | 484,1 | 433,2 | 211,2 | 88,0 | 138,0 | -221,3 | -175,8 | -36,6 | -51,7 | -36,9 | -20,1 | -27,4 | -11,5 | 36,7 |
| 388 | 509,6 | 458,7 | 210,1 | 86,9 | 141,7 | -212,5 | -98,3 | -97,0 | -36,7 | -41,0 | -27,0 | -20,3 | -9,0 | 43,1 |
| 389 | 481,3 | 429,3 | 91,4 | 80,8 | 141,0 | -218,2 | -183,8 | -98,7 | -53,5 | -30,5 | -111,0 | -18,1 | -11,2 | 105,3 |
| **Total** | **3.358,9** | **2.878,6** | **1.169,1** | **576,2** | **972,3** | **-1.416,1** | **-853,9** | **-347,3** | **-288,3** | **-243,9** | **-256,0** | **-136,0** | **-87,6** | **355,9** |

Lecturas del cuadro: la cuota 1 y el plus porta son dos tercios de los créditos; el descuento de portabilidad es el
débito más grande y supera a las suspensiones; los legajos de mayo (111 M) son un pico aislado, el resto está entre
18 y 42 M. Bono productividad por mes según "Obj CO / %Cumpl." de la liquidación:

| Liq. | Objetivo CO | Cumplimiento | Bono por línea |
|---|---|---|---|
| 383 (nov-25) | 1.950 | 101,6% | 95.000 |
| 384 (dic-25) | 1.750 | 100,3% | 95.000 |
| 385 (ene-26) | 1.900 | 100,6% | 110.000 |
| 386 (feb-26) | 1.900 | 95,8% | 50.000 |
| 387 (mar-26) | 1.900 | 101,1% | 110.000 |
| 388 (abr-26) | 1.900 | 100,5% | 110.000 |
| 389 (may-26) | 1.900 | 96,2% | 50.000 |

Si no se llega al objetivo se paga el escalón alcanzado y nada por debajo del 95%. Con la escala vigente: entre
95% y 100% son 40.000 por línea; al 100% 105.000; al 105% 115.000; al 110% 120.000. Las líneas en estado C o S
("no suma y no paga") quedan fuera: entre 3 y 10 por mes.

**Indicadores medidos por liquidación** (base de la calibración):

| Liq. | Porta | Bono efect. cobrado | Cuota 2 cobran | Suspensiones | Deuda | Reverso | Migración | Legajos / activación | Recupero |
|---|---|---|---|---|---|---|---|---|---|
| 383 | 88% | 82% | 57% | 24% | 8,5% | 2,1% | 3,5% | 20.355 | 21,0% |
| 384 | 82% | 87% | 52% | 31% | 9,5% | 3,7% | 4,3% | 9.926 | 14,4% |
| 385 | 89% | 86% | 56% | 28% | 9,4% | 7,0% | 3,6% | 9.401 | 3,0% |
| 386 | 90% | 87% | 52% | 17% | 8,5% | 4,9% | 3,2% | 9.195 | 9,2% |
| 387 | 93% | 91% | 49% | 41% | 8,8% | 6,4% | 2,8% | 7.687 | 6,5% |
| 388 | 92% | 91% | 53% | 23% | 9,4% | 4,8% | 2,2% | 11.636 | 9,9% |
| 389 | 94% | 88% | 52% | 45% | 7,4% | 4,4% | 2,7% | 59.422 | 21,2% |
| **Ponderado** | **89,8%** | **87,5%** | **53,0%** | **29,7%** | **8,8%** | **4,8%** | **3,2%** | **11.500 (sin mayo)** | **12,1%** |

Porcentajes sobre las activaciones cuota 1 del mes; "Recupero" = devuelto ÷ descontado (ver §4).

Curva real de **líneas que pagan residual** por mes de antigüedad (146.000 filas RESIDUAL), contra la **zafra**
oficial de líneas activas:

| Mes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pagan residual | 91,3 | 63,7 | 53,8 | 51,7 | 50,9 | 49,5 | 46,6 | 43,7 | 42,4 | 39,6 | 35,7 | 32,4 |
| Zafra (activas) | 82,6 | 58,5 | 53,8 | 53,1 | 49,2 | 51,1 | 46,2 | 41,9 | 40,7 | 40,1 | 40,4 | 41,8 |

### 3. El modelo del simulador

Motor: `backend/app/services/analyzers/facturacion_simulador.py`. Todos los parámetros están en `PARAMETROS_DEFAULT`
y son editables desde "Variables de negocio"; las simulaciones guardadas conservan los suyos.

**Entrada**: ventas efectivas del mes (= activaciones cuota 1; la efectividad de entregas no descuenta ventas, solo
elige el escalón del bono efectividad). Tarifas y abono se ponderan por el mix de planes.

**Mes 0 (facturación del mes)**

```
activaciones  = ventas × cuota1_ponderada × (1 + ajuste_comisiones)
portabilidad  = ventas × porta_pct × porta_plus_ponderado × (1 + ajuste_comisiones)
bono_prod     = ventas × pct_estado_a × monto_escala(cumplimiento = ventas × pct_estado_a ÷ objetivo_co)
bono_efect    = ventas × pct_bono_efectividad_cobrado × monto_escala(efectividad)
bono_adicional = monto cargado a mano (no se devuelve ni se recalcula)
```

**Meses 1 a 12 de cada cohorte** (`z[k]` = zafra a la edad k, `rc[k]` = curva de líneas que pagan residual)

```
residual_k     = ventas × rc[k] × 14,5% × abono_acreditado × abono_ponderado        (k = 1..12)
legajos_1      = − ventas × (no_presentado × cuota1 + incompleto × cuota1 ÷ 2)         (k = 1)
caidas_k       = ventas × (z[k−1] − z[k])                                             (k ≤ chargeback)
devolucion_k   = − caidas_k × [ pen × (cuota1 + residual_por_linea) + porta_pct × porta_plus ] × (1 − recupero)
dev_bono_k     = − caidas_k × pct_bono_efectividad_cobrado × bono_efect_por_venta × (1 − recupero)
migracion_3    = − ventas × migracion_pct × cuota1                                     (k = 3, sin recupero)
cuota2_3       = ventas × z[3] × cuota2_ponderada × (1 − incompleto ÷ 2 − no_presentado)
recalculo_6    = − ventas × pct_estado_a × bono_prod_por_linea × pct_recalculo
                 pct_recalculo = 100 − zafra[6] (regla de Claro: 100% del bono de TODAS las líneas caídas al día 180;
                 48,9% con la zafra tipo). Se puede fijar a mano un % distinto.
                 Bono efectividad (concepto 471): se devuelve completo (50.000) en cada caída dentro de los 180 días,
                 sobre todo en los meses 1 y 2 (PFI); en 6 meses devuelve el 46–47% de las líneas que lo cobraron y
                 se re-acredita (472) en ~8–11% de las devoluciones al reconectar. Nada después del día 180.
```

`pen` (caídas que pierden la cuota 1) se aplica solo a la cuota 1 y su residual; el plus porta y el bono efectividad
se devuelven en el 100% de las caídas del chargeback. El ajuste de comisiones negociado con Claro escala cuota 1,
cuota 2 y porta (también sus devoluciones) y no toca bonos, residual ni la remuneración del vendedor.

**Salidas de la cohorte**: facturación bruta; "queda a 6 meses" (ya cayeron todas las caídas, residual a medias:
la cifra que decide); "queda a 12 meses" (residual completo); peso de los bonos sobre la facturación; cierre
(devoluciones y cobros a 12 meses, gana o pierde).

**Simulación anual (12 o 18 meses)**: el mes 1 fija la estructura y el objetivo; cada mes es una cohorte. El mes
calendario *t* liquida su propio mes 0 más los flujos de todas las cohortes anteriores en la edad que les toca.
Nombres de mes editables, bono adicional por mes, y **meses afectados** (un mes puede tener porta, efectividad,
objetivo, mix, ajuste, bonos, legajos, caídas, recupero o costos variables propios). Al cierre queda la **cola**:
lo que las últimas cohortes todavía tienen por cobrar (residual, cuota 2) y por devolver (caídas). Todo redondea
por flujo y deriva lo demás de los redondeados, así cada puente cierra exacto: bruta + ajustes = neto;
neto − costos = resultado; acumulado anterior + resultado = acumulado; resultado + cola = resultado final.

**La ola de la zafra (riesgo potencial por bajar productividad)**: cada cohorte deja comprometidas devoluciones
para los meses siguientes. Por mes calendario el motor informa `ola_devoluciones` (legajos + caídas + devolución de
bonos + recálculo heredados), `ola_cobros` (residual + cuota 2 heredados) y `ventas_equilibrio`: las ventas mínimas
del mes para que bruta(v) + ajustes heredados − costos(v) ≥ 0 con la estructura fija (bisección). Con ventas
estables la ola crece hasta estabilizarse; si las ventas bajan, la ola sigue pegando sobre menos facturación y el
mes queda `en_riesgo`. Se muestra como área roja en los gráficos del simulador anual y como hito en la historia.

**Costos de la estructura (por mes)**

```
vendedores    = ventas ÷ ventas_por_vendedor (1 supervisor cada 14; 1 backoffice cada 180 ventas; 1 coordinador; 2 controllers; SubGerencia opcional)
salario operador = 14.635 Gs/h × 7 h × 23 días
comisión vendedor = ventas × 102.000 Gs   → dentro del RRHH: paga IPS y aguinaldo
plus vendedor     = ventas × 32.000 Gs    → fuera del RRHH: sin IPS ni aguinaldo
IPS        = 16,5% × todo el RRHH (salarios, comisiones, supervisores, coordinación, backoffice, controllers, subgerencia)
aguinaldo  = RRHH ÷ 12 por mes (sin IPS)
logística  = ventas × (60% × 80.000 Interior + 40% × 55.000 Central) + 20.000.000 de premios fijos
operativos = ventas × 12.500
```

El peso de comisión + plus sobre la facturación se muestra solo como referencia. Margen = lo que queda de la
facturación (mes 0, 6 y 12 meses) − costo de la estructura; punto de equilibrio a 6 meses por bisección.

### 4. Calibración (valores por defecto)

| Parámetro | Default | Base |
|---|---|---|
| Mix de planes | CG15G 58% · CG30G 39% · CG50B 2,5% · C100X 0,5% | Activaciones cuota 1 de las 7 liquidaciones |
| Portabilidad | 90% | 82–94% por liquidación, ponderado 89,8% |
| Efectividad de entregas | 89% | Real 88,5–89,1% |
| Activaciones que cobran bono efectividad | 87,5% | 82–91% por liquidación |
| Líneas en estado A | 99,5% | Bono productividad pagado en todas las activaciones salvo 3 a 10 líneas en estado C/S por mes |
| Escala del bono productividad | ≥110% 120.000 · ≥105% 115.000 · ≥100% 105.000 · ≥95% 40.000 · <95% 0 | Escala vigente comunicada por Claro (ene–may 2026 liquidó 110.000 / 50.000) |
| Legajo incompleto / no presentado | 5% (50%) / 3% (100%) | 11.500 Gs por activación sin el pico de mayo |
| Cuota 2 | mes 3, zafra al día 90 | 53% cobra, 27.491 Gs por activación (modelo 26.400) |
| Residual | 14,5% × 48% del abono, 12 meses, curva real | 78.400 Gs por activación en 12 meses |
| Zafra | 99,9 · 82,6 · 58,5 · 53,8 · 53,1 · 49,2 · 51,1 · 46,2 · 41,9 · 40,7 · 40,1 · 40,4 · 41,8 | Cohortes jul-25 a ene-26 informadas por Claro |
| Chargeback | 6 meses | Manual (180 días); descuento de porta 100% dentro de la ventana |
| Caídas que pierden la cuota 1 | 85% de las caídas | 46% de las activaciones (susp. 29,7 + deuda 8,8 + reverso 4,8 + migración 3,2) contra 51% de caídas |
| Migración de negocio | 3,2% en el mes 3 | 2,2–4,3% por liquidación, ~207.000 por línea |
| Recálculo del bono productividad | 100% del bono de las líneas caídas al día 180 = 100 − zafra[6] (48,9%), mes 6 | Concepto 1871, una fila por línea de la cohorte, entre el día 152 y 184: líneas castigadas jul-25 41%, ago 45%, sep 52%, oct 51%, nov 52% (promedio 48,5%). Ningún descuento de bonos después del día 184 (cohortes observadas hasta 12 meses) |
| Recupero por reconexión | 12% | Ver definición abajo |
| Comisión / plus del vendedor | 102.000 / 32.000 Gs por venta | Promedio real pagado |

**Recupero por reconexión** = devuelto ÷ descontado, ponderado sobre las 7 liquidaciones (21,0 · 14,4 · 3,0 · 9,2 ·
6,5 · 9,9 · 21,2% → 12,1%). Devuelto: RECONEXIONES + REVERSO DESCUENTO PORTABILIDAD NUMERICA + RECUPERO INCENTIVOS
REVERSO PENALIDAD + REVERSO PENALIZACION POR DEUDA + RECUPERO ACTIVACION. Descontado: SUSPENSIONES + DESCUENTO
PORTABILIDAD NUMERICA + DESCUENTO INCENTIVOS POR PENALIDAD + PENALIZACION POR DEUDA. Cada liquidación por separado
salta porque los reversos corresponden a descuentos de meses anteriores; el valor de conjunto es el que vale.

**Qué fila del EERR alimenta cada concepto**: Activaciones (cuota 1) ← ACTIVACIONES cuota 1 · Plus portabilidad ←
ACTIVACION PORTABILIDAD NUMERICA · Bono productividad ← INCENTIVO PRODUCTIVIDAD · Bono efectividad ← INCENTIVO
EFECTIVIDAD DISTRIBUCION · Residual ← RESIDUAL · Cuota 2 ← ACTIVACIONES cuota 2 · Legajos ← LINEA CON DOCUMENTACION
FALTANTE + AJUSTE LEGAJO · Devoluciones por caídas ← SUSPENSIONES + DESCUENTO PORTABILIDAD NUMERICA + PENALIZACION
POR DEUDA + REVERSO ACTIVACION + CANCELACIONES + PENALIZACIÓN POR MIGRACIÓN DE NEGOCIO, netas del recupero ·
Devolución bono efectividad ← DESCUENTO INCENTIVOS POR PENALIDAD · Recálculo ← RECALCULO INCENTIVO PRODUCTIVIDAD.
No modelados: CAMBIO DE PLAN, CONCEPTO INICIO DE PRESUSPENSION POR DEUDA y la devolución de documentación al día 365.

### 5. Herramientas del módulo

- **Simulador mensual** (`/televentas-claro/simulador`): una cohorte; EERR a mes 0 / 6 / 12 meses, estructura
  necesaria, remuneración del vendedor, peso de los bonos, cierre con veredicto, explicación de cada cuadro.
- **Simulador anual** (`/televentas-claro/simulador-anual`): 12 o 18 meses con cohortes superpuestas, EERR mes a mes,
  meses afectados, bono adicional por mes, gráficos, historia animada del negocio con hitos y alertas, y **registro
  del trabajo** (simulaciones guardadas con nombre y comentario, notas tipificadas, ítems marcados y post-its
  arrastrables), en una barra lateral ocultable. Todo se imprime como informe.
- **Reportes de liquidación** (`/televentas-claro`): carga del `.txt`, resumen por concepto, comparación entre
  liquidaciones con descomposición del delta.
- Endpoints: `GET /api/v1/facturacion/simulador/parametros`, `POST /api/v1/facturacion/simulador`,
  `POST /api/v1/facturacion/simulador/anual`, CRUD en `/api/v1/facturacion/simulaciones`.
- Tests: `backend/tests/test_facturacion_simulador.py` (invariantes del motor, aditividad al guaraní, calibración) y
  `test_facturacion_simulaciones.py` (registro del trabajo).

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
