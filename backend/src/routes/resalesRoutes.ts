import { Router } from 'express';
import {
  getMyCustomers,
  getCustomerDetail,
  getCareSchedule,
  addCareInteraction,
  getCustomerOrders,
  getResalesStats,
  updateCustomer,
  transferCustomer,
  getCustomerInteractions,
  updateCskhLeadPriority,
} from '../controllers/resalesController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

// Tất cả routes cần xác thực
router.use(authMiddleware);

// Thống kê Resales
router.get('/stats', checkPermission('VIEW_RESALES'), getResalesStats);

// Lịch chăm sóc
router.get('/care-schedule', checkPermission('VIEW_RESALES'), getCareSchedule);

// Danh sách khách hàng của tôi
router.get('/my-customers', checkPermission('VIEW_RESALES'), getMyCustomers);

// Chi tiết khách hàng
router.get('/customer/:id', checkPermission('VIEW_RESALES'), getCustomerDetail);

// Cập nhật khách hàng
router.put('/customer/:id', checkPermission('MANAGE_RESALES'), updateCustomer);

// Lịch sử đơn hàng của khách
router.get('/customer/:customerId/orders', checkPermission('VIEW_RESALES'), getCustomerOrders);

// Ghi nhận tương tác chăm sóc
router.post('/interaction', checkPermission('MANAGE_RESALES'), addCareInteraction);

// Lịch sử tác động (customer_interactions)
router.get('/interactions/:customerId', checkPermission('VIEW_RESALES'), getCustomerInteractions);

// Ưu tiên lead CSKH (data_pool)
router.patch('/lead/:id/priority', checkPermission('MANAGE_RESALES'), updateCskhLeadPriority);

// Chuyển khách hàng
router.post('/transfer', checkPermission('MANAGE_RESALES'), transferCustomer);

export default router;
