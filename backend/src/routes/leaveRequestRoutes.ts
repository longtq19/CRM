import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getLeaveRequests,
  getLeaveRequestById,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  confirmLeaveRequest,
  cancelLeaveRequest,
  permanentDeleteLeaveRequest,
  getEmployeeLeaveHistory,
  getLeaveRequestConfig,
  updateLeaveRequestConfig,
  getPendingApprovals,
  getPendingConfirmations
} from '../controllers/leaveRequestController';
import { LEAVE_REQUEST_PERMANENT_DELETE_PERMISSIONS } from '../config/routePermissionPolicy';

const router = Router();

// Cấu hình (chỉ người có quyền quản lý nghỉ phép)
router.get('/config', authMiddleware, checkPermission(['VIEW_LEAVE_REQUESTS', 'MANAGE_LEAVE_REQUESTS', 'MANAGE_HR']), getLeaveRequestConfig);
router.put('/config', authMiddleware, checkPermission(['MANAGE_LEAVE_REQUESTS', 'MANAGE_HR']), updateLeaveRequestConfig);

// Danh sách chờ duyệt — phạm vi theo quản lý vận hành / quản lý bộ phận HR (controller)
router.get('/pending-approvals', authMiddleware, getPendingApprovals);
router.get('/pending-confirmations', authMiddleware, checkPermission(['VIEW_LEAVE_REQUESTS', 'MANAGE_LEAVE_REQUESTS', 'MANAGE_HR']), getPendingConfirmations);

// Xóa hẳn bản ghi (phân quyền RBAC) — đặt trước GET /:id
router.post(
  '/:id/permanent-delete',
  authMiddleware,
  checkPermission([...LEAVE_REQUEST_PERMANENT_DELETE_PERMISSIONS]),
  permanentDeleteLeaveRequest
);

// CRUD: xem danh sách/chi tiết cần VIEW_LEAVE_REQUESTS hoặc xem của chính mình (controller xử lý)
router.get('/', authMiddleware, getLeaveRequests);
router.get('/:id', authMiddleware, getLeaveRequestById);
router.post('/', authMiddleware, createLeaveRequest);
router.delete('/:id', authMiddleware, cancelLeaveRequest);

// Duyệt/từ chối — quản lý đơn vị vận hành hoặc quản lý bộ phận HR (controller), không bắt buộc permission MANAGE_HR
router.post('/:id/approve', authMiddleware, approveLeaveRequest);
router.post('/:id/reject', authMiddleware, rejectLeaveRequest);
router.post('/:id/confirm', authMiddleware, checkPermission(['MANAGE_LEAVE_REQUESTS', 'MANAGE_HR']), confirmLeaveRequest);

// Lịch sử (nhân viên xem của mình hoặc HR xem tất cả - controller xử lý)
router.get('/employee/:employeeId/history', authMiddleware, getEmployeeLeaveHistory);

export default router;
