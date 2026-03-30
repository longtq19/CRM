
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 9 ? `0${digits}` : digits;
};

const main = async () => {
  console.log('Starting phone hash migration...');
  
  const employees = await prisma.employee.findMany({
    where: {
      phone: { not: null }
    }
  });

  console.log(`Found ${employees.length} employees with phone numbers.`);

  for (const employee of employees) {
    if (employee.phone) {
      const normalizedPhone = normalizePhone(employee.phone);
      const phoneHash = crypto.createHash('sha256').update(normalizedPhone).digest('hex');
      
      await prisma.employee.update({
        where: { id: employee.id },
        data: { phoneHash }
      });
      console.log(`Updated employee ${employee.code}: ${employee.phone} -> ${phoneHash}`);
    }
  }

  console.log('Migration complete.');
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
