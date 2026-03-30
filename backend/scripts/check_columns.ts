
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking columns in employees table...');
  const columns: any[] = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'employees'
  `;
  
  console.log('Columns:', columns.map(c => c.column_name).join(', '));
  
  console.log('Checking columns in devices table...');
  const devColumns: any[] = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'devices'
  `;
  console.log('Columns:', devColumns.map(c => c.column_name).join(', '));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
