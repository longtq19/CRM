const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConfig() {
  const divisions = await prisma.department.findMany({
    where: { type: 'DIVISION' },
    select: { id: true, name: true, dataFlowShares: true, organizationId: true }
  });
  console.log('Divisions with dataFlowShares:');
  divisions.forEach(d => {
    console.log(`- ${d.name} (${d.id}):`, JSON.stringify(d.dataFlowShares, null, 2));
  });

  const salesCount = await prisma.employee.count({
    where: {
      status: { code: 'WORKING' },
      OR: [
        { salesType: 'SALES' },
        { roleGroup: { code: { in: ['TELESALES', 'TELESALES_MGR', 'REALSALES', 'REALSALES_MGR'] } } },
      ],
    }
  });
  console.log('\nTotal working Sales employees:', salesCount);

  const teamRatios = await prisma.teamDistributionRatio.findMany({
    where: { isActive: true }
  });
  console.log('\nActive Team Distribution Ratios:', teamRatios.length);
}

checkConfig().catch(console.error).finally(() => prisma.$disconnect());
