import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting: move Admin System to BOD and remove Ban Giám Đốc division...');

  const divisionBod = await prisma.division.findFirst({
    where: {
      name: {
        contains: 'BOD',
        mode: 'insensitive',
      },
    },
  });

  if (!divisionBod) {
    console.error('Division BOD not found. Aborting.');
    return;
  }

  const divisionBanGiamDoc = await prisma.division.findFirst({
    where: {
      name: {
        contains: 'BAN GIÁM ĐỐC',
        mode: 'insensitive',
      },
    },
  });

  if (!divisionBanGiamDoc) {
    console.log('Division "Ban Giám Đốc" not found. Nothing to remove.');
  } else {
    console.log(`Found division Ban Giám Đốc: ${divisionBanGiamDoc.id}`);

    const updatedDepts = await prisma.department.updateMany({
      where: { divisionId: divisionBanGiamDoc.id },
      data: { divisionId: divisionBod.id },
    });
    console.log(`Moved ${updatedDepts.count} departments from Ban Giám Đốc to BOD.`);

    const remainingDeptCount = await prisma.department.count({
      where: { divisionId: divisionBanGiamDoc.id },
    });

    if (remainingDeptCount === 0) {
      await prisma.division.delete({
        where: { id: divisionBanGiamDoc.id },
      });
      console.log('Deleted division "Ban Giám Đốc".');
    } else {
      console.warn(
        `Cannot delete "Ban Giám Đốc": still has ${remainingDeptCount} departments.`,
      );
    }
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
