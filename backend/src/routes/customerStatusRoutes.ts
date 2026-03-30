import express from 'express';
import { authenticate, checkPermission } from '../middleware/authMiddleware';
import {
  getCustomerStatuses,
  createCustomerStatus,
  updateCustomerStatus,
  deleteCustomerStatus,
  updateCustomerStatusAssignment
} from '../controllers/customerStatusController';

const router = express.Router();

router.use(authenticate);

// Customer Statuses CRUD
router.get('/', checkPermission('VIEW_SETTINGS'), getCustomerStatuses);
router.post('/', checkPermission('EDIT_SETTINGS'), createCustomerStatus);
router.put('/:id', checkPermission('EDIT_SETTINGS'), updateCustomerStatus);
router.delete('/:id', checkPermission('EDIT_SETTINGS'), deleteCustomerStatus);

// API endpoint để cập nhật trạng thái của một khách hàng (có thể gọi từ chi tiết KH)
router.post('/customer/:customerId', checkPermission('MANAGE_CUSTOMERS'), updateCustomerStatusAssignment);

export default router;
