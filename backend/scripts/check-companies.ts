
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findUnique({ where: { code: 'KAGRI' } });
  const companies = await prisma.department.findMany({ where: { organizationId: org?.id, type: 'COMPANY' } });
  console.log(`Organization "KAGRI" ID: ${org?.id}`);
  for (const c of companies) {
    const childrenCount = await prisma.department.count({ where: { parentId: c.id } });
    console.log(`Root COMPANY: ${c.name} (${c.code}) ID: ${c.id} Children: ${childrenCount}`);
    
    // List divisions for this specific company
    const divs = await prisma.department.findMany({ where: { parentId: c.id, type: 'DIVISION' } });
    for (const d of divs) {
      console.log(`  - ${d.name} (${d.code})`);
    }
  }
}
main().finally(() => prisma.$disconnect());
