/**
 * Khắc phục Prisma P3009 cho migration `20250323120000_organizations_and_department_org_fk`:
 * kiểm tra schema thực tế, rồi `migrate resolve` + `migrate deploy`.
 *
 * Chạy từ thư mục backend với DATABASE_URL trỏ đúng DB cần sửa (production: copy từ Dokploy):
 *   npx ts-node scripts/resolve-p3009-migration.ts
 * Chỉ in lệnh, không ghi DB:
 *   npx ts-node scripts/resolve-p3009-migration.ts --dry-run
 *
 * Trước khi chạy trên production: backup DB (npm run backup:db).
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATION_NAME = '20250323120000_organizations_and_department_org_fk';
const backendRoot = path.join(__dirname, '..');

const prisma = new PrismaClient();

type MigrationRow = {
  migration_name: string;
  started_at: Date | null;
  finished_at: Date | null;
  logs: string | null;
};

function argvHas(flag: string): boolean {
  return process.argv.includes(flag);
}

function run(cmd: string, dry: boolean): void {
  console.log(dry ? `[dry-run] ${cmd}` : `\n> ${cmd}\n`);
  if (!dry) {
    execSync(cmd, { cwd: backendRoot, stdio: 'inherit', env: process.env });
  }
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function columnExists(table: string, col: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${col}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function fkExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = ${name}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

/** True nếu DB đã khớp nội dung migration organizations + department org FK. */
async function schemaMatchesOrgMigration(): Promise<{ ok: boolean; detail: string }> {
  if (!(await tableExists('organizations'))) {
    return { ok: false, detail: 'Thiếu bảng organizations.' };
  }
  if (!(await columnExists('departments', 'organization_id'))) {
    return { ok: false, detail: 'Thiếu cột departments.organization_id.' };
  }
  const nullCount = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "departments" WHERE "organization_id" IS NULL
  `;
  const n = Number(nullCount[0]?.c ?? 0);
  if (n > 0) {
    return {
      ok: false,
      detail: `Còn ${n} dòng departments.organization_id = NULL — cần gán org (ví dụ KAGRI) trước khi --applied.`,
    };
  }
  if (!(await fkExists('departments_organization_id_fkey'))) {
    return { ok: false, detail: 'Thiếu FK departments_organization_id_fkey.' };
  }
  if (!(await indexExists('departments_organization_id_code_key'))) {
    return { ok: false, detail: 'Thiếu unique index departments_organization_id_code_key.' };
  }
  if (!(await indexExists('organizations_code_key'))) {
    return { ok: false, detail: 'Thiếu unique index organizations_code_key.' };
  }
  return { ok: true, detail: 'Schema khớp migration organizations + FK.' };
}

async function main(): Promise<void> {
  const dry = argvHas('--dry-run');
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('Thiếu DATABASE_URL. Đặt trong .env hoặc export trước khi chạy.');
    process.exit(1);
  }

  const failed = await prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, started_at, finished_at, logs
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL
    ORDER BY started_at ASC
  `;

  console.log('--- Migration chưa hoàn tất (finished_at IS NULL) ---');
  if (failed.length === 0) {
    console.log('Không có bản ghi failed. Thử: npx prisma migrate deploy');
    await prisma.$disconnect();
    return;
  }
  for (const r of failed) {
    console.log(
      `- ${r.migration_name} | started: ${r.started_at?.toISOString?.() ?? r.started_at} | logs: ${(r.logs ?? '').slice(0, 200)}`,
    );
  }

  const target = failed.find((r) => r.migration_name === MIGRATION_NAME);
  if (!target) {
    console.error(
      `\nScript này chỉ tự động xử lý khi migration thất bại là "${MIGRATION_NAME}". Các migration khác: xử lý tay với prisma migrate resolve.`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  const { ok, detail } = await schemaMatchesOrgMigration();
  console.log(`\nKiểm tra schema: ${detail}`);

  if (ok) {
    const cmdResolve = `npx prisma migrate resolve --applied "${MIGRATION_NAME}"`;
    run(cmdResolve, dry);
    const cmdDeploy = `npx prisma migrate deploy`;
    run(cmdDeploy, dry);
    if (!dry) {
      console.log('\nHoàn tất. Redeploy container app trên Dokploy nếu cần.');
    }
  } else {
    console.log(
      '\nSchema chưa khớp migration — không dùng --applied (sẽ lệch lịch sử). Có thể:\n' +
        '  1) Sửa dữ liệu / chạy phần SQL còn thiếu trong prisma/migrations/.../migration.sql\n' +
        '  2) Nếu transaction đã rollback sạch: npx prisma migrate resolve --rolled-back "' +
        MIGRATION_NAME +
        '"\n' +
        '  3) Sau đó: npx prisma migrate deploy',
    );
    await prisma.$disconnect();
    process.exit(3);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
