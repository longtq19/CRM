
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const orgs = await prisma.organization.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  
  for (const o of orgs) {
      const root = await prisma.department.findFirst({
          where: { organizationId: o.id, type: 'COMPANY' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
      });
      console.log(`Org: ${o.name} ID: ${o.id} rootDepartmentId: ${root?.id}`);
      
      const divisions = await prisma.department.findMany({
          where: { organizationId: o.id, type: 'DIVISION' },
          orderBy: { displayOrder: 'asc' },
      });
      console.log(`  Divisions count: ${divisions.length}`);
      
      const topLevel = root?.id 
        ? divisions.filter(d => d.parentId === root.id)
        : divisions.filter(d => !d.parentId);
      
      console.log(`  Top Level Divisions: ${topLevel.length}`);
      for (const d of topLevel) {
          console.log(`    - ${d.name} (Code: ${d.code}) ID: ${d.id}`);
      }
  }
}
main().finally(() => prisma.$disconnect());
