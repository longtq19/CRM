import { prisma } from '../src/config/database';

async function main() {
  console.log('--- Raw Integrity Check ---');
  
  const nullUnits: any = await prisma.$queryRaw`SELECT id, code, full_name as "fullName" FROM employees WHERE hr_department_unit_id IS NULL`;
  console.log('Employees with NULL hr_department_unit_id:', nullUnits);

  const nullStatuses: any = await prisma.$queryRaw`SELECT id, code, full_name as "fullName" FROM employees WHERE status_id IS NULL`;
  console.log('Employees with NULL status_id:', nullStatuses);

  const nullTypes: any = await prisma.$queryRaw`SELECT id, code, full_name as "fullName" FROM employees WHERE employment_type_id IS NULL`;
  console.log('Employees with NULL employment_type_id:', nullTypes);

  if (nullUnits.length > 0 || nullStatuses.length > 0 || nullTypes.length > 0) {
    const defaultUnit = await prisma.hrDepartmentUnit.findFirst({ where: { code: 'CHUNG' } });
    const defaultStatus = await prisma.employeeStatus.findFirst({ where: { code: 'WORKING' } });
    const defaultType = await prisma.employmentType.findFirst({ where: { code: 'official' } });

    console.log('Defaults found:', { 
        unitId: defaultUnit?.id, 
        statusId: defaultStatus?.id, 
        typeId: defaultType?.id 
    });

    if (defaultUnit && defaultStatus && defaultType) {
        console.log('⚠️ Fixing broken records...');
        if (nullUnits.length > 0) {
            await prisma.$executeRaw`UPDATE employees SET hr_department_unit_id = ${defaultUnit.id} WHERE hr_department_unit_id IS NULL`;
        }
        if (nullStatuses.length > 0) {
            await prisma.$executeRaw`UPDATE employees SET status_id = ${defaultStatus.id} WHERE status_id IS NULL`;
        }
        if (nullTypes.length > 0) {
            await prisma.$executeRaw`UPDATE employees SET employment_type_id = ${defaultType.id} WHERE employment_type_id IS NULL`;
        }
        console.log('✅ Fixed!');
    }
  }

  console.log('--- End of Raw Integrity Check ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
