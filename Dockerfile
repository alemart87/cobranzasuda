# === Stage 1: build frontend ===
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# === Stage 2: runtime (Python + Node) ===
FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System deps + Node 20 for Next runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Backend
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --upgrade pip && pip install -r backend/requirements.txt
COPY backend/ ./backend/

# Frontend build artifacts (standalone output)
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/.next/standalone ./frontend/
COPY --from=frontend-builder /app/frontend/.next/static ./frontend/.next/static

# Startup script
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Create upload dir
RUN mkdir -p /var/data/uploads

ENV PORT=8080 \
    BACKEND_URL=http://127.0.0.1:8000 \
    UPLOAD_DIR=/var/data/uploads

EXPOSE 8080

CMD ["./start.sh"]
