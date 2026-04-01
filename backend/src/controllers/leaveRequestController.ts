import { Request, Response } from 'express';
import type { LeaveType } from '@prisma/client';
import { prisma } from '../config/database';
import { getIO } from '../socket';
import { getDirectManager, getSubordinateIds } from '../utils/viewScopeHelper';
import { isTechnicalAdminRoleCode } from '../constants/rbac';
import { formatICTDate } from '../utils/dateFormatter';
import { getAuditUser, logAudit } from '../utils/auditLog';
import { createUserNotification } from './userNotificationController';

/** Loại nghỉ được phép tạo mới (ẩn UNPAID / các loại cũ không còn dùng trên giao diện). */
const CREATABLE_LEAVE_TYPES = new Set([
  'ANNUAL',
  'SICK',
  'MATERNITY',
  'WEDDING',
  'FUNERAL',
  'OTHER',
]);

/** Mã nhóm quyền HCNS — đồng bộ `isHRUser` (người được xác nhận đơn nghỉ phép). */
const HR_ROLE_GROUP_CODES_FOR_NOTIFY = [
  'HR_STAFF',
  'NV_HCNS',
  'hr_assistant',
  'HRA',
  'HRA_STAFF',
  'HR_MANAGER',
  'QL_HCNS',
  'hr_manager',
  'HRA_MGR',
] as const;

async function getHrEmployeeIdsForLeaveNotify(): Promise<string[]> {
  const rows = await prisma.employee.findMany({
    where: { roleGroup: { code: { in: [...HR_ROLE_GROUP_CODES_FOR_NOTIFY] } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function formatDateVi(d: Date): string {
  return formatICTDate(d);
}

/** Gọi sau khi ghi `user_notifications` để chuông thông báo cập nhật realtime. */
function emitNotificationRefreshSocket(employeeId: string) {
  try {
    const io = getIO();
    if (io) io.to(`user:${employeeId}`).emit('notification:new', { scope: 'leave' });
  } catch {
    /* socket chưa init */
  }
}

async function pushLeaveInAppNotification(
  employeeId: string,
  title: string,
  content: string,
  metadata?: { leaveRequestId?: string; code?: string },
) {
  await createUserNotification(
    employeeId,
    title,
    content,
    'LEAVE_REQUEST',
    '/hr/leave-requests',
    metadata,
  );
  emitNotificationRefreshSocket(employeeId);
}

const isAdminUser = async (userId: string): Promise<boolean> => {
  const employee = await prisma.employee.findUnique({
    where: { id: userId },
    select: { roleGroup: { select: { code: true } } },
  });
  return isTechnicalAdminRoleCode(employee?.roleGroup?.code);
};

/**
 * Kiểm tra user có phải HR (Hành chính nhân sự hoặc Quản lý HCNS) không
 */
const isHRUser = async (userId: string): Promise<{ isHR: boolean; isHRManager: boolean }> => {
  const employee = await prisma.employee.findUnique({
    where: { id: userId },
    include: { roleGroup: true }
  });
  
  if (!employee?.roleGroup) return { isHR: false, isHRManager: false };
  
  const hrCodes = ['HR_STAFF', 'NV_HCNS', 'hr_assistant', 'HRA', 'HRA_STAFF']; // Nhân viên hành chính nhân sự
  const hrManagerCodes = ['HR_MANAGER', 'QL_HCNS', 'hr_manager', 'HRA_MGR']; // Quản lý hành chính nhân sự
  
  const isHR = hrCodes.includes(employee.roleGroup.code) || hrManagerCodes.includes(employee.roleGroup.code);
  const isHRManager = hrManagerCodes.includes(employee.roleGroup.code);
  
  return { isHR, isHRManager };
};

/**
 * Kiểm tra user có phải cấp trên (trực tiếp hoặc gián tiếp) của employee không
 */
const isManagerOf = async (userId: string, employeeId: string): Promise<boolean> => {
  const subordinates = await getSubordinateIds(userId);
  return subordinates.includes(employeeId);
};

/** Quản lý bộ phận HR (danh mục) — duyệt nghỉ cho NV cùng hr_department_unit_id; không tự duyệt chính mình. */
async function isHrDepartmentManagerOf(approverId: string, employeeId: string): Promise<boolean> {
  if (approverId === employeeId) return false;
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { hrDepartmentUnitId: true },
  });
  if (!employee?.hrDepartmentUnitId) return false;
  const unit = await prisma.hrDepartmentUnit.findUnique({
    where: { id: employee.hrDepartmentUnitId },
    select: { managerId: true },
  });
  return unit?.managerId === approverId;
}

async function getEmployeeIdsInHrUnitsManagedBy(managerId: string): Promise<string[]> {
  const units = await prisma.hrDepartmentUnit.findMany({
    where: { managerId },
    select: { id: true },
  });
  if (units.length === 0) return [];
  const emps = await prisma.employee.findMany({
    where: { hrDepartmentUnitId: { in: units.map((u) => u.id) } },
    select: { id: true },
  });
  return emps.map((e) => e.id).filter((id) => id !== managerId);
}

async function canApproveOrRejectLeave(userId: string, employeeId: string): Promise<boolean> {
  if (await isAdminUser(userId)) return true;
  if (await isManagerOf(userId, employeeId)) return true;
  if (await isHrDepartmentManagerOf(userId, employeeId)) return true;
  return false;
}

/**
 * Tạo mã yêu cầu nghỉ phép
 */
const generateLeaveRequestCode = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const baseCode = `LP-${dateStr}`;
  
  const lastRequest = await prisma.leaveRequest.findFirst({
    where: { code: { startsWith: baseCode } },
    orderBy: { code: 'desc' }
  });
  
  let sequence = 1;
  if (lastRequest) {
    const lastSeq = parseInt(lastRequest.code.split('-').pop() || '0');
    if (!isNaN(lastSeq)) sequence = lastSeq + 1;
  }
  
  return `${baseCode}-${sequence.toString().padStart(4, '0')}`;
};

/**
 * Lấy cấu hình nghỉ phép
 */
const getLeaveConfig = async () => {
  const advanceDaysConfig = await prisma.systemConfig.findFirst({
    where: { key: 'LEAVE_REQUEST_ADVANCE_DAYS' }
  });
  const approvalHoursConfig = await prisma.systemConfig.findFirst({
    where: { key: 'LEAVE_REQUEST_APPROVAL_HOURS' }
  });
  
  return {
    /** Mặc định 0: cho phép bổ sung đơn sau khi đã nghỉ (không bắt xin trước). */
    advanceDays: advanceDaysConfig ? parseInt(advanceDaysConfig.value, 10) : 0,
    /** Mặc định 0: không giới hạn thời gian duyệt (chỉ hiển thị/hướng dẫn trên FE). */
    approvalHours: approvalHoursConfig ? parseInt(approvalHoursConfig.value, 10) : 0,
  };
};

// ==================== LEAVE REQUEST APIs ====================

/**
 * Lấy danh sách yêu cầu nghỉ phép
 * - Nhân sự: xem của mình
 * - Quản lý: xem của cấp dưới
 * - HR: xem tất cả
 * - ADM: xem tất cả
 */
export const getLeaveRequests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { status, employeeId, startDate, endDate } = req.query;
    
    const isAdmin = await isAdminUser(user.id);
    const { isHR } = await isHRUser(user.id);
    const subordinates = await getSubordinateIds(user.id);
    const hrUnitMembers = await getEmployeeIdsInHrUnitsManagedBy(user.id);
    const managedPeerIds = [...new Set([...subordinates, ...hrUnitMembers])];
    
    let where: any = {};
    
    // Filter by status
    if (status && status !== 'all') {
      where.status = status;
    }
    
    // Filter by date range
    if (startDate) {
      where.startDate = { gte: new Date(startDate as string) };
    }
    if (endDate) {
      where.endDate = { lte: new Date(endDate as string) };
    }
    
    // Filter by employee (for HR/ADM)
    if (employeeId && (isAdmin || isHR)) {
      where.employeeId = employeeId;
    }
    
    // Permission-based filtering
    if (!isAdmin && !isHR) {
      // Chỉ xem của mình, cấp dưới (đơn vị vận hành) hoặc cùng bộ phận HR do mình quản lý
      where.OR = [
        { employeeId: user.id },
        { employeeId: { in: managedPeerIds } }
      ];
    }
    
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { id: true, name: true } },
            position: { select: { id: true, name: true } }
          }
        },
        approver: {
          select: { id: true, fullName: true, avatarUrl: true }
        },
        confirmer: {
          select: { id: true, fullName: true, avatarUrl: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(requests);
  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách yêu cầu nghỉ phép' });
  }
};

/**
 * Lấy chi tiết yêu cầu nghỉ phép
 */
export const getLeaveRequestById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    
    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { id: true, name: true } },
            position: { select: { id: true, name: true } },
          }
        },
        approver: {
          select: { id: true, fullName: true, avatarUrl: true }
        },
        confirmer: {
          select: { id: true, fullName: true, avatarUrl: true }
        }
      }
    });
    
    if (!request) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu nghỉ phép' });
    }
    
    // Check permission
    const isAdmin = await isAdminUser(user.id);
    const { isHR } = await isHRUser(user.id);
    const isOpManager = await isManagerOf(user.id, request.employeeId);
    const isHrDeptMgr = await isHrDepartmentManagerOf(user.id, request.employeeId);
    const isOwner = request.employeeId === user.id;
    
    if (!isAdmin && !isHR && !isOpManager && !isHrDeptMgr && !isOwner) {
      return res.status(403).json({ message: 'Bạn không có quyền xem yêu cầu này' });
    }
    
    res.json({
      ...request,
      canApprove: isAdmin || isOpManager || isHrDeptMgr,
      canConfirm: isAdmin || isHR,
      isOwner
    });
  } catch (error) {
    console.error('Get leave request error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin yêu cầu nghỉ phép' });
  }
};

/**
 * Tạo yêu cầu nghỉ phép
 */
export const createLeaveRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      leaveType: rawLeaveType,
      startDate,
      endDate,
      reason,
      leaveTypeOtherLabel: rawOtherLabel,
    } = req.body;

    const leaveType = (rawLeaveType || 'ANNUAL') as string;
    const otherLabel =
      typeof rawOtherLabel === 'string' ? rawOtherLabel.trim().slice(0, 200) : '';

    if (!CREATABLE_LEAVE_TYPES.has(leaveType)) {
      return res.status(400).json({ message: 'Loại nghỉ không hợp lệ' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Vui lòng chọn ngày bắt đầu và kết thúc' });
    }

    if (leaveType === 'OTHER') {
      if (!otherLabel) {
        return res.status(400).json({
          message: 'Vui lòng nhập tên loại nghỉ khi chọn «Khác»',
        });
      }
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({ message: 'Ngày bắt đầu phải trước ngày kết thúc' });
    }

    const config = await getLeaveConfig();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil(
      (startDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Cho phép tạo đơn sau ngày nghỉ (bổ sung): không áp quy tắc «xin trước» khi ngày bắt đầu đã qua.
    if (config.advanceDays > 0 && diffDays >= 0 && diffDays < config.advanceDays) {
      return res.status(400).json({
        message: `Phải xin nghỉ phép trước ít nhất ${config.advanceDays} ngày (kể từ hôm nay tới ngày bắt đầu nghỉ)`,
      });
    }

    const totalDays =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const code = await generateLeaveRequestCode();

    const request = await prisma.leaveRequest.create({
      data: {
        code,
        employeeId: user.id,
        leaveType: (leaveType || 'ANNUAL') as LeaveType,
        leaveTypeOtherLabel: leaveType === 'OTHER' ? otherLabel : null,
        startDate: start,
        endDate: end,
        totalDays,
        lateMinutes: 0,
        earlyMinutes: 0,
        reason,
        status: 'PENDING'
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
          }
        }
      }
    });
    
    // Gửi thông báo cho quản lý vận hành (cây đơn vị), quản lý bộ phận HR và HCNS (nhóm vai trò HR)
    let io: ReturnType<typeof getIO> | null = null;
    try {
      io = getIO();
    } catch {
      io = null;
    }
    const directManagerId = await getDirectManager(user.id);
    let hrUnitManagerId: string | null = null;
    const creator = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { hrDepartmentUnitId: true },
    });
    if (creator?.hrDepartmentUnitId) {
      const unit = await prisma.hrDepartmentUnit.findUnique({
        where: { id: creator.hrDepartmentUnitId },
        select: { managerId: true },
      });
      hrUnitManagerId = unit?.managerId ?? null;
    }
    const notifyIds = new Set<string>();
    if (directManagerId && directManagerId !== user.id) notifyIds.add(directManagerId);
    if (hrUnitManagerId && hrUnitManagerId !== user.id) notifyIds.add(hrUnitManagerId);
    const hrIds = await getHrEmployeeIdsForLeaveNotify();
    for (const hid of hrIds) {
      if (hid !== user.id) notifyIds.add(hid);
    }

    const employeeName =
      (request as { employee?: { fullName: string } }).employee?.fullName ?? '';
    const payload = {
      requestId: request.id,
      code: request.code,
      employeeName,
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: request.totalDays,
    };

    const reasonLine =
      reason && String(reason).trim() ? String(reason).trim() : '—';
    const notifTitle = 'Đơn xin nghỉ phép mới';
    const notifContent = `${employeeName} — ${request.code}: xin nghỉ từ ${formatDateVi(
      request.startDate,
    )} đến ${formatDateVi(request.endDate)} (${request.totalDays} ngày). Lý do: ${reasonLine}.`;

    for (const uid of notifyIds) {
      await pushLeaveInAppNotification(uid, notifTitle, notifContent, {
        leaveRequestId: request.id,
        code: request.code,
      });
      if (io) {
        io.to(`user:${uid}`).emit('leave:new_request', payload);
      }
    }

    res.status(201).json(request);
  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo yêu cầu nghỉ phép' });
  }
};

/**
 * Duyệt yêu cầu nghỉ phép (Quản lý)
 */
export const approveLeaveRequest = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const { note } = req.body;
    
    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true }
    });
    
    if (!request) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu nghỉ phép' });
    }
    
    if (request.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu này đã được xử lý' });
    }
    
    // Kiểm tra quyền duyệt (quản lý vận hành hoặc quản lý bộ phận HR)
    if (!(await canApproveOrRejectLeave(user.id, request.employeeId))) {
      return res.status(403).json({ message: 'Bạn không có quyền duyệt yêu cầu này' });
    }
    
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approverId: user.id,
        approvedAt: new Date(),
        approverNote: note
      },
      include: {
        employee: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } }
      }
    });
    
    const approverName = updated.approver?.fullName ?? 'Quản lý';
    await pushLeaveInAppNotification(
      request.employeeId,
      'Đơn nghỉ phép đã được duyệt',
      `Đơn ${updated.code} đã được ${approverName} duyệt. Vui lòng chờ HCNS xác nhận.`,
      { leaveRequestId: updated.id, code: updated.code },
    );

    const hrIds = await getHrEmployeeIdsForLeaveNotify();
    for (const hid of hrIds) {
      if (hid === user.id) continue;
      await pushLeaveInAppNotification(
        hid,
        'Đơn nghỉ phép chờ xác nhận HCNS',
        `${updated.code} (${updated.employee.fullName}) đã được duyệt, cần xác nhận.`,
        { leaveRequestId: updated.id, code: updated.code },
      );
    }

    let io: ReturnType<typeof getIO> | null = null;
    try {
      io = getIO();
    } catch {
      io = null;
    }
    if (io) {
      io.to(`user:${request.employeeId}`).emit('leave:approved', {
        requestId: updated.id,
        code: updated.code,
        approverName: updated.approver?.fullName,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Approve leave request error:', error);
    res.status(500).json({ message: 'Lỗi khi duyệt yêu cầu nghỉ phép' });
  }
};

/**
 * Từ chối yêu cầu nghỉ phép (Quản lý)
 */
export const rejectLeaveRequest = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const { note } = req.body;
    
    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true }
    });
    
    if (!request) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu nghỉ phép' });
    }
    
    if (request.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu này đã được xử lý' });
    }
    
    if (!(await canApproveOrRejectLeave(user.id, request.employeeId))) {
      return res.status(403).json({ message: 'Bạn không có quyền từ chối yêu cầu này' });
    }
    
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approverId: user.id,
        rejectedAt: new Date(),
        approverNote: note
      },
      include: {
        employee: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } }
      }
    });
    
    const rejectNote = note && String(note).trim() ? String(note).trim() : '';
    await pushLeaveInAppNotification(
      request.employeeId,
      'Đơn nghỉ phép bị từ chối',
      rejectNote
        ? `Đơn ${updated.code} đã bị từ chối. Ghi chú: ${rejectNote}`
        : `Đơn ${updated.code} đã bị từ chối.`,
      { leaveRequestId: updated.id, code: updated.code },
    );

    let io: ReturnType<typeof getIO> | null = null;
    try {
      io = getIO();
    } catch {
      io = null;
    }
    if (io) {
      io.to(`user:${request.employeeId}`).emit('leave:rejected', {
        requestId: updated.id,
        code: updated.code,
        approverName: updated.approver?.fullName,
        reason: note,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Reject leave request error:', error);
    res.status(500).json({ message: 'Lỗi khi từ chối yêu cầu nghỉ phép' });
  }
};

/**
 * Xác nhận yêu cầu nghỉ phép (HR)
 */
export const confirmLeaveRequest = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const { hrNote } = req.body;
    
    if (!hrNote) {
      return res.status(400).json({ message: 'Vui lòng nhập ghi chú xác nhận' });
    }
    
    const request = await prisma.leaveRequest.findUnique({
      where: { id }
    });
    
    if (!request) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu nghỉ phép' });
    }
    
    if (request.status !== 'APPROVED') {
      return res.status(400).json({ message: 'Yêu cầu chưa được quản lý duyệt' });
    }
    
    // Kiểm tra quyền HR
    const isAdmin = await isAdminUser(user.id);
    const { isHR } = await isHRUser(user.id);
    
    if (!isAdmin && !isHR) {
      return res.status(403).json({ message: 'Bạn không có quyền xác nhận yêu cầu này' });
    }
    
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        confirmerId: user.id,
        confirmedAt: new Date(),
        hrNote
      },
      include: {
        employee: { select: { id: true, fullName: true } },
        confirmer: { select: { id: true, fullName: true } }
      }
    });
    
    const confirmerName = updated.confirmer?.fullName ?? 'HCNS';
    await pushLeaveInAppNotification(
      request.employeeId,
      'Đơn nghỉ phép đã được xác nhận',
      `Đơn ${updated.code} đã được ${confirmerName} xác nhận.${hrNote ? ` Ghi chú: ${hrNote}` : ''}`,
      { leaveRequestId: updated.id, code: updated.code },
    );

    let io: ReturnType<typeof getIO> | null = null;
    try {
      io = getIO();
    } catch {
      io = null;
    }
    if (io) {
      io.to(`user:${request.employeeId}`).emit('leave:confirmed', {
        requestId: updated.id,
        code: updated.code,
        hrNote,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Confirm leave request error:', error);
    res.status(500).json({ message: 'Lỗi khi xác nhận yêu cầu nghỉ phép' });
  }
};

/**
 * Hủy yêu cầu nghỉ phép (Nhân sự tự hủy)
 */
export const cancelLeaveRequest = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    
    const request = await prisma.leaveRequest.findUnique({
      where: { id }
    });
    
    if (!request) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu nghỉ phép' });
    }
    
    // Chỉ chủ sở hữu hoặc ADM mới được hủy
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin && request.employeeId !== user.id) {
      return res.status(403).json({ message: 'Bạn không có quyền hủy yêu cầu này' });
    }
    
    // Chỉ hủy được khi đang PENDING
    if (request.status !== 'PENDING') {
      return res.status(400).json({ message: 'Chỉ có thể hủy yêu cầu đang chờ duyệt' });
    }
    
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Cancel leave request error:', error);
    res.status(500).json({ message: 'Lỗi khi hủy yêu cầu nghỉ phép' });
  }
};

const LEAVE_STATUS_LABEL_VI: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CONFIRMED: 'Đã xác nhận',
  CANCELLED: 'Đã hủy',
};

/**
 * Xóa hẳn bản ghi đơn nghỉ phép (không thể hoàn tác). Route: `DELETE_LEAVE_REQUESTS` (hoặc FULL_ACCESS / quản trị kỹ thuật qua middleware).
 * Đơn **APPROVED** / **CONFIRMED**: chỉ cho xóa nếu JWT có **đúng mã** `DELETE_LEAVE_REQUESTS` hoặc **quản trị kỹ thuật** — `FULL_ACCESS` không đủ.
 */
export const permanentDeleteLeaveRequest = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    const auditUser = getAuditUser(req);
    const jwtPerms: string[] = user.permissions || [];
    const hasExplicitDeleteLeave = jwtPerms.includes('DELETE_LEAVE_REQUESTS');

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, fullName: true, code: true } },
      },
    });

    if (!request) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu nghỉ phép' });
    }

    const isAdmin = await isAdminUser(user.id);
    const { isHR } = await isHRUser(user.id);
    const isOpManager = await isManagerOf(user.id, request.employeeId);
    const isHrDeptMgr = await isHrDepartmentManagerOf(user.id, request.employeeId);
    const isOwner = request.employeeId === user.id;

    if (!isAdmin && !isHR && !isOpManager && !isHrDeptMgr && !isOwner) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa yêu cầu này' });
    }

    if (
      (request.status === 'APPROVED' || request.status === 'CONFIRMED') &&
      !isAdmin &&
      !hasExplicitDeleteLeave
    ) {
      return res.status(403).json({
        message:
          'Không được xóa đơn đã duyệt hoặc đã xác nhận khi nhóm quyền chưa gán quyền «Xóa đơn nghỉ phép» (quyền Toàn hệ thống không áp dụng cho trường hợp này).',
      });
    }

    const statusLabel = LEAVE_STATUS_LABEL_VI[request.status] || request.status;

    await prisma.leaveRequest.delete({ where: { id } });

    await logAudit({
      ...auditUser,
      action: 'DELETE',
      object: 'Đơn nghỉ phép',
      objectId: id,
      result: 'SUCCESS',
      details: `Xóa đơn nghỉ phép mã "${request.code}" (trạng thái: ${statusLabel}) của nhân sự "${request.employee.fullName}" (mã NV ${request.employee.code}).`,
      oldValues: {
        code: request.code,
        leaveType: request.leaveType,
        leaveTypeOtherLabel: request.leaveTypeOtherLabel,
        status: request.status,
        employeeId: request.employeeId,
        employeeName: request.employee.fullName,
        startDate: request.startDate,
        endDate: request.endDate,
      },
      req,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Permanent delete leave request error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa đơn nghỉ phép' });
  }
};

/**
 * Lấy lịch sử nghỉ phép của nhân sự
 */
export const getEmployeeLeaveHistory = async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.employeeId as string;
    const user = (req as any).user;
    const { year } = req.query;
    
    // Kiểm tra quyền
    const isAdmin = await isAdminUser(user.id);
    const { isHR } = await isHRUser(user.id);
    const isOpManager = await isManagerOf(user.id, employeeId);
    const isHrDeptMgr = await isHrDepartmentManagerOf(user.id, employeeId);
    const isOwner = employeeId === user.id;
    
    if (!isAdmin && !isHR && !isOpManager && !isHrDeptMgr && !isOwner) {
      return res.status(403).json({ message: 'Bạn không có quyền xem lịch sử này' });
    }
    
    const where: any = { employeeId };
    
    if (year) {
      const yearNum = parseInt(year as string);
      where.startDate = {
        gte: new Date(yearNum, 0, 1),
        lt: new Date(yearNum + 1, 0, 1)
      };
    }
    
    const history = await prisma.leaveRequest.findMany({
      where,
      orderBy: { startDate: 'desc' }
    });
    
    // Tính tổng số ngày nghỉ theo loại
    const summary = {
      total: 0,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    };
    
    history.forEach(req => {
      if (req.status === 'CONFIRMED' || req.status === 'APPROVED') {
        summary.total += req.totalDays;
        summary.byType[req.leaveType] = (summary.byType[req.leaveType] || 0) + req.totalDays;
      }
      summary.byStatus[req.status] = (summary.byStatus[req.status] || 0) + 1;
    });
    
    res.json({ history, summary });
  } catch (error) {
    console.error('Get leave history error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử nghỉ phép' });
  }
};

/**
 * Lấy cấu hình nghỉ phép
 */
export const getLeaveRequestConfig = async (req: Request, res: Response) => {
  try {
    const config = await getLeaveConfig();
    res.json(config);
  } catch (error) {
    console.error('Get leave config error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy cấu hình' });
  }
};

/**
 * Cập nhật cấu hình nghỉ phép (ADM only)
 */
export const updateLeaveRequestConfig = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { advanceDays, approvalHours } = req.body;
    
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Chỉ quản trị viên mới có quyền thay đổi cấu hình' });
    }
    
    if (advanceDays !== undefined) {
      await prisma.systemConfig.upsert({
        where: { key: 'LEAVE_REQUEST_ADVANCE_DAYS' },
        update: { value: advanceDays.toString() },
        create: {
          key: 'LEAVE_REQUEST_ADVANCE_DAYS',
          value: advanceDays.toString(),
          name: 'Số ngày xin trước',
          description: 'Số ngày phải xin nghỉ phép trước ngày nghỉ',
          dataType: 'INTEGER',
          category: 'HR'
        }
      });
    }
    
    if (approvalHours !== undefined) {
      await prisma.systemConfig.upsert({
        where: { key: 'LEAVE_REQUEST_APPROVAL_HOURS' },
        update: { value: approvalHours.toString() },
        create: {
          key: 'LEAVE_REQUEST_APPROVAL_HOURS',
          value: approvalHours.toString(),
          name: 'Thời gian duyệt (giờ)',
          description: 'Số giờ để quản lý duyệt yêu cầu nghỉ phép',
          dataType: 'INTEGER',
          category: 'HR'
        }
      });
    }
    
    const config = await getLeaveConfig();
    res.json(config);
  } catch (error) {
    console.error('Update leave config error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cấu hình' });
  }
};

/**
 * Lấy yêu cầu chờ duyệt của quản lý
 */
export const getPendingApprovals = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const isAdmin = await isAdminUser(user.id);
    const subordinates = await getSubordinateIds(user.id);
    const hrUnitMembers = await getEmployeeIdsInHrUnitsManagedBy(user.id);
    const pendingIds = [...new Set([...subordinates, ...hrUnitMembers])];
    
    if (!isAdmin && pendingIds.length === 0) {
      return res.json([]);
    }
    
    let where: any = { status: 'PENDING' };
    
    if (!isAdmin) {
      where.employeeId = { in: pendingIds };
    }
    
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
            position: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    
    res.json(requests);
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách chờ duyệt' });
  }
};

/**
 * Lấy yêu cầu chờ xác nhận của HR
 */
export const getPendingConfirmations = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const isAdmin = await isAdminUser(user.id);
    const { isHR } = await isHRUser(user.id);
    
    if (!isAdmin && !isHR) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập' });
    }
    
    const requests = await prisma.leaveRequest.findMany({
      where: { status: 'APPROVED' },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
            position: { select: { name: true } }
          }
        },
        approver: {
          select: { id: true, fullName: true }
        }
      },
      orderBy: { approvedAt: 'asc' }
    });
    
    res.json(requests);
  } catch (error) {
    console.error('Get pending confirmations error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách chờ xác nhận' });
  }
};
