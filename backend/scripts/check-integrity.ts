import { prisma } from '../src/config/database';

async function main() {
  console.log('--- Database Integrity Check ---');
  
  const total = await prisma.employee.count();
  console.log('Total employees:', total);

  const missingDeptUnit = await prisma.employee.count({
    where: { hrDepartmentUnitId: null as any }
  });
  console.log('Employees with NULL hrDepartmentUnitId:', missingDeptUnit);

  const missingStatus = await prisma.employee.count({
    where: { statusId: null as any }
  });
  console.log('Employees with NULL statusId:', missingStatus);

  const missingEmploymentType = await prisma.employee.count({
    where: { employmentTypeId: null as any }
  });
  console.log('Employees with NULL employmentTypeId:', missingEmploymentType);

  // Check if any referenced IDs point to non-existent records
  const employees = await prisma.employee.findMany({
    select: { id: true, code: true, hrDepartmentUnitId: true, statusId: true, employmentTypeId: true }
  });

  const units = new Set((await prisma.hrDepartmentUnit.findMany({ select: { id: true } })).map(u => u.id));
  const statuses = new Set((await prisma.employeeStatus.findMany({ select: { id: true } })).map(s => s.id));
  const types = new Set((await prisma.employmentType.findMany({ select: { id: true } })).map(t => t.id));

  const brokenUnits = employees.filter(e => !units.has(e.hrDepartmentUnitId));
  const brokenStatuses = employees.filter(e => !statuses.has(e.statusId));
  const brokenTypes = employees.filter(e => !types.has(e.employmentTypeId));

  console.log('Broken Unit IDs:', brokenUnits.length);
  console.log('Broken Status IDs:', brokenStatuses.length);
  console.log('Broken EmploymentType IDs:', brokenTypes.length);

  if (brokenUnits.length > 0) {
    console.log('Example broken unit:', brokenUnits[0]);
  }

  console.log('--- End of Integrity Check ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
