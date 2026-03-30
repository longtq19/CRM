
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting employee code migration to NVxxxx format...');

  // Fetch all employees
  // Order by createdAt to maintain some chronological order in the sequence, 
  // or just by current code to keep groups together? 
  // User said "xxxx tăng dần tự động", usually implies chronological creation.
  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Found ${employees.length} employees.`);

  let counter = 0;
  for (const emp of employees) {
    const sequence = counter.toString().padStart(4, '0');
    const newCode = `NV${sequence}`;
    
    // Skip if already correct format (highly unlikely unless manually set)
    if (emp.code === newCode) {
        counter++;
        continue;
    }

    console.log(`Migrating ${emp.fullName}: ${emp.code} -> ${newCode}`);
    
    // Update
    await prisma.employee.update({
        where: { id: emp.id },
        data: { code: newCode }
    });
    
    counter++;
  }

  console.log('Migration completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
