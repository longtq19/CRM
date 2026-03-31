import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const permissions = [
    {
      code: 'PERMANENT_DELETE_CUSTOMER',
      name: 'Xóa khách hàng vĩnh viễn',
      description: 'Quyền xóa vĩnh viễn khách hàng khỏi hệ thống (Dành cho Quản trị viên)',
    },
  ];

  console.log('Seeding new marketing permissions...');

  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        description: p.description,
      },
      create: p,
    });
    console.log(`- Upserted permission: ${p.code}`);
  }

  // Also assign to System Administrator by default
  const adminRole = await prisma.roleGroup.findUnique({
    where: { code: 'system_administrator' },
    include: { permissions: true }
  });

  if (adminRole) {
    const existingCodes = adminRole.permissions.map(p => p.code);
    for (const p of permissions) {
      if (!existingCodes.includes(p.code)) {
        await prisma.roleGroup.update({
          where: { id: adminRole.id },
          data: {
            permissions: { connect: { code: p.code } }
          }
        });
        console.log(`- Connected ${p.code} to System Administrator`);
      } else {
        console.log(`- ${p.code} already present for System Administrator`);
      }
    }
  }

  console.log('Finished seeding permissions.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
