/**
 * Chạy một lần trước khi db push NOT NULL hr_department_unit_id (hoặc để sửa dữ liệu cũ).
 * npm run ts-node scripts/ensure-hr-department-units.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  let unit = await prisma.hrDepartmentUnit.findFirst({ where: { code: 'CHUNG' } });
  if (!unit) {
    unit = await prisma.hrDepartmentUnit.create({
      data: { code: 'CHUNG', name: 'Chung', sortOrder: 0 },
    });
  }
  const r = await prisma.employee.updateMany({
    where: { hrDepartmentUnitId: null },
    data: { hrDepartmentUnitId: unit.id },
  });
  console.log('Updated employees without unit:', r.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
