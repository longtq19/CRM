import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getDivisions,
  getDivisionById,
  updateDivision,
  getDivisionStructure,
  getDivisionTargets
} from '../controllers/divisionController';

const router = Router();

router.use(authMiddleware);

// Lấy danh sách KHỐI (quyền xem)
router.get('/', checkPermission('VIEW_DIVISIONS'), getDivisions);

// Lấy cấu trúc KHỐI cho Dashboard
router.get('/structure', checkPermission('VIEW_DIVISIONS'), getDivisionStructure);

// Lấy mục tiêu kinh doanh theo KHỐI
router.get('/targets', checkPermission('VIEW_DIVISIONS'), getDivisionTargets);

// Lấy chi tiết KHỐI
router.get('/:id', checkPermission('VIEW_DIVISIONS'), getDivisionById);

// Cập nhật KHỐI (ADM only - kiểm tra trong controller)
router.put('/:id', updateDivision);

export default router;
