import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { getPaginationParams } from '../utils/pagination';

/**
 * Lấy danh sách thông báo của user
 */
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { unreadOnly = 'false' } = req.query;
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    const where: any = {
      employeeId: user.id
    };

    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.userNotification.count({ where }),
      prisma.userNotification.count({
        where: {
          employeeId: user.id,
          isRead: false
        }
      })
    ]);

    res.json({
      notifications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      unreadCount
    });
  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách thông báo' });
  }
};

/**
 * Lấy số lượng thông báo chưa đọc
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const unreadCount = await prisma.userNotification.count({
      where: {
        employeeId: user.id,
        isRead: false
      }
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy số thông báo chưa đọc' });
  }
};

/**
 * Đánh dấu một thông báo đã đọc
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const notificationId = req.params.id as string;

    const notification = await prisma.userNotification.findFirst({
      where: {
        id: notificationId,
        employeeId: user.id
      }
    });

    if (!notification) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    const updated = await prisma.userNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Lỗi khi đánh dấu đã đọc' });
  }
};

/**
 * Đánh dấu tất cả thông báo đã đọc
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const result = await prisma.userNotification.updateMany({
      where: {
        employeeId: user.id,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    res.json({ 
      message: 'Đã đánh dấu tất cả đã đọc',
      count: result.count 
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ message: 'Lỗi khi đánh dấu tất cả đã đọc' });
  }
};

/**
 * Xóa một thông báo
 */
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const notificationId = req.params.id as string;

    const notification = await prisma.userNotification.findFirst({
      where: {
        id: notificationId,
        employeeId: user.id
      }
    });

    if (!notification) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    await prisma.userNotification.delete({
      where: { id: notificationId }
    });

    res.json({ message: 'Đã xóa thông báo' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa thông báo' });
  }
};

/**
 * Xóa tất cả thông báo đã đọc
 */
export const deleteAllRead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const result = await prisma.userNotification.deleteMany({
      where: {
        employeeId: user.id,
        isRead: true
      }
    });

    res.json({ 
      message: 'Đã xóa tất cả thông báo đã đọc',
      count: result.count 
    });
  } catch (error) {
    console.error('Delete all read error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa thông báo' });
  }
};

/**
 * Tạo thông báo cho user (internal use)
 */
export const createUserNotification = async (
  employeeId: string,
  title: string,
  content: string,
  type: string,
  link?: string,
  metadata?: any
) => {
  try {
    const notification = await prisma.userNotification.create({
      data: {
        employeeId,
        title,
        content,
        type,
        link,
        metadata
      }
    });
    return notification;
  } catch (error) {
    console.error('Create user notification error:', error);
    return null;
  }
};
