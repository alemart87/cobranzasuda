# Cobranzas Voicenter · Sudameris Seguros

Plataforma web monorepo para análisis mensual de cobranzas. Procesa 3 archivos Excel (DXP Voicenter, Boca de Cobranzas, Cobrado 186) y entrega dashboards con KPIs, tramos de mora, top deudores, recupero efectivo sobre mora y proyecciones de cierre.

## Stack
- **Backend:** Python 3.12 + FastAPI + SQLAlchemy 2.0 async + Postgres
- **Frontend:** Next.js 14 + React 18 + Tailwind CSS + Recharts
- **Jobs:** FastAPI BackgroundTasks (in-process, sin Redis)
- **Auth:** JWT + bcrypt. Superadmin desde `.env`, viewers en DB
- **Deploy:** Render.com — un solo servicio Docker (web) + Postgres + disco persistente

## Estructura
```
cobranzasegurossuda/
├── backend/           ← FastAPI app
├── frontend/          ← Next.js app
├── Dockerfile         ← multi-stage build
├── start.sh           ← lanza backend en :8000 + Next en :$PORT
├── render.yaml        ← blueprint Render
├── docker-compose.yml ← dev local (Postgres + app)
└── .env.example
```

## Quickstart local

### 1. Generar hash de superadmin
```bash
python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('TuPassword123!'))"
```

### 2. Configurar .env
```bash
cp .env.example .env
# Editar SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD_HASH
```

### 3. Backend solo (SQLite, sin Docker)
```bash
cd backend
python -m venv ../.venv
../.venv/Scripts/pip install -r requirements.txt
DATABASE_URL=sqlite+aiosqlite:///./local.db ../.venv/Scripts/uvicorn app.main:app --reload
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
# Abrir http://localhost:3000
```

### 5. Stack completo con Docker
```bash
export SUPERADMIN_PASSWORD_HASH='$2b$12$...'
docker-compose up --build
# Abrir http://localhost:8080
```

## Smoke tests
```bash
cd backend
../.venv/Scripts/python -m pytest tests/ -v
```

## Deploy Render
1. Push a `https://github.com/alemart87/cobranzasuda`
2. En Render: New → Blueprint → conectar repo → autodetect `render.yaml`
3. Provisionar Postgres + Web service + Disk (10 GB)
4. Setear envvars secretos: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_HASH`
5. Deploy

## Endpoints principales
- `POST /api/v1/auth/login`
- `POST /api/v1/uploads` (3 archivos)
- `GET  /api/v1/reports` / `GET /api/v1/reports/{id}`
- `POST /api/v1/users` (superadmin)
- `GET  /api/v1/audit` (superadmin)
- `GET  /health`

## Operado por Voicenter S.A. · Cliente: Sudameris Seguros
