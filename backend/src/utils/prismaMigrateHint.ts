import { Prisma } from '@prisma/client';

/** Khi DB chưa có bảng (thường là Postgres mới, chưa `migrate deploy`). */
export function logPrismaMigrateHintIfSchemaMissing(err: unknown): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021') {
    console.error(
      '[HCRM] P2021: thiếu bảng — schema chưa áp dụng lên đúng DB mà app đang dùng.',
    );
    console.error(
      '[HCRM] Trong cùng container (env giống app): cd /app/backend && npx prisma migrate deploy',
    );
    console.error(
      '[HCRM] Nếu deploy báo P3005 (DB không trống) thì baseline theo README (Docker / Dokploy); nếu deploy thành công mà vẫn P2021 thì DATABASE_URL trong terminal khác env của service.',
    );
  }
}
