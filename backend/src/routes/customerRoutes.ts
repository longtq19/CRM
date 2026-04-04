import { Router } from 'express';
import {
  getCustomers,
  getCustomerById,
  getCustomerStats,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getViewableEmployees,
  exportCustomersExcel,
  getCustomerImportTemplate,
  importCustomersExcel,
  getCustomerTags,
  createCustomerTag,
  updateCustomerTag,
  deleteCustomerTag,
  assignTagToCustomer,
  removeTagFromCustomer,
  getCustomerFarms,
  createCustomerFarm,
  updateCustomerFarm,
  deleteCustomerFarm,
  setPhoneSecondary,
  patchCustomerQuickName,
  patchCustomerQuickMainCrop,
  patchCustomerQuickMainCrops,
} from '../controllers/customerController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import { excelUploadMiddleware } from '../middleware/excelUploadMiddleware';

const router = Router();

/** Ghi thẻ (CRUD) + gán thẻ: Marketing / Sales / CSKH / hoặc quản lý khách chung. */
const TAG_CUSTOMER_WRITE_PERMS = [
  'MANAGE_CUSTOMERS',
  'MANAGE_SALES',
  'MANAGE_RESALES',
  'MANAGE_MARKETING_GROUPS',
] as const;

/** Tạo khách từ Sales / CSKH (hoặc quản lý khách). */
const CUSTOMER_CREATE_PERMS = ['MANAGE_CUSTOMERS', 'CREATE_CUSTOMER', 'MANAGE_SALES', 'MANAGE_RESALES'] as const;

// Customer Tags
router.get('/customer-tags', authMiddleware, getCustomerTags);
router.post('/customer-tags', authMiddleware, checkPermission([...TAG_CUSTOMER_WRITE_PERMS]), createCustomerTag);
router.put('/customer-tags/:id', authMiddleware, checkPermission([...TAG_CUSTOMER_WRITE_PERMS]), updateCustomerTag);
router.delete('/customer-tags/:id', authMiddleware, checkPermission([...TAG_CUSTOMER_WRITE_PERMS]), deleteCustomerTag);
router.post('/customer-tags/assign', authMiddleware, checkPermission([...TAG_CUSTOMER_WRITE_PERMS]), assignTagToCustomer);
router.delete('/customer-tags/:customerId/:tagId', authMiddleware, checkPermission([...TAG_CUSTOMER_WRITE_PERMS]), removeTagFromCustomer);

// Customer Farms
router.get('/customers/:customerId/farms', authMiddleware, checkPermission('VIEW_CUSTOMERS'), getCustomerFarms);
router.post('/customers/:customerId/farms', authMiddleware, checkPermission(['MANAGE_CUSTOMERS', 'CREATE_CUSTOMER']), createCustomerFarm);
router.put('/customers/farms/:farmId', authMiddleware, checkPermission(['MANAGE_CUSTOMERS', 'UPDATE_CUSTOMER']), updateCustomerFarm);
router.delete('/customers/farms/:farmId', authMiddleware, checkPermission(['MANAGE_CUSTOMERS', 'DELETE_CUSTOMER']), deleteCustomerFarm);

// Customers
router.get('/customers/stats', authMiddleware, checkPermission('VIEW_CUSTOMERS'), getCustomerStats);
router.get('/customers/viewable-employees', authMiddleware, checkPermission('VIEW_CUSTOMERS'), getViewableEmployees);
router.get('/customers/import/template', authMiddleware, checkPermission('VIEW_CUSTOMERS'), getCustomerImportTemplate);
router.post('/customers/import', authMiddleware, checkPermission(['MANAGE_CUSTOMERS', 'CREATE_CUSTOMER']), excelUploadMiddleware.single('file'), importCustomersExcel);
router.get('/customers/:id', authMiddleware, checkPermission('VIEW_CUSTOMERS'), getCustomerById);
router.get('/customers', authMiddleware, checkPermission('VIEW_CUSTOMERS'), getCustomers);
router.post('/customers', authMiddleware, checkPermission([...CUSTOMER_CREATE_PERMS]), createCustomer);
router.patch(
  '/customers/:id/phone-secondary',
  authMiddleware,
  checkPermission(['MANAGE_SALES', 'MANAGE_RESALES', 'MANAGE_CUSTOMERS']),
  setPhoneSecondary,
);
router.patch(
  '/customers/:id/quick-name',
  authMiddleware,
  checkPermission(['MANAGE_SALES', 'MANAGE_RESALES', 'MANAGE_CUSTOMERS']),
  patchCustomerQuickName,
);
router.patch(
  '/customers/:id/quick-main-crop',
  authMiddleware,
  checkPermission(['MANAGE_SALES', 'MANAGE_RESALES', 'MANAGE_CUSTOMERS']),
  patchCustomerQuickMainCrop,
);
router.patch(
  '/customers/:id/quick-main-crops',
  authMiddleware,
  checkPermission(['MANAGE_SALES', 'MANAGE_RESALES', 'MANAGE_CUSTOMERS']),
  patchCustomerQuickMainCrops,
);
router.put('/customers/:id', authMiddleware, checkPermission(['MANAGE_CUSTOMERS', 'UPDATE_CUSTOMER']), updateCustomer);
router.delete('/customers/:id', authMiddleware, checkPermission('DELETE_CUSTOMER'), deleteCustomer);

export default router;
