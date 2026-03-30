import { Request, Response } from 'express';
import { prisma } from '../config/database';
import fs from 'fs';
import path from 'path';
import { getRootDir } from '../utils/pathHelper';
import { createUserNotification } from './userNotificationController';
import { getDirectManager } from '../utils/viewScopeHelper';
import { isTechnicalAdminRoleCode } from '../constants/rbac';

function userIsContractAdmin(currentUser: any): boolean {
  return (
    isTechnicalAdminRoleCode(currentUser?.roleGroupCode) ||
    (!!currentUser?.permissions &&
      (currentUser.permissions.includes('MANAGE_HR') ||
        currentUser.permissions.includes('FULL_ACCESS')))
  );
}

// Helper to get total size of contracts for an employee
const getContractsSize = async (employeeId: string) => {
  const contracts = await prisma.contract.findMany({
    where: { employeeId },
    select: { fileSize: true }
  });
  return contracts.reduce((sum, contract) => sum + Number(contract.fileSize || 0), 0);
};

export const uploadContract = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params as { employeeId: string };
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'Vui lòng chọn file.' });
    }

    // Fix filename encoding
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // Check file type
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Chỉ chấp nhận file định dạng PDF.' });
    }
    
    // Check file size limit (5MB) - Multer already handles this, but double check
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'File quá lớn. Giới hạn 5MB.' });
    }

    // Check if employee exists (cần notifyOnNewContractUpload để quyết định gửi thông báo)
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true, notifyOnNewContractUpload: true }
    });

    if (!employee) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
    }

    const currentUser = (req as any).user;
    const directMgrId = await getDirectManager(employeeId);
    const isManager = directMgrId === currentUser.id;
    const isAdmin = userIsContractAdmin(currentUser);

    // Also allow employee to upload their own contracts if needed? 
    // Requirement says "Quản lý gần nhất... có thể tải lên". Doesn't forbid employee.
    // Usually employees provide contracts to HR. 
    // I'll stick to Manager + Admin for now based on strict reading.
    
    if (!isManager && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền tải lên hợp đồng cho nhân viên này.' });
    }

    // Check total size limit (20MB)
    const currentTotalSize = await getContractsSize(employeeId);
    if (currentTotalSize + file.size > 20 * 1024 * 1024) {
      return res.status(400).json({ message: 'Tổng dung lượng hợp đồng vượt quá giới hạn 20MB.' });
    }

    // Move file to employee specific folder
    const uploadDir = path.join(getRootDir(), 'uploads/contracts');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Sanitize filename to prevent filesystem errors
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9\s.-]/g, '_');
    const fileName = `${Date.now()}-${sanitizedOriginalName}`;
    const filePath = path.join(uploadDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    const body = req.body as { endDate?: string; startDate?: string };
    const endDate = body?.endDate ? new Date(body.endDate) : undefined;
    const startDate = body?.startDate ? new Date(body.startDate) : undefined;

    if (startDate && endDate && endDate <= startDate) {
      return res.status(400).json({ message: 'Ngày hết hạn phải sau ngày hiệu lực.' });
    }

    const contract = await prisma.contract.create({
      data: {
        employeeId,
        fileName: file.originalname,
        filePath: fileName,
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: currentUser.id,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined
      }
    });

    // Thông báo chỉ gửi khi nhân sự bật "Gửi thông báo khi tải hợp đồng mới" (notifyOnNewContractUpload !== false)
    const shouldNotify = employee?.notifyOnNewContractUpload !== false;
    if (shouldNotify) {
      const title = 'Đã tải lên hợp đồng';
      const content = `Hợp đồng "${file.originalname}" đã được tải lên cho ${employee.fullName}.`;
      const link = `/hr/${employeeId}/edit`;
      try {
        await createUserNotification(currentUser.id, title, content, 'HR', link, { contractId: contract.id });
        if (employeeId !== currentUser.id) {
          await createUserNotification(employeeId, title, content, 'HR', link, { contractId: contract.id });
        }
      } catch (notifErr) {
        console.error('Contract upload: failed to send notifications', notifErr);
      }
    }

    res.status(201).json(contract);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi tải lên hợp đồng.' });
  }
};

/** Danh sách hợp đồng toàn hệ thống (tab Quản lý hợp đồng) - chỉ HR/Admin */
export const listAllContracts = async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const isAdmin = userIsContractAdmin(currentUser);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền xem danh sách hợp đồng toàn hệ thống.' });
    }
    const status = (req.query.status as string) || ''; // effective | expired | not_yet_effective
    const expiringSoon = req.query.expiringSoon === '1' || req.query.expiringSoon === 'true';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const contracts = await prisma.contract.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, fullName: true, code: true } }
      }
    });
    type Row = (typeof contracts)[0];
    let filtered: Row[] = contracts;
    if (status === 'effective') {
      filtered = contracts.filter(c => {
        const start = c.startDate ? new Date(c.startDate) : null;
        const end = c.endDate ? new Date(c.endDate) : null;
        if (start && start > today) return false;
        if (end && end < today) return false;
        return true;
      });
    } else if (status === 'expired') {
      filtered = contracts.filter(c => c.endDate && new Date(c.endDate) < today);
    } else if (status === 'not_yet_effective') {
      filtered = contracts.filter(c => c.startDate && new Date(c.startDate) > today);
    }
    if (expiringSoon) {
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() + 15);
      filtered = filtered.filter(c => c.endDate && new Date(c.endDate) >= today && new Date(c.endDate) <= windowEnd);
    }
    res.json(filtered);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách hợp đồng.' });
  }
};

export const getContracts = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params as { employeeId: string };
    const currentUser = (req as any).user;

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true }
    });

    if (!employee) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
    }

    const isSelf = currentUser.id === employeeId;
    const mgrId = await getDirectManager(employeeId);
    const isManager = mgrId === currentUser.id;
    const isAdmin = userIsContractAdmin(currentUser);

    if (!isSelf && !isManager && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền xem hợp đồng này.' });
    }

    const contracts = await prisma.contract.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(contracts);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách hợp đồng.' });
  }
};

export const deleteContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const currentUser = (req as any).user;

    // Only Admin can delete
    const isAdmin = currentUser.permissions.includes('MANAGE_HR') || currentUser.permissions.includes('FULL_ACCESS');
    if (!isAdmin) {
      return res.status(403).json({ message: 'Chỉ Admin mới có quyền xóa hợp đồng.' });
    }

    const contract = await prisma.contract.findUnique({
      where: { id }
    });

    if (!contract) {
      return res.status(404).json({ message: 'Không tìm thấy hợp đồng.' });
    }

    // Delete file from disk
    if (contract.filePath) {
      const filePath = path.join(getRootDir(), 'uploads/contracts', contract.filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete record
    await prisma.contract.delete({
      where: { id }
    });

    res.json({ message: 'Xóa hợp đồng thành công.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi xóa hợp đồng.' });
  }
};

export const updateContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const currentUser = (req as any).user;

    const isAdmin = userIsContractAdmin(currentUser);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật hợp đồng.' });
    }

    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract) {
      return res.status(404).json({ message: 'Không tìm thấy hợp đồng.' });
    }

    const { startDate, endDate } = req.body;
    const updateData: any = {};

    if (startDate !== undefined) {
      updateData.startDate = startDate ? new Date(startDate) : null;
    }
    if (endDate !== undefined) {
      updateData.endDate = endDate ? new Date(endDate) : null;
    }

    const finalStart = updateData.startDate !== undefined ? updateData.startDate : contract.startDate;
    const finalEnd = updateData.endDate !== undefined ? updateData.endDate : contract.endDate;
    if (finalStart && finalEnd && new Date(finalEnd) <= new Date(finalStart)) {
      return res.status(400).json({ message: 'Ngày hết hạn phải sau ngày hiệu lực.' });
    }

    const updated = await prisma.contract.update({
      where: { id },
      data: updateData
    });

    res.json(updated);
  } catch (error) {
    console.error('Update contract error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật hợp đồng.' });
  }
};

export const downloadContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const currentUser = (req as any).user;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: { employee: true }
    }) as any;

    if (!contract) {
      return res.status(404).json({ message: 'Không tìm thấy hợp đồng.' });
    }

    const isSelf = currentUser.id === contract.employeeId;
    const contractMgrId = await getDirectManager(contract.employeeId);
    const isManager = contractMgrId === currentUser.id;
    const isAdmin = userIsContractAdmin(currentUser);

    if (!isSelf && !isManager && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền tải xuống hợp đồng này.' });
    }

    const filePath = path.join(getRootDir(), 'uploads/contracts', contract.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File không tồn tại trên hệ thống.' });
    }

    res.download(filePath, contract.fileName);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi tải xuống hợp đồng.' });
  }
};
