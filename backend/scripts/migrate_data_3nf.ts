
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Migrating data...');
  
  // 1. Order.customerId
  // Map Order.phone -> Customer.phone
  try {
      const orders = await prisma.$executeRawUnsafe(`
        UPDATE "orders"
        SET "customer_id" = "customers"."id"
        FROM "customers"
        WHERE "orders"."phone" = "customers"."phone"
      `);
      console.log(`Updated orders: ${orders}`);
  } catch (e) {
      console.error('Error updating orders:', e);
  }
  
  // 2. Device.staffId
  console.log('Skipping Device.staffId migration (column staff_code missing)');
  
  // 3. Device.managerId
  console.log('Skipping Device.managerId migration (column manager_code missing)');
  
  // 4. Device.customerId
  console.log('Skipping Device.customerId migration (column customer_code missing)');

  // 5. Employee.employmentTypeId
  console.log('Skipping Employee.employmentTypeId migration (column employment_type missing)');

  // 6. Employee.statusId
  console.log('Skipping Employee.statusId migration (column status missing)');

  // 7. Migrate Bank Accounts
  /*
  const employeesWithBank: any[] = await prisma.$queryRaw`
    SELECT id, "bankName", "bankAccountNumber", "bankAccountHolder"
    FROM "employees"
    WHERE "bankAccountNumber" IS NOT NULL AND "bankName" IS NOT NULL
  `;
  ...
  */
  console.log('Skipping Bank Account migration (columns bankName/bankAccountNumber missing from employees)');

  // 8. Migrate Vehicles
  /*
  const employeesWithVehicle: any[] = await prisma.$queryRaw`
    SELECT id, "vehicleType", "vehicleColor", "vehicleLicensePlate"
    FROM "employees"
    WHERE "vehicleLicensePlate" IS NOT NULL
  `;
  ...
  */
  console.log('Skipping Vehicle migration (columns vehicleType/vehicleLicensePlate missing from employees)');
  
  console.log('Migration done.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
