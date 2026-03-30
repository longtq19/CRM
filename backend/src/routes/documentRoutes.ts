import { Router } from 'express';
import * as documentController from '../controllers/documentController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import { uploadMiddleware } from '../middleware/uploadMiddleware';

const router = Router();

// Upload file
router.post('/documents/upload', authMiddleware, checkPermission('MANAGE_DOCUMENTS'), uploadMiddleware.single('file'), documentController.uploadDocument);

// CRUD Documents - danh sách/xem theo phân quyền từng tài liệu trong controller
router.get('/documents', authMiddleware, documentController.getDocuments);
// Phân loại tài liệu (phải đặt trước /documents/:id)
router.get('/documents/types', authMiddleware, checkPermission('MANAGE_DOCUMENTS'), documentController.getDocumentTypes);
router.post('/documents/types', authMiddleware, checkPermission('MANAGE_DOCUMENTS'), documentController.createDocumentType);
router.put('/documents/types/:id', authMiddleware, checkPermission('MANAGE_DOCUMENTS'), documentController.updateDocumentType);
router.delete('/documents/types/:id', authMiddleware, checkPermission('MANAGE_DOCUMENTS'), documentController.deleteDocumentType);
router.get('/documents/:id', authMiddleware, documentController.getDocumentById);
router.post('/documents', authMiddleware, checkPermission('MANAGE_DOCUMENTS'), documentController.createDocument);
// update/delete: controller kiểm tra theo từng tài liệu (owner, phân quyền)
router.put('/documents/:id', authMiddleware, documentController.updateDocument);
router.delete('/documents/:id', authMiddleware, documentController.deleteDocument);

// Phân quyền tài liệu
router.put('/documents/:id/permissions', authMiddleware, documentController.updateDocumentPermissions);

// Download và Print (chỉ ADM)
router.get('/documents/:id/download', authMiddleware, documentController.downloadDocument);
router.get('/documents/:id/print-check', authMiddleware, documentController.checkPrintPermission);

// Helpers cho UI phân quyền
router.get('/documents-helper/employees', authMiddleware, documentController.getEmployeesForPermission);
router.get('/documents-helper/divisions', authMiddleware, documentController.getDivisionsAndDepartments);
router.get('/documents-helper/role-groups', authMiddleware, documentController.getRoleGroupsForPermission);

export default router;
