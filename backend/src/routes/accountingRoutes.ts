import express from 'express';
import { authenticate, checkPermission } from '../middleware/authMiddleware';
import {
  // Salary Components
  getSalaryComponents,
  createSalaryComponent,
  updateSalaryComponent,
  deleteSalaryComponent,
  // Payroll
  getPayrolls,
  getPayrollById,
  createPayroll,
  updatePayroll,
  approvePayroll,
  generateMonthlyPayroll,
  // Draft Invoice
  getDraftInvoices,
  getDraftInvoiceById,
  createDraftInvoice,
  updateDraftInvoice,
  deleteDraftInvoice,
  prepareInvoiceExport,
  createInvoiceFromOrder,
  // Financial Reports
  getFinancialReports,
  generateFinancialReport,
  getAccountingSummary,
  // Invoice Provider
  getInvoiceProviders,
  createInvoiceProvider,
  updateInvoiceProvider,
  getRoleDashboard,
  upsertRoleMetric
} from '../controllers/accountingController';

const router = express.Router();

router.use(authenticate);

// ==========================================
// Salary Components - Đầu mục lương
// ==========================================
router.get('/salary-components', checkPermission('VIEW_ACCOUNTING'), getSalaryComponents);
router.post('/salary-components', checkPermission('MANAGE_ACCOUNTING'), createSalaryComponent);
router.put('/salary-components/:id', checkPermission('MANAGE_ACCOUNTING'), updateSalaryComponent);
router.delete('/salary-components/:id', checkPermission('MANAGE_ACCOUNTING'), deleteSalaryComponent);

// ==========================================
// Payroll - Bảng lương
// ==========================================
router.get('/payrolls', checkPermission('VIEW_ACCOUNTING'), getPayrolls);
router.get('/payrolls/:id', checkPermission('VIEW_ACCOUNTING'), getPayrollById);
router.post('/payrolls', checkPermission('MANAGE_ACCOUNTING'), createPayroll);
router.put('/payrolls/:id', checkPermission('MANAGE_ACCOUNTING'), updatePayroll);
router.post('/payrolls/:id/approve', checkPermission('MANAGE_ACCOUNTING'), approvePayroll);
router.post('/payrolls/generate', checkPermission('MANAGE_ACCOUNTING'), generateMonthlyPayroll);

// ==========================================
// Draft Invoice - Hóa đơn nháp
// ==========================================
router.get('/invoices', checkPermission('VIEW_ACCOUNTING'), getDraftInvoices);
router.get('/invoices/:id', checkPermission('VIEW_ACCOUNTING'), getDraftInvoiceById);
router.post('/invoices', checkPermission('MANAGE_ACCOUNTING'), createDraftInvoice);
router.put('/invoices/:id', checkPermission('MANAGE_ACCOUNTING'), updateDraftInvoice);
router.delete('/invoices/:id', checkPermission('MANAGE_ACCOUNTING'), deleteDraftInvoice);
router.post('/invoices/:id/prepare-export', checkPermission('MANAGE_ACCOUNTING'), prepareInvoiceExport);
router.post('/invoices/from-order', checkPermission('MANAGE_ACCOUNTING'), createInvoiceFromOrder);

// ==========================================
// Financial Reports - Báo cáo tài chính
// ==========================================
router.get('/reports', checkPermission('VIEW_ACCOUNTING'), getFinancialReports);
router.post('/reports/generate', checkPermission('MANAGE_ACCOUNTING'), generateFinancialReport);
router.get('/summary', checkPermission('VIEW_ACCOUNTING'), getAccountingSummary);

// ==========================================
// Invoice Provider - Nhà cung cấp hóa đơn
// ==========================================
router.get('/providers', checkPermission('VIEW_ACCOUNTING'), getInvoiceProviders);
router.post('/providers', checkPermission('MANAGE_ACCOUNTING'), createInvoiceProvider);
router.put('/providers/:id', checkPermission('MANAGE_ACCOUNTING'), updateInvoiceProvider);

// Bảng chỉ số theo vai trò (MKT, CSKH, Sale, Vận đơn, Ecom)
router.get('/role-dashboard', checkPermission('VIEW_ACCOUNTING'), getRoleDashboard);
router.put('/role-metrics', checkPermission('MANAGE_ACCOUNTING'), upsertRoleMetric);

export default router;
