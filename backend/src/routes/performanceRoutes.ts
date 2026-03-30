import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getMarketingPerformance,
  getSalesPerformance,
  getResalesPerformance,
  getSalesTargets,
  updateSalesTarget,
  getDashboardProgress,
  getComprehensiveReport
} from '../controllers/performanceController';

const router = Router();

router.use(authMiddleware);

/** Marketing: quyền điều hành như trước */
router.get('/marketing', checkPermission(['VIEW_PERFORMANCE', 'VIEW_REPORTS']), getMarketingPerformance);

/** Sales / CSKH: thêm quyền module để gán trên Nhóm quyền (xem README) */
router.get(
  '/sales',
  checkPermission(['VIEW_PERFORMANCE', 'VIEW_REPORTS', 'VIEW_SALES_EFFECTIVENESS']),
  getSalesPerformance
);
router.get(
  '/resales',
  checkPermission(['VIEW_PERFORMANCE', 'VIEW_REPORTS', 'VIEW_CSKH_EFFECTIVENESS']),
  getResalesPerformance
);

router.get(
  '/dashboard/progress',
  checkPermission(['VIEW_PERFORMANCE', 'VIEW_DASHBOARD', 'VIEW_REPORTS']),
  getDashboardProgress
);

router.get(
  '/targets',
  checkPermission(['VIEW_PERFORMANCE', 'VIEW_DIVISIONS', 'CONFIG_OPERATIONS', 'EDIT_SETTINGS']),
  getSalesTargets
);
router.put('/targets', checkPermission(['CONFIG_OPERATIONS', 'EDIT_SETTINGS']), updateSalesTarget);

router.get('/comprehensive', checkPermission(['VIEW_PERFORMANCE', 'VIEW_REPORTS']), getComprehensiveReport);

export default router;
