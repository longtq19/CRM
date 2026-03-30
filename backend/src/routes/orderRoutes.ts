import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  createOrder,
  createOrderOutsideSystem,
  updateOrder,
  confirmOrder,
  pushToViettelPost,
  cancelViettelPostOrder,
  getShippingStatus,
  updateShippingStatus,
  getOrderStats,
  shippingEditOrder,
  processReturnedOrder
} from '../controllers/orderController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

// Tất cả routes cần xác thực
router.use(authMiddleware);

// Thống kê
router.get('/stats', checkPermission('VIEW_ORDERS'), getOrderStats);

// Danh sách đơn hàng
router.get('/', checkPermission('VIEW_ORDERS'), getOrders);

// Chi tiết đơn hàng
router.get('/:id/:orderDate', checkPermission('VIEW_ORDERS'), getOrderById);

// Tạo đơn hàng ngoài hệ thống (chỉ ADM, phục vụ test VTP)
router.post('/outside-system', checkPermission('CREATE_ORDER_OUTSIDE_SYSTEM'), createOrderOutsideSystem);
// Tạo đơn hàng
router.post('/', checkPermission(['CREATE_ORDER', 'MANAGE_ORDERS']), createOrder);

// Cập nhật đơn hàng
router.put('/:id/:orderDate', checkPermission('MANAGE_ORDERS'), updateOrder);

// Xác nhận đơn hàng (NV vận đơn)
router.post('/:id/:orderDate/confirm', checkPermission('MANAGE_SHIPPING'), confirmOrder);

// Nhân viên vận đơn sửa đơn hàng
router.put('/:id/:orderDate/shipping-edit', checkPermission('MANAGE_SHIPPING'), shippingEditOrder);

// Xử lý hàng hoàn
router.post('/:id/:orderDate/process-return', checkPermission('MANAGE_SHIPPING'), processReturnedOrder);

// Đẩy sang Viettel Post
router.post('/:id/:orderDate/push-viettel-post', checkPermission('MANAGE_SHIPPING'), pushToViettelPost);

// Hủy vận đơn trên Viettel Post (đơn đã có trackingNumber VTP)
router.post('/:id/:orderDate/cancel-viettel-post', checkPermission('MANAGE_SHIPPING'), cancelViettelPostOrder);

// Lấy trạng thái vận chuyển
router.get('/:id/:orderDate/shipping-status', checkPermission('VIEW_ORDERS'), getShippingStatus);

// Cập nhật trạng thái vận chuyển
router.put('/:id/:orderDate/shipping-status', checkPermission('MANAGE_SHIPPING'), updateShippingStatus);

export default router;
