#!/bin/sh
# Entrypoint image production: đợi Postgres sẵn sàng rồi migrate + chạy server.
# Giảm P1001 / crash khi app khởi động trước DB (Docker/Dokploy).
set -e
cd /app/backend

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is not set"
  exit 1
fi

if [ "${SKIP_DB_WAIT:-0}" != "1" ]; then
  HP=$(node -e "
    try {
      const u = new URL(process.env.DATABASE_URL);
      process.stdout.write(u.hostname + ' ' + (u.port || '5432'));
    } catch (e) {
      console.error('[entrypoint] DATABASE_URL parse error:', e.message);
      process.exit(1);
    }
  ")
  H=$(echo "$HP" | cut -d' ' -f1)
  P=$(echo "$HP" | cut -d' ' -f2)
  echo "[entrypoint] Waiting for PostgreSQL at ${H}:${P} ..."
  i=0
  max=40
  while [ "$i" -lt "$max" ]; do
    if pg_isready -h "$H" -p "$P" -q 2>/dev/null; then
      echo "[entrypoint] PostgreSQL is accepting connections."
      break
    fi
    i=$((i + 1))
    echo "[entrypoint] pg_isready: not ready yet ($i/$max), sleep 3s..."
    sleep 3
  done
  if ! pg_isready -h "$H" -p "$P" -q 2>/dev/null; then
    echo "[entrypoint] FATAL: PostgreSQL not reachable at ${H}:${P} after ~$((max * 3))s."
    echo "[entrypoint] Check: DB service running, same Docker network as app, DATABASE_URL host/port match Postgres (Prisma P1001)."
    exit 1
  fi
fi

echo "[entrypoint] prisma migrate deploy"
# Allow start even if deploy fails (e.g. P3009 resolve needed) so container stays UP for terminal access.
npx prisma migrate deploy --schema=prisma/schema.prisma || echo "[entrypoint] WARNING: prisma migrate deploy failed. Manual fix may be required."

echo "[entrypoint] Starting Node server"
exec node dist/src/server.js
