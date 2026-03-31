import { prisma } from '../config/database';
import { isTechnicalAdminRoleCode } from '../constants/rbac';
import { getSubordinateIds } from './viewScopeHelper';

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

/** Các departmentId thuộc cây con của mọi đơn vị mà nhân viên là manager (trưởng đơn vị / khối). */
export async function getManagedDepartmentSubtreeIds(managerEmployeeId: string): Promise<Set<string>> {
  const managedRoots = await prisma.department.findMany({
    where: { managerId: managerEmployeeId },
    select: { id: true },
  });
  const out = new Set<string>();
  for (const r of managedRoots) {
    await collectSubDepartments(r.id, out);
  }
  return out;
}

/**
 * NV thuộc phạm vi đơn vị do trưởng quản lý (trưởng + cấp dưới trong cây đơn vị gán `managerId`).
 * `null` nếu không phải trưởng đơn vị/khối nào.
 */
export async function getManagedTeamEmployeeIdsForPool(managerEmployeeId: string): Promise<string[] | null> {
  const managedRoots = await prisma.department.findMany({
    where: { managerId: managerEmployeeId },
    select: { id: true },
  });
  if (managedRoots.length === 0) return null;
  const subs = await getSubordinateIds(managerEmployeeId);
  return [...new Set([managerEmployeeId, ...subs])];
}

export interface FloatingDistributeActor {
  id: string;
  roleGroupCode?: string | null;
  permissions?: string[];
}

/**
 * Phân từ kho thả nổi: cross-org nếu có DISTRIBUTE_FLOATING_CROSS_ORG hoặc MANAGE_DATA_POOL;
 * DISTRIBUTE_FLOATING_POOL chỉ đích thuộc cây đơn vị do actor quản lý.
 */
export async function validateFloatingDistributeTarget(
  actor: FloatingDistributeActor,
  targetEmployeeId: string | undefined,
  targetDepartmentId: string | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isTechnicalAdminRoleCode(actor.roleGroupCode)) {
    return { ok: true };
  }
  const perms = actor.permissions || [];
  if (perms.includes('MANAGE_DATA_POOL') || perms.includes('DISTRIBUTE_FLOATING_CROSS_ORG')) {
    return { ok: true };
  }
  if (!perms.includes('DISTRIBUTE_FLOATING_POOL')) {
    return { ok: false, message: 'Thiếu quyền phân kho thả nổi' };
  }

  let deptId: string | null = targetDepartmentId || null;
  if (targetEmployeeId && !deptId) {
    const emp = await prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { departmentId: true },
    });
    deptId = emp?.departmentId ?? null;
  }
  if (!deptId) {
    return { ok: false, message: 'Không xác định đơn vị đích' };
  }

  const subtree = await getManagedDepartmentSubtreeIds(actor.id);
  if (subtree.has(deptId)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      'Đích phân nằm ngoài phạm vi đơn vị bạn quản lý. Cần quyền «Phân kho thả nổi ra mọi khối/đơn vị» (DISTRIBUTE_FLOATING_CROSS_ORG) hoặc «Quản lý kho số thả nổi».',
  };
}

/**
 * Phân từ kho Sales/CSKH: cross-org nếu có DISTRIBUTE_SALES_CROSS_ORG hoặc MANAGE_DATA_POOL;
 * ASSIGN_LEAD / MANAGE_CSKH_POOL chỉ đích thuộc cây đơn vị do actor quản lý.
 * requiredFunc: 'SALES' hoặc 'CSKH' để bắt buộc nhân viên/đơn vị đích phải khớp chức năng.
 */
export async function validateSalesDistributeTarget(
  actor: FloatingDistributeActor,
  targetEmployeeId: string | undefined,
  targetDepartmentId: string | undefined,
  requiredFunc?: 'SALES' | 'CSKH'
): Promise<{ ok: true } | { ok: false; message: string }> {
  const perms = actor.permissions || [];
  const isTechAdmin = isTechnicalAdminRoleCode(actor.roleGroupCode);

  // 1. Kiểm tra quyền của Distributor (người chia)
  if (!isTechAdmin) {
    if (targetDepartmentId && !perms.includes('DISTRIBUTE_TO_UNIT')) {
      return { ok: false, message: 'Bạn không có quyền chia khách cho đơn vị' };
    }
    if (targetEmployeeId && !perms.includes('DISTRIBUTE_TO_STAFF')) {
      return { ok: false, message: 'Bạn không có quyền chia khách cho nhân viên cụ thể' };
    }
  }

  // 2. Kiểm tra chức năng/loại của đích nếu có requiredFunc
  if (requiredFunc) {
    if (targetEmployeeId) {
      const emp = await prisma.employee.findUnique({
        where: { id: targetEmployeeId },
        select: { 
          salesType: true, 
          employeeType: { select: { code: true } },
          roleGroup: { include: { permissions: { select: { code: true } } } }
        },
      });
      if (emp) {
        // Kiểm tra Employee Type
        if (requiredFunc === 'SALES') {
          const isSales = emp.employeeType?.code === 'sales' || ['SALES', 'MARKETING'].includes(emp.salesType || '');
          if (!isSales) return { ok: false, message: 'Nhân viên đích không phải loại Sales' };
        } else if (requiredFunc === 'CSKH') {
          const isCskh = emp.employeeType?.code === 'customer_service' || emp.salesType === 'RESALES';
          if (!isCskh) return { ok: false, message: 'Nhân viên đích không phải loại CSKH' };
        }

        // Kiểm tra Quyền nhận khách (Catalog quyền)
        const targetPerms = emp.roleGroup?.permissions.map(p => p.code) || [];
        if (requiredFunc === 'SALES' && !targetPerms.includes('RECEIVE_SALES_LEAD')) {
          return { ok: false, message: 'Nhóm quyền của nhân viên đích không có quyền nhận khách Sales' };
        }
        if (requiredFunc === 'CSKH' && !targetPerms.includes('RECEIVE_CSKH_LEAD')) {
          return { ok: false, message: 'Nhóm quyền của nhân viên đích không có quyền nhận khách CSKH' };
        }
      }
    }
    if (targetDepartmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: targetDepartmentId },
        select: { function: true },
      });
      if (dept && dept.function && dept.function !== requiredFunc) {
        return { ok: false, message: `Đơn vị đích không có chức năng ${requiredFunc}` };
      }
    }
  }

  if (isTechAdmin) {
    return { ok: true };
  }
  if (perms.includes('MANAGE_DATA_POOL') || perms.includes('DISTRIBUTE_SALES_CROSS_ORG')) {
    return { ok: true };
  }
  if (
    !perms.includes('ASSIGN_LEAD') &&
    !perms.includes('MANAGE_CSKH_POOL')
  ) {
    return { ok: false, message: 'Thiếu quyền phân kho Sales/CSKH' };
  }

  let deptId: string | null = targetDepartmentId || null;
  if (targetEmployeeId && !deptId) {
    const emp = await prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { departmentId: true },
    });
    deptId = emp?.departmentId ?? null;
  }
  if (!deptId) {
    return { ok: false, message: 'Không xác định đơn vị đích' };
  }

  const subtree = await getManagedDepartmentSubtreeIds(actor.id);
  if (subtree.has(deptId)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      'Đích phân nằm ngoài phạm vi đơn vị bạn quản lý. Cần quyền «Phân kho Sales/CSKH cho bất kỳ khối/đơn vị/NV» (DISTRIBUTE_SALES_CROSS_ORG) hoặc «Quản lý kho số thả nổi».',
  };
}
