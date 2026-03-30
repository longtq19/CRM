#!/bin/sh
# Baseline: đánh dấu tất cả migration (trừ migration mới nhất) là đã áp dụng.
# Dùng khi DB production đã có schema nhưng chưa có bảng _prisma_migrations (lỗi P3005).
set -e
cd "$(dirname "$0")/.."
echo "[HCRM] Prisma baseline: marking existing migrations as applied (except latest)..."
MIGRATIONS_DIR="prisma/migrations"
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "[HCRM] No prisma/migrations found, skip baseline."
  exit 0
fi
# Lấy danh sách migration theo thứ tự, bỏ qua migration mới nhất để deploy chạy migration đó
LAST=""
for name in $(ls -1 "$MIGRATIONS_DIR" | sort); do
  if [ -n "$LAST" ]; then
    echo "[HCRM] Resolve --applied: $LAST"
    npx prisma migrate resolve --applied "$LAST" || true
  fi
  LAST="$name"
done
echo "[HCRM] Baseline done. Latest migration left for deploy: $LAST"
