import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking Employee Data...');
  const totalEmployees = await prisma.employee.count();
  console.log(`Total Employees: ${totalEmployees}`);

  if (totalEmployees > 0) {
    const firstEmp = await prisma.employee.findFirst({
        include: {
            employmentType: true,
            status: true,
            department: {
                include: {
                    division: true
                }
            }
        }
    });
    console.log('Sample Employee:', JSON.stringify(firstEmp, null, 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
