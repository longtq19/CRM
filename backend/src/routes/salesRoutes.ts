import { Router } from 'express';
import {
  getMyLeads,
  updateLeadStatus,
  addInteraction,
  getInteractions,
  getSalesStats,
  updateLeadPriority,
} from '../controllers/salesController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

// Thống kê Sales
router.get('/stats', checkPermission('VIEW_SALES'), getSalesStats);

// Danh sách Lead (với view scope + extended filters)
router.get('/my-leads', checkPermission('VIEW_SALES'), getMyLeads);

// Cập nhật trạng thái lead
router.put('/lead/:id/status', checkPermission('MANAGE_SALES'), updateLeadStatus);

// Ưu tiên lead (data pool Sales)
router.patch('/lead/:id/priority', checkPermission('MANAGE_SALES'), updateLeadPriority);

// Ghi nhận tương tác
router.post('/interaction', checkPermission('MANAGE_SALES'), addInteraction);

// Lấy lịch sử tương tác
router.get('/interactions/:customerId', checkPermission('VIEW_SALES'), getInteractions);

export default router;
