import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const types = await prisma.employeeType.findMany({ select: { code: true, name: true } });
  console.log(JSON.stringify(types, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
