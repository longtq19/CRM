import { Notification as PrismaNotification, NotificationRead } from '@prisma/client';
import { prisma } from '../config/database';

export interface NotificationTarget {
  type: 'all' | 'area' | 'crop' | 'rank' | 'customer_phone';
  value?: string | string[];
}

export interface NotificationStats {
  sent: number;
  read: number;
}

export interface Notification {
  id: string;
  code: string;
  title: string;
  content: string;
  type: 'system_maintenance' | 'knowledge_share' | 'marketing' | 'maintenance_warranty';
  target: NotificationTarget;
  status: 'SCHEDULED' | 'SENT' | 'DISABLED' | 'DRAFT';
  cta?: {
    label: string;
    url: string;
  };
  scheduledAt?: Date;
  sentAt?: Date;
  createdAt: Date;
  createdBy: string;
  stats: NotificationStats;
}

export interface NotificationFilters {
  status?: string;
  type?: string;
  target?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

// Helper to map Prisma object to Interface
const mapToInterface = (n: PrismaNotification): Notification => {
  let targetValue: any = undefined;
  if (n.targetValue) {
    try {
      targetValue = JSON.parse(n.targetValue);
    } catch (e) {
      targetValue = n.targetValue;
    }
  }

  return {
    id: n.id,
    code: n.code || '',
    title: n.title,
    content: n.content,
    type: n.type as any,
    target: {
      type: n.targetType as any,
      value: targetValue
    },
    status: n.status as any,
    cta: (n.ctaLabel && n.ctaUrl) ? { label: n.ctaLabel, url: n.ctaUrl } : undefined,
    scheduledAt: n.scheduledAt || undefined,
    sentAt: n.sentAt || undefined,
    createdAt: n.createdAt,
    createdBy: n.createdBy,
    stats: {
      sent: n.sentCount,
      read: n.readCount
    }
  };
};

export const notificationModel = {
  findAll: async () => {
    const notifs = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return notifs.map(mapToInterface);
  },

  find: async (filters: NotificationFilters = {}) => {
    const where: any = {};

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }
    if (filters.type && filters.type !== 'all') {
      where.type = filters.type;
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } }
      ];
    }
    if (filters.startDate) {
      where.createdAt = { ...where.createdAt, gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { ...where.createdAt, lte: end };
    }

    const notifs = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    return notifs.map(mapToInterface);
  },

  findById: async (id: string) => {
    const n = await prisma.notification.findUnique({ where: { id } });
    return n ? mapToInterface(n) : null;
  },

  create: async (data: Omit<Notification, 'id' | 'createdAt' | 'stats' | 'code'>) => {
    const targetValue = data.target.value ? JSON.stringify(data.target.value) : null;
    
    const newNotif = await prisma.notification.create({
      data: {
        title: data.title,
        content: data.content,
        type: data.type,
        targetType: data.target.type,
        targetValue: targetValue,
        status: data.status,
        ctaLabel: data.cta?.label,
        ctaUrl: data.cta?.url,
        scheduledAt: data.scheduledAt,
        sentAt: data.sentAt,
        createdBy: data.createdBy,
        sentCount: 0,
        readCount: 0
      }
    });
    
    return mapToInterface(newNotif);
  },

  update: async (id: string, updates: Partial<Notification>) => {
    const data: any = {};
    
    if (updates.title) data.title = updates.title;
    if (updates.content) data.content = updates.content;
    if (updates.type) data.type = updates.type;
    if (updates.status) data.status = updates.status;
    if (updates.scheduledAt !== undefined) data.scheduledAt = updates.scheduledAt;
    if (updates.sentAt !== undefined) data.sentAt = updates.sentAt;
    
    if (updates.target) {
      data.targetType = updates.target.type;
      data.targetValue = updates.target.value ? JSON.stringify(updates.target.value) : null;
    }
    
    if (updates.cta) {
      data.ctaLabel = updates.cta.label;
      data.ctaUrl = updates.cta.url;
    }
    
    if (updates.stats) {
      if (updates.stats.sent !== undefined) data.sentCount = updates.stats.sent;
      if (updates.stats.read !== undefined) data.readCount = updates.stats.read;
    }

    try {
      const updated = await prisma.notification.update({
        where: { id },
        data
      });
      return mapToInterface(updated);
    } catch (e) {
      return null;
    }
  },

  delete: async (id: string) => {
    try {
      await prisma.notification.delete({ where: { id } });
      return true;
    } catch (e) {
      return false;
    }
  },

  // Read status management
  getReadNotificationIds: async (userId: string) => {
    const reads = await prisma.notificationRead.findMany({
      where: { userId },
      select: { notificationId: true }
    });
    return reads.map(r => r.notificationId);
  },

  markAsRead: async (userId: string, notificationId: string) => {
    try {
      await prisma.notificationRead.create({
        data: {
          userId,
          notificationId
        }
      });
      
      // Increment read count
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          readCount: { increment: 1 }
        }
      });
      
      return true;
    } catch (e) {
      return false; // Already read or error
    }
  }
};
