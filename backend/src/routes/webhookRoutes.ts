import { Router } from 'express';
import { 
  handleVTPWebhook, 
  testWebhook,
  getOrderShippingLogs 
} from '../controllers/viettelPostWebhookController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

/**
 * =====================================================
 * VIETTEL POST WEBHOOK ROUTES
 * =====================================================
 * 
 * Public endpoints (không cần auth - VTP gọi trực tiếp):
 * - POST /webhook/viettelpost/order-status
 * - POST /webhook/viettelpost/test
 * 
 * Protected endpoints (cần auth):
 * - GET /webhook/orders/:orderId/shipping-logs
 */

// Public webhook endpoints (VTP gọi trực tiếp)
router.post('/viettelpost/order-status', handleVTPWebhook);
router.post('/viettelpost/order-st', handleVTPWebhook); // Khớp với URL đã cấu hình trên VTP Portal
router.post('/viettelpost/test', testWebhook);
router.get('/viettelpost/test', testWebhook);

// Protected endpoints
router.get('/orders/:orderId/shipping-logs', authMiddleware, getOrderShippingLogs);

export default router;
