import { Router } from 'express';
import {
  getDataPool,
  claimLead,
  assignLeads,
  autoDistribute,
  recallLeads,
  addToDataPool,
  getDistributionConfig,
  updateDistributionConfig,
  getDataPoolStats,
  getDistributionRatios,
  updateDistributionRatios,
  immediateDistribute,
  updateProcessingStatus,
  updateCallbackSchedule,
  distributeFromFloatingPool,
  claimFromFloatingPool,
  distributeFromSalesPool,
  distributeFromCskhPool,
} from '../controllers/dataPoolController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

// Thống kê — VIEW_SALES chỉ dùng số liệu kho Sales mở (FE Sales); VIEW_FLOATING_POOL xem đủ; VIEW_MANAGED_UNIT_POOL: theo đơn vị
router.get(
  '/stats',
  checkPermission(['VIEW_FLOATING_POOL', 'VIEW_SALES', 'VIEW_MANAGED_UNIT_POOL']),
  getDataPoolStats
);

// Cấu hình phân số
router.get('/config', checkPermission('DATA_POOL_CONFIG'), getDistributionConfig);
router.put('/config', checkPermission('DATA_POOL_CONFIG'), updateDistributionConfig);

// Danh sách — VIEW_FLOATING_POOL: mọi pool_queue; VIEW_SALES: chỉ SALES_OPEN (controller ép); VIEW_MANAGED_UNIT_POOL: phạm vi đơn vị
router.get('/', checkPermission(['VIEW_FLOATING_POOL', 'VIEW_SALES', 'VIEW_MANAGED_UNIT_POOL']), getDataPool);

// ── Kho thả nổi ──
// Phân chia số từ kho thả nổi cho NV hoặc đơn vị
router.post(
  '/distribute',
  checkPermission(['DISTRIBUTE_FLOATING_POOL', 'MANAGE_DATA_POOL', 'DISTRIBUTE_FLOATING_CROSS_ORG']),
  distributeFromFloatingPool
);
// NV Sales/CSKH tự nhận khách từ kho thả nổi / kho CSKH
// NV Sales/CSKH tự nhận khách từ kho thả nổi / kho CSKH
router.post(
  '/claim-customer',
  (req, res, next) => {
    const user = (req as any).user;
    const role = (user.roleGroupCode || '').toLowerCase();
    if (
      role.includes('sales') ||
      role.includes('customer_success') ||
      user.permissions.includes('CLAIM_FLOATING_POOL') ||
      user.permissions.includes('CLAIM_LEAD_CSKH')
    ) {
      return next();
    }
    return checkPermission(['CLAIM_FLOATING_POOL', 'CLAIM_LEAD_CSKH'])(req, res, next);
  },
  claimFromFloatingPool
);

// ── Legacy / nội bộ (giữ cho cron và luồng vận hành) ──
router.post('/claim', checkPermission('CLAIM_LEAD'), claimLead);
router.post('/assign', checkPermission('ASSIGN_LEAD'), assignLeads);
router.post('/auto-distribute', checkPermission('ASSIGN_LEAD'), autoDistribute);
router.post('/recall', checkPermission(['MANAGE_DATA_POOL', 'RECALL_MANAGED_UNIT_LEADS']), recallLeads);
router.post('/add', checkPermission('MANAGE_DATA_POOL'), addToDataPool);
router.get('/distribution-ratios', checkPermission('CONFIG_DISTRIBUTION'), getDistributionRatios);
router.put('/distribution-ratios', checkPermission('CONFIG_DISTRIBUTION'), updateDistributionRatios);
router.post('/immediate-distribute', checkPermission('ASSIGN_LEAD'), immediateDistribute);

// Cập nhật trạng thái xử lý lead (sales)
router.put('/processing-status', checkPermission('CLAIM_LEAD'), updateProcessingStatus);

// Hẹn gọi lại + nhắc thông báo (NV được gán hoặc quản lý Sales/CSKH)
router.put(
  '/callback-schedule',
  checkPermission(['CLAIM_LEAD', 'MANAGE_SALES', 'MANAGE_RESALES', 'MANAGE_DATA_POOL']),
  updateCallbackSchedule,
);

// ── Kho Sales (chưa phân) ──
// Quản lý phân chia lead từ kho Sales cho NV hoặc đơn vị
router.post(
  '/distribute-sales',
  checkPermission(['ASSIGN_LEAD', 'MANAGE_DATA_POOL', 'DISTRIBUTE_SALES_CROSS_ORG', 'DISTRIBUTE_TO_UNIT', 'DISTRIBUTE_TO_STAFF']),
  distributeFromSalesPool
);

// ── Kho CSKH (chưa phân) ──
// Quản lý phân chia lead từ kho CSKH cho NV hoặc đơn vị
router.post(
  '/distribute-cskh',
  checkPermission(['MANAGE_CSKH_POOL', 'MANAGE_DATA_POOL', 'DISTRIBUTE_SALES_CROSS_ORG', 'DISTRIBUTE_TO_UNIT', 'DISTRIBUTE_TO_STAFF']),
  distributeFromCskhPool
);

export default router;
