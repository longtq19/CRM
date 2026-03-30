
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting division name update to uppercase...');

  const divisions = await prisma.division.findMany();
  console.log(`Found ${divisions.length} divisions.`);

  let updatedCount = 0;
  for (const div of divisions) {
    if (div.name !== div.name.toUpperCase()) {
      const upperName = div.name.toUpperCase();
      console.log(`Updating "${div.name}" to "${upperName}"...`);
      
      // Check if uppercase name already exists (conflict)
      const existing = await prisma.division.findFirst({
        where: { 
            name: upperName,
            id: { not: div.id }
        }
      });

      if (existing) {
        console.warn(`WARNING: Cannot update "${div.name}" because "${upperName}" already exists (ID: ${existing.id}). Skipping.`);
        // Optional: Merge logic could go here, but for now we just skip to avoid unique constraint errors if name was unique
        continue;
      }

      await prisma.division.update({
        where: { id: div.id },
        data: { name: upperName }
      });
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} divisions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
