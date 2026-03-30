
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking 3NF Status...');
  
  const employees = await prisma.employee.count();
  
  const invalidEmpType: any[] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM "employees" WHERE "employment_type_id" IS NULL
  `;
  const invalidStatus: any[] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM "employees" WHERE "status_id" IS NULL
  `;
  
  const orphanedEmpType = invalidEmpType[0].count;
  const orphanedStatus = invalidStatus[0].count;

  console.log(`Employees: ${employees}`);
  console.log(`- Missing Employment Type Relation: ${orphanedEmpType}`);
  console.log(`- Missing Status Relation: ${orphanedStatus}`);

  let devices = 0;
  let soldDevices = 0;
  let soldWithoutCustomer = 0;
  const hasDevicesTable: any[] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM information_schema.tables
    WHERE table_name = 'devices'
  `;
  if (hasDevicesTable[0].count > 0) {
    const deviceCountRaw: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "devices"`;
    devices = deviceCountRaw[0].count;
    const soldCountRaw: any[] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM "devices" WHERE "sales_status" = 'sold'
    `;
    soldDevices = soldCountRaw[0].count;
    const soldWithoutCustomerRaw: any[] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM "devices" WHERE "sales_status" = 'sold' AND "customer_id" IS NULL
    `;
    soldWithoutCustomer = soldWithoutCustomerRaw[0].count;
  }
  console.log(`Devices: ${devices}`);
  console.log(`- Sold: ${soldDevices}`);
  console.log(`- Sold without Customer ID: ${soldWithoutCustomer}`);

  const orders = await prisma.order.count();
  const ordersWithoutCustomerRaw: any[] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM "orders" WHERE "customer_id" IS NULL
  `;
  const ordersWithoutCustomer = ordersWithoutCustomerRaw[0].count;
  
  console.log(`Orders: ${orders}`);
  console.log(`- Without Customer ID: ${ordersWithoutCustomer}`);
  
  if (orphanedEmpType === 0 && orphanedStatus === 0 && soldWithoutCustomer === 0) {
      console.log('3NF Status: PASS (No obvious violations found in existing data)');
  } else {
      console.log('3NF Status: FAIL (Found violations)');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
