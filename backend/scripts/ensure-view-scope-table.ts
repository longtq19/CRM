/**
 * Tạo bảng role_group_view_scopes nếu chưa tồn tại (dùng khi migrate deploy không chạy được)
 * Chạy: npx ts-node scripts/ensure-view-scope-table.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "role_group_view_scopes" (
        "id" TEXT NOT NULL,
        "role_group_id" TEXT NOT NULL,
        "context" TEXT NOT NULL,
        "scope" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "role_group_view_scopes_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "role_group_view_scopes_role_group_id_fkey" FOREIGN KEY ("role_group_id") REFERENCES "role_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }
  try {
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "role_group_view_scopes_role_group_id_context_key" ON "role_group_view_scopes"("role_group_id", "context");`);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }
  try {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "role_group_view_scopes_role_group_id_idx" ON "role_group_view_scopes"("role_group_id");`);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }
  console.log('Bảng role_group_view_scopes đã sẵn sàng.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
