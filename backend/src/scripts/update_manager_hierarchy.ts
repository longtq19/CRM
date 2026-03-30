import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('managerId field has been removed from Employee.');
  console.log('Hierarchy is now resolved dynamically from Department/Division manager assignments.');
  console.log('No data migration is required in this script anymore.');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
