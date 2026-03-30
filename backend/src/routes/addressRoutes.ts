import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getProvinces,
  getDistricts,
  getWards,
  searchAddress,
  syncAddressFromJson,
  getVTPProvinces,
  getVTPDistricts,
  getVTPWards,
  syncAddressFromVTP,
  getVTPServices,
  calculateShippingFee,
  createVTPOrder,
  trackVTPOrder,
  cancelVTPOrder
} from '../controllers/viettelPostController';

const router = Router();

// ==================== LOCAL ADDRESS APIs (từ DB) ====================
// Không cần auth để FE có thể gọi khi nhập địa chỉ
router.get('/address/provinces', getProvinces);
router.get('/address/districts', getDistricts);
router.get('/address/wards', getWards);
router.get('/address/search', searchAddress);

// Nạp địa chỉ từ file JSON (backend/data/addresses) vào DB - chỉ ADM/MANAGE_SYSTEM
router.post('/address/seed-from-json', authMiddleware, checkPermission('MANAGE_SYSTEM'), syncAddressFromJson);

// ==================== VTP ADDRESS APIs (trực tiếp từ VTP) ====================
router.get('/vtp/provinces', authMiddleware, getVTPProvinces);
router.get('/vtp/districts', authMiddleware, getVTPDistricts);
router.get('/vtp/wards', authMiddleware, getVTPWards);

// Đồng bộ địa chỉ từ VTP vào DB (chỉ ADM)
router.post('/vtp/sync-address', authMiddleware, checkPermission('MANAGE_SYSTEM'), syncAddressFromVTP);

// ==================== VTP SHIPPING APIs ====================
router.get('/vtp/services', authMiddleware, getVTPServices);
router.post('/vtp/calculate-fee', authMiddleware, calculateShippingFee);
router.post('/vtp/create-order', authMiddleware, checkPermission('MANAGE_ORDERS'), createVTPOrder);
router.get('/vtp/track/:orderCode', authMiddleware, trackVTPOrder);
router.post('/vtp/cancel-order', authMiddleware, checkPermission('MANAGE_ORDERS'), cancelVTPOrder);

export default router;
