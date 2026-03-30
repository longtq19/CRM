import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead
} from '../controllers/userNotificationController';
import {
  getVapidPublicKey,
  saveSubscription
} from '../controllers/pushSubscriptionController';

const router = Router();

router.use(authMiddleware);

// Web Push: lấy VAPID public key và đăng ký subscription (hiển thị thông báo khi màn hình khóa)
router.get('/push-vapid-key', getVapidPublicKey);
router.post('/push-subscribe', saveSubscription);

// Lấy danh sách thông báo
router.get('/', getUserNotifications);

// Lấy số thông báo chưa đọc
router.get('/unread-count', getUnreadCount);

// Đánh dấu tất cả đã đọc
router.put('/mark-all-read', markAllAsRead);

// Xóa tất cả thông báo đã đọc
router.delete('/read', deleteAllRead);

// Đánh dấu một thông báo đã đọc
router.put('/:id/read', markAsRead);

// Xóa một thông báo
router.delete('/:id', deleteNotification);

export default router;
