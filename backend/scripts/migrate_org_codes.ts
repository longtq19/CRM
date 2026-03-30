
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration for Division (Kxx), Department (Pxxx), and Subsidiary (Cxx) codes...');

  // 1. Migrate Divisions (Kxx)
  const divisions = await prisma.division.findMany({ orderBy: { createdAt: 'asc' } });
  let divCounter = 1;
  for (const div of divisions) {
    const newCode = `K${divCounter.toString().padStart(2, '0')}`;
    if (div.code !== newCode) {
        // Check collision (very unlikely in fresh migration, but safe to check)
        const exists = await prisma.division.findUnique({ where: { code: newCode } });
        if (!exists) {
            console.log(`Division: ${div.name} (${div.code}) -> ${newCode}`);
            await prisma.division.update({ where: { id: div.id }, data: { code: newCode } });
        } else {
            console.warn(`Skipping Division ${div.name}: Code ${newCode} already exists.`);
        }
    }
    divCounter++;
  }

  // 2. Migrate Departments (Pxxx)
  const departments = await prisma.department.findMany({ orderBy: { createdAt: 'asc' } });
  let deptCounter = 1;
  for (const dept of departments) {
    const newCode = `P${deptCounter.toString().padStart(3, '0')}`;
    if (dept.code !== newCode) {
        const exists = await prisma.department.findUnique({ where: { code: newCode } });
        if (!exists) {
            console.log(`Department: ${dept.name} (${dept.code}) -> ${newCode}`);
            await prisma.department.update({ where: { id: dept.id }, data: { code: newCode } });
        } else {
             console.warn(`Skipping Department ${dept.name}: Code ${newCode} already exists.`);
        }
    }
    deptCounter++;
  }

  // 3. Migrate Subsidiaries (Cxx)
  const subsidiaries = await prisma.subsidiary.findMany({ orderBy: { createdAt: 'asc' } });
  let subCounter = 1;
  for (const sub of subsidiaries) {
    const newCode = `C${subCounter.toString().padStart(2, '0')}`;
    if (sub.code !== newCode) {
        const exists = await prisma.subsidiary.findUnique({ where: { code: newCode } });
        if (!exists) {
             console.log(`Subsidiary: ${sub.name} (${sub.code}) -> ${newCode}`);
             await prisma.subsidiary.update({ where: { id: sub.id }, data: { code: newCode } });
        } else {
             console.warn(`Skipping Subsidiary ${sub.name}: Code ${newCode} already exists.`);
        }
    }
    subCounter++;
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
