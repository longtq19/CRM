import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getAcronym(name: string): string {
    return name
        .normalize('NFD') // Decompose unicode characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toUpperCase()
        .split(/[\s-]+/) // Split by space or hyphen
        .map(word => word.charAt(0))
        .join('');
}

async function main() {
    console.log('Starting Position Code Optimization...');

    // 1. Fetch all positions with departments
    const positions = await prisma.position.findMany({
        include: {
            department: true
        }
    });

    console.log(`Found ${positions.length} positions.`);

    const updates: { id: string, oldCode: string, newCode: string }[] = [];
    const usedCodes = new Set<string>();

    // Pre-fill used codes with existing ones to avoid collision during process if we were doing partial updates, 
    // but here we are rewriting all. However, to be safe, let's track generated codes.
    
    for (const pos of positions) {
        if (!pos.department) {
            console.warn(`Position ${pos.name} (${pos.code}) has no department! Skipping.`);
            continue;
        }

        const deptCode = pos.department.code;
        const posAcronym = getAcronym(pos.name);
        
        let newCode = `${deptCode}_${posAcronym}`;
        
        // Handle collisions (e.g. 'Nhan vien' and 'Nhan van' -> NV)
        // Or if same position name exists multiple times in same department (shouldn't happen ideally but safety first)
        let counter = 1;
        const baseCode = newCode;
        while (usedCodes.has(newCode)) {
            newCode = `${baseCode}_${counter}`;
            counter++;
        }

        usedCodes.add(newCode);

        if (newCode !== pos.code) {
            updates.push({
                id: pos.id,
                oldCode: pos.code,
                newCode: newCode
            });
        }
    }

    console.log(`Identified ${updates.length} positions needing code updates.`);

    // 2. Execute Updates
    for (const update of updates) {
        try {
            await prisma.position.update({
                where: { id: update.id },
                data: { code: update.newCode }
            });
            console.log(`Updated: ${update.oldCode} -> ${update.newCode}`);
        } catch (error) {
            console.error(`Failed to update ${update.oldCode} to ${update.newCode}:`, error);
        }
    }

    console.log('Optimization Complete.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
