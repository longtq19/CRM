import { Request, Response } from 'express';
import { notificationModel, Notification } from '../models/notificationModel';
import { prisma } from '../config/database';
import { logModel } from '../models/logModel';
import { customerModel } from '../models/customerModel';


// Helper to calculate target count
const calculateTargetCount = async (target: Notification['target']): Promise<number> => {
  try {
    switch (target.type) {
        case 'all':
            const allCustomers = await customerModel.findAll();
            return allCustomers.length;
        case 'area':
            // Removed Farm Module
            return 0;
        case 'crop':
            // Removed Farm Module
            return 0;
        case 'rank':
            const customers = await customerModel.findAll();
            return Math.floor(customers.length * 0.2);
        case 'customer_phone':
            return Array.isArray(target.value) ? target.value.length : (target.value ? 1 : 0);
        default:
            return 0;
    }
  } catch (error) {
    return 0;
  }
};

export const notificationController = {
  // --- Admin APIs ---

  getAll: async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const skip = (page - 1) * limit;

      const filters = {
          status: req.query.status as string,
          type: req.query.type as string,
          target: req.query.target as string,
          search: req.query.search as string,
          startDate: req.query.startDate as string,
          endDate: req.query.endDate as string,
      };

      const notifications = await notificationModel.find(filters);
      
      // Pagination logic (Ideally should be done in DB, but keeping it simple for now as find() returns all)
      const total = notifications.length;
      const paginatedNotifications = notifications.slice(skip, skip + limit);

      res.json({
        data: paginatedNotifications,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Error fetching notifications' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const { title, content, type, target, schedule, cta, status: requestedStatus } = req.body;
      // @ts-ignore
      const userId = req.user?.id || 'admin'; // From Auth Middleware
      const user = await prisma.employee.findUnique({ where: { id: userId } });
      const permissions = (req as any).user?.permissions || [];

      // --- Permission Check ---
      let finalStatus = requestedStatus;
      
      // If user does NOT have full management permission, enforce restrictions
      if (!permissions.includes('MANAGE_NOTIFICATIONS')) {
        // Restricted User (e.g. Staff) MUST create as DRAFT
        if (finalStatus !== 'DRAFT') {
           // Either reject or force DRAFT. Let's force DRAFT as per requirement "Nhân viên chỉ được tạo lưu nháp"
           finalStatus = 'DRAFT';
        }

        // Restricted User MUST target 'customer_phone'
        if (target.type !== 'customer_phone') {
          return res.status(403).json({ message: 'Bạn chỉ được gửi thông báo cho khách hàng cụ thể.' });
        }

        // Validate customers belong to user
        const allCustomers = await customerModel.findAll();
        const myCustomers = allCustomers.filter((c: any) => c.employeeId === userId);
        const myCustomerPhones = myCustomers.map((c: any) => c.phone);

        const targetPhones = Array.isArray(target.value) ? target.value : [target.value];
        const unauthorizedPhones = targetPhones.filter((p: string) => !myCustomerPhones.includes(p));

        if (unauthorizedPhones.length > 0) {
          return res.status(403).json({ message: `Bạn không có quyền gửi thông báo cho các SĐT: ${unauthorizedPhones.join(', ')}` });
        }
      }

      // Default status logic if not set
      const isScheduled = !!schedule;
      if (!finalStatus) {
        finalStatus = isScheduled ? 'SCHEDULED' : 'SENT';
      }
      
      const newNotif = await notificationModel.create({
        title,
        content,
        type: type || 'system_maintenance',
        target: target || { type: 'rank', value: 'Thành Viên' },
        status: finalStatus,
        scheduledAt: schedule ? new Date(schedule) : undefined,
        sentAt: (finalStatus === 'SENT') ? new Date() : undefined,
        createdBy: userId,
        cta
      });

      // Log the action
      await logModel.create({
        userId,
        userName: user?.fullName || 'Unknown',
            userPhone: user?.phone || undefined,
        action: 'Tạo thông báo',
        object: 'Thông báo',
        result: 'Thành công',
        details: `Tiêu đề: ${title} | Status: ${finalStatus}`
      });

      // If sent immediately, calculate stats
      if (finalStatus === 'SENT') {
        const sentCount = await calculateTargetCount(newNotif.target);
        await notificationModel.update(newNotif.id, {
          stats: { sent: sentCount, read: 0 }
        });
        newNotif.stats.sent = sentCount;
      }

      res.status(201).json(newNotif);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error creating notification' });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      // @ts-ignore
      const userId = req.user?.id || 'admin';
      const user = await prisma.employee.findUnique({ where: { id: userId } });

      const existing = await notificationModel.findById(id as string);
      if (!existing) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      // --- Check: Cannot edit SENT notifications ---
      if (existing.status === 'SENT') {
        return res.status(403).json({ message: 'Không thể chỉnh sửa thông báo đã gửi.' });
      }

      // Handle sending a scheduled notification immediately or publishing a draft
      if (updates.status === 'SENT') {
          // Calculate stats
          const sentCount = await calculateTargetCount(existing.target);
          updates.sentAt = new Date();
          updates.scheduledAt = undefined; // Clear schedule if sent now
          updates.stats = { sent: sentCount, read: 0 };

          // Log sending action
          await logModel.create({
            userId,
            userName: user?.fullName || 'Unknown',
            action: 'Gửi thông báo',
            object: 'Thông báo',
            result: 'Thành công',
            details: `Gửi thông báo: ${existing.title}`
          });
      } else {
          // Log update action
          await logModel.create({
            userId,
            userName: user?.fullName || 'Unknown',
            action: 'Cập nhật thông báo',
            object: 'Thông báo',
            result: 'Thành công',
            details: `Cập nhật thông báo: ${existing.title}`
          });
      }

      const updated = await notificationModel.update(id as string, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: 'Error updating notification' });
    }
  },

  delete: async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const deleted = await notificationModel.delete(id as string);
        if (deleted) {
            res.json({ message: 'Deleted successfully' });
        } else {
            res.status(404).json({ message: 'Notification not found' });
        }
      } catch (error) {
          res.status(500).json({ message: 'Error deleting notification' });
      }
  },

  // --- User APIs ---
  getMyNotifications: async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        // Logic to find notifications relevant to this user
        // 1. Get all SENT notifications
        const allSent = await notificationModel.find({ status: 'SENT' });
        
        // 2. Filter by target (simplified)
        // In real app, we check if user matches target (rank, crop, etc.)
        // Here we just return 'all' or specific phone
        const myNotifs = allSent.filter(n => {
            if (n.target.type === 'all') return true;
            // Add more logic here
            return false;
        });

        res.json(myNotifs);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching my notifications' });
    }
  },

  getUnreadCount: async (req: Request, res: Response) => {
      try {
          // @ts-ignore
          const userId = req.user?.id;
          if (!userId) return res.status(401).json({ message: 'Unauthorized' });

          // In a real implementation, we would query NotificationRead table
          // For now, return 0 or mock
          const unreadCount = 0; 
          res.json({ count: unreadCount });
      } catch (error) {
          res.status(500).json({ message: 'Error fetching unread count' });
      }
  },

  markAsRead: async (req: Request, res: Response) => {
      try {
          const { id } = req.params;
          // @ts-ignore
          const userId = req.user?.id;
          if (!userId) return res.status(401).json({ message: 'Unauthorized' });

          // Record read in DB
          await prisma.notificationRead.upsert({
              where: {
                  userId_notificationId: {
                      userId,
                      notificationId: id as string
                  }
              },
              create: {
                  userId,
                  notificationId: id as string
              },
              update: {}
          });

          // Update read count on notification (optional, can be expensive)
          await prisma.notification.update({
              where: { id: id as string },
              data: {
                  readCount: { increment: 1 }
              }
          });

          res.json({ success: true });
      } catch (error) {
          res.status(500).json({ message: 'Error marking as read' });
      }
  }
};
