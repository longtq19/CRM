/**
 * Backup dữ liệu nhân viên + nhóm quyền trước khi thêm trường loại nhân viên.
 * Chạy: cd backend && node scripts/backup-before-employee-type.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const backupDir = path.join(__dirname, '../backups');

async function main() {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(backupDir, `pre_employee_type_${ts}.json`);

  const [employees, roleGroups] = await Promise.all([
    prisma.employee.findMany({
      select: {
        id: true, code: true, fullName: true, roleGroupId: true, positionId: true,
        departmentId: true, salesType: true, isSales: true
      }
    }),
    prisma.roleGroup.findMany({ select: { id: true, code: true, name: true } })
  ]);

  const data = { exportedAt: new Date().toISOString(), employees, roleGroups };
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Backup lưu tại:', outPath, '(', employees.length, 'nhân viên,', roleGroups.length, 'nhóm quyền)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
