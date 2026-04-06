
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findUnique({ where: { code: 'KAGRI' } });
  const root = await prisma.department.findFirst({ where: { organizationId: org?.id, type: 'COMPANY' } });
  
  console.log(`Org ID: ${org?.id} Root ID: ${root?.id} Name: ${root?.name}`);
  
  const seed = await prisma.department.findUnique({
    where: { 
        organizationId_code: {
            organizationId: org?.id!,
            code: 'DIV_KAGARI_BIO'
        }
    }
  });
  console.log('DIV_KAGARI_BIO:', seed);
  
  const others = await prisma.department.findMany({
    where: { organizationId: org?.id, type: 'DIVISION' }
  });
  console.log('Other Divisions:', others.map(d => `${d.name} (${d.code}) parent: ${d.parentId}`));
}
main().finally(() => prisma.$disconnect());
