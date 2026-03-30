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
 */
export async function validateSalesDistributeTarget(
  actor: FloatingDistributeActor,
  targetEmployeeId: string | undefined,
  targetDepartmentId: string | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isTechnicalAdminRoleCode(actor.roleGroupCode)) {
    return { ok: true };
  }
  const perms = actor.permissions || [];
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
