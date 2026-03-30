/**
 * Khôi phục tổ chức KAGRI: nút COMPANY + 7 khối seed (DIV_KAGARI_BIO … DIV_CSKH_TONG).
 * Tùy chọn: thêm 3 đơn vị lá mẫu (Marketing / Sales / CSKH) cho mỗi khối seed đang không có đơn vị con.
 *
 * Quy trình an toàn (theo README):
 * 1) Backup DB (mặc định script gọi pg_dump trước khi ghi).
 * 2) Chạy script.
 * 3) Nếu cần hoàn tác: pg_restore từ file .dump đã tạo (xem README).
 *
 * Chạy từ thư mục backend:
 *   npx ts-node scripts/restore-kagri-org.ts
 *   npx ts-node scripts/restore-kagri-org.ts --skip-backup
 *   npx ts-node scripts/restore-kagri-org.ts --minimal-units
 *
 * Yêu cầu: DATABASE_URL trong .env; pg_dump trên PATH (PostgreSQL client) trừ khi --skip-backup.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_DIVISIONS: { code: string; name: string }[] = [
  { code: 'DIV_KAGARI_BIO', name: 'KAGARI BIO' },
  { code: 'DIV_NAM_DUONG', name: 'NAM DƯƠNG' },
  { code: 'DIV_PE', name: 'PE' },
  { code: 'DIV_KVC', name: 'KVC' },
  { code: 'DIV_THICH', name: 'THÍCH' },
  { code: 'DIV_TRUST_NATION', name: 'TRUST NATION' },
  { code: 'DIV_CSKH_TONG', name: 'CSKH TỔNG' },
];

const MINIMAL_LEAVES: { suffix: string; name: string; fn: 'MARKETING' | 'SALES' | 'CSKH' }[] = [
  { suffix: 'AUTO_MKT', name: 'Marketing (khôi phục mẫu)', fn: 'MARKETING' },
  { suffix: 'AUTO_SAL', name: 'Sales (khôi phục mẫu)', fn: 'SALES' },
  { suffix: 'AUTO_CSKH', name: 'CSKH (khôi phục mẫu)', fn: 'CSKH' },
];

function argvHas(flag: string) {
  return process.argv.includes(flag);
}

function runPgDump(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    throw new Error('Thiếu DATABASE_URL trong .env');
  }
  const root = path.join(__dirname, '..');
  const backupDir = path.join(root, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(backupDir, `pre-restore-kagri-org-${stamp}.dump`);

  const tryDump = (cmd: string) => {
    execFileSync(cmd, ['-Fc', '-f', outFile, url], { stdio: 'inherit' });
  };

  try {
    tryDump('pg_dump');
  } catch {
    try {
      tryDump('pg_dump.exe');
    } catch (e2) {
      console.error(
        'Không chạy được pg_dump. Cài PostgreSQL client hoặc thêm vào PATH, hoặc chạy lại với --skip-backup nếu đã tự backup (pg_dump).'
      );
      throw e2;
    }
  }

  console.log('Đã backup (custom format):', outFile);
  return outFile;
}

async function main() {
  const skipBackup = argvHas('--skip-backup');
  const minimalUnits = argvHas('--minimal-units');

  if (!skipBackup) {
    console.log('Đang backup DB bằng pg_dump…');
    runPgDump();
  } else {
    console.warn('Bỏ qua backup (--skip-backup). Đảm bảo bạn đã có bản pg_dump riêng nếu cần hoàn tác.');
  }

  const { ensureKagriOrganizationAndTree } = await import('../src/controllers/hrController');
  const { org, company } = await ensureKagriOrganizationAndTree();
  console.log('Đã đảm bảo tổ chức KAGRI và', SEED_DIVISIONS.length, 'khối seed (tạo mới nếu thiếu theo mã).');
  console.log('  org:', org.code, org.id);
  console.log('  company:', company.name, company.id);

  if (minimalUnits) {
    let created = 0;
    for (const spec of SEED_DIVISIONS) {
      const division = await prisma.department.findFirst({
        where: { organizationId: org.id, code: spec.code, type: 'DIVISION' },
        select: { id: true },
      });
      if (!division) continue;

      const childCount = await prisma.department.count({
        where: {
          organizationId: org.id,
          parentId: division.id,
          type: { in: ['DEPARTMENT', 'TEAM'] },
        },
      });
      if (childCount > 0) continue;

      for (let i = 0; i < MINIMAL_LEAVES.length; i++) {
        const leaf = MINIMAL_LEAVES[i]!;
        const code = `${spec.code}_${leaf.suffix}`;
        const exists = await prisma.department.findFirst({
          where: { organizationId: org.id, code },
        });
        if (exists) continue;
        await prisma.department.create({
          data: {
            organizationId: org.id,
            parentId: division.id,
            type: 'DEPARTMENT',
            code,
            name: leaf.name,
            function: leaf.fn,
            displayOrder: i,
          },
        });
        created++;
      }
      console.log('  + Đơn vị mẫu cho khối', spec.name, '(', spec.code, ')');
    }
    console.log('Tổng đơn vị mẫu đã tạo:', created);
  } else {
    console.log('Không dùng --minimal-units: chỉ khôi phục khối seed, không tạo đơn vị lá mẫu.');
    console.log('Gợi ý: nếu mỗi khối đang trống đơn vị, chạy lại kèm --minimal-units.');
  }

  console.log('\nHoàn tất.');
  console.log(
    'Lưu ý: đơn vị / khối tùy chỉnh (không trùng mã seed) không thể tái tạo tự động — cần pg_restore từ backup cũ nếu đã xóa.'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
