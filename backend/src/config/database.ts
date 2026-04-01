import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Real-time update broadcasting middleware
prisma.$use(async (params, next) => {
  const result = await next(params);
  
  // Models we want to watch for real-time updates
  const modelsToWatch = [
    'Customer', 'Order', 'Notification', 'Employee', 'DataPool', 
    'ChatMessage', 'CustomerInteraction', 'LeaveRequest', 'SystemConfig',
    'Product', 'Task', 'InternalNote'
  ];
  
  // Actions that modify data
  const actionsToWatch = ['create', 'update', 'delete', 'upsert', 'updateMany', 'deleteMany', 'createMany'];

  if (params.model && modelsToWatch.includes(params.model) && actionsToWatch.includes(params.action)) {
    try {
      // Import broadcastDataChange inside to avoid circular dependency
      const { broadcastDataChange } = await import('../socket');
      // Action is uppercase for consistency (CREATE, UPDATE, DELETE, ...)
      const action = params.action.replace('Many', '').toUpperCase() as 'CREATE' | 'UPDATE' | 'DELETE';
      broadcastDataChange(params.model, action);
    } catch (e) {
      // Socket.io might not be initialized yet during early startup migrations/seeding
    }
  }

  return result;
});

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
    const { ensureLeadProcessingStatuses } = await import('../utils/ensureLeadProcessingStatuses');
    await ensureLeadProcessingStatuses();
    const { ensureAddressCatalog } = await import('../controllers/viettelPostController');
    await ensureAddressCatalog();
  } catch (error) {
    console.error('[HCRM] Error connecting to database:', error);
    process.stderr.write('[HCRM] DB connection failed, exiting.\n');
    process.exit(1);
  }
};
