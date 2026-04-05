import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import {
  generateToken,
  generateStaffCheckToken,
  verifyStaffCheckToken,
} from '../../utils/jwt';
import { ROLE_CODES, isTechnicalAdminRoleCode } from '../../constants/rbac';
import { tryMarkStaffCheckJtiConsumedOnce } from '../../utils/staffCheckTokenStore';

export interface AuthResult {
  success: boolean;
  message?: string;
  token?: string;
  employee?: any;
}

export class AuthService {
  /**
   * Verify phone number exists.
   */
  static async validatePhone(phone: string): Promise<boolean> {
    const employee = await prisma.employee.findFirst({ where: { phone } });
    return !!employee;
  }

  /**
   * Login with phone and password.
   */
  static async login(phone: string, password?: string): Promise<AuthResult> {
    if (!phone) return { success: false, message: 'Vui lòng nhập số điện thoại' };

    const employee = await prisma.employee.findFirst({
      where: { phone: phone },
      select: {
        id: true,
        fullName: true,
        code: true,
        phone: true,
        avatarUrl: true,
        passwordHash: true,
        roleGroupId: true,
        roleGroup: {
          include: {
            menus: { orderBy: { order: 'asc' } },
            permissions: true
          }
        }
      }
    });

    if (!employee) return { success: false, message: 'Số điện thoại chưa được đăng ký' };

    // Check account lock
    const empWithLock = await prisma.employee.findUnique({
      where: { id: employee.id },
      select: { isLocked: true }
    }).catch(() => null);
    
    if (empWithLock?.isLocked) {
      return { success: false, message: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ Quản trị viên.' };
    }

    if (!password || !employee.passwordHash) {
      return { success: false, message: 'Tài khoản chưa được thiết lập mật khẩu, vui lòng liên hệ HR/IT' };
    }

    const isValid = await bcrypt.compare(password, employee.passwordHash);
    if (!isValid) return { success: false, message: 'Mật khẩu không chính xác' };

    // Update last login
    await prisma.employee.update({
      where: { id: employee.id },
      data: { sessionInvalidatedAt: null, lastLoginAt: new Date() }
    }).catch(() => {});

    const token = generateToken({ id: employee.id, phone: employee.phone });

    return {
      success: true,
      token,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        code: employee.code,
        phone: employee.phone,
        avatarUrl: employee.avatarUrl,
        roleGroup: employee.roleGroup,
        menus: employee.roleGroup?.menus || [],
        permissions: (employee.roleGroup?.permissions || []).map((p: any) => (typeof p === 'string' ? p : p.code))
      }
    };
  }

  /**
   * Consume a staff check token and login.
   */
  static async consumeStaffCheckToken(token: string): Promise<AuthResult> {
    if (!token) return { success: false, message: 'Missing token' };

    const decoded = verifyStaffCheckToken(token);
    if (!decoded) return { success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' };

    const consumed = tryMarkStaffCheckJtiConsumedOnce(decoded.jti, decoded.exp);
    if (!consumed) return { success: false, message: 'Token này đã được sử dụng rồi.' };

    const employee = await prisma.employee.findUnique({
      where: { id: decoded.targetEmployeeId },
      include: {
        roleGroup: {
          include: {
            menus: { orderBy: { order: 'asc' } },
            permissions: true
          }
        }
      }
    });

    if (!employee) return { success: false, message: 'Nhân viên không tồn tại' };

    const authToken = generateToken({ id: employee.id, phone: employee.phone });

    return {
      success: true,
      token: authToken,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        code: employee.code,
        phone: employee.phone,
        avatarUrl: employee.avatarUrl,
        roleGroup: employee.roleGroup,
        menus: employee.roleGroup?.menus || [],
        permissions: (employee.roleGroup?.permissions || []).map((p: any) => (typeof p === 'string' ? p : p.code))
      }
    };
  }

  /**
   * Change password for the current employee.
   */
  static async changePassword(employeeId: string, oldPassword?: string, newPassword?: string): Promise<AuthResult> {
    if (!oldPassword || !newPassword) return { success: false, message: 'Thiếu thông tin mật khẩu' };

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || !employee.passwordHash) return { success: false, message: 'Nhân viên không tồn tại' };

    const isMatch = await bcrypt.compare(oldPassword, employee.passwordHash);
    if (!isMatch) return { success: false, message: 'Mật khẩu cũ không chính xác' };

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.employee.update({
      where: { id: employeeId },
      data: { passwordHash: hash, sessionInvalidatedAt: new Date() }
    });

    return { success: true, message: 'Đổi mật khẩu thành công' };
  }

  /**
   * Admin: Set a temporary password for an employee.
   */
  static async setTempPassword(employeeId: string, tempPassword?: string): Promise<AuthResult> {
    if (!tempPassword) return { success: false, message: 'Mật khẩu tạm thời không được để trống' };

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return { success: false, message: 'Nhân viên không tồn tại' };

    const hash = await bcrypt.hash(tempPassword, 10);
    await prisma.employee.update({
      where: { id: employeeId },
      data: { passwordHash: hash, sessionInvalidatedAt: new Date() }
    });

    return { success: true, message: 'Đặt lại mật khẩu tạm thời thành công. Phiên làm việc của nhân viên đã bị vô hiệu hóa.' };
  }

  /**
   * Admin: Issue a staff check token to view the system as another employee (impersonation).
   */
  static async issueStaffCheckToken(targetId: string, actorId: string): Promise<AuthResult> {
    const target = await prisma.employee.findUnique({ where: { id: targetId } });
    if (!target) return { success: false, message: 'Target employee not found' };

    const token = generateStaffCheckToken({
      targetEmployeeId: targetId,
      issuedByEmployeeId: actorId
    });
    return { success: true, token };
  }

  /**
   * Admin: Logout an employee (invalidate session).
   */
  static async logoutEmployee(employeeId: string): Promise<AuthResult> {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return { success: false, message: 'Nhân viên không tồn tại' };

    await prisma.employee.update({
      where: { id: employeeId },
      data: { sessionInvalidatedAt: new Date() }
    });

    return { success: true, message: 'Đã vô hiệu hóa phiên làm việc của nhân viên.' };
  }

  /**
   * Admin: Lock or unlock an employee account.
   */
  static async lockEmployee(employeeId: string, isLocked: boolean): Promise<AuthResult> {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return { success: false, message: 'Nhân viên không tồn tại' };

    await prisma.employee.update({
      where: { id: employeeId },
      data: { isLocked, sessionInvalidatedAt: isLocked ? new Date() : employee.sessionInvalidatedAt }
    });

    return { success: true, message: isLocked ? 'Đã khóa tài khoản nhân viên.' : 'Đã mở khóa tài khoản nhân viên.' };
  }
}
