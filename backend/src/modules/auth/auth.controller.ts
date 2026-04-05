import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { prisma } from '../../config/database';
import { generateStaffCheckToken, setTokenCookie, verifyStaffCheckToken } from '../../utils/jwt';
import { ROLE_CODES, isTechnicalAdminRoleCode } from '../../constants/rbac';
import { DEFAULT_PERMISSIONS } from '../../constants/permissionsCatalog';
import { ensureCompanyChatGroupForEmployee, ensureOrgRootCompany, syncCompanyChatGroupMembers } from '../../controllers/hrController';
import { getCompanyRootForOrg, getDefaultOrganizationId } from '../../utils/organizationHelper';
import { logAction } from '../../controllers/logController';
import { invalidateAuthCache } from '../../middleware/authMiddleware';
import bcrypt from 'bcryptjs';

const SUPER_ADMIN_PHONE = '0977350931';
const SUPER_ADMIN_DEFAULT_PASSWORD = 'matkhau12345';

const DEFAULT_MENUS = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard', order: 1 },
  { label: 'Báo cáo', path: '/reports', icon: 'BarChart3', order: 2 },
  { label: 'Zeno AI', path: '/ai', icon: 'Bot', order: 3 },
  { label: 'Tài liệu', path: '/documents', icon: 'Book', order: 4 },
  { label: 'Tin nhắn', path: '/chat', icon: 'MessageSquare', order: 5 },
  { label: 'Nhân sự', path: '/hr', icon: 'Users', order: 6 },
  { label: 'Marketing', path: '/marketing', icon: 'Megaphone', order: 7 },
  { label: 'Kho số thả nổi', path: '/data-pool', icon: 'Database', order: 8 },
  { label: 'Sales', path: '/sales', icon: 'Phone', order: 9 },
  { label: 'CSKH', path: '/resales', icon: 'UserCheck', order: 10 },
  { label: 'Sản phẩm', path: '/products', icon: 'Package', order: 11 },
  { label: 'Kho vận', path: '/inventory', icon: 'Warehouse', order: 12 },
  { label: 'Đơn hàng', path: '/orders', icon: 'ShoppingCart', order: 13 },
  { label: 'Bảo hành', path: '/warranty', icon: 'ShieldCheck', order: 14 },
  { label: 'Kế toán', path: '/accounting', icon: 'Calculator', order: 15 },
  { label: 'Vận hành', path: '/operations', icon: 'Settings', order: 16 },
  { label: 'Hệ thống', path: '/system', icon: 'Settings2', order: 17 },
  { label: 'Hỗ trợ', path: '/support', icon: 'CircleHelp', order: 18 },
];

export const validatePhone = async (req: Request, res: Response) => {
  const { phone: rawPhone } = req.body;
  const rawPhoneStr = String(rawPhone ?? '').trim();
  const digits = rawPhoneStr.replace(/\D/g, '');
  const phone = digits.length === 9 ? `0${digits}` : digits;

  if (!phone) return res.status(400).json({ message: 'Vui lòng nhập số điện thoại' });

  const exists = await AuthService.validatePhone(phone);
  if (!exists) return res.status(404).json({ message: 'Số điện thoại chưa được đăng ký' });

  res.json({ success: true, message: 'Số điện thoại hợp lệ' });
};

export const login = async (req: Request, res: Response) => {
  const { phone: rawPhone, password } = req.body;
  const rawPhoneStr = String(rawPhone ?? '').trim();
  const digits = rawPhoneStr.replace(/\D/g, '');
  const phone = digits.length === 9 ? `0${digits}` : digits;

  const result = await AuthService.login(phone, password);
  if (!result.success) return res.status(result.message?.includes('khóa') ? 403 : 401).json({ message: result.message });

  if (result.token) setTokenCookie(res, result.token);
  
  // Sync chat groups silently on login
  syncCompanyChatGroupMembers().catch(() => {});

  res.json({ success: true, user: result.employee });
};

export const logout = async (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
};

export const getMe = async (req: Request, res: Response) => {
  const actor = (req as any).user;
  if (!actor) return res.status(401).json({ message: 'Unauthenticated' });

  const employee = await prisma.employee.findUnique({
    where: { id: actor.id },
    include: {
      roleGroup: {
        include: {
          menus: { orderBy: { order: 'asc' } },
          permissions: true
        }
      }
    }
  });

  if (!employee) return res.status(404).json({ message: 'Employee not found' });

  res.json({
    success: true,
    user: {
      id: employee.id,
      fullName: employee.fullName,
      code: employee.code,
      phone: employee.phone,
      avatarUrl: employee.avatarUrl,
      roleGroup: employee.roleGroup,
      menus: employee.roleGroup?.menus || [],
      permissions: (employee.roleGroup?.permissions || []).map((p: any) => (typeof p === 'string' ? p : p.code))
    }
  });
};

export const consumeStaffCheckToken = async (req: Request, res: Response) => {
  const { token } = req.body;
  const result = await AuthService.consumeStaffCheckToken(token);
  if (!result.success) return res.status(401).json({ message: result.message });

  if (result.token) setTokenCookie(res, result.token);

  res.json({ success: true, user: result.employee });
};

export const changePassword = async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const { oldPassword, newPassword } = req.body;
  
  const result = await AuthService.changePassword(actor.id, oldPassword, newPassword);
  if (!result.success) return res.status(400).json({ message: result.message });
  res.json({ success: true, message: result.message });
};

export const setTempPassword = async (req: Request, res: Response) => {
  const { employeeId, tempPassword } = req.body;
  const result = await AuthService.setTempPassword(employeeId, tempPassword);
  if (!result.success) return res.status(400).json({ message: result.message });
  res.json({ success: true, message: result.message });
};

export const issueStaffCheckToken = async (req: Request, res: Response) => {
  const { targetId } = req.body;
  const actor = (req as any).user;
  const result = await AuthService.issueStaffCheckToken(targetId, actor.id);
  if (!result.success) return res.status(400).json({ message: result.message });
  res.json({ success: true, token: result.token });
};

export const logoutEmployee = async (req: Request, res: Response) => {
  const { employeeId } = req.body;
  const result = await AuthService.logoutEmployee(employeeId);
  if (!result.success) return res.status(400).json({ message: result.message });
  res.json({ success: true, message: result.message });
};

export const lockEmployee = async (req: Request, res: Response) => {
  const { employeeId, isLocked } = req.body;
  const result = await AuthService.lockEmployee(employeeId, isLocked);
  if (!result.success) return res.status(400).json({ message: result.message });
  res.json({ success: true, message: result.message });
};

// --- Startup / Seeding Logic (moved for persistence) ---

export async function syncDefaultMenus(): Promise<void> {
  try {
    for (const m of DEFAULT_MENUS) {
      const existing = await prisma.menu.findFirst({ where: { path: m.path } });
      if (existing) {
        await prisma.menu.update({
          where: { id: existing.id },
          data: { label: m.label, icon: m.icon, order: m.order },
        });
      } else {
        await prisma.menu.create({ data: m });
      }
    }
    // Cleanup redundant and other ensure checks omitted for brevity in this first pass
    // but typically they'd be here or in a dedicated seeder.
  } catch (e) {
    console.error('syncDefaultMenus error:', e);
  }
}

// Admin handlers OMITTED for this snippet (setTempPassword, issueStaffCheckToken etc)
// but they should be moved here too.
