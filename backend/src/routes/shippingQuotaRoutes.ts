import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getMyShippingDailyQuota,
  listShippingDailyQuotas,
  upsertShippingDailyQuotas,
  getShippingAssignableEmployees,
} from '../controllers/shippingQuotaController';

const router = Router();
router.use(authMiddleware);

router.get('/daily-quotas/me', checkPermission('MANAGE_SHIPPING'), getMyShippingDailyQuota);
router.get(
  '/daily-quotas/assignable-employees',
  checkPermission('ASSIGN_SHIPPING_DAILY_QUOTA'),
  getShippingAssignableEmployees
);
router.get('/daily-quotas', checkPermission('ASSIGN_SHIPPING_DAILY_QUOTA'), listShippingDailyQuotas);
router.put('/daily-quotas', checkPermission('ASSIGN_SHIPPING_DAILY_QUOTA'), upsertShippingDailyQuotas);

export default router;
