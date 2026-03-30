
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  // 1. Read JSON
  const jsonPath = path.resolve(__dirname, '../../danh_sach_nhan_su_merged_fixed.json');
  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const employees = JSON.parse(rawData);

  console.log(`Read ${employees.length} employees from JSON.`);

  // 2. Extract pairs
  const mapDeptPos = new Map<string, Set<string>>(); // Dept -> Set<Position>
  
  employees.forEach((e: any) => {
    const deptName = e['Phòng ban'];
    const posName = e['Chức vụ'];
    if (deptName && posName) {
      if (!mapDeptPos.has(deptName)) {
        mapDeptPos.set(deptName, new Set());
      }
      mapDeptPos.get(deptName)?.add(posName);
    }
  });

  console.log('Found Departments in JSON:', Array.from(mapDeptPos.keys()));

  // 3. Check DB Departments
  const dbDepts = await prisma.department.findMany();
  console.log('DB Departments:', dbDepts.map(d => d.name));

  // 4. Update Positions
  for (const [deptName, positions] of mapDeptPos) {
    // Find DB Dept
    const dbDept = dbDepts.find(d => d.name.toLowerCase() === deptName.toLowerCase());
    
    if (!dbDept) {
      console.warn(`⚠️ JSON Department "${deptName}" not found in DB! Skipping positions: ${Array.from(positions).join(', ')}`);
      continue;
    }

    console.log(`Processing Department: ${deptName} (ID: ${dbDept.id})`);

    for (const posName of positions) {
      // Find Position in DB
      const dbPos = await prisma.position.findFirst({
        where: { name: posName } // Assuming unique name or just take first match
      });

      if (dbPos) {
        // Update
        await prisma.position.update({
          where: { id: dbPos.id },
          data: { departmentId: dbDept.id }
        });
        console.log(`  ✅ Linked Position "${posName}" to Department "${deptName}"`);
      } else {
        console.warn(`  ⚠️ Position "${posName}" not found in DB!`);
      }
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
