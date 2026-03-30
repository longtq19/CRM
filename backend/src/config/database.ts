import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected via Prisma');
    const { syncDefaultMenus } = await import('../controllers/authController');
    await syncDefaultMenus();
    const { ensureOrgRootCompany, ensureHrDepartmentUnits, ensureEmploymentTypes } = await import(
      '../controllers/hrController'
    );
    await ensureOrgRootCompany();
    await ensureHrDepartmentUnits();
    await ensureEmploymentTypes();
    const { ensureDefaultProductCategories } = await import('../controllers/productController');
    await ensureDefaultProductCategories();
    const { seedDefaultConfigs } = await import('../controllers/systemConfigController');
    await seedDefaultConfigs();
    const { ensureDefaultCustomerTags } = await import('../utils/ensureDefaultCustomerTags');
    await ensureDefaultCustomerTags();
    const { ensureAddressCatalog } = await import('../controllers/viettelPostController');
    await ensureAddressCatalog();
  } catch (error) {
    console.error('[HCRM] Error connecting to database:', error);
    process.stderr.write('[HCRM] DB connection failed, exiting.\n');
    process.exit(1);
  }
};
