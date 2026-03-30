/**
 * Org-aware routing: tìm đơn vị đích (SALES/CSKH) theo cấu trúc tổ chức.
 *
 * Ưu tiên:
 *   1. targetSalesUnitId / targetCsUnitId (nếu đã cấu hình trên Department)
 *   2. Đơn vị cùng DIVISION có function phù hợp
 *   3. Khối ngoài: externalSalesDivisionId (Sales) / externalCsDivisionId (CSKH) trên **khối gốc của đơn vị nguồn**
 *   4. Leo lên parent: quét DIVISION anh em **cùng cấp**, rồi thử external_* trên **khối cha** (DIVISION) — khi khối chỉ chứa khối con
 *      không cần nối từng khối con; dữ liệu đi theo luồng cha
 *   5. Lặp bước 4 khi leo tiếp
 *   6. Fallback: toàn bộ org
 */
import { prisma } from '../config/database';

type OrgFuncTarget = 'SALES' | 'CSKH';

export interface DeptRow {
  id: string;
  parentId: string | null;
  type: string;
  function: string | null;
  organizationId: string;
  targetSalesUnitId: string | null;
  targetCsUnitId: string | null;
  externalCsDivisionId: string | null;
  externalSalesDivisionId: string | null;
  dataFlowShares: unknown | null;
  autoDistributeLead: boolean;
  autoDistributeCustomer: boolean;
  leadDistributeMethod: string;
  customerDistributeMethod: string;
}

const DEPT_SELECT = {
  id: true,
  parentId: true,
  type: true,
  function: true,
  organizationId: true,
  targetSalesUnitId: true,
  targetCsUnitId: true,
  externalCsDivisionId: true,
  externalSalesDivisionId: true,
  dataFlowShares: true,
  autoDistributeLead: true,
  autoDistributeCustomer: true,
  leadDistributeMethod: true,
  customerDistributeMethod: true,
} as const;

async function loadDept(id: string): Promise<DeptRow | null> {
  return prisma.department.findUnique({ where: { id }, select: DEPT_SELECT }) as any;
}

async function collectSubtreeIds(rootId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    if (ids.has(cur)) continue;
    ids.add(cur);
    const children = await prisma.department.findMany({
      where: { parentId: cur },
      select: { id: true },
    });
    for (const c of children) queue.push(c.id);
  }
  return ids;
}

async function findDivisionRoot(deptId: string): Promise<DeptRow | null> {
  let cur: string | null = deptId;
  while (cur) {
    const row = await loadDept(cur);
    if (!row) break;
    if (row.type === 'DIVISION') return row;
    cur = row.parentId;
  }
  return null;
}

async function findDeptsWithFunction(deptIds: Set<string>, func: OrgFuncTarget): Promise<string[]> {
  if (deptIds.size === 0) return [];
  const rows = await prisma.department.findMany({
    where: { id: { in: [...deptIds] }, function: func },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Tìm danh sách departmentId có function = targetFunction, xuất phát từ sourceDeptId.
 *
 * Trả về { departmentIds, divisionRow (nếu có), method }.
 */
export async function resolveTargetDepartments(
  sourceDeptId: string | null,
  targetFunction: OrgFuncTarget
): Promise<{
  departmentIds: string[];
  divisionRow: DeptRow | null;
  method: string;
}> {
  const empty = { departmentIds: [], divisionRow: null, method: 'ROUND_ROBIN' };
  if (!sourceDeptId) return empty;

  const sourceDept = await loadDept(sourceDeptId);
  if (!sourceDept) return empty;

  const configField = targetFunction === 'SALES' ? 'targetSalesUnitId' : 'targetCsUnitId';
  const configuredTarget = sourceDept[configField];
  if (configuredTarget) {
    const targetDept = await loadDept(configuredTarget);
    if (targetDept) {
      const methodField = targetFunction === 'SALES' ? 'leadDistributeMethod' : 'customerDistributeMethod';
      const subtree = await collectSubtreeIds(configuredTarget);
      const matching = await findDeptsWithFunction(subtree, targetFunction);
      if (matching.length > 0) {
        return { departmentIds: matching, divisionRow: targetDept, method: targetDept[methodField] || 'ROUND_ROBIN' };
      }
      const empsInTarget = await prisma.employee.findMany({
        where: { departmentId: { in: [...subtree] }, status: { code: 'WORKING' } },
        select: { id: true },
        take: 1,
      });
      if (empsInTarget.length > 0) {
        return { departmentIds: [...subtree], divisionRow: targetDept, method: targetDept[methodField] || 'ROUND_ROBIN' };
      }
    }
  }

  const division = await findDivisionRoot(sourceDeptId);

  if (division) {
    const divSubtree = await collectSubtreeIds(division.id);
    const inDiv = await findDeptsWithFunction(divSubtree, targetFunction);
    if (inDiv.length > 0) {
      const methodField = targetFunction === 'SALES' ? 'leadDistributeMethod' : 'customerDistributeMethod';
      return { departmentIds: inDiv, divisionRow: division, method: division[methodField] || 'ROUND_ROBIN' };
    }

    if (targetFunction === 'SALES' && division.externalSalesDivisionId) {
      const extDiv = await loadDept(division.externalSalesDivisionId);
      if (extDiv) {
        const subtree = await collectSubtreeIds(extDiv.id);
        const matching = await findDeptsWithFunction(subtree, 'SALES');
        if (matching.length > 0) {
          return {
            departmentIds: matching,
            divisionRow: extDiv,
            method: extDiv.leadDistributeMethod || 'ROUND_ROBIN',
          };
        }
      }
    }

    if (targetFunction === 'CSKH' && division.externalCsDivisionId) {
      const extDiv = await loadDept(division.externalCsDivisionId);
      if (extDiv) {
        const subtree = await collectSubtreeIds(extDiv.id);
        const matching = await findDeptsWithFunction(subtree, 'CSKH');
        if (matching.length > 0) {
          return {
            departmentIds: matching,
            divisionRow: extDiv,
            method: extDiv.customerDistributeMethod || 'ROUND_ROBIN',
          };
        }
      }
    }

    let parentId = division.parentId;
    while (parentId) {
      const parentRow = await loadDept(parentId);
      if (!parentRow) break;

      const siblingDivs = await prisma.department.findMany({
        where: { parentId, type: 'DIVISION', id: { not: division.id } },
        select: { id: true },
      });

      for (const sib of siblingDivs) {
        const sibSubtree = await collectSubtreeIds(sib.id);
        const matching = await findDeptsWithFunction(sibSubtree, targetFunction);
        if (matching.length > 0) {
          const sibDiv = await loadDept(sib.id);
          const methodField = targetFunction === 'SALES' ? 'leadDistributeMethod' : 'customerDistributeMethod';
          return {
            departmentIds: matching,
            divisionRow: sibDiv,
            method: sibDiv?.[methodField] || 'ROUND_ROBIN',
          };
        }
      }

      // Nối luồng cấu hình trên khối cha (khối chỉ có khối con: không bắt buộc external trên từng khối con)
      if (parentRow.type === 'DIVISION') {
        if (targetFunction === 'SALES' && parentRow.externalSalesDivisionId) {
          const extDiv = await loadDept(parentRow.externalSalesDivisionId);
          if (extDiv) {
            const subtree = await collectSubtreeIds(extDiv.id);
            const matching = await findDeptsWithFunction(subtree, 'SALES');
            if (matching.length > 0) {
              return {
                departmentIds: matching,
                divisionRow: extDiv,
                method: extDiv.leadDistributeMethod || 'ROUND_ROBIN',
              };
            }
          }
        }
        if (targetFunction === 'CSKH' && parentRow.externalCsDivisionId) {
          const extDiv = await loadDept(parentRow.externalCsDivisionId);
          if (extDiv) {
            const subtree = await collectSubtreeIds(extDiv.id);
            const matching = await findDeptsWithFunction(subtree, 'CSKH');
            if (matching.length > 0) {
              return {
                departmentIds: matching,
                divisionRow: extDiv,
                method: extDiv.customerDistributeMethod || 'ROUND_ROBIN',
              };
            }
          }
        }
      }

      if (parentRow.type === 'DIVISION' || parentRow.type === 'COMPANY') {
        parentId = parentRow.parentId;
      } else {
        break;
      }
    }
  }

  const orgId = sourceDept.organizationId;
  const allInOrg = await prisma.department.findMany({
    where: { organizationId: orgId, function: targetFunction },
    select: { id: true },
  });
  if (allInOrg.length > 0) {
    return { departmentIds: allInOrg.map((d) => d.id), divisionRow: null, method: 'ROUND_ROBIN' };
  }

  return empty;
}

/**
 * Lấy danh sách NV WORKING trong các department.
 */
export async function getEmployeesInDepartments(
  departmentIds: string[],
  extraFilter?: Record<string, any>
): Promise<{ id: string; fullName: string; departmentId: string | null }[]> {
  if (departmentIds.length === 0) return [];
  const allDeptIds = new Set<string>();
  for (const deptId of departmentIds) {
    const subtree = await collectSubtreeIds(deptId);
    subtree.forEach((id) => allDeptIds.add(id));
  }
  if (allDeptIds.size === 0) return [];

  const where: any = {
    departmentId: { in: [...allDeptIds] },
    status: { code: 'WORKING' },
    ...extraFilter,
  };
  return prisma.employee.findMany({
    where,
    select: { id: true, fullName: true, departmentId: true },
  });
}

/**
 * Kết hợp: tìm đơn vị đích → lấy NV trong đó.
 */
export async function resolveTargetEmployees(
  sourceDeptId: string | null,
  targetFunction: OrgFuncTarget,
  extraFilter?: Record<string, any>
): Promise<{
  employees: { id: string; fullName: string; departmentId: string | null }[];
  method: string;
  divisionRow: DeptRow | null;
}> {
  const resolved = await resolveTargetDepartments(sourceDeptId, targetFunction);
  if (resolved.departmentIds.length === 0) {
    return { employees: [], method: resolved.method, divisionRow: resolved.divisionRow };
  }
  const employees = await getEmployeesInDepartments(resolved.departmentIds, extraFilter);
  return { employees, method: resolved.method, divisionRow: resolved.divisionRow };
}

/**
 * Tìm divisionId của một department (leo cây lên DIVISION).
 */
export async function getDivisionIdForDept(deptId: string | null): Promise<string | null> {
  if (!deptId) return null;
  const div = await findDivisionRoot(deptId);
  return div?.id ?? null;
}
