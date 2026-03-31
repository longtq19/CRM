import { Request, Response } from 'express';
import {
  generateToken,
  generateStaffCheckToken,
  setTokenCookie,
  verifyStaffCheckToken,
  verifyToken,
} from '../utils/jwt';
import { prisma } from '../config/database';
import { ensureCompanyChatGroupForEmployee, ensureOrgRootCompany, syncCompanyChatGroupMembers } from './hrController';
import { getCompanyRootForOrg, getDefaultOrganizationId } from '../utils/organizationHelper';
import { logAction } from './logController';
import { invalidateAuthCache } from '../middleware/authMiddleware';
import { tryMarkStaffCheckJtiConsumedOnce, unmarkStaffCheckJti } from '../utils/staffCheckTokenStore';
import bcrypt from 'bcryptjs';
import { ROLE_CODES, isTechnicalAdminRoleCode } from '../constants/rbac';
import { DEFAULT_PERMISSIONS } from '../constants/permissionsCatalog';

/** Thêm cột is_locked, session_invalidated_at vào bảng employees nếu chưa có (tương đương migration 20260316100000) */
async function ensureEmployeeLockColumns(): Promise<void> {
  const addColumn = async (col: string, def: string) => {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS ${col} ${def}`
      );
    } catch (e: any) {
      if (e?.message?.includes('already exists') || e?.code === '42701') return;
      if (e?.message?.includes('IF NOT EXISTS') || e?.message?.includes('syntax')) {
        const result = await prisma.$queryRawUnsafe<{ exists: number }[]>(
          `SELECT 1 as exists FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = $1`,
          col
        );
        if (!Array.isArray(result) || result.length === 0) {
          await prisma.$executeRawUnsafe(`ALTER TABLE employees ADD COLUMN ${col} ${def}`);
        }
        return;
      }
      throw e;
    }
  };
  await addColumn('is_locked', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumn('session_invalidated_at', 'TIMESTAMP(3)');
}

const normalizeHumanName = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isSystemAdminEmployee = (employee: { code?: string | null; fullName?: string | null } | null | undefined) => {
  if (!employee) return false;
  const code = String(employee.code ?? '').toUpperCase().trim();
  if (code === 'SUPERADMIN') return true;
  const name = normalizeHumanName(employee.fullName);
  return name === 'admin system' || name === 'super admin' || name === 'quan tri vien he thong';
};

const SUPER_ADMIN_PHONE = '0977350931';
const SUPER_ADMIN_DEFAULT_PASSWORD = 'matkhau12345';

/**
 * Menu sidebar: nhãn hiển thị lưu trực tiếp (tiếng Việt) trong DB — FE chỉ hiển thị `label` từ API, không map menu.* tại FE.
 * Kagri AI: `/ai`. Tin nhắn (chat nội bộ): `/chat`, ngay sau Tài liệu.
 * Thứ tự `order`: Marketing trước Kho số thả nổi; Kho vận trước Đơn hàng (đồng bộ README mục 4.1).
 */
const DEFAULT_MENUS = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard', order: 1 },
  { label: 'Báo cáo', path: '/reports', icon: 'BarChart3', order: 2 },
  { label: 'Kagri AI', path: '/ai', icon: 'Bot', order: 3 },
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

/** Role nào đã có quyền vào Tin nhắn (`/chat`) thì tự bổ sung menu Kagri AI (`/ai`) nếu chưa có — tránh mất module sau khi tách route. */
async function ensureAiMenuForRolesThatHaveChat(): Promise<void> {
  const aiMenu = await prisma.menu.findFirst({ where: { path: '/ai' } });
  const chatMenu = await prisma.menu.findFirst({ where: { path: '/chat' } });
  if (!aiMenu || !chatMenu) return;

  const groupsWithChat = await prisma.roleGroup.findMany({
    where: { menus: { some: { id: chatMenu.id } } },
    include: { menus: { select: { id: true } } },
  });

  for (const rg of groupsWithChat) {
    const hasAi = rg.menus.some((m) => m.id === aiMenu.id);
    if (!hasAi) {
      await prisma.roleGroup.update({
        where: { id: rg.id },
        data: { menus: { connect: { id: aiMenu.id } } },
      });
    }
  }
}

/** Nhóm technical admin luôn gắn đủ mọi menu (kể cả bản ghi mới như `/ai`). */
async function ensureTechnicalAdminsHaveAllMenus(): Promise<void> {
  const allMenus = await prisma.menu.findMany({ select: { id: true } });
  if (allMenus.length === 0) return;
  const adminGroups = await prisma.roleGroup.findMany({
    where: {
      OR: [{ code: ROLE_CODES.SYSTEM_ADMINISTRATOR }, { code: 'ADM' }],
    },
    select: { id: true },
  });
  for (const g of adminGroups) {
    await prisma.roleGroup.update({
      where: { id: g.id },
      data: { menus: { set: allMenus.map((m) => ({ id: m.id })) } },
    });
  }
}

/** Nhóm technical admin luôn gắn đủ mọi quyền trong catalog (kể cả quyền mới thêm sau). */
async function ensureTechnicalAdminsHaveAllPermissions(): Promise<void> {
  const allPerms = await prisma.permission.findMany({ select: { id: true } });
  if (allPerms.length === 0) return;
  const adminGroups = await prisma.roleGroup.findMany({
    where: {
      OR: [{ code: ROLE_CODES.SYSTEM_ADMINISTRATOR }, { code: 'ADM' }],
    },
    select: { id: true },
  });
  for (const g of adminGroups) {
    await prisma.roleGroup.update({
      where: { id: g.id },
      data: { permissions: { set: allPerms.map((p) => ({ id: p.id })) } },
    });
  }
}

/** Phạm vi xem HR & Khách hàng tối đa (toàn công ty) cho nhóm Quản trị hệ thống. */
async function ensureTechnicalAdminViewScopesFull(): Promise<void> {
  const fullScope = 'COMPANY';
  const adminGroups = await prisma.roleGroup.findMany({
    where: {
      OR: [{ code: ROLE_CODES.SYSTEM_ADMINISTRATOR }, { code: 'ADM' }],
    },
    select: { id: true },
  });
  for (const g of adminGroups) {
    await prisma.roleGroupViewScope.upsert({
      where: {
        roleGroupId_context: { roleGroupId: g.id, context: 'HR' },
      },
      create: { roleGroupId: g.id, context: 'HR', scope: fullScope },
      update: { scope: fullScope },
    });
    await prisma.roleGroupViewScope.upsert({
      where: {
        roleGroupId_context: { roleGroupId: g.id, context: 'CUSTOMER' },
      },
      create: { roleGroupId: g.id, context: 'CUSTOMER', scope: fullScope },
      update: { scope: fullScope },
    });
  }
}

/** Cập nhật label / icon / order theo DEFAULT_MENUS (theo path), thêm bản ghi nếu thiếu — chạy sau khi kết nối DB. */
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

    // `/settings` trên FE hiện chỉ redirect sang `/operations`, nên menu này là dư thừa
    // và dễ gây hiển thị 2 mục "Cài đặt" trong sidebar (tùy dữ liệu DB/roleGroup).
    const redundantSettingsMenu = await prisma.menu.findFirst({
      where: { path: '/settings' },
      select: { id: true }
    });

    if (redundantSettingsMenu?.id) {
      const roleGroups = await prisma.roleGroup.findMany({
        where: { menus: { some: { id: redundantSettingsMenu.id } } },
        select: { id: true }
      });

      // Disconnect trước để tránh ràng buộc FK ở bảng nối RoleMenu.
      for (const rg of roleGroups) {
        await prisma.roleGroup.update({
          where: { id: rg.id },
          data: { menus: { disconnect: { id: redundantSettingsMenu.id } } }
        });
      }

      await prisma.menu.delete({ where: { id: redundantSettingsMenu.id } });
    }

    await ensureAiMenuForRolesThatHaveChat();
    await ensureTechnicalAdminsHaveAllMenus();
    await ensureDefaultPermissionsCatalog();
    await migrateMarketingPlatformPermissionsFromManage();
    await migrateMarketingCampaignPermissionsFromLegacyCatalog();
    await ensureViewMarketingCampaignsForManageCustomersRoles();
    await ensureCampaignWritePermissionsForMarketingRoles();
    await cleanupOrphanPermissions();
    await ensureTechnicalAdminsHaveAllPermissions();
    await ensureTechnicalAdminViewScopesFull();
    await ensureTechnicalAdminsHaveOrgAndFlowPermissions();
    await ensureCrmAdministratorDefaultPermissions();
  } catch (e) {
    console.error('syncDefaultMenus error:', e);
  }
}

/** Gán bộ quyền CRM mặc định cho nhóm Quản trị CRM (catalog — có thể chỉnh trên FE). Không hardcode trong API. */
async function ensureCrmAdministratorDefaultPermissions(): Promise<void> {
  const codes = [
    'VIEW_FLOATING_POOL',
    'MANAGE_DATA_POOL',
    'DATA_POOL_CONFIG',
    'CONFIG_DISTRIBUTION',
    'CLAIM_LEAD',
    'ASSIGN_LEAD',
    'DISTRIBUTE_FLOATING_POOL',
    'DISTRIBUTE_FLOATING_CROSS_ORG',
    'CLAIM_FLOATING_POOL',
    'VIEW_CSKH_POOL',
    'MANAGE_CSKH_POOL',
    'DISTRIBUTE_SALES_CROSS_ORG',
    'VIEW_MANAGED_UNIT_POOL',
    'RECALL_MANAGED_UNIT_LEADS',
    'VIEW_SALES',
    'MANAGE_SALES',
    'VIEW_RESALES',
    'MANAGE_RESALES',
    'VIEW_CUSTOMERS',
    'VIEW_ALL_COMPANY_CUSTOMERS',
    'MANAGE_CUSTOMERS',
    'VIEW_MARKETING_PLATFORMS',
    'CREATE_MARKETING_PLATFORM',
    'UPDATE_MARKETING_PLATFORM',
    'DELETE_MARKETING_PLATFORM',
    'DELETE_CUSTOMER',
    'MANAGE_MARKETING_GROUPS',
    'VIEW_MARKETING_CAMPAIGNS',
    'CREATE_MARKETING_CAMPAIGN',
    'UPDATE_MARKETING_CAMPAIGN',
    'DELETE_MARKETING_CAMPAIGN',
    'VIEW_ORDERS',
    'VIEW_ALL_COMPANY_ORDERS',
    'CREATE_ORDER',
    'MANAGE_ORDERS',
    'MANAGE_SHIPPING',
    'ASSIGN_SHIPPING_DAILY_QUOTA',
    'VIEW_REPORTS',
    'VIEW_PERFORMANCE',
    'VIEW_SALES_EFFECTIVENESS',
    'VIEW_CSKH_EFFECTIVENESS',
  ];
  const perms = await prisma.permission.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  if (perms.length === 0) return;

  const crm = await prisma.roleGroup.findFirst({
    where: { code: ROLE_CODES.CRM_ADMINISTRATOR },
    include: { permissions: { select: { code: true } } },
  });
  if (!crm) return;

  const has = new Set((crm.permissions || []).map((p) => p.code));
  const toConnect = perms.filter((p) => p.code && !has.has(p.code)).map((p) => ({ id: p.id }));
  if (toConnect.length === 0) return;
  await prisma.roleGroup.update({
    where: { id: crm.id },
    data: { permissions: { connect: toConnect } },
  });
}

async function ensureDefaultPermissionsCatalog(): Promise<void> {
  for (const p of DEFAULT_PERMISSIONS) {
    await prisma.permission
      .upsert({
        where: { code: p.code },
        update: { name: p.name, description: p.description },
        create: { code: p.code, name: p.name, description: p.description },
      })
      .catch(() => {});
  }
}

/** Đồng bộ từ quyền legacy MANAGE_MARKETING_CATALOG (seed cũ) sang bộ R/C/U/D chiến dịch trước khi xóa orphan. */
/** Đồng bộ từ quyền gộp MANAGE_MARKETING_PLATFORMS sang CREATE/UPDATE/DELETE/VIEW rồi gỡ legacy (cleanup orphan xóa mã cũ). */
async function migrateMarketingPlatformPermissionsFromManage(): Promise<void> {
  try {
    const legacy = await prisma.permission.findUnique({
      where: { code: 'MANAGE_MARKETING_PLATFORMS' },
      select: { id: true },
    });
    if (!legacy) return;

    const newCodes = [
      'CREATE_MARKETING_PLATFORM',
      'UPDATE_MARKETING_PLATFORM',
      'DELETE_MARKETING_PLATFORM',
      'VIEW_MARKETING_PLATFORMS',
    ];
    const perms = await prisma.permission.findMany({
      where: { code: { in: newCodes } },
      select: { id: true, code: true },
    });
    if (perms.length === 0) return;

    const groups = await prisma.roleGroup.findMany({
      where: { permissions: { some: { code: 'MANAGE_MARKETING_PLATFORMS' } } },
      include: { permissions: { select: { code: true } } },
    });

    for (const g of groups) {
      const has = new Set((g.permissions || []).map((p) => p.code));
      const toConnect = perms.filter((p) => p.code && !has.has(p.code)).map((p) => ({ id: p.id }));
      if (toConnect.length > 0) {
        await prisma.roleGroup.update({
          where: { id: g.id },
          data: { permissions: { connect: toConnect } },
        });
      }
      await prisma.roleGroup.update({
        where: { id: g.id },
        data: { permissions: { disconnect: { id: legacy.id } } },
      });
    }
  } catch (e) {
    console.error('migrateMarketingPlatformPermissionsFromManage error:', e);
  }
}

async function migrateMarketingCampaignPermissionsFromLegacyCatalog(): Promise<void> {
  try {
    const legacy = await prisma.permission.findUnique({
      where: { code: 'MANAGE_MARKETING_CATALOG' },
      select: { id: true },
    });
    if (!legacy) return;

    const codes = [
      'VIEW_MARKETING_CAMPAIGNS',
      'CREATE_MARKETING_CAMPAIGN',
      'UPDATE_MARKETING_CAMPAIGN',
      'DELETE_MARKETING_CAMPAIGN',
    ];
    const perms = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    if (perms.length === 0) return;

    const groups = await prisma.roleGroup.findMany({
      where: { permissions: { some: { code: 'MANAGE_MARKETING_CATALOG' } } },
      include: { permissions: { select: { code: true } } },
    });

    for (const g of groups) {
      const has = new Set((g.permissions || []).map((p) => p.code));
      const toConnect = perms.filter((p) => p.code && !has.has(p.code)).map((p) => ({ id: p.id }));
      if (toConnect.length === 0) continue;
      await prisma.roleGroup.update({
        where: { id: g.id },
        data: { permissions: { connect: toConnect } },
      });
    }
  } catch (e) {
    console.error('migrateMarketingCampaignPermissionsFromLegacyCatalog error:', e);
  }
}

/** Gán VIEW_MARKETING_CAMPAIGNS cho mọi nhóm đã có MANAGE_CUSTOMERS (dropdown chiến dịch / đọc danh sách). */
async function ensureViewMarketingCampaignsForManageCustomersRoles(): Promise<void> {
  try {
    const viewPerm = await prisma.permission.findUnique({
      where: { code: 'VIEW_MARKETING_CAMPAIGNS' },
      select: { id: true },
    });
    if (!viewPerm) return;

    const groups = await prisma.roleGroup.findMany({
      where: { permissions: { some: { code: 'MANAGE_CUSTOMERS' } } },
      include: { permissions: { select: { code: true } } },
    });

    for (const g of groups) {
      const has = new Set((g.permissions || []).map((p) => p.code));
      if (has.has('VIEW_MARKETING_CAMPAIGNS')) continue;
      await prisma.roleGroup.update({
        where: { id: g.id },
        data: { permissions: { connect: { id: viewPerm.id } } },
      });
    }
  } catch (e) {
    console.error('ensureViewMarketingCampaignsForManageCustomersRoles error:', e);
  }
}

/** Nhóm có MANAGE_CUSTOMERS + ít nhất một quyền ghi nền tảng (tạo/sửa/xóa) nhận thêm CREATE/UPDATE chiến dịch nếu chưa có. */
async function ensureCampaignWritePermissionsForMarketingRoles(): Promise<void> {
  try {
    const codes = ['CREATE_MARKETING_CAMPAIGN', 'UPDATE_MARKETING_CAMPAIGN'];
    const perms = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    if (perms.length === 0) return;

    const platformWriteCodes = [
      'CREATE_MARKETING_PLATFORM',
      'UPDATE_MARKETING_PLATFORM',
      'DELETE_MARKETING_PLATFORM',
    ];
    const groups = await prisma.roleGroup.findMany({
      where: {
        AND: [
          { permissions: { some: { code: 'MANAGE_CUSTOMERS' } } },
          {
            permissions: {
              some: { code: { in: platformWriteCodes } },
            },
          },
        ],
      },
      include: { permissions: { select: { code: true } } },
    });

    for (const g of groups) {
      const has = new Set((g.permissions || []).map((p) => p.code));
      const toConnect = perms.filter((p) => p.code && !has.has(p.code)).map((p) => ({ id: p.id }));
      if (toConnect.length === 0) continue;
      await prisma.roleGroup.update({
        where: { id: g.id },
        data: { permissions: { connect: toConnect } },
      });
    }
  } catch (e) {
    console.error('ensureCampaignWritePermissionsForMarketingRoles error:', e);
  }
}

const VALID_PERMISSION_CODES = new Set(DEFAULT_PERMISSIONS.map((p) => p.code));

async function cleanupOrphanPermissions(): Promise<void> {
  try {
    const allPerms = await prisma.permission.findMany({ select: { id: true, code: true } });
    const orphans = allPerms.filter((p) => !VALID_PERMISSION_CODES.has(p.code));
    if (orphans.length === 0) return;

    const orphanIds = orphans.map((p) => p.id);

    const linkedGroups = await prisma.roleGroup.findMany({
      where: { permissions: { some: { id: { in: orphanIds } } } },
      select: { id: true, permissions: { select: { id: true } } },
    });
    for (const rg of linkedGroups) {
      const toDisconnect = rg.permissions.filter((p) => orphanIds.includes(p.id));
      if (toDisconnect.length > 0) {
        await prisma.roleGroup.update({
          where: { id: rg.id },
          data: { permissions: { disconnect: toDisconnect.map((p) => ({ id: p.id })) } },
        });
      }
    }

    await prisma.permission.deleteMany({ where: { id: { in: orphanIds } } });
    console.log(`Cleaned up ${orphans.length} orphan permission(s): ${orphans.map((p) => p.code).join(', ')}`);
  } catch (e) {
    console.error('cleanupOrphanPermissions error:', e);
  }
}

/**
 * Gắn CONFIG_ORG_STRUCTURE + CONFIG_DATA_FLOW cho nhóm quản trị hệ thống (đồng bộ catalog).
 * Các nhóm khác (kể cả crm_administrator) chỉ nhận quyền qua UI Nhóm quyền.
 */
async function ensureTechnicalAdminsHaveOrgAndFlowPermissions(): Promise<void> {
  const codes = ['CONFIG_ORG_STRUCTURE', 'CONFIG_DATA_FLOW'];
  const perms = await prisma.permission.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  if (perms.length === 0) return;

  const groups = await prisma.roleGroup.findMany({
    where: {
      OR: [{ code: ROLE_CODES.SYSTEM_ADMINISTRATOR }, { code: 'ADM' }],
    },
    include: { permissions: { select: { code: true } } },
  });

  for (const g of groups) {
    const has = new Set((g.permissions || []).map((p) => p.code));
    const toConnect = perms.filter((p) => p.code && !has.has(p.code)).map((p) => ({ id: p.id }));
    if (toConnect.length === 0) continue;
    await prisma.roleGroup.update({
      where: { id: g.id },
      data: { permissions: { connect: toConnect } },
    });
  }
}

async function ensureAdminMenusAndPermissions(adminRoleGroupId: string): Promise<void> {
  try {
    const roleGroup = await prisma.roleGroup.findUnique({
      where: { id: adminRoleGroupId },
      include: { menus: { select: { id: true } }, permissions: { select: { id: true } } }
    });

    if (roleGroup && roleGroup.menus.length > 0 && roleGroup.permissions.length > 0) {
      return;
    }

    let allMenus = await prisma.menu.findMany({ select: { id: true } });
    if (allMenus.length === 0) {
      for (const m of DEFAULT_MENUS) {
        await prisma.menu
          .create({
            data: m,
          })
          .catch(() => {});
      }
      allMenus = await prisma.menu.findMany({ select: { id: true } });
    }

    let allPermissions = await prisma.permission.findMany({ select: { id: true } });
    if (allPermissions.length === 0) {
      for (const p of DEFAULT_PERMISSIONS) {
        await prisma.permission.upsert({
          where: { code: p.code },
          update: { name: p.name, description: p.description },
          create: { code: p.code, name: p.name, description: p.description },
        }).catch(() => {});
      }
      allPermissions = await prisma.permission.findMany({ select: { id: true } });
    }

    if (allMenus.length > 0 || allPermissions.length > 0) {
      await prisma.roleGroup.update({
        where: { id: adminRoleGroupId },
        data: {
          menus: { connect: allMenus.map(m => ({ id: m.id })) },
          permissions: { connect: allPermissions.map(p => ({ id: p.id })) }
        }
      });
    }
  } catch (e) {
    console.error('ensureAdminMenusAndPermissions error:', e);
  }
}

async function ensureSuperAdminExists() {
  let employee = await prisma.employee.findFirst({
    where: { phone: SUPER_ADMIN_PHONE },
    select: {
      id: true,
      fullName: true,
      code: true,
      phone: true,
      roleGroupId: true,
      passwordHash: true,
      roleGroup: { select: { code: true } },
    },
  });
  if (employee) {
    if (employee.roleGroupId && isTechnicalAdminRoleCode(employee.roleGroup?.code)) {
      await ensureAdminMenusAndPermissions(employee.roleGroupId);
    }
    return employee as any;
  }

  const adminRoleGroup = await prisma.roleGroup.upsert({
    where: { code: ROLE_CODES.SYSTEM_ADMINISTRATOR },
    update: { name: 'Quản trị hệ thống' },
    create: { code: ROLE_CODES.SYSTEM_ADMINISTRATOR, name: 'Quản trị hệ thống' },
  });

  await ensureAdminMenusAndPermissions(adminRoleGroup.id);

  const statusWorking = await prisma.employeeStatus.upsert({
    where: { code: 'WORKING' },
    update: {},
    create: { code: 'WORKING', name: 'Working' }
  });
  const employmentTypeOfficial = await prisma.employmentType.upsert({
    where: { code: 'official' },
    update: { name: 'Hợp đồng chính thức' },
    create: { code: 'official', name: 'Hợp đồng chính thức' },
  });
  await ensureOrgRootCompany();
  const orgId = await getDefaultOrganizationId();
  if (!orgId) {
    throw new Error('NO_ORGANIZATION');
  }
  const companyRoot = await getCompanyRootForOrg(orgId);

  let department = await prisma.department.findFirst({
    where: { organizationId: orgId, type: { in: ['DEPARTMENT', 'TEAM'] } },
  });
  if (!department) {
    let division = await prisma.department.findFirst({
      where: { organizationId: orgId, code: 'K01', type: 'DIVISION' },
    });
    if (!division) {
      division = await prisma.department.create({
        data: {
          organizationId: orgId,
          code: 'K01',
          name: 'HEADQUARTERS',
          type: 'DIVISION',
          parentId: companyRoot.id,
          displayOrder: 900,
        },
      });
    }
    department = await prisma.department.create({
      data: {
        organizationId: orgId,
        code: 'P001',
        name: 'System Administration',
        parentId: division.id,
        type: 'DEPARTMENT',
      },
    });
  }
  let position = await prisma.position.findFirst();
  if (!position) {
    position = await prisma.position.create({
      data: { code: 'SA', name: 'System Admin', departmentId: department.id }
    });
  }

  let defaultHrUnit = await prisma.hrDepartmentUnit.findFirst({ where: { code: 'CHUNG' } });
  if (!defaultHrUnit) {
    defaultHrUnit = await prisma.hrDepartmentUnit.create({
      data: { code: 'CHUNG', name: 'Chung', sortOrder: 0 },
    });
  }

  const hash = await bcrypt.hash(SUPER_ADMIN_DEFAULT_PASSWORD, 10);
  const created = await prisma.employee.create({
    data: {
      code: 'SUPERADMIN',
      fullName: 'System Administrator',
      gender: 'Khác',
      phone: SUPER_ADMIN_PHONE,
      roleGroupId: adminRoleGroup.id,
      dateOfBirth: new Date('1990-01-01'),
      emailPersonal: 'superadmin@example.com',
      statusId: statusWorking.id,
      employmentTypeId: employmentTypeOfficial.id,
      departmentId: department.id,
      positionId: position.id,
      hrDepartmentUnitId: defaultHrUnit.id,
      passwordHash: hash
    }
  });

  try {
    await ensureCompanyChatGroupForEmployee(created.id);
  } catch (_) {}
  return created as any;
}

export const validatePhone = async (req: Request, res: Response) => {
  const { phone: rawPhone } = req.body as { phone?: any };
  const rawPhoneStr = String(rawPhone ?? '').trim();
  const digits = rawPhoneStr.replace(/\D/g, '');
  const phone = digits.length === 9 ? `0${digits}` : digits;

  try {
    if (!phone) {
      return res.status(400).json({ message: 'Vui lòng nhập số điện thoại' });
    }

    let employee = await prisma.employee.findFirst({ where: { phone } });
    if (!employee && phone === SUPER_ADMIN_PHONE) {
      employee = await ensureSuperAdminExists();
    }
    if (!employee) {
      return res.status(404).json({ message: 'Số điện thoại chưa được đăng ký' });
    }

    res.json({ success: true, message: 'Số điện thoại hợp lệ' });
  } catch (error) {
    console.error('Validate phone error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { phone: rawPhone, password } = req.body as { phone?: any; password?: string };
  const rawPhoneStr = String(rawPhone ?? '').trim();
  const digits = rawPhoneStr.replace(/\D/g, '');
  const phone = digits.length === 9 ? `0${digits}` : digits;

  try {
    if (!phone) {
      return res.status(400).json({ message: 'Vui lòng nhập số điện thoại' });
    }

    // Self-healing: tự tạo Super Admin nếu chưa tồn tại
    if (phone === SUPER_ADMIN_PHONE) {
      await ensureSuperAdminExists();
    }

    // Dùng select (không include) để tránh lỗi khi DB chưa có cột is_locked, session_invalidated_at (migration chưa chạy)
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
    if (!employee) {
      return res.status(401).json({ message: 'Số điện thoại chưa được đăng ký' });
    }

    const empWithLock = await prisma.employee.findUnique({
      where: { id: employee.id },
      select: { isLocked: true }
    }).catch(() => null);
    if (empWithLock?.isLocked) {
      return res.status(403).json({ message: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ Quản trị viên.' });
    }

    // Self-healing cho Super Admin: gán role ADM + set password mặc định nếu thiếu
    if (phone === SUPER_ADMIN_PHONE && isSystemAdminEmployee(employee)) {
      const needsUpdate: any = {};
      if (!employee.roleGroupId) {
        const admRole = await prisma.roleGroup.findUnique({
          where: { code: ROLE_CODES.SYSTEM_ADMINISTRATOR },
        });
        if (admRole) needsUpdate.roleGroupId = admRole.id;
      }
      if (!employee.passwordHash) {
        needsUpdate.passwordHash = await bcrypt.hash(SUPER_ADMIN_DEFAULT_PASSWORD, 10);
      }
      if (Object.keys(needsUpdate).length > 0) {
        await prisma.employee.update({ where: { id: employee.id }, data: needsUpdate });
        if (needsUpdate.passwordHash) employee.passwordHash = needsUpdate.passwordHash;
      }
    }

    const loginRg = employee.roleGroup;
    if (
      loginRg &&
      isTechnicalAdminRoleCode(loginRg.code) &&
      (!loginRg.menus?.length || !loginRg.permissions?.length)
    ) {
      await ensureAdminMenusAndPermissions(loginRg.id);
      const reloaded = await prisma.roleGroup.findUnique({
        where: { id: loginRg.id },
        include: { menus: { orderBy: { order: 'asc' } }, permissions: true }
      });
      if (reloaded) {
        (employee as any).roleGroup = reloaded;
      }
    }

    if (!password || !employee.passwordHash) {
      return res.status(401).json({ message: 'Tài khoản chưa được thiết lập mật khẩu, vui lòng liên hệ HR/IT' });
    }

    const isValid = await bcrypt.compare(password, employee.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: 'Mật khẩu không chính xác' });
    }

    await prisma.employee
      .update({
        where: { id: employee.id },
        data: { sessionInvalidatedAt: null, lastLoginAt: new Date() }
      })
      .catch(() =>
        prisma.employee.update({
          where: { id: employee.id },
          data: { lastLoginAt: new Date() }
        }).catch(() => {})
      );

    // Đồng bộ nhóm chat công ty khi đăng nhập để tự vá dữ liệu cũ thiếu membership/owner.
    try {
      await syncCompanyChatGroupMembers();
    } catch (e) {
      console.error('syncCompanyChatGroupMembers on login error:', e);
    }

    const role = employee.roleGroup?.name || 'Staff';

    const token = generateToken({
      id: employee.id,
      role: role,
      name: employee.fullName,
      phone: employee.phone
    });

    setTokenCookie(res, token);

    logAction(employee.id, employee.fullName, 'LOGIN', 'System', 'Đăng nhập vào hệ thống', undefined, employee.phone || undefined);

    res.json({
      success: true,
      token,
      user: {
        id: employee.id,
        name: employee.fullName,
        phone: employee.phone,
        role: role,
        avatar: employee.avatarUrl,
        menus: employee.roleGroup?.menus || [],
        permissions: (employee.roleGroup?.permissions ?? []).map((p) => p.code),
        roleGroup: employee.roleGroup ? { id: employee.roleGroup.id, code: employee.roleGroup.code, name: employee.roleGroup.name } : null
      }
    });
  } catch (error: any) {
    console.error('Login error:', error?.message ?? error);
    if (error?.stack) console.error(error.stack);
    res.status(500).json({
      message: 'Đã xảy ra lỗi hệ thống khi đăng nhập. Vui lòng thử lại sau hoặc liên hệ quản trị viên.',
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  const token = req.cookies.jwt;
  if (token) {
    try {
      const decoded: any = verifyToken(token);
      if (decoded && decoded.id) {
        const employee = await prisma.employee.findUnique({ where: { id: decoded.id } });
        if (employee) {
          logAction(employee.id, employee.fullName, 'LOGOUT', 'System', 'Đăng xuất khỏi hệ thống', undefined, employee.phone || undefined);
        }
      }
    } catch (e) {
    }
  }

  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  res.json({ message: 'Logged out successfully' });
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        roleGroup: {
          include: {
            menus: { orderBy: { order: 'asc' } },
            permissions: true
          }
        }
      }
    });

    if (!employee) {
      return res.status(401).json({ message: 'Không tìm thấy tài khoản.' });
    }

    const meRg = employee.roleGroup;
    if (
      meRg &&
      isTechnicalAdminRoleCode(meRg.code) &&
      (!meRg.menus?.length || !meRg.permissions?.length)
    ) {
      await ensureAdminMenusAndPermissions(meRg.id);
      const reloaded = await prisma.roleGroup.findUnique({
        where: { id: meRg.id },
        include: { menus: { orderBy: { order: 'asc' } }, permissions: true }
      });
      if (reloaded) {
        (employee as any).roleGroup = reloaded;
      }
    }

    const role = employee.roleGroup?.name || 'Staff';

    res.json({
      success: true,
      user: {
        id: employee.id,
        name: employee.fullName,
        phone: employee.phone,
        role: role,
        avatar: employee.avatarUrl,
        menus: employee.roleGroup?.menus || [],
        permissions: (employee.roleGroup?.permissions || []).map((p: { code: string }) => p.code),
        roleGroup: employee.roleGroup ? {
          id: employee.roleGroup.id,
          code: employee.roleGroup.code,
          name: employee.roleGroup.name
        } : null
      }
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ message: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.' });
  }
};

export const setTempPassword = async (req: Request, res: Response) => {
  try {
    const body = req.body as { employeeId?: string; tempPassword?: string };
    const employeeId = body?.employeeId != null ? String(body.employeeId).trim() : '';
    const tempPassword = typeof body?.tempPassword === 'string' ? body.tempPassword.trim() : '';
    const currentUser = (req as any).user;

    if (!employeeId || !tempPassword) {
      return res.status(400).json({ success: false, message: 'Thiếu employeeId hoặc mật khẩu tạm.' });
    }

    if (tempPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu tạm phải có ít nhất 6 ký tự.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự.' });
    }

    const hash = await bcrypt.hash(tempPassword, 10);

    // Chỉ cập nhật password_hash bằng raw query để tránh lỗi khi DB chưa có cột is_locked/session_invalidated_at (migration chưa chạy)
    await prisma.$executeRaw`
      UPDATE employees SET password_hash = ${hash} WHERE id = ${employee.id}
    `;

    invalidateAuthCache(employee.id);

    try {
      if (currentUser?.id) {
        logAction(
          currentUser.id,
          currentUser.name || currentUser.fullName || 'Unknown',
          'SET_TEMP_PASSWORD',
          'Employee',
          'Thiết lập mật khẩu tạm cho nhân sự',
          employee.id,
          currentUser.phone
        );
      }
    } catch (logErr) {
      console.error('SetTempPassword logAction error:', logErr);
    }

    return res.json({ success: true, message: 'Đã thiết lập mật khẩu tạm cho nhân sự.' });
  } catch (error: any) {
    console.error('SetTempPassword error:', error);
    const msg = error?.message && typeof error.message === 'string' && error.message.length < 200
      ? error.message
      : 'Lỗi máy chủ khi đặt mật khẩu tạm. Vui lòng thử lại.';
    return res.status(500).json({ success: false, message: msg });
  }
};

/** Phát hành JWT ngắn hạn để tab mới gọi consume và đăng nhập thay nhân sự (quyền MANAGE_HR / ADM). */
export const issueStaffCheckToken = async (req: Request, res: Response) => {
  try {
    const body = req.body as { employeeId?: string };
    const employeeId = body?.employeeId != null ? String(body.employeeId).trim() : '';
    const currentUser = (req as any).user;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Thiếu employeeId.' });
    }
    if (!currentUser?.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (employeeId === currentUser.id) {
      return res.status(400).json({ success: false, message: 'Không thể kiểm tra tài khoản của chính bạn.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự.' });
    }

    const token = generateStaffCheckToken({
      targetEmployeeId: employeeId,
      issuedByEmployeeId: String(currentUser.id),
    });

    return res.json({ success: true, token });
  } catch (error: any) {
    console.error('issueStaffCheckToken error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo phiên kiểm tra.' });
  }
};

/** Đổi cookie phiên sang nhân sự mục tiêu (body: token từ issueStaffCheckToken). Không cần đăng nhập trước. */
export const consumeStaffCheckToken = async (req: Request, res: Response) => {
  let markedJti: string | null = null;
  try {
    const body = req.body as { token?: string };
    const raw = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!raw) {
      return res.status(400).json({ success: false, message: 'Thiếu token kiểm tra.' });
    }

    let payload: ReturnType<typeof verifyStaffCheckToken>;
    try {
      payload = verifyStaffCheckToken(raw);
    } catch {
      return res.status(401).json({ success: false, message: 'Liên kết kiểm tra không hợp lệ hoặc đã hết hạn.' });
    }

    if (!tryMarkStaffCheckJtiConsumedOnce(payload.jti, payload.exp)) {
      return res.status(401).json({
        success: false,
        message: 'Liên kết kiểm tra đã được sử dụng. Hãy tạo liên kết mới từ Hệ thống → Tài khoản nhân sự.',
      });
    }
    markedJti = payload.jti;

    const employee = await prisma.employee.findUnique({
      where: { id: payload.targetEmployeeId },
      select: {
        id: true,
        fullName: true,
        code: true,
        phone: true,
        avatarUrl: true,
        roleGroupId: true,
        roleGroup: {
          include: {
            menus: { orderBy: { order: 'asc' } },
            permissions: true,
          },
        },
        status: true,
      },
    });

    if (!employee) {
      unmarkStaffCheckJti(payload.jti);
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự.' });
    }

    const empWithLock = await prisma.employee
      .findUnique({
        where: { id: employee.id },
        select: { isLocked: true },
      })
      .catch(() => null);
    if (empWithLock?.isLocked) {
      unmarkStaffCheckJti(payload.jti);
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị tạm khóa.' });
    }

    if (!employee.status?.isActive) {
      unmarkStaffCheckJti(payload.jti);
      return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    }

    const loginRg = employee.roleGroup;
    if (
      loginRg &&
      isTechnicalAdminRoleCode(loginRg.code) &&
      (!loginRg.menus?.length || !loginRg.permissions?.length)
    ) {
      await ensureAdminMenusAndPermissions(loginRg.id);
      const reloaded = await prisma.roleGroup.findUnique({
        where: { id: loginRg.id },
        include: { menus: { orderBy: { order: 'asc' } }, permissions: true },
      });
      if (reloaded) {
        (employee as any).roleGroup = reloaded;
      }
    }

    await prisma.employee
      .update({
        where: { id: employee.id },
        data: { sessionInvalidatedAt: null, lastLoginAt: new Date() },
      })
      .catch(() =>
        prisma.employee
          .update({
            where: { id: employee.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => {})
      );

    try {
      await syncCompanyChatGroupMembers();
    } catch (e) {
      console.error('syncCompanyChatGroupMembers on staff check login error:', e);
    }

    const role = employee.roleGroup?.name || 'Staff';

    const sessionToken = generateToken({
      id: employee.id,
      role,
      name: employee.fullName,
      phone: employee.phone,
    });

    /** Không set cookie: cookie dùng chung mọi tab — tránh tab quản trị bị đổi phiên; FE lưu JWT vào sessionStorage cửa sổ kiểm tra. */
    try {
      const issuer = await prisma.employee.findUnique({
        where: { id: payload.issuedByEmployeeId },
        select: { fullName: true, phone: true },
      });
      logAction(
        payload.issuedByEmployeeId,
        issuer?.fullName || 'Admin',
        'STAFF_CHECK_LOGIN',
        'Employee',
        `Mở phiên kiểm tra tài khoản: ${employee.fullName} (${employee.code || employee.id})`,
        employee.id,
        issuer?.phone || undefined
      );
    } catch (logErr) {
      console.error('consumeStaffCheckToken log issuer error:', logErr);
    }

    logAction(
      employee.id,
      employee.fullName,
      'LOGIN',
      'System',
      'Đăng nhập qua kiểm tra tài khoản (admin)',
      undefined,
      employee.phone || undefined
    );

    invalidateAuthCache(employee.id);

    return res.json({
      success: true,
      token: sessionToken,
      user: {
        id: employee.id,
        name: employee.fullName,
        phone: employee.phone,
        role,
        avatar: employee.avatarUrl,
        menus: employee.roleGroup?.menus || [],
        permissions: (employee.roleGroup?.permissions ?? []).map((p) => p.code),
        roleGroup: employee.roleGroup
          ? {
              id: employee.roleGroup.id,
              code: employee.roleGroup.code,
              name: employee.roleGroup.name,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('consumeStaffCheckToken error:', error);
    if (markedJti) unmarkStaffCheckJti(markedJti);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập kiểm tra.' });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    const currentUser = (req as any).user;

    if (!currentUser || !currentUser.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: currentUser.id },
      select: { id: true, passwordHash: true }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự.' });
    }

    if (!employee.passwordHash) {
      return res.status(400).json({ success: false, message: 'Tài khoản chưa có mật khẩu, vui lòng liên hệ HR/IT.' });
    }

    const isValid = await bcrypt.compare(currentPassword, employee.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không chính xác.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    // Chỉ cập nhật password_hash bằng raw query để tránh lỗi khi DB chưa có cột is_locked (migration chưa chạy)
    await prisma.$executeRaw`
      UPDATE employees SET password_hash = ${hash} WHERE id = ${employee.id}
    `;

    invalidateAuthCache(employee.id);

    try {
      if (currentUser?.id) {
        logAction(
          currentUser.id,
          currentUser.name || currentUser.fullName || 'Unknown',
          'CHANGE_PASSWORD',
          'Employee',
          'Người dùng đổi mật khẩu',
          employee.id,
          currentUser.phone
        );
      }
    } catch (logErr) {
      console.error('ChangePassword logAction error:', logErr);
    }

    return res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
  } catch (error: any) {
    console.error('ChangePassword error:', error);
    const msg = error?.message && typeof error.message === 'string' && error.message.length < 200
      ? error.message
      : 'Lỗi máy chủ khi đổi mật khẩu. Vui lòng thử lại.';
    return res.status(500).json({ success: false, message: msg });
  }
};

/** Đăng xuất tài khoản nhân sự (vô hiệu hóa phiên) - chỉ ADM hoặc quyền STAFF_LOGOUT */
export const logoutEmployee = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.body as { employeeId?: string };
    const currentUser = (req as any).user;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Thiếu employeeId.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: String(employeeId) },
      select: { id: true, fullName: true, phone: true }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự.' });
    }

    if (employee.id === currentUser?.id) {
      return res.status(400).json({ success: false, message: 'Không thể đăng xuất chính tài khoản của bạn từ đây. Dùng Đăng xuất trên giao diện.' });
    }

    try {
      await prisma.$executeRaw`
        UPDATE employees SET session_invalidated_at = NOW() WHERE id = ${employee.id}
      `;
    } catch (dbErr: any) {
      const missingColumn = dbErr?.message?.includes('session_invalidated_at') || dbErr?.message?.includes('does not exist');
      if (missingColumn) {
        try {
          await ensureEmployeeLockColumns();
          await prisma.$executeRaw`
            UPDATE employees SET session_invalidated_at = NOW() WHERE id = ${employee.id}
          `;
        } catch (retryErr: any) {
          console.error('LogoutEmployee ensureColumns or retry error:', retryErr);
          return res.status(503).json({ success: false, message: 'Máy chủ chưa hỗ trợ tính năng đăng xuất tài khoản. Vui lòng chạy migration database.' });
        }
      } else {
        throw dbErr;
      }
    }
    invalidateAuthCache(employee.id);

    try {
      if (currentUser?.id) {
        logAction(
          currentUser.id,
          currentUser.name || currentUser.fullName || 'Unknown',
          'STAFF_LOGOUT',
          'Employee',
          `Đăng xuất tài khoản nhân sự: ${employee.fullName}`,
          employee.id,
          currentUser.phone
        );
      }
    } catch (logErr) {
      console.error('LogoutEmployee logAction error:', logErr);
    }

    return res.json({ success: true, message: `Đã đăng xuất tài khoản ${employee.fullName}.` });
  } catch (error: any) {
    console.error('LogoutEmployee error:', error);
    const msg = error?.message && typeof error.message === 'string' && error.message.length < 200
      ? error.message
      : 'Lỗi máy chủ. Vui lòng thử lại.';
    return res.status(500).json({ success: false, message: msg });
  }
};

/** Tạm khóa / Mở khóa tài khoản nhân sự - chỉ ADM hoặc quyền STAFF_LOCK */
export const lockEmployee = async (req: Request, res: Response) => {
  try {
    const { employeeId, lock } = req.body as { employeeId?: string; lock?: boolean };
    const currentUser = (req as any).user;

    if (!employeeId || typeof lock !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Thiếu employeeId hoặc tham số lock (true/false).' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: String(employeeId) },
      select: { id: true, fullName: true, phone: true }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự.' });
    }

    if (employee.id === currentUser?.id) {
      return res.status(400).json({ success: false, message: 'Không thể khóa chính tài khoản của bạn.' });
    }

    try {
      if (lock) {
        await prisma.$executeRaw`
          UPDATE employees SET is_locked = true, session_invalidated_at = NOW() WHERE id = ${employee.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE employees SET is_locked = false, session_invalidated_at = NULL WHERE id = ${employee.id}
        `;
      }
    } catch (dbErr: any) {
      const missingColumn = dbErr?.message?.includes('is_locked') || dbErr?.message?.includes('session_invalidated_at') || dbErr?.message?.includes('does not exist');
      if (missingColumn) {
        try {
          await ensureEmployeeLockColumns();
          if (lock) {
            await prisma.$executeRaw`
              UPDATE employees SET is_locked = true, session_invalidated_at = NOW() WHERE id = ${employee.id}
            `;
          } else {
            await prisma.$executeRaw`
              UPDATE employees SET is_locked = false, session_invalidated_at = NULL WHERE id = ${employee.id}
            `;
          }
        } catch (retryErr: any) {
          console.error('LockEmployee ensureColumns or retry error:', retryErr);
          return res.status(503).json({ success: false, message: 'Máy chủ chưa hỗ trợ tạm khóa tài khoản. Vui lòng chạy migration database (thêm cột is_locked, session_invalidated_at).' });
        }
      } else {
        throw dbErr;
      }
    }
    if (lock) invalidateAuthCache(employee.id);

    try {
      if (currentUser?.id) {
        const action = lock ? 'STAFF_LOCK' : 'STAFF_UNLOCK';
        logAction(
          currentUser.id,
          currentUser.name || currentUser.fullName || 'Unknown',
          action,
          'Employee',
          lock ? `Tạm khóa tài khoản: ${employee.fullName}` : `Mở khóa tài khoản: ${employee.fullName}`,
          employee.id,
          currentUser.phone
        );
      }
    } catch (logErr) {
      console.error('LockEmployee logAction error:', logErr);
    }

    return res.json({
      success: true,
      message: lock ? `Đã tạm khóa tài khoản ${employee.fullName}.` : `Đã mở khóa tài khoản ${employee.fullName}.`,
      isLocked: lock
    });
  } catch (error: any) {
    console.error('LockEmployee error:', error);
    const msg = error?.message && typeof error.message === 'string' && error.message.length < 200
      ? error.message
      : 'Lỗi máy chủ. Vui lòng thử lại.';
    return res.status(500).json({ success: false, message: msg });
  }
};
