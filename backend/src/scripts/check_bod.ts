
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bod = await prisma.employee.findFirst({
    where: { fullName: 'Cao Xuân Hồng' },
    include: { position: true }
  });
  console.log('BOD:', bod ? `${bod.fullName} - ${bod.position?.name}` : 'Not found');
  
  const positions = await prisma.position.findMany();
  console.log('Positions count:', positions.length);
  console.log('Sample positions:', positions.slice(0, 5).map(p => p.name));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
