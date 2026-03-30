import { prisma } from '../config/database';
import { Request } from 'express';

interface AuditLogParams {
  userId: string;
  userName: string;
  userPhone?: string | null;
  action: string;
  object: string;
  objectId?: string | null;
  result: 'SUCCESS' | 'FAILURE';
  details?: string;
  oldValues?: any;
  newValues?: any;
  req?: Request;
}

const AUDIT_ALREADY_LOGGED_FLAG = '__auditAlreadyLogged';

const normalizeResult = (
  result: 'SUCCESS' | 'FAILURE' | string | undefined,
): 'Thành công' | 'Thất bại' | 'Thành công một phần' => {
  if (!result) return 'Thành công';
  const upper = String(result).toUpperCase();
  if (upper === 'FAILURE' || upper === 'THẤT BẠI') return 'Thất bại';
  if (upper === 'PARTIAL_SUCCESS' || upper === 'THÀNH CÔNG MỘT PHẦN') return 'Thành công một phần';
  return 'Thành công';
};

export const logAudit = async (params: AuditLogParams) => {
  try {
    const {
      userId,
      userName,
      userPhone,
      action,
      object,
      objectId,
      result,
      details,
      oldValues,
      newValues,
      req
    } = params;

    const ipAddress = req ? (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress) : undefined;
    const userAgent = req ? req.headers['user-agent'] : undefined;

    await prisma.systemLog.create({
      data: {
        userId,
        userName,
        userPhone,
        action,
        object,
        objectId,
        result: normalizeResult(result),
        details,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : undefined,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
        ipAddress,
        userAgent,
      },
    });
    if (req) {
      (req as any)[AUDIT_ALREADY_LOGGED_FLAG] = true;
    }
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw error to avoid breaking the main flow
  }
};

// Helper to extract user info from request (assuming auth middleware attaches user to req)
export const getAuditUser = (req: any) => {
  if (req.user) {
    return {
      userId: req.user.id,
      userName: req.user.fullName || req.user.name || 'Unknown',
      userPhone: req.user.phone,
    };
  }
  return {
    userId: 'system',
    userName: 'System',
    userPhone: null,
  };
};
