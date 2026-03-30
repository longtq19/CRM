/**
 * Chỉ seed loại nhân viên (employee_types) — không xóa dữ liệu khác.
 * Chạy: cd backend && npx ts-node scripts/seed-employee-types.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const employeeTypes = [
  { code: 'BOD', name: 'Ban điều hành', description: 'CEO, GĐ các khối', sortOrder: 1 },
  { code: 'MKT', name: 'Marketing', description: 'Nhân viên Marketing', sortOrder: 2 },
  { code: 'SAL', name: 'Sales', description: 'Kinh doanh mới / Telesales', sortOrder: 3 },
  { code: 'RES', name: 'CSKH', description: 'Chăm sóc khách hàng / Resales', sortOrder: 4 },
  { code: 'ACC', name: 'Kế toán', description: 'Nhân viên Kế toán', sortOrder: 5 },
  { code: 'HR', name: 'Nhân sự', description: 'Hành chính nhân sự', sortOrder: 6 },
  { code: 'IT', name: 'IT', description: 'Công nghệ thông tin', sortOrder: 7 },
  { code: 'WH', name: 'Kho', description: 'Kho vận', sortOrder: 8 },
  { code: 'SHP', name: 'Vận đơn', description: 'Vận chuyển', sortOrder: 9 },
  { code: 'ECOM', name: 'TMĐT', description: 'Thương mại điện tử', sortOrder: 10 },
  { code: 'COM', name: 'Truyền thông', description: 'Truyền thông', sortOrder: 11 },
  { code: 'OTHER', name: 'Khác', description: 'Loại khác', sortOrder: 99 }
];

async function main() {
  console.log('Seeding employee types...');
  for (const et of employeeTypes) {
    await prisma.employeeType.upsert({
      where: { code: et.code },
      update: { name: et.name, description: et.description ?? null, sortOrder: et.sortOrder },
      create: et
    });
    console.log(`  ✓ ${et.name}`);
  }
  console.log(`Done. ${employeeTypes.length} loại nhân viên.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
