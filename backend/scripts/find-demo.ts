
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const demo = await prisma.department.findFirst({ where: { name: 'DEMO' } });
  console.log('DEMO division found:', demo);
}
main().finally(() => prisma.$disconnect());
