import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getRevenueReport,
  getCostReport,
  getTopSalesReport,
  getGrowthReport,
  getDivisionTargetsProgress,
  getCropReport,
  getRegionReport,
  getBusinessTypeReport
} from '../controllers/reportController';

const router = Router();

router.use(authMiddleware);
router.use(checkPermission('VIEW_REPORTS'));

// Báo cáo doanh thu
router.get('/revenue', getRevenueReport);

// Báo cáo chi phí
router.get('/cost', getCostReport);

// Top nhân viên kinh doanh
router.get('/top-sales', getTopSalesReport);

// Báo cáo tăng trưởng
router.get('/growth', getGrowthReport);

// Mục tiêu và tiến trình theo KHỐI
router.get('/division-targets', getDivisionTargetsProgress);

// Báo cáo theo cây trồng
router.get('/crops', getCropReport);

// Báo cáo theo vùng miền
router.get('/regions', getRegionReport);

// Báo cáo theo loại khách hàng
router.get('/business-types', getBusinessTypeReport);

export default router;
