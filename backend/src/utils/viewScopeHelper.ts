import { prisma } from '../config/database';
import { isTechnicalAdminRoleCode, userHasCatalogPermission } from '../constants/rbac';

export type ViewContext = 'HR' | 'CUSTOMER' | 'ORDER';
export type ViewScope = 'SELF_RECURSIVE' | 'DEPARTMENT' | 'DIVISION' | 'COMPANY';

interface CurrentUser {
  id: string;
  roleGroupId: string | null;
  /** Có thể null nếu nhân viên chưa được gán đơn vị vận hành. */
  departmentId: string | null;
  permissions?: string[];
  /** Mã nhóm quyền (JWT) — dùng để ADM / quản trị kỹ thuật xem toàn bộ. */
  roleGroupCode?: string | null;
}

export async function getConfiguredScope(roleGroupId: string | null, context: ViewContext): Promise<ViewScope> {
  if (!roleGroupId) return 'SELF_RECURSIVE';
  const vs = await prisma.roleGroupViewScope.findUnique({
    where: { roleGroupId_context: { roleGroupId, context } },
    select: { scope: true },
  });
  return (vs?.scope as ViewScope) || 'SELF_RECURSIVE';
}

/**
 * Tìm quản lý trực tiếp của employee bằng đệ quy phòng ban (KHÔNG dùng employee.managerId).
 * Đi từ phòng ban hiện tại → phòng ban cha → division cho đến khi tìm được manager.
 */
export async function getDirectManager(employeeId: string): Promise<string | null> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { departmentId: true },
  });
  if (!employee?.departmentId) return null;
  return walkUpHierarchy(employee.departmentId, employeeId);
}

async function walkUpHierarchy(departmentId: string, excludeEmployeeId?: string): Promise<string | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { managerId: true, parentId: true },
  });
  if (!dept) return null;

  if (dept.managerId && dept.managerId !== excludeEmployeeId) {
    return dept.managerId;
  }

  if (dept.parentId) {
    return walkUpHierarchy(dept.parentId, excludeEmployeeId);
  }

  return null;
}

async function collectSubDepartments(deptId: string, collected: Set<string>): Promise<void> {
  collected.add(deptId);
  const children = await prisma.department.findMany({
    where: { parentId: deptId },
    select: { id: true },
  });
  for (const child of children) {
    await collectSubDepartments(child.id, collected);
  }
}

/**
 * Lấy danh sách ID nhân viên cấp dưới bằng đệ quy phòng ban.
 * Tìm tất cả phòng ban/khối mà employee là manager, sau đó lấy mọi employee trong đó.
 */
export async function getSubordinateIds(employeeId: string): Promise<string[]> {
  const managedDepts = await prisma.department.findMany({
    where: { managerId: employeeId },
    select: { id: true },
  });

  const allDeptIds = new Set<string>();

  for (const dept of managedDepts) {
    await collectSubDepartments(dept.id, allDeptIds);
  }

  if (allDeptIds.size === 0) return [];

  const employees = await prisma.employee.findMany({
    where: { departmentId: { in: Array.from(allDeptIds) } },
    select: { id: true },
  });

  return employees.map(e => e.id).filter(id => id !== employeeId);
}

/** Phạm vi báo cáo hiệu quả Sales/CSKH: điều hành = toàn công ty; quản lý = cây đơn vị; không quản lý = cùng đơn vị lá. */
export type EffectivenessScopeMode = 'COMPANY' | 'MANAGER_TREE' | 'LEAF_UNIT';

export async function resolveEffectivenessReportScope(
  userId: string,
  roleGroupCode: string | null | undefined,
  permissions: string[] | undefined
): Promise<{
  allowedEmployeeIds: string[] | null;
  scopeMode: EffectivenessScopeMode;
  scopeDescriptionVi: string;
}> {
  const userLite = { roleGroupCode: roleGroupCode ?? null, permissions: permissions ?? [] };

  if (permissions?.includes('FULL_ACCESS')) {
    return {
      allowedEmployeeIds: null,
      scopeMode: 'COMPANY',
      scopeDescriptionVi: 'Toàn công ty (FULL_ACCESS)',
    };
  }

  if (roleGroupCode && isTechnicalAdminRoleCode(roleGroupCode)) {
    return {
      allowedEmployeeIds: null,
      scopeMode: 'COMPANY',
      scopeDescriptionVi: 'Toàn công ty (quản trị hệ thống)',
    };
  }

  if (userHasCatalogPermission(userLite, ['VIEW_PERFORMANCE', 'VIEW_REPORTS'])) {
    return {
      allowedEmployeeIds: null,
      scopeMode: 'COMPANY',
      scopeDescriptionVi: 'Toàn công ty (quyền xem báo cáo / hiệu suất điều hành)',
    };
  }

  const me = await prisma.employee.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  const deptId = me?.departmentId ?? null;

  const managedSubtree = await getSubordinateIds(userId);
  if (managedSubtree.length > 0) {
    const allowed = [...new Set([userId, ...managedSubtree])];
    return {
      allowedEmployeeIds: allowed,
      scopeMode: 'MANAGER_TREE',
      scopeDescriptionVi: 'Phạm vi nhân viên trong cây đơn vị do bạn quản lý',
    };
  }

  if (!deptId) {
    return {
      allowedEmployeeIds: [userId],
      scopeMode: 'LEAF_UNIT',
      scopeDescriptionVi: 'Chỉ bạn (chưa gán đơn vị vận hành; không có cấp dưới trong cây)',
    };
  }

  const peers = await prisma.employee.findMany({
    where: { departmentId: deptId },
    select: { id: true },
  });
  const dept = await prisma.department.findUnique({
    where: { id: deptId },
    select: { name: true },
  });
  return {
    allowedEmployeeIds: peers.map((p) => p.id),
    scopeMode: 'LEAF_UNIT',
    scopeDescriptionVi: `Xếp hạng trong cùng đơn vị lá: ${dept?.name || '—'}`,
  };
}

/**
 * Trả về danh sách employee IDs mà user được phép xem theo phạm vi đã cấu hình.
 * FULL_ACCESS -> null (không filter, xem tất cả)
 */
export async function getVisibleEmployeeIds(
  user: CurrentUser,
  context: ViewContext,
  options?: { includeSelf?: boolean }
): Promise<string[] | null> {
  const includeSelf = options?.includeSelf ?? true;

  if (user.permissions?.includes('FULL_ACCESS')) {
    return null;
  }

  if (user.roleGroupCode && isTechnicalAdminRoleCode(user.roleGroupCode)) {
    return null;
  }

  if (context === 'CUSTOMER' && user.permissions?.includes('VIEW_ALL_COMPANY_CUSTOMERS')) {
    return null;
  }

  if (context === 'ORDER' && user.permissions?.includes('VIEW_ALL_COMPANY_ORDERS')) {
    return null;
  }

  const scope = await getConfiguredScope(user.roleGroupId, context);

  if (scope === 'COMPANY') {
    return null;
  }

  if (scope === 'SELF_RECURSIVE' || context === 'ORDER') {
    const selfIds = includeSelf ? [user.id] : [];
    const subs = await getSubordinateIds(user.id);
    const ids = [...new Set([...selfIds, ...subs])];
    return ids.length > 0 ? ids : [user.id];
  }

  if (scope === 'DEPARTMENT') {
    // Không có đơn vị vận hành: không thể lọc theo departmentId (Prisma { null } có thể trả về 0 bản ghi / sai phạm vi).
    if (!user.departmentId) {
      return [user.id];
    }
    const employees = await prisma.employee.findMany({
      where: { departmentId: user.departmentId },
      select: { id: true },
    });
    const ids = employees.map((e) => e.id);
    return ids.length > 0 ? ids : [user.id];
  }

  if (scope === 'DIVISION') {
    let currentDeptId: string | null = user.departmentId;
    let divisionDeptId: string | null = null;
    while(currentDeptId) {
      const deptNode: any = await prisma.department.findUnique({
        where: { id: currentDeptId },
        select: { id: true, type: true, parentId: true }
      });
      if (!deptNode) break;
      if (deptNode.type === 'DIVISION') {
        divisionDeptId = deptNode.id;
        break;
      }
      currentDeptId = deptNode.parentId;
    }
    
    if (!divisionDeptId) return [user.id];
    
    const divDeptIds = new Set<string>();
    await collectSubDepartments(divisionDeptId, divDeptIds);
    
    const employees = await prisma.employee.findMany({
      where: { departmentId: { in: Array.from(divDeptIds) } },
      select: { id: true },
    });
    const divIds = employees.map((e) => e.id);
    return divIds.length > 0 ? divIds : [user.id];
  }

  return [user.id];
}

/**
 * Mô tả ngắn (tiếng Việt) phạm vi danh sách khách — đồng bộ logic với `getVisibleEmployeeIds` (CUSTOMER).
 * Dùng cho API `GET /customers` và UI module Sản phẩm.
 */
export async function describeCustomerListScopeVi(user: CurrentUser): Promise<string> {
  if (user.permissions?.includes('FULL_ACCESS')) {
    return 'Phạm vi: toàn bộ khách hàng (FULL_ACCESS).';
  }
  if (user.roleGroupCode && isTechnicalAdminRoleCode(user.roleGroupCode)) {
    return 'Phạm vi: toàn bộ khách hàng (quản trị hệ thống).';
  }
  if (user.permissions?.includes('VIEW_ALL_COMPANY_CUSTOMERS')) {
    return 'Phạm vi: toàn bộ khách hàng công ty (quyền VIEW_ALL_COMPANY_CUSTOMERS).';
  }

  const scope = await getConfiguredScope(user.roleGroupId ?? null, 'CUSTOMER');
  const base =
    'Danh sách gồm khách gắn NV/MKT/người tạo trong phạm vi và khách chưa phân — ';

  const byScope: Record<ViewScope, string> = {
    COMPANY: 'Phạm vi nhóm quyền: toàn công ty (COMPANY).',
    SELF_RECURSIVE:
      base + 'phạm vi nhóm quyền: bản thân & cấp dưới theo cây đơn vị (SELF_RECURSIVE).',
    DEPARTMENT: base + 'phạm vi nhóm quyền: cùng đơn vị vận hành (DEPARTMENT).',
    DIVISION: base + 'phạm vi nhóm quyền: trong khối của bạn (DIVISION).',
  };

  return byScope[scope] || 'Phạm vi: theo cấu hình nhóm quyền (Phạm vi xem khách).';
}

export async function buildEmployeeWhereByScope(
  user: CurrentUser,
  context: ViewContext,
  extraWhere?: object
): Promise<object> {
  const visibleIds = await getVisibleEmployeeIds(user, context);
  if (!visibleIds) {
    return extraWhere || {};
  }
  return {
    ...(extraWhere || {}),
    id: { in: visibleIds },
  };
}

export async function buildCustomerWhereByScope(
  user: CurrentUser,
  context: ViewContext,
  extraWhere?: object
): Promise<object> {
  const visibleIds = await getVisibleEmployeeIds(user, context);
  if (!visibleIds) {
    return extraWhere || {};
  }
  return {
    ...(extraWhere || {}),
    OR: [
      { employeeId: { in: visibleIds } },
      { marketingOwnerId: { in: visibleIds } },
      { createdById: { in: visibleIds } },
    ],
  };
}
