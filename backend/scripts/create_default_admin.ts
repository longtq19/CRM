
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const phone = '0977350931';
  const password = 'password123'; // Mật khẩu mặc định
  const fullName = 'Admin';
  const code = 'ADM001';

  console.log(`Checking if admin user with phone ${phone} exists...`);

  const existingUser = await prisma.employee.findFirst({
    where: { phone: phone }
  });

  if (existingUser) {
    console.log('User already exists. Updating password...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    await prisma.employee.update({
      where: { id: existingUser.id },
      data: { passwordHash }
    });
    console.log(`Password updated to: ${password}`);
    return;
  }

  console.log('Creating default admin user...');

  // 1. Ensure Dependencies exist
  // Employment Type
  let empType = await prisma.employmentType.findFirst({ where: { code: 'official' } });
  if (!empType) {
    empType = await prisma.employmentType.create({
      data: { code: 'official', name: 'Chính thức', sortOrder: 1 }
    });
  }

  // Employee Status
  let empStatus = await prisma.employeeStatus.findFirst({ where: { code: 'WORKING' } });
  if (!empStatus) {
    empStatus = await prisma.employeeStatus.create({
      data: { code: 'WORKING', name: 'Working', sortOrder: 1 }
    });
  }

  // Subsidiary
  let subsidiary = await prisma.subsidiary.findFirst({ where: { code: 'KGT' } });
  if (!subsidiary) {
    subsidiary = await prisma.subsidiary.create({
      data: { code: 'KGT', name: 'Kagri Tech' }
    });
  }

  // Division
  let division = await prisma.division.findFirst({ where: { code: 'K01' } });
  if (!division) {
    division = await prisma.division.create({
      data: { code: 'K01', name: 'ADMIN BLOCK' }
    });
  }

  // Department
  let department = await prisma.department.findFirst({ where: { code: 'IT' } });
  if (!department) {
    department = await prisma.department.create({
      data: { 
        code: 'IT', 
        name: 'Information Technology',
        divisionId: division.id 
      }
    });
  }

  // Position
  let position = await prisma.position.findFirst({ where: { code: 'ADM' } });
  if (!position) {
    position = await prisma.position.create({
      data: { 
        code: 'ADM', 
        name: 'System Administrator',
        departmentId: department.id
      }
    });
  }

  // RoleGroup
  let roleGroup = await prisma.roleGroup.findFirst({ where: { code: 'ADM' } });
  if (!roleGroup) {
    roleGroup = await prisma.roleGroup.create({
      data: { code: 'ADM', name: 'System Admin' }
    });
  }

  // 2. Create User
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await prisma.employee.create({
    data: {
      code,
      fullName,
      phone,
      gender: 'Nam',
      passwordHash,
      employmentTypeId: empType.id,
      statusId: empStatus.id,
      positionId: position.id,
      departmentId: department.id,
      roleGroupId: roleGroup.id,
      subsidiaries: {
        connect: { id: subsidiary.id }
      }
    }
  });

  console.log(`Admin user created successfully!`);
  console.log(`Phone: ${phone}`);
  console.log(`Password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
