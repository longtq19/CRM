import { Request, Response } from 'express';
import { logModel } from '../models/logModel';
import { getPaginationParams } from '../utils/pagination';
import { logAudit } from '../utils/auditLog';

export const getLogs = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, action = 'All', userName = 'All', search = '', result = 'All', object = 'All' } = req.query;
    
    const where: any = {};

    // Filter by Date Range
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.timestamp.lte = end;
      }
    }

    // Filter by Action
    if (action !== 'All') {
      where.action = action;
    }

    // Filter by Object (Target)
    if (object && object !== 'All') {
      where.object = object;
    }

    // Filter by User (Name)
    if (userName !== 'All') {
      where.userName = userName;
    }

    // Filter by Result
    if (result !== 'All') {
      if (result === 'Thành công') {
        where.result = { in: ['Thành công', 'SUCCESS'] };
      } else if (result === 'Thất bại') {
        where.result = { in: ['Thất bại', 'FAILURE'] };
      } else {
        where.result = result;
      }
    }

    // Search text (User Name, Object, Details)
    if (search) {
      where.OR = [
        { userName: { contains: search as string } }, // simplified for broad compatibility
        { object: { contains: search as string } },
        { details: { contains: search as string } }
      ];
    }

    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    const [logs, total, uniqueUsers, uniqueObjects, uniqueActions] = await Promise.all([
      logModel.findAll({ where, skip, take: limitNum }),
      logModel.count(where),
      logModel.getDistinctUsers(),
      logModel.getDistinctObjects(),
      logModel.getDistinctActions()
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      uniqueUsers,
      uniqueObjects,
      uniqueActions
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createLog = async (req: Request, res: Response) => {
  try {
    const { action, object, result, details } = req.body;
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const newLog = await logModel.create({
      action,
      userId: user.id || user.userId, // JWT payload usually has id or userId
      userName: user.name || 'Unknown', // Ideally fetch user name or store it in token
      userPhone: user.phone,
      object,
      result: result || 'Thành công',
      details
    });

    res.status(201).json({ success: true, log: newLog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Internal helper for other controllers to use
interface LogActionParams {
  userId: string;
  userName: string;
  action: string;
  object: string;
  details: string;
  targetId?: string;
  userPhone?: string;
  result?: 'Thành công' | 'Thất bại' | 'Thành công một phần';
}

/** Ghi nhật ký hệ thống (tương thích cũ). Ưu tiên dùng logAudit trực tiếp khi có req để tránh trùng middleware. */
export const logAction = (
  userIdOrParams: string | LogActionParams,
  userName?: string,
  action?: string,
  object?: string,
  details?: string,
  targetId?: string,
  userPhone?: string
) => {
  const run = async () => {
    if (typeof userIdOrParams === 'object') {
      const p = userIdOrParams;
      await logAudit({
        userId: p.userId,
        userName: p.userName,
        userPhone: p.userPhone,
        action: p.action,
        object: p.object,
        objectId: p.targetId,
        result: p.result === 'Thất bại' ? 'FAILURE' : 'SUCCESS',
        details: p.details,
      });
    } else {
      await logAudit({
        userId: userIdOrParams,
        userName: userName || 'Unknown',
        userPhone,
        action: action || '',
        object: object || '',
        objectId: targetId,
        result: 'SUCCESS',
        details: details || '',
      });
    }
  };
  void run().catch((e) => console.error('logAction error:', e));
};
