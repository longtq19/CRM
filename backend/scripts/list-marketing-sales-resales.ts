/**
 * Liệt kê nhân sự Marketing, Sales, Resales theo đúng logic phân vai trò trong hệ thống.
 * Dùng chung nguồn chân lý với backend: src/constants/roleIdentification.ts
 * Chạy: npx ts-node scripts/list-marketing-sales-resales.ts
 */
import { PrismaClient } from '@prisma/client';
import { marketingEmployeeWhere, salesEmployeeWhere, resalesEmployeeWhere } from '../src/constants/roleIdentification';

const prisma = new PrismaClient();

async function main() {
  console.log('\n========== DANH SÁCH NHÂN SỰ THEO VAI TRÒ ==========\n');

  const select = {
    id: true,
    code: true,
    fullName: true,
    phone: true,
    emailCompany: true,
    salesType: true,
    department: { select: { name: true, division: { select: { name: true, code: true } } } },
    roleGroup: { select: { code: true, name: true } }
  };

  const marketing = await prisma.employee.findMany({
    where: marketingEmployeeWhere(),
    select,
    orderBy: [{ department: { name: 'asc' } }, { fullName: 'asc' }]
  });

  const sales = await prisma.employee.findMany({
    where: salesEmployeeWhere(),
    select,
    orderBy: [{ department: { name: 'asc' } }, { fullName: 'asc' }]
  });

  const resales = await prisma.employee.findMany({
    where: resalesEmployeeWhere(),
    select,
    orderBy: [{ department: { name: 'asc' } }, { fullName: 'asc' }]
  });

  const fmt = (e: any) => {
    const dept = e.department?.name ?? '—';
    const div = e.department?.division?.name ?? '';
    const role = e.roleGroup ? `${e.roleGroup.code} (${e.roleGroup.name})` : '—';
    return `  ${(e.code || '').padEnd(12)} ${(e.fullName || '').padEnd(28)} ${dept} ${div ? '· ' + div : ''}  | ${role}`;
  };

  console.log('--- MARKETING ---');
  if (marketing.length === 0) {
    console.log('  (Không có nhân viên nào thỏa: salesType = MARKETING hoặc roleGroup thuộc MARKETING, MARKETING_MGR, MKT_*, NV_MKT, QL_MKT)\n');
  } else {
    console.log(`  Tổng: ${marketing.length} người\n`);
    marketing.forEach((e) => console.log(fmt(e)));
    console.log('');
  }

  console.log('--- SALES ---');
  if (sales.length === 0) {
    console.log('  (Không có nhân viên nào thỏa: salesType = SALES hoặc roleGroup thuộc SAL_*, TELESALES_*, NV_SALES, QL_SALES)\n');
  } else {
    console.log(`  Tổng: ${sales.length} người\n`);
    sales.forEach((e) => console.log(fmt(e)));
    console.log('');
  }

  console.log('--- RESALES (CSKH) ---');
  if (resales.length === 0) {
    console.log('  (Không có nhân viên nào thỏa: salesType = RESALES hoặc roleGroup thuộc CSKH_*, REALSALES_*, CSK_*)\n');
  } else {
    console.log(`  Tổng: ${resales.length} người\n`);
    resales.forEach((e) => console.log(fmt(e)));
    console.log('');
  }

  console.log('========== KẾT THÚC ==========\n');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
