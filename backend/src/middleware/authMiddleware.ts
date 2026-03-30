import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { isTechnicalAdminRoleCode } from '../constants/rbac';

const AUTH_CACHE_TTL = 60_000; // 60 seconds
const authCache = new Map<string, { data: any; expiry: number }>();

function getCachedUser(userId: string) {
  const entry = authCache.get(userId);
  if (entry && Date.now() < entry.expiry) return entry.data;
  if (entry) authCache.delete(userId);
  return null;
}

function setCachedUser(userId: string, data: any) {
  authCache.set(userId, { data, expiry: Date.now() + AUTH_CACHE_TTL });
  if (authCache.size > 500) {
    const firstKey = authCache.keys().next().value;
    if (firstKey) authCache.delete(firstKey);
  }
}

export function invalidateAuthCache(userId?: string) {
  if (userId) authCache.delete(userId);
  else authCache.clear();
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  /** Ưu tiên Bearer (phiên kiểm tra tài khoản dùng sessionStorage, không ghi đè cookie tab quản trị). */
  let token: string | undefined;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({ message: 'Chưa gửi thông tin đăng nhập. Vui lòng đăng nhập lại.' });
  }

  try {
    const decoded: any = verifyToken(token);

    let cached = getCachedUser(decoded.id);
    if (!cached) {
      // Dùng select để tránh lỗi khi DB chưa có cột is_locked, session_invalidated_at
      const user = await prisma.employee.findUnique({
          where: { id: decoded.id },
          select: {
              id: true,
              roleGroupId: true,
              roleGroup: { include: { permissions: true } },
              status: true
          }
      });

      if (!user) {
          return res.status(401).json({ message: 'Không tìm thấy tài khoản.' });
      }

      const lockAndSession = await prisma.employee.findUnique({
          where: { id: decoded.id },
          select: { isLocked: true, sessionInvalidatedAt: true }
      }).catch(() => null);
      if (lockAndSession?.isLocked) {
          return res.status(403).json({ message: 'Forbidden: Account is locked' });
      }
      const sessionInvalidatedAt = lockAndSession?.sessionInvalidatedAt;
      if (sessionInvalidatedAt && decoded.iat != null) {
          const invalidatedSec = Math.floor(sessionInvalidatedAt.getTime() / 1000);
          if (decoded.iat < invalidatedSec) {
              return res.status(401).json({ message: 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.' });
          }
      }

      if (!user.status?.isActive) {
          return res.status(403).json({ message: 'Forbidden: Account is inactive' });
      }

      cached = {
          permissions: user.roleGroup?.permissions.map(p => p.code) || [],
          role: user.roleGroup?.name || 'Staff',
          roleGroupCode: user.roleGroup?.code || null
      };
      setCachedUser(decoded.id, cached);
    }

    (req as any).user = {
        ...decoded,
        ...cached
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
  }
};

export const authMiddleware = authenticate;

export const checkPermission = (permissionCode: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Technical system administrator: full API access (replaces legacy ADM).
    if (isTechnicalAdminRoleCode(user.roleGroupCode)) {
        return next();
    }

    const permissionsToCheck = Array.isArray(permissionCode) ? permissionCode : [permissionCode];
    const userPermissions = user.permissions || [];

    const hasAccess = userPermissions.includes('FULL_ACCESS') || 
                      permissionsToCheck.some((p: string) => userPermissions.includes(p));

    if (hasAccess) {
        next();
    } else {
        return res.status(403).json({
          message: `Bạn không có quyền thực hiện thao tác này (cần một trong các quyền: ${permissionsToCheck.join(', ')}).`,
        });
    }
  };
};

