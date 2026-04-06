
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const orgId = '12ca6aa3-95c5-4b29-8ef9-7b1db825f264';
  const companies = await prisma.department.findMany({ 
    where: { organizationId: orgId, type: 'COMPANY' },
    orderBy: { createdAt: 'asc' }
  });
  console.log(`Found ${companies.length} companies for KAGRI`);
  for (const c of companies) {
    const childrenCount = await prisma.department.count({ where: { parentId: c.id } });
    console.log(`Company: ${c.name} (${c.code}) ID: ${c.id} CreatedAt: ${c.createdAt.toISOString()} Children: ${childrenCount}`);
  }
}
main().finally(() => prisma.$disconnect());
