import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Sales Modules...');

  // 1. Thêm Permissions mới
  const newPermissions = [
    // Data Pool
    { code: 'VIEW_FLOATING_POOL', name: 'Xem kho số thả nổi', description: 'Quyền xem danh sách kho số thả nổi' },
    { code: 'MANAGE_DATA_POOL', name: 'Quản lý kho số thả nổi', description: 'Quyền phân số, thu hồi, cấu hình kho thả nổi' },
    { code: 'CLAIM_LEAD', name: 'Nhận khách từ kho Sales', description: 'Quyền tự nhận khách từ kho Sales (chưa phân)' },
    
    // Sales
    { code: 'VIEW_SALES', name: 'Xem Sales', description: 'Quyền xem lead và cơ hội của mình' },
    { code: 'MANAGE_SALES', name: 'Quản lý Sales', description: 'Quyền cập nhật, chuyển đổi lead/cơ hội' },
    
    // Resales
    { code: 'VIEW_RESALES', name: 'Xem Resales', description: 'Quyền xem khách hàng và lịch chăm sóc' },
    { code: 'MANAGE_RESALES', name: 'Quản lý Resales', description: 'Quyền chăm sóc, cập nhật khách hàng' },
    
    // Orders
    { code: 'VIEW_ORDERS', name: 'Xem đơn hàng', description: 'Quyền xem danh sách đơn hàng' },
    { code: 'MANAGE_ORDERS', name: 'Quản lý đơn hàng', description: 'Quyền tạo, cập nhật đơn hàng' },
    { code: 'MANAGE_SHIPPING', name: 'Quản lý vận đơn', description: 'Quyền xác nhận, đẩy đơn vận chuyển' },
    
    // Customers
    { code: 'VIEW_CUSTOMERS', name: 'Xem khách hàng', description: 'Quyền xem danh sách khách hàng' },
  ];

  for (const perm of newPermissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description },
      create: perm,
    });
    console.log(`  Permission: ${perm.code}`);
  }

  // 2. Thêm Menu mới
  const newMenus = [
    { label: 'Kho số thả nổi', path: '/data-pool', icon: 'Database', order: 7 },
    { label: 'Sales', path: '/sales', icon: 'Phone', order: 8 },
    { label: 'Resales', path: '/resales', icon: 'UserCheck', order: 9 },
  ];

  for (const menu of newMenus) {
    const existing = await prisma.menu.findFirst({ where: { path: menu.path } });
    if (!existing) {
      await prisma.menu.create({ data: menu });
      console.log(`  Menu: ${menu.label}`);
    } else {
      await prisma.menu.update({
        where: { id: existing.id },
        data: { label: menu.label, icon: menu.icon, order: menu.order }
      });
      console.log(`  Menu updated: ${menu.label}`);
    }
  }

  // 3. Gán permissions cho ADM role group
  const admRoleGroup = await prisma.roleGroup.findFirst({ where: { code: 'ADM' } });
  if (admRoleGroup) {
    const allPermissions = await prisma.permission.findMany();
    await prisma.roleGroup.update({
      where: { id: admRoleGroup.id },
      data: {
        permissions: {
          set: allPermissions.map(p => ({ id: p.id }))
        }
      }
    });
    console.log('  ADM role group updated with all permissions');
  }

  // 4. Gán permissions cho Sales role groups
  const salesPermissions = ['VIEW_FLOATING_POOL', 'CLAIM_LEAD', 'VIEW_SALES', 'MANAGE_SALES', 'VIEW_ORDERS', 'MANAGE_ORDERS', 'CREATE_ORDER'];
  const salesRoleGroups = await prisma.roleGroup.findMany({
    where: { code: { in: ['SALES_MGR', 'SALES_STAFF'] } }
  });

  for (const rg of salesRoleGroups) {
    const perms = await prisma.permission.findMany({
      where: { code: { in: salesPermissions } }
    });
    await prisma.roleGroup.update({
      where: { id: rg.id },
      data: {
        permissions: {
          connect: perms.map(p => ({ id: p.id }))
        }
      }
    });
    console.log(`  ${rg.code} updated with sales permissions`);
  }

  // 5. Gán permissions cho Resales role groups
  const resalesPermissions = ['VIEW_RESALES', 'MANAGE_RESALES', 'VIEW_ORDERS', 'MANAGE_ORDERS', 'CREATE_ORDER', 'VIEW_CUSTOMERS'];
  const resalesRoleGroups = await prisma.roleGroup.findMany({
    where: { code: { in: ['CSKH_MGR', 'CSKH_STAFF'] } }
  });

  for (const rg of resalesRoleGroups) {
    const perms = await prisma.permission.findMany({
      where: { code: { in: resalesPermissions } }
    });
    await prisma.roleGroup.update({
      where: { id: rg.id },
      data: {
        permissions: {
          connect: perms.map(p => ({ id: p.id }))
        }
      }
    });
    console.log(`  ${rg.code} updated with resales permissions`);
  }

  // 6. Gán permissions cho Shipping role groups
  const shippingPermissions = ['VIEW_ORDERS', 'MANAGE_SHIPPING'];
  const shippingRoleGroups = await prisma.roleGroup.findMany({
    where: { code: { in: ['SHIPPING_MGR', 'SHIPPING_STAFF'] } }
  });

  for (const rg of shippingRoleGroups) {
    const perms = await prisma.permission.findMany({
      where: { code: { in: shippingPermissions } }
    });
    await prisma.roleGroup.update({
      where: { id: rg.id },
      data: {
        permissions: {
          connect: perms.map(p => ({ id: p.id }))
        }
      }
    });
    console.log(`  ${rg.code} updated with shipping permissions`);
  }

  // 7. Gán menu cho ADM
  if (admRoleGroup) {
    const allMenus = await prisma.menu.findMany();
    await prisma.roleGroup.update({
      where: { id: admRoleGroup.id },
      data: {
        menus: {
          set: allMenus.map(m => ({ id: m.id }))
        }
      }
    });
    console.log('  ADM role group updated with all menus');
  }

  console.log('Seeding completed!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
