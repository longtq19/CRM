import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  confirmOrder,
  distributePendingOrdersConfirm,
  pushToViettelPost,
  cancelViettelPostOrder,
  getShippingStatus,
  updateShippingStatus,
  getOrderStats,
  shippingEditOrder,
  processReturnedOrder,
  deleteOrder,
  exportOrders
} from '../controllers/orderController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

// Tất cả routes cần xác thực
router.use(authMiddleware);

// Thống kê
router.get('/stats', checkPermission(['VIEW_ORDERS', 'MANAGE_ORDERS']), getOrderStats);

// Xuất Excel đơn hàng
router.get('/export', checkPermission(['VIEW_ORDERS', 'MANAGE_ORDERS']), exportOrders);

// Danh sách đơn hàng
router.get('/', checkPermission(['VIEW_ORDERS', 'MANAGE_ORDERS']), getOrders);

// Chia xác nhận hàng loạt đơn chờ xác nhận cho NV vận đơn (phải đặt trước /:id/:orderDate)
router.post(
  '/distribute-pending-confirm',
  checkPermission(['CONFIRM_ORDER', 'ASSIGN_SHIPPING_DAILY_QUOTA']),
  distributePendingOrdersConfirm
);

// Chi tiết đơn hàng
router.get('/:id/:orderDate', checkPermission(['VIEW_ORDERS', 'MANAGE_ORDERS']), getOrderById);

// Tạo đơn hàng
router.post('/', checkPermission(['CREATE_ORDER', 'MANAGE_ORDERS']), createOrder);

// Cập nhật đơn hàng (Sửa đơn)
router.put('/:id/:orderDate', checkPermission(['EDIT_ORDER', 'MANAGE_ORDERS']), updateOrder);

// Xác nhận đơn hàng (NV vận đơn)
router.post('/:id/:orderDate/confirm', checkPermission(['CONFIRM_ORDER', 'MANAGE_SHIPPING', 'MANAGE_ORDERS']), confirmOrder);

// Nhân viên vận đơn sửa đơn hàng (cho phép Logistics sửa thông tin vận chuyển)
router.put('/:id/:orderDate/shipping-edit', checkPermission(['CONFIRM_ORDER', 'MANAGE_SHIPPING', 'MANAGE_ORDERS']), shippingEditOrder);

// Xử lý hàng hoàn
router.post('/:id/:orderDate/process-return', checkPermission(['MANAGE_SHIPPING', 'MANAGE_ORDERS']), processReturnedOrder);

// Đẩy sang Viettel Post
router.post('/:id/:orderDate/push-viettel-post', checkPermission(['PUSH_ORDER_TO_SHIPPING', 'MANAGE_SHIPPING']), pushToViettelPost);

// Hủy vận đơn trên Viettel Post / Hủy đơn hàng nội bộ
router.post('/:id/:orderDate/cancel-viettel-post', checkPermission(['CANCEL_ORDER', 'MANAGE_SHIPPING', 'MANAGE_ORDERS']), cancelViettelPostOrder);

// Lấy trạng thái vận chuyển
router.get('/:id/:orderDate/shipping-status', checkPermission(['VIEW_ORDERS', 'MANAGE_ORDERS']), getShippingStatus);

// Cập nhật trạng thái vận chuyển (Manual status update)
router.put('/:id/:orderDate/shipping-status', checkPermission(['MANAGE_SHIPPING', 'MANAGE_ORDERS']), updateShippingStatus);

// Xóa vĩnh viễn đơn hàng
router.delete('/:id/:orderDate', checkPermission(['DELETE_ORDER', 'MANAGE_ORDERS']), deleteOrder);

export default router;
