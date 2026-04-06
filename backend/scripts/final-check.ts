
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findUnique({ where: { code: 'KAGRI' } });
  const companies = await prisma.department.findMany({ where: { organizationId: org?.id, type: 'COMPANY' } });
  const divisions = await prisma.department.findMany({ where: { organizationId: org?.id, type: 'DIVISION' } });
  
  console.log(`Org: ${org?.name} ID: ${org?.id}`);
  console.log('Companies:', companies.map(c => ({ id: c.id, code: c.code, name: c.name })));
  console.log('Divisions:', divisions.map(d => ({ id: d.id, code: d.code, name: d.name, parentId: d.parentId })));
  
  const rootId = companies[0]?.id;
  const filtered = divisions.filter(d => d.parentId === rootId);
  console.log('Filtered Divs (should match UI):', filtered.length);
}
main().finally(() => prisma.$disconnect());
