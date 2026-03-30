import { prisma } from '../config/database';

export interface SystemLog {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  userPhone?: string;
  action: string;
  object: string;
  result: 'Thành công' | 'Thất bại' | 'Thành công một phần' | string;
  details?: string;
}

export const logModel = {
  findAll: async (params?: { where?: any, skip?: number, take?: number }) => {
    const { where, skip, take } = params || {};
    return await prisma.systemLog.findMany({
      where,
      orderBy: {
        timestamp: 'desc'
      },
      skip,
      take
    });
  },

  count: async (where?: any) => {
    return await prisma.systemLog.count({ where });
  },

  getDistinctUsers: async () => {
    const users = await prisma.systemLog.groupBy({
      by: ['userName'],
      orderBy: {
        userName: 'asc'
      }
    });
    return users.map(u => u.userName);
  },

  getDistinctObjects: async () => {
    const objects = await prisma.systemLog.groupBy({
      by: ['object'],
      orderBy: {
        object: 'asc'
      }
    });
    return objects.map(o => o.object);
  },

  getDistinctActions: async () => {
    const actions = await prisma.systemLog.groupBy({
      by: ['action'],
      orderBy: {
        action: 'asc'
      }
    });
    return actions.map(a => a.action);
  },
  
  create: async (log: Omit<SystemLog, 'id' | 'timestamp'>) => {
    return await prisma.systemLog.create({
      data: {
        userId: log.userId,
        userName: log.userName,
        userPhone: log.userPhone,
        action: log.action,
        object: log.object,
        result: log.result,
        details: log.details,
      }
    });
  },

  deleteOldLogs: async (date: Date) => {
    return await prisma.systemLog.deleteMany({
      where: {
        timestamp: {
          lt: date
        }
      }
    });
  }
};

