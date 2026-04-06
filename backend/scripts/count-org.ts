
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const orgs = await prisma.organization.findMany();
  for (const o of orgs) {
    const root = await prisma.department.findFirst({
        where: { organizationId: o.id, type: 'COMPANY' },
    });
    const dCount = await prisma.department.count({ where: { organizationId: o.id } });
    const divCount = await prisma.department.count({ where: { organizationId: o.id, type: 'DIVISION' } });
    console.log(`Org: ${o.name} (${o.code}) ID: ${o.id} - RootDept: ${root?.id} (${root?.name}), Divisions: ${divCount}`);
    
    // List divisions for this org
    const divs = await prisma.department.findMany({ where: { organizationId: o.id, type: 'DIVISION' } });
    for (const d of divs) {
      console.log(`  - Division: ${d.name} (${d.code}) ID: ${d.id} Parent: ${d.parentId}`);
    }
  }
}
main().finally(() => prisma.$disconnect());
