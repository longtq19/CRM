
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find Admin System by name or phone
  const admin = await prisma.employee.findFirst({
    where: {
      OR: [
        { fullName: { contains: 'Admin System', mode: 'insensitive' } },
        { phone: '0977350931' } // Super Admin phone from memory
      ]
    },
    select: { id: true, code: true, fullName: true }
  });

  if (!admin) {
    console.log('Admin System user not found.');
    return;
  }

  console.log(`Found Admin: ${admin.fullName} (${admin.code})`);
  console.log('managerId field was removed from Employee model.');
  console.log('No manager update is required for Admin System.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
