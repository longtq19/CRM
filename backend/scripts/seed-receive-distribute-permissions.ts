
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const newPermissions = [
  { code: 'CLAIM_LEAD_CSKH', name: 'Nhận khách từ kho CSKH', description: 'Quyền tự nhận khách từ kho CSKH (chưa phân)' },
  { code: 'RECEIVE_SALES_LEAD', name: 'Có quyền nhận khách Sales', description: 'Được phép nhận khách từ kho Sales (được gán hoặc tự nhận)' },
  { code: 'RECEIVE_CSKH_LEAD', name: 'Có quyền nhận khách CSKH', description: 'Được phép nhận khách từ kho CSKH (được gán hoặc tự nhận)' },
  { code: 'DISTRIBUTE_TO_UNIT', name: 'Chia khách đến đơn vị', description: 'Quyền chia khách cho phòng ban/team' },
  { code: 'DISTRIBUTE_TO_STAFF', name: 'Chia khách đến nhân viên', description: 'Quyền chia khách cho nhân viên cụ thể' },
];

async function main() {
  console.log('Seeding new Receive/Distribute Permissions...');
  for (const perm of newPermissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description },
      create: perm,
    });
    console.log(`  ✓ ${perm.code}`);
  }

  // Auto-grant to SUPERADMIN and existing managers
  const adm = await prisma.roleGroup.findFirst({ where: { code: { in: ['ADM', 'SUPERADMIN'] } } });
  if (adm) {
    const all = await prisma.permission.findMany({ where: { code: { in: newPermissions.map(p => p.code) } } });
    await prisma.roleGroup.update({
      where: { id: adm.id },
      data: { permissions: { connect: all.map(p => ({ id: p.id })) } }
    });
  }

  const salesMgr = await prisma.roleGroup.findFirst({ where: { code: 'SALES_MGR' } });
  if (salesMgr) {
    const sPerms = await prisma.permission.findMany({ 
      where: { code: { in: ['RECEIVE_SALES_LEAD', 'DISTRIBUTE_TO_UNIT', 'DISTRIBUTE_TO_STAFF'] } } 
    });
    await prisma.roleGroup.update({
      where: { id: salesMgr.id },
      data: { permissions: { connect: sPerms.map(p => ({ id: p.id })) } }
    });
  }

  const salesStaff = await prisma.roleGroup.findFirst({ where: { code: 'SALES_STAFF' } });
  if (salesStaff) {
    const sPerms = await prisma.permission.findMany({ 
      where: { code: { in: ['RECEIVE_SALES_LEAD'] } } 
    });
    await prisma.roleGroup.update({
      where: { id: salesStaff.id },
      data: { permissions: { connect: sPerms.map(p => ({ id: p.id })) } }
    });
  }

  const cskhMgr = await prisma.roleGroup.findFirst({ where: { code: 'CSKH_MGR' } });
  if (cskhMgr) {
    const cPerms = await prisma.permission.findMany({ 
      where: { code: { in: ['RECEIVE_CSKH_LEAD', 'DISTRIBUTE_TO_UNIT', 'DISTRIBUTE_TO_STAFF', 'CLAIM_LEAD_CSKH'] } } 
    });
    await prisma.roleGroup.update({
      where: { id: cskhMgr.id },
      data: { permissions: { connect: cPerms.map(p => ({ id: p.id })) } }
    });
  }

  const cskhStaff = await prisma.roleGroup.findFirst({ where: { code: 'CSKH_STAFF' } });
  if (cskhStaff) {
    const cPerms = await prisma.permission.findMany({ 
      where: { code: { in: ['RECEIVE_CSKH_LEAD', 'CLAIM_LEAD_CSKH'] } } 
    });
    await prisma.roleGroup.update({
      where: { id: cskhStaff.id },
      data: { permissions: { connect: cPerms.map(p => ({ id: p.id })) } }
    });
  }

  console.log('Done.');
}
main().finally(() => prisma.$disconnect());
