import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ensureLeadProcessingStatuses } from '../utils/ensureLeadProcessingStatuses';
import { rebuildPoolPushConfigFromLeadStatuses } from '../utils/poolPushSync';

/**
 * Lấy danh sách trạng thái xử lý
 */
export const getProcessingStatuses = async (req: Request, res: Response) => {
  try {
    const statuses = await prisma.leadProcessingStatus.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    res.json(statuses);
  } catch (error) {
    console.error('Error fetching processing statuses:', error);
    res.status(500).json({ error: 'Không thể tải danh sách trạng thái' });
  }
};

/**
 * Lấy danh mục trạng thái để hiển thị (chỉ lấy activated)
 */
export const getActiveProcessingStatuses = async (req: Request, res: Response) => {
  try {
    const statuses = await prisma.leadProcessingStatus.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(statuses);
  } catch (error) {
    console.error('Error fetching active processing statuses:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh mục trạng thái' });
  }
};

/**
 * Thêm mới trạng thái
 */
export const createProcessingStatus = async (req: Request, res: Response) => {
  try {
    const { code, name, description, color, sortOrder, isActive, isPushToPool } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Vui lòng nhập Mã và Tên trạng thái' });
    }

    const existing = await prisma.leadProcessingStatus.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ error: 'Mã trạng thái đã tồn tại' });
    }

    const status = await prisma.leadProcessingStatus.create({
      data: {
        code: code.toUpperCase(),
        name,
        description,
        color: color || '#9CA3AF',
        sortOrder: Number(sortOrder) || 0,
        isActive: isActive !== undefined ? !!isActive : true,
        isPushToPool: !!isPushToPool,
      },
    });

    await rebuildPoolPushConfigFromLeadStatuses().catch(() => undefined);

    res.json(status);
  } catch (error) {
    console.error('Error creating processing status:', error);
    res.status(500).json({ error: 'Lỗi khi thêm trạng thái' });
  }
};

/**
 * Cập nhật trạng thái
 */
export const updateProcessingStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, color, sortOrder, isActive, isPushToPool } = req.body;

    const status = await prisma.leadProcessingStatus.update({
      where: { id },
      data: {
        name,
        description,
        color,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
        isActive: isActive !== undefined ? !!isActive : undefined,
        isPushToPool: isPushToPool !== undefined ? !!isPushToPool : undefined,
      },
    });

    await rebuildPoolPushConfigFromLeadStatuses().catch(() => undefined);

    res.json(status);
  } catch (error) {
    console.error('Error updating processing status:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái' });
  }
};

/**
 * Xóa trạng thái
 */
export const deleteProcessingStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // TODO: Kiểm tra xem có lead nào đang sử dụng trạng thái này không?
    // Nếu có thì nên deactivate thay vì delete.
    
    await prisma.leadProcessingStatus.delete({ where: { id } });
    await rebuildPoolPushConfigFromLeadStatuses().catch(() => undefined);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting processing status:', error);
    res.status(500).json({ error: 'Lỗi khi xóa trạng thái' });
  }
};

/**
 * Seed data từ constants (chạy một lần hoặc khi cần đồng bộ)
 */
export const seedProcessingStatuses = async (req: Request, res: Response) => {
  try {
    await ensureLeadProcessingStatuses();
    const results = await prisma.leadProcessingStatus.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ message: 'Seed success', data: results });
  } catch (error) {
    console.error('Error seeding processing statuses:', error);
    res.status(500).json({ error: 'Lỗi khi seed trạng thái' });
  }
};
