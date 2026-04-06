
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findUnique({ where: { code: 'KAGRI' } });
  const root = await prisma.department.findFirst({ where: { organizationId: org?.id, type: 'COMPANY' } });
  
  if (!org || !root) {
    console.error('Missing Org or Root');
    return;
  }
  
  const divisions = await prisma.department.findMany({ 
    where: { 
        organizationId: org.id, 
        parentId: root.id,
        type: 'DIVISION'
    }
  });
  
  console.log(`Org: ${org.name} (${org.code}) Root: ${root.name} (${root.code})`);
  console.log(`Top Level Divisions Count: ${divisions.length}`);
  for (const d of divisions) {
    console.log(`  - ${d.name} (${d.code})`);
  }
}
main().finally(() => prisma.$disconnect());
