# HCRM — build context: thư mục gốc repo (backend + frontend).
# Dokploy: Build Type = Dockerfile, Dockerfile path = Dockerfile (root).

# --- Frontend (Vite) ---
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# --- Backend (tsc + Prisma generate) ---
FROM node:22-bookworm-slim AS backend-builder
WORKDIR /app/backend
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json* ./
COPY backend/prisma ./prisma
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

# --- Runtime ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app/backend
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/data ./data
COPY backend/package.json ./
COPY backend/prisma ./prisma
# Script CLI (backup…) + pg_dump; đồng bộ VTP dùng dist/scripts từ build
COPY backend/scripts ./scripts

RUN mkdir -p backups

# SPA production: app.ts đọc ../frontend/dist từ thư mục backend
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

RUN mkdir -p uploads/avatars uploads/images uploads/chat uploads/marketing-costs uploads/products uploads/contracts uploads/support-tickets

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/src/server.js"]
