import { Request, Response } from 'express';
import { prisma } from '../config/database';

// ==========================================
// CUSTOMER STATUS - Trạng thái khách hàng
// ==========================================

export const getCustomerStatuses = async (req: Request, res: Response) => {
  try {
    const statuses = await prisma.customerStatus.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { customers: true } }
      }
    });
    res.json(statuses);
  } catch (error) {
    console.error('Get customer statuses error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách trạng thái khách hàng' });
  }
};

export const createCustomerStatus = async (req: Request, res: Response) => {
  try {
    const { code, name, description, color, isActive, sortOrder } = req.body;

    if (!code || !name) {
      return res.status(400).json({ message: 'Vui lòng điền đủ mã và tên trạng thái' });
    }

    const existing = await prisma.customerStatus.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Mã trạng thái đã tồn tại' });
    }

    const maxSort = await prisma.customerStatus.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });
    const nextSortOrder = sortOrder !== undefined ? Number(sortOrder) : (maxSort?.sortOrder || 0) + 1;

    const statusObj = await prisma.customerStatus.create({
      data: {
        code,
        name,
        description,
        color: color || '#3B82F6',
        isActive: isActive !== undefined ? isActive : true,
        sortOrder: nextSortOrder
      }
    });

    res.status(201).json(statusObj);
  } catch (error) {
    console.error('Create customer status error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo trạng thái khách hàng' });
  }
};

export const updateCustomerStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, color, isActive, sortOrder } = req.body;

    const statusObj = await prisma.customerStatus.update({
      where: { id },
      data: {
        name,
        description,
        color,
        isActive,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined
      }
    });

    res.json(statusObj);
  } catch (error) {
    console.error('Update customer status error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái khách hàng' });
  }
};

export const deleteCustomerStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Check if any customers have this status
    const customersCount = await prisma.customer.count({
      where: { statusId: id }
    });

    if (customersCount > 0) {
      // Reset customers' status to null before deleting (or you could prevent deletion)
      await prisma.customer.updateMany({
        where: { statusId: id },
        data: { statusId: null }
      });
    }

    await prisma.customerStatus.delete({ where: { id } });
    res.json({ success: true, message: `Đã xóa trạng thái và reset ${customersCount} khách hàng` });
  } catch (error) {
    console.error('Delete customer status error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa trạng thái khách hàng' });
  }
};

// API endpoint để cập nhật trạng thái của một khách hàng
export const updateCustomerStatusAssignment = async (req: Request, res: Response) => {
  try {
    const customerId = req.params.customerId as string;
    const { statusId } = req.body;

    let targetStatusId = statusId || null;

    if (targetStatusId) {
      const statusExists = await prisma.customerStatus.findUnique({ where: { id: targetStatusId } });
      if (!statusExists) {
        return res.status(404).json({ message: 'Không tìm thấy trạng thái được chọn' });
      }
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: { statusId: targetStatusId },
      include: { customerStatus: true }
    });

    res.json({
      success: true,
      customer: updated,
      newStatus: updated.customerStatus?.name || 'Không có trạng thái'
    });
  } catch (error) {
    console.error('Update single customer status error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái' });
  }
};
