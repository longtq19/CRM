
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const orgs = await prisma.organization.findMany();
  const departments = await prisma.department.findMany();
  
  console.log('Orgs:', orgs.map(o=>`${o.name} (${o.code}) ID: ${o.id}`));
  console.log('Departments:', departments.map(d=>`${d.name} (${d.code}) type: ${d.type} org: ${d.organizationId} id: ${d.id} parent: ${d.parentId}`));
}
main().finally(() => prisma.$disconnect());
