
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to remove accents and special chars
function removeAccents(str: string) {
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();
}

function generateCode(name: string, existingCodes: Set<string>): string {
  const cleanName = removeAccents(name).toUpperCase();
  const words = cleanName.split(/\s+/);
  
  let code = '';
  
  if (words.length >= 3) {
    // Take first letter of first 3 words
    code = words.slice(0, 3).map(w => w[0]).join('');
  } else if (words.length === 2) {
    // Take first letter of first word + first 2 of second word, or similar
    code = words[0][0] + words[1].substring(0, 2);
  } else {
    // Take first 3 letters
    code = cleanName.substring(0, 3).padEnd(3, 'X');
  }

  code = code.substring(0, 3);
  
  // If code exists, try variations
  let finalCode = code;
  let counter = 1;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  
  while (existingCodes.has(finalCode)) {
    // Try modifying last char
    // Strategy: keep first 2 chars, change last char
    const prefix = code.substring(0, 2);
    // Try to find a char that works
    let found = false;
    for (let i = 0; i < chars.length; i++) {
        const testCode = prefix + chars[i];
        if (!existingCodes.has(testCode)) {
            finalCode = testCode;
            found = true;
            break;
        }
    }
    
    if (!found) {
        // Fallback: fully random 3 chars? Or use counter
        // Just fail safe
        finalCode = Math.random().toString(36).substring(2, 5).toUpperCase();
    }
    
    // Safety break to prevent infinite loop
    if (counter++ > 100) break; 
  }

  return finalCode;
}

async function main() {
  console.log('Starting cleanup...');

  // 1. Fetch all divisions
  const divisions = await prisma.division.findMany({
    include: { departments: true }
  });

  console.log(`Found ${divisions.length} divisions.`);

  // 2. Group by normalized name to find duplicates
  const grouped = new Map<string, typeof divisions>();
  
  for (const div of divisions) {
    // Replace all whitespace (including newlines) with single space
    const normalized = div.name.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!grouped.has(normalized)) {
      grouped.set(normalized, []);
    }
    grouped.get(normalized)?.push(div);
  }

  // 3. Merge duplicates
  for (const [name, divs] of grouped) {
    if (divs.length > 1) {
      console.log(`Processing duplicate group: ${name} (${divs.length} items)`);
      
      // Sort by number of departments (desc) or created date (asc)
      // We want to keep the one with most data or oldest
      divs.sort((a, b) => {
         const deptCountDiff = b.departments.length - a.departments.length;
         if (deptCountDiff !== 0) return deptCountDiff;
         return a.createdAt.getTime() - b.createdAt.getTime();
      });

      const primary = divs[0];
      const others = divs.slice(1);

      console.log(`Keeping: ${primary.name} (${primary.id})`);

      for (const other of others) {
        console.log(`Merging ${other.name} (${other.id}) into primary...`);
        
        // Move departments
        await prisma.department.updateMany({
          where: { divisionId: other.id },
          data: { divisionId: primary.id }
        });

        // Delete duplicate division
        await prisma.division.delete({
          where: { id: other.id }
        });
      }
    }
  }

  console.log('Duplicates merged.');

  // 4. Update Division Codes (3 chars)
  const allDivs = await prisma.division.findMany();
  const divCodeMap = new Map<string, string>(); // id -> newCode
  const usedDivCodes = new Set<string>();

  console.log('Calculating new Division codes...');
  for (const div of allDivs) {
    const newCode = generateCode(div.name, usedDivCodes);
    usedDivCodes.add(newCode);
    divCodeMap.set(div.id, newCode);
  }

  // Update Divisions - 2 phase commit to avoid unique constraints
  console.log('Phase 1: Temporary codes for Divisions...');
  for (const div of allDivs) {
     await prisma.division.update({
         where: { id: div.id },
         data: { code: `TMP_${div.id.substring(0, 8)}` }
     });
  }

  console.log('Phase 2: Final codes for Divisions...');
  for (const div of allDivs) {
      const newCode = divCodeMap.get(div.id)!;
      console.log(`Division ${div.name}: -> ${newCode}`);
      await prisma.division.update({
          where: { id: div.id },
          data: { code: newCode }
      });
  }

  // 5. Update Department Codes (3 chars)
  const allDepts = await prisma.department.findMany();
  const deptCodeMap = new Map<string, string>(); // id -> newCode
  const usedDeptCodes = new Set<string>();

  console.log('Calculating new Department codes...');
  for (const dept of allDepts) {
    const newCode = generateCode(dept.name, usedDeptCodes);
    usedDeptCodes.add(newCode);
    deptCodeMap.set(dept.id, newCode);
  }

  // Update Departments - 2 phase
  console.log('Phase 1: Temporary codes for Departments...');
  for (const dept of allDepts) {
      await prisma.department.update({
          where: { id: dept.id },
          data: { code: `TMP_${dept.id.substring(0, 8)}` }
      });
  }

  console.log('Phase 2: Final codes for Departments...');
  for (const dept of allDepts) {
      const newCode = deptCodeMap.get(dept.id)!;
      console.log(`Department ${dept.name}: -> ${newCode}`);
      await prisma.department.update({
          where: { id: dept.id },
          data: { code: newCode }
      });
  }

  console.log('Cleanup completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
