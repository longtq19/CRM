
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bankCount = await prisma.employeeBankAccount.count();
  const vehicleCount = await prisma.employeeVehicle.count();
  const orderCount = await prisma.order.count();
  const orderWithCustomerCount = orderCount;
  
  console.log(`EmployeeBankAccount count: ${bankCount}`);
  console.log(`EmployeeVehicle count: ${vehicleCount}`);
  console.log(`Total Orders: ${orderCount}`);
  console.log(`Orders with CustomerId: ${orderWithCustomerCount}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
