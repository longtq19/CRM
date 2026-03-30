import { Router } from 'express';
import { notificationController } from '../controllers/notificationController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

// Admin Side
router.get('/admin/notifications', authMiddleware, checkPermission(['MANAGE_NOTIFICATIONS', 'CREATE_DRAFT_NOTIFICATION']), notificationController.getAll);
router.post('/admin/notifications', authMiddleware, checkPermission(['MANAGE_NOTIFICATIONS', 'CREATE_DRAFT_NOTIFICATION']), notificationController.create);
router.put('/admin/notifications/:id', authMiddleware, checkPermission(['MANAGE_NOTIFICATIONS', 'CREATE_DRAFT_NOTIFICATION']), notificationController.update);
router.delete('/admin/notifications/:id', authMiddleware, checkPermission('MANAGE_NOTIFICATIONS'), notificationController.delete);

// User Side
router.get('/notifications', authMiddleware, notificationController.getMyNotifications);
router.get('/notifications/unread-count', authMiddleware, notificationController.getUnreadCount);
router.post('/notifications/:id/read', authMiddleware, notificationController.markAsRead);

export default router;
