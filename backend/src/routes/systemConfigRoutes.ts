import express from 'express';
import { 
  getSystemConfigs, 
  getSystemConfigByKey, 
  updateSystemConfig, 
  updateMultipleConfigs,
  getConfigCategories 
} from '../controllers/systemConfigController';
import { authenticate, checkPermission } from '../middleware/authMiddleware';
import { isTechnicalAdminRoleCode, userHasCatalogPermission } from '../constants/rbac';

const router = express.Router();

// Tất cả routes đều yêu cầu authentication
router.use(authenticate);

// Lấy danh sách categories
router.get('/categories', getConfigCategories);

// Lấy tất cả cấu hình (có thể filter theo category)
router.get('/', getSystemConfigs);

// Lấy một cấu hình theo key
router.get('/:key', getSystemConfigByKey);

// Cập nhật một cấu hình (EDIT_SETTINGS, CONFIG_OPERATIONS, MANAGE_HR, … — xem userHasCatalogPermission trong route)
router.put('/:key', (req, res, next) => {
  const u = (req as any).user;
  if (isTechnicalAdminRoleCode(u?.roleGroupCode)) return next();
  if (userHasCatalogPermission(u, ['EDIT_SETTINGS', 'MANAGE_HR', 'CONFIG_OPERATIONS']))
    return next();
  return res.status(403).json({ error: 'Bạn không có quyền cập nhật cấu hình' });
}, updateSystemConfig);

// Cập nhật nhiều cấu hình cùng lúc (EDIT_SETTINGS hoặc CONFIG_OPERATIONS)
router.put('/', (req, res, next) => {
  const u = (req as any).user;
  if (isTechnicalAdminRoleCode(u?.roleGroupCode)) return next();
  if (userHasCatalogPermission(u, ['EDIT_SETTINGS', 'CONFIG_OPERATIONS'])) return next();
  return res.status(403).json({ error: 'Bạn không có quyền cập nhật cấu hình' });
}, updateMultipleConfigs);

export default router;
