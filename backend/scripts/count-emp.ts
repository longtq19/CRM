
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.employee.count();
  console.log('Employee count:', count);
}
main().finally(() => prisma.$disconnect());
