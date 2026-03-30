#!/bin/sh
set -e
echo "[HCRM] Entrypoint started"
cd /app/backend
# Chạy migration nếu có DATABASE_URL, timeout 20s để tránh treo khi DB không tới được.
if [ -n "$DATABASE_URL" ]; then
  echo "Running Prisma migrate deploy (max 20s)..."
  OUT=$(timeout 20 npx prisma migrate deploy 2>&1) || true
  if echo "$OUT" | grep -q "P3005"; then
    # DB đã có schema nhưng chưa baseline. Đánh dấu các migration cũ đã áp dụng rồi deploy lại.
    echo "[HCRM] P3005: database not empty, running baseline then migrate deploy..."
    sh ./scripts/prisma-baseline.sh || true
    timeout 30 npx prisma migrate deploy && echo "[HCRM] Prisma migrate deploy OK after baseline." || echo "[HCRM] WARN: migrate deploy still failed."
  else
    echo "$OUT"
    if echo "$OUT" | grep -q "Error:"; then
      echo "[HCRM] WARN: Prisma migrate deploy failed. Starting server anyway."
    else
      echo "[HCRM] Prisma migrate deploy OK."
    fi
  fi
else
  echo "[HCRM] DATABASE_URL not set, skipping migrate."
fi
echo "[HCRM] Starting Node server..."
exec node dist/src/server.js
