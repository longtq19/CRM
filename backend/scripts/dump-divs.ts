
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const orgId = '12ca6aa3-95c5-4b29-8ef9-7b1db825f264';
  const divs = await prisma.department.findMany({ where: { organizationId: orgId, type: 'DIVISION' } });
  console.log(divs.map(d=>({name:d.name, id: d.id, parentId:d.parentId})));
}
main().finally(() => prisma.$disconnect());
