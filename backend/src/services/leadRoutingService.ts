/**
 * Chọn Sales / CSKH khi phân bổ lại: ưu tiên cùng đơn vị → cùng khối → khối anh em → cùng tổ chức → toàn hệ thống.
 * `externalMarketingToSalesPct` và đếm `EXT_MKT_SALES_LEAF` trên **khối nhận** (Sales đích). Map nội bộ cây khối dùng `scope_division_id` tại khối đang cấu hình. Cân bằng theo thời gian qua `division_flow_routing_counters`.
 */
import { prisma } from '../config/database';
import {
  pickWeightedDeficitTargetAndRecord,
  pickFairSalesEmployeeInLeaf,
  pickFairResalesEmployeeInLeaf,
  ROUTING_COUNTER_KIND,
} from './divisionFlowRoutingCounterService';
import { SALES_ROLE_CODES, RESALES_ROLE_CODES } from '../constants/roleIdentification';

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

async function loadDepartmentRow(id: string) {
  return prisma.department.findUnique({
    where: { id },
    select: { id: true, parentId: true, type: true, organizationId: true },
  });
}

export async function getDivisionRootForDepartment(
  deptId: string | null
): Promise<{ divisionId: string; organizationId: string } | null> {
  let current = deptId;
  while (current) {
    const row = await loadDepartmentRow(current);
    if (!row) break;
    if (row.type === 'DIVISION') return { divisionId: row.id, organizationId: row.organizationId };
    current = row.parentId;
  }
  return null;
}

/**
 * Khi đi `parentId` không gặp DIVISION (dữ liệu cũ / cây lệch): tìm **khối DIVISION** có cây con **nhỏ nhất**
 * mà vẫn chứa `deptId` — thường là khối gần đơn vị NV Marketing nhất (nơi có `data_flow_shares`).
 */
async function findNearestDivisionContainingDepartment(
  deptId: string
): Promise<{ divisionId: string; organizationId: string } | null> {
  const start = await prisma.department.findUnique({
    where: { id: deptId },
    select: { organizationId: true },
  });
  if (!start?.organizationId) return null;
  const divisions = await prisma.department.findMany({
    where: { organizationId: start.organizationId, type: 'DIVISION' },
    select: { id: true, organizationId: true },
  });
  let best: { divisionId: string; organizationId: string } | null = null;
  let bestSize = Infinity;
  for (const d of divisions) {
    const sub = await collectSubtreeDepartmentIds(d.id);
    if (sub.has(deptId) && sub.size < bestSize) {
      bestSize = sub.size;
      best = { divisionId: d.id, organizationId: d.organizationId };
    }
  }
  return best;
}

async function collectSubtreeDepartmentIds(divisionId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const queue = [divisionId];
  while (queue.length) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    ids.add(id);
    const children = await prisma.department.findMany({
      where: { parentId: id },
      select: { id: true },
    });
    for (const c of children) queue.push(c.id);
  }
  return ids;
}

function pickFromCandidates(
  candidates: { id: string }[],
  exclude: Set<string>,
  seed: string
): string | null {
  const filtered = candidates.filter((c) => !exclude.has(c.id));
  if (filtered.length === 0) return null;
  const idx = hashString(seed) % filtered.length;
  return filtered[idx]!.id;
}

async function getSalesLeafDeptIdsInSubtree(divisionRootId: string): Promise<string[]> {
  const subtree = await collectSubtreeDepartmentIds(divisionRootId);
  const ids = [...subtree];
  const sales = await prisma.department.findMany({
    where: { id: { in: ids }, function: 'SALES' },
    select: { id: true },
  });
  if (sales.length === 0) return [];
  const childRows = await prisma.department.findMany({
    where: { parentId: { in: sales.map((s) => s.id) } },
    select: { parentId: true },
  });
  const hasChild = new Set(childRows.map((c) => c.parentId));
  return sales.filter((s) => !hasChild.has(s.id)).map((s) => s.id);
}

async function getCsKhLeafDeptIdsInSubtree(divisionRootId: string): Promise<string[]> {
  const subtree = await collectSubtreeDepartmentIds(divisionRootId);
  const ids = [...subtree];
  const cs = await prisma.department.findMany({
    where: { id: { in: ids }, function: 'CSKH' },
    select: { id: true },
  });
  if (cs.length === 0) return [];
  const childRows = await prisma.department.findMany({
    where: { parentId: { in: cs.map((c) => c.id) } },
    select: { parentId: true },
  });
  const hasChild = new Set(childRows.map((c) => c.parentId));
  return cs.filter((c) => !hasChild.has(c.id)).map((c) => c.id);
}

/** Đơn vị lá Sales/CSKH gắn trực tiếp với khối này — không nằm trong cây khối DIVISION con (cha chia con trước). */
async function getSalesLeafDeptIdsDirectUnderDivisionOnly(divisionRootId: string): Promise<string[]> {
  const allLeaves = await getSalesLeafDeptIdsInSubtree(divisionRootId);
  const childDivs = await prisma.department.findMany({
    where: { parentId: divisionRootId, type: 'DIVISION' },
    select: { id: true },
  });
  if (childDivs.length === 0) return allLeaves;
  const excluded = new Set<string>();
  for (const c of childDivs) {
    const sub = await collectSubtreeDepartmentIds(c.id);
    for (const id of sub) excluded.add(id);
  }
  return allLeaves.filter((id) => !excluded.has(id));
}

async function getCsKhLeafDeptIdsDirectUnderDivisionOnly(divisionRootId: string): Promise<string[]> {
  const allLeaves = await getCsKhLeafDeptIdsInSubtree(divisionRootId);
  const childDivs = await prisma.department.findMany({
    where: { parentId: divisionRootId, type: 'DIVISION' },
    select: { id: true },
  });
  if (childDivs.length === 0) return allLeaves;
  const excluded = new Set<string>();
  for (const c of childDivs) {
    const sub = await collectSubtreeDepartmentIds(c.id);
    for (const id of sub) excluded.add(id);
  }
  return allLeaves.filter((id) => !excluded.has(id));
}

type DivisionFlowShares = {
  marketingToSalesChildDivisionPct?: Record<string, number>;
  marketingToSalesPct?: Record<string, number>;
  salesToCsChildDivisionPct?: Record<string, number>;
  salesToCsPct?: Record<string, number>;
  /** Khối chỉ CSKH: chia lá trực thuộc khối (không gồm lá trong cây khối con). */
  csOnlyPct?: Record<string, number>;
};

/**
 * Trong cây gốc divisionId: **luôn** chia cho khối DIVISION con trực tiếp có Sales trước (có % hoặc đều),
 * đệ quy vào khối con; sau đó mới `marketingToSalesPct` / chia đều trên **đơn vị lá Sales trực thuộc** khối này
 * (không gồm lá nằm trong cây khối con).
 * `scopeDivisionId` trong DB đếm = khối **cho** (bản ghi đang chứa map tỉ lệ).
 */
async function pickSalesLeafDeptFromDivisionTree(
  divisionId: string,
  seed: string,
  organizationId?: string
): Promise<string | null> {
  const row = await prisma.department.findUnique({
    where: { id: divisionId },
    select: { dataFlowShares: true, type: true, organizationId: true },
  });
  if (!row || row.type !== 'DIVISION') return null;
  const orgId = organizationId ?? row.organizationId;
  const shares = (row.dataFlowShares || {}) as DivisionFlowShares;

  const childDivs = await prisma.department.findMany({
    where: { parentId: divisionId, type: 'DIVISION' },
    select: { id: true },
  });
  const childrenWithSales: string[] = [];
  for (const c of childDivs) {
    const leaves = await getSalesLeafDeptIdsInSubtree(c.id);
    if (leaves.length > 0) childrenWithSales.push(c.id);
  }

  const childPct = shares.marketingToSalesChildDivisionPct;
  if (childrenWithSales.length > 0) {
    let pickedChild: string | null = null;
    if (childPct && Object.keys(childPct).length > 0) {
      pickedChild = await pickWeightedDeficitTargetAndRecord({
        organizationId: orgId,
        scopeDivisionId: divisionId,
        kind: ROUTING_COUNTER_KIND.MKT_SALES_CHILD_DIV,
        weights: childPct,
        candidateIds: childrenWithSales,
      });
    }
    if (!pickedChild) {
      const eq = Object.fromEntries(
        childrenWithSales.map((id) => [id, 100 / childrenWithSales.length])
      );
      pickedChild = await pickWeightedDeficitTargetAndRecord({
        organizationId: orgId,
        scopeDivisionId: divisionId,
        kind: ROUTING_COUNTER_KIND.MKT_SALES_CHILD_DIV,
        weights: eq,
        candidateIds: childrenWithSales,
      });
    }
    if (pickedChild) {
      const deeper = await pickSalesLeafDeptFromDivisionTree(pickedChild, seed + ':c' + pickedChild, orgId);
      if (deeper) return deeper;
    }
  }

  const salesLeavesDirect = await getSalesLeafDeptIdsDirectUnderDivisionOnly(divisionId);
  const mtos = shares.marketingToSalesPct;
  if (mtos && Object.keys(mtos).length > 0 && salesLeavesDirect.length > 0) {
    const wd = await pickWeightedDeficitTargetAndRecord({
      organizationId: orgId,
      scopeDivisionId: divisionId,
      kind: ROUTING_COUNTER_KIND.MKT_SALES_LEAF,
      weights: mtos,
      candidateIds: salesLeavesDirect,
    });
    if (wd) return wd;
  }
  if (salesLeavesDirect.length === 1) return salesLeavesDirect[0]!;
  if (salesLeavesDirect.length > 1) {
    const eq = Object.fromEntries(
      salesLeavesDirect.map((id) => [id, 100 / salesLeavesDirect.length])
    );
    return pickWeightedDeficitTargetAndRecord({
      organizationId: orgId,
      scopeDivisionId: divisionId,
      kind: ROUTING_COUNTER_KIND.MKT_SALES_LEAF_UNIFORM,
      weights: eq,
      candidateIds: salesLeavesDirect,
    });
  }
  return null;
}

/** Sales → CSKH: khối con trực tiếp có CSKH trước (có % hoặc đều), đệ quy; rồi lá CSKH trực thuộc khối. */
async function pickCsLeafDeptFromDivisionTree(
  divisionId: string,
  seed: string,
  organizationId?: string
): Promise<string | null> {
  const row = await prisma.department.findUnique({
    where: { id: divisionId },
    select: { dataFlowShares: true, type: true, organizationId: true },
  });
  if (!row || row.type !== 'DIVISION') return null;
  const orgId = organizationId ?? row.organizationId;
  const shares = (row.dataFlowShares || {}) as DivisionFlowShares;

  const childDivs = await prisma.department.findMany({
    where: { parentId: divisionId, type: 'DIVISION' },
    select: { id: true },
  });
  const childrenWithCs: string[] = [];
  for (const c of childDivs) {
    const leaves = await getCsKhLeafDeptIdsInSubtree(c.id);
    if (leaves.length > 0) childrenWithCs.push(c.id);
  }

  const childPct = shares.salesToCsChildDivisionPct;
  if (childrenWithCs.length > 0) {
    let pickedChild: string | null = null;
    if (childPct && Object.keys(childPct).length > 0) {
      pickedChild = await pickWeightedDeficitTargetAndRecord({
        organizationId: orgId,
        scopeDivisionId: divisionId,
        kind: ROUTING_COUNTER_KIND.SALES_CS_CHILD_DIV,
        weights: childPct,
        candidateIds: childrenWithCs,
      });
    }
    if (!pickedChild) {
      const eq = Object.fromEntries(
        childrenWithCs.map((id) => [id, 100 / childrenWithCs.length])
      );
      pickedChild = await pickWeightedDeficitTargetAndRecord({
        organizationId: orgId,
        scopeDivisionId: divisionId,
        kind: ROUTING_COUNTER_KIND.SALES_CS_CHILD_DIV,
        weights: eq,
        candidateIds: childrenWithCs,
      });
    }
    if (pickedChild) {
      const deeper = await pickCsLeafDeptFromDivisionTree(pickedChild, seed + ':csc' + pickedChild, orgId);
      if (deeper) return deeper;
    }
  }

  const csLeavesDirect = await getCsKhLeafDeptIdsDirectUnderDivisionOnly(divisionId);
  const leafPct =
    shares.salesToCsPct && Object.keys(shares.salesToCsPct).length > 0
      ? shares.salesToCsPct
      : shares.csOnlyPct && Object.keys(shares.csOnlyPct).length > 0
        ? shares.csOnlyPct
        : undefined;
  if (leafPct && csLeavesDirect.length > 0) {
    const wd = await pickWeightedDeficitTargetAndRecord({
      organizationId: orgId,
      scopeDivisionId: divisionId,
      kind: ROUTING_COUNTER_KIND.SALES_CS_LEAF,
      weights: leafPct,
      candidateIds: csLeavesDirect,
    });
    if (wd) return wd;
  }
  if (csLeavesDirect.length === 1) return csLeavesDirect[0]!;
  if (csLeavesDirect.length > 1) {
    const eq = Object.fromEntries(
      csLeavesDirect.map((id) => [id, 100 / csLeavesDirect.length])
    );
    return pickWeightedDeficitTargetAndRecord({
      organizationId: orgId,
      scopeDivisionId: divisionId,
      kind: ROUTING_COUNTER_KIND.SALES_CS_LEAF_UNIFORM,
      weights: eq,
      candidateIds: csLeavesDirect,
    });
  }
  return null;
}

const salesEmployeeFilter = {
  status: { code: 'WORKING' as const },
  OR: [
    { salesType: 'SALES' as const },
    { roleGroup: { code: { in: SALES_ROLE_CODES } } },
  ],
};

const resalesEmployeeFilter = {
  status: { code: 'WORKING' as const },
  OR: [
    { salesType: 'RESALES' as const },
    { roleGroup: { code: { in: RESALES_ROLE_CODES } } },
  ],
};

/** Khối gốc của NV và khối cha (nối sang khối đồng cấp khi cấu hình trên khối cha). */
async function pickFromExternalSalesDivision(
  divisionRow: {
    id: string;
    organizationId: string;
    externalSalesDivisionId: string | null;
    dataFlowShares: unknown;
  },
  exclude: Set<string>,
  seed: string
): Promise<string | null> {
  if (!divisionRow.externalSalesDivisionId) return null;
  const receiverId = divisionRow.externalSalesDivisionId;
  const receiver = await prisma.department.findUnique({
    where: { id: receiverId },
    select: { id: true, organizationId: true, dataFlowShares: true },
  });
  if (!receiver) return null;
  const extSub = await collectSubtreeDepartmentIds(receiverId);
  const salesLeaves = await getSalesLeafDeptIdsInSubtree(receiverId);
  const shares = (receiver.dataFlowShares || {}) as { externalMarketingToSalesPct?: Record<string, number> };
  const extMtos = shares.externalMarketingToSalesPct;
  const extEmps = await prisma.employee.findMany({
    where: {
      ...salesEmployeeFilter,
      id: { notIn: [...exclude] },
      departmentId: { in: [...extSub] },
    },
    select: { id: true, departmentId: true },
  });
  if (extEmps.length === 0) return null;

  const leafFromTree = await pickSalesLeafDeptFromDivisionTree(
    receiverId,
    seed + ':exttree',
    divisionRow.organizationId
  );
  if (leafFromTree) {
    const inTree = extEmps.filter((e) => e.departmentId === leafFromTree);
    const eligibleExt = inTree.map((e) => e.id).filter((id) => !exclude.has(id));
    if (eligibleExt.length > 0) {
      const fairExt = await pickFairSalesEmployeeInLeaf({
        organizationId: receiver.organizationId,
        scopeDivisionId: receiver.id,
        employeeIds: eligibleExt,
      });
      if (fairExt) return fairExt;
    }
    const pTree = await pickFairSalesEmployeeInLeaf({
      organizationId: receiver.organizationId,
      scopeDivisionId: receiver.id,
      employeeIds: inTree.map((e) => e.id).filter((id) => !exclude.has(id)),
    });
    if (pTree) return pTree;
  }

  if (extMtos && Object.keys(extMtos).length > 0 && salesLeaves.length > 0) {
    const wd = await pickWeightedDeficitTargetAndRecord({
      organizationId: receiver.organizationId,
      scopeDivisionId: receiver.id,
      kind: ROUTING_COUNTER_KIND.EXT_MKT_SALES_LEAF,
      weights: extMtos,
      candidateIds: salesLeaves,
    });
    if (wd) {
      const inWd = extEmps.filter((e) => e.departmentId === wd);
      const pwx = await pickFairSalesEmployeeInLeaf({
        organizationId: receiver.organizationId,
        scopeDivisionId: receiver.id,
        employeeIds: inWd.map((e) => e.id).filter((id) => !exclude.has(id)),
      });
      if (pwx) return pwx;
    }
  }
  return pickFairSalesEmployeeInLeaf({
    organizationId: receiver.organizationId,
    scopeDivisionId: receiver.id,
    employeeIds: extEmps.map((e) => e.id).filter((id) => !exclude.has(id)),
  });
}

async function pickFromExternalCsDivision(
  divisionRow: { id: string; organizationId: string; externalCsDivisionId: string | null },
  exclude: Set<string>,
  seed: string
): Promise<string | null> {
  if (!divisionRow.externalCsDivisionId) return null;
  const targetSubtree = await collectSubtreeDepartmentIds(divisionRow.externalCsDivisionId);
  const inTarget = await prisma.employee.findMany({
    where: {
      ...resalesEmployeeFilter,
      id: { notIn: [...exclude] },
      departmentId: { in: [...targetSubtree] },
    },
    select: { id: true, departmentId: true },
  });
  if (inTarget.length === 0) return null;
  const leafFromTree = await pickCsLeafDeptFromDivisionTree(
    divisionRow.externalCsDivisionId,
    seed + ':extcstree',
    divisionRow.organizationId
  );
  if (leafFromTree) {
    const inLeaf = inTarget.filter((e) => e.departmentId === leafFromTree);
    const pc = await pickFairResalesEmployeeInLeaf({
      organizationId: divisionRow.organizationId,
      scopeDivisionId: divisionRow.id,
      employeeIds: inLeaf.map((e) => e.id).filter((id) => !exclude.has(id)),
    });
    if (pc) return pc;
  }
  return pickFairResalesEmployeeInLeaf({
    organizationId: divisionRow.organizationId,
    scopeDivisionId: divisionRow.id,
    employeeIds: inTarget.map((e) => e.id).filter((id) => !exclude.has(id)),
  });
}

/**
 * anchorEmployeeId: thường là sales vừa hết hạn hoặc CS vừa thu hồi — dùng để xác định khối/đơn vị.
 */
export async function pickNextSalesEmployeeId(opts: {
  seed: string;
  excludeIds: string[];
  anchorEmployeeId: string | null;
}): Promise<string | null> {
  const exclude = new Set(opts.excludeIds.filter(Boolean));

  let anchorDept: string | null = null;
  let divisionInfo: { divisionId: string; organizationId: string } | null = null;
  if (opts.anchorEmployeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: opts.anchorEmployeeId },
      select: { departmentId: true },
    });
    anchorDept = emp?.departmentId ?? null;
    if (anchorDept) {
      divisionInfo = await getDivisionRootForDepartment(anchorDept);
      if (!divisionInfo) {
        divisionInfo = await findNearestDivisionContainingDepartment(anchorDept);
      }
    }
  }

  // Config-first: ưu tiên targetSalesUnitId nếu department gốc đã cấu hình
  if (anchorDept) {
    const deptRow = await prisma.department.findUnique({
      where: { id: anchorDept },
      select: { targetSalesUnitId: true },
    });
    if (deptRow?.targetSalesUnitId) {
      const targetSubtree = await collectSubtreeDepartmentIds(deptRow.targetSalesUnitId);
      const inTarget = await prisma.employee.findMany({
        where: { ...salesEmployeeFilter, id: { notIn: [...exclude] }, departmentId: { in: [...targetSubtree] } },
        select: { id: true },
      });
      const pc = await pickFairSalesEmployeeInLeaf({
        organizationId: divisionInfo?.organizationId || '',
        scopeDivisionId: divisionInfo?.divisionId || '',
        employeeIds: inTarget.map((e) => e.id),
      });
      if (pc) return pc;
    }
  }

  if (divisionInfo && anchorDept) {
    const sameDept = await prisma.employee.findMany({
      where: {
        ...salesEmployeeFilter,
        id: { notIn: [...exclude] },
        departmentId: anchorDept,
      },
      select: { id: true },
    });
    const p0 = await pickFairSalesEmployeeInLeaf({
      organizationId: divisionInfo.organizationId,
      scopeDivisionId: divisionInfo.divisionId,
      employeeIds: sameDept.map((e) => e.id),
    });
    if (p0) return p0;
  }

  if (divisionInfo) {
    const subtree = await collectSubtreeDepartmentIds(divisionInfo.divisionId);
    const weightedSalesLeaf = await pickSalesLeafDeptFromDivisionTree(
      divisionInfo.divisionId,
      opts.seed + ':wmtos',
      divisionInfo.organizationId
    );
    if (weightedSalesLeaf) {
      const inWeighted = await prisma.employee.findMany({
        where: {
          ...salesEmployeeFilter,
          id: { notIn: [...exclude] },
          departmentId: weightedSalesLeaf,
        },
        select: { id: true },
      });
      const eligibleW = inWeighted.map((e) => e.id).filter((id) => !exclude.has(id));
      if (eligibleW.length > 0) {
        const fairW = await pickFairSalesEmployeeInLeaf({
          organizationId: divisionInfo.organizationId,
          scopeDivisionId: divisionInfo.divisionId,
          employeeIds: eligibleW,
        });
        if (fairW) return fairW;
        const p1wFb = pickFromCandidates(inWeighted, exclude, opts.seed + ':fairfb');
        if (p1wFb) return p1wFb;
      }
    }
    const inBlock = await prisma.employee.findMany({
      where: {
        ...salesEmployeeFilter,
        id: { notIn: [...exclude] },
        departmentId: { in: [...subtree] },
      },
      select: { id: true },
    });
    const p1 = await pickFairSalesEmployeeInLeaf({
      organizationId: divisionInfo.organizationId,
      scopeDivisionId: divisionInfo.divisionId,
      employeeIds: inBlock.map((e) => e.id),
    });
    if (p1) return p1;

    const divFlowRow = await prisma.department.findUnique({
      where: { id: divisionInfo.divisionId },
      select: { id: true, organizationId: true, externalSalesDivisionId: true, dataFlowShares: true },
    });
    if (divFlowRow) {
      const pExt = await pickFromExternalSalesDivision(divFlowRow, exclude, opts.seed + ':selfext');
      if (pExt) return pExt;
    }

    const divRow = await loadDepartmentRow(divisionInfo.divisionId);
    if (divRow?.parentId) {
      const siblings = await prisma.department.findMany({
        where: { parentId: divRow.parentId, type: 'DIVISION' },
        select: { id: true },
      });
      const sibDeptIds = new Set<string>();
      for (const s of siblings) {
        if (s.id === divisionInfo.divisionId) continue;
        const sub = await collectSubtreeDepartmentIds(s.id);
        sub.forEach((x) => sibDeptIds.add(x));
      }
      if (sibDeptIds.size > 0) {
        const inSiblings = await prisma.employee.findMany({
          where: {
            ...salesEmployeeFilter,
            id: { notIn: [...exclude] },
            departmentId: { in: [...sibDeptIds] },
          },
          select: { id: true },
        });
        const p2 = await pickFairSalesEmployeeInLeaf({
          organizationId: divisionInfo.organizationId,
          scopeDivisionId: divisionInfo.divisionId,
          employeeIds: inSiblings.map((e) => e.id).filter((id) => !exclude.has(id)),
        });
        if (p2) return p2;
      }
    }

    let walkerParentId: string | null = divRow?.parentId ?? null;
    while (walkerParentId) {
      const parentDiv = await prisma.department.findUnique({
        where: { id: walkerParentId },
        select: {
          id: true,
          organizationId: true,
          parentId: true,
          type: true,
          externalSalesDivisionId: true,
          dataFlowShares: true,
        },
      });
      if (!parentDiv) break;
      if (parentDiv.type === 'DIVISION') {
        const pAnc = await pickFromExternalSalesDivision(parentDiv, exclude, opts.seed + ':anc' + parentDiv.id);
        if (pAnc) return pAnc;
      }
      walkerParentId = parentDiv.parentId;
    }

    const inOrg = await prisma.employee.findMany({
      where: {
        ...salesEmployeeFilter,
        id: { notIn: [...exclude] },
        department: { organizationId: divisionInfo.organizationId },
      },
      select: { id: true },
    });
    const p3 = await pickFairSalesEmployeeInLeaf({
      organizationId: divisionInfo.organizationId,
      scopeDivisionId: divisionInfo.divisionId,
      employeeIds: inOrg.map((e) => e.id).filter((id) => !exclude.has(id)),
    });
    if (p3) return p3;
  }

  const all = await prisma.employee.findMany({
    where: { ...salesEmployeeFilter, id: { notIn: [...exclude] } },
    select: { id: true },
  });
  return pickFairSalesEmployeeInLeaf({
    organizationId: 'ROOT',
    scopeDivisionId: 'GLOBAL',
    employeeIds: all.map((e) => e.id).filter((id) => !exclude.has(id)),
  });
}

export async function pickNextResalesEmployeeId(opts: {
  seed: string;
  excludeIds: string[];
  anchorEmployeeId: string | null;
}): Promise<string | null> {
  const exclude = new Set(opts.excludeIds.filter(Boolean));

  let anchorDept: string | null = null;
  let divisionInfo: { divisionId: string; organizationId: string } | null = null;
  if (opts.anchorEmployeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: opts.anchorEmployeeId },
      select: { departmentId: true },
    });
    anchorDept = emp?.departmentId ?? null;
    if (anchorDept) {
      divisionInfo = await getDivisionRootForDepartment(anchorDept);
      if (!divisionInfo) {
        divisionInfo = await findNearestDivisionContainingDepartment(anchorDept);
      }
    }
  }

  // Config-first: ưu tiên targetCsUnitId, rồi externalCsDivisionId trên bản ghi khối
  if (anchorDept) {
    const deptRow = await prisma.department.findUnique({
      where: { id: anchorDept },
      select: { targetCsUnitId: true },
    });
    if (deptRow?.targetCsUnitId) {
      const targetSubtree = await collectSubtreeDepartmentIds(deptRow.targetCsUnitId);
      const inTarget = await prisma.employee.findMany({
        where: { ...resalesEmployeeFilter, id: { notIn: [...exclude] }, departmentId: { in: [...targetSubtree] } },
        select: { id: true },
      });
      const pc = await pickFairResalesEmployeeInLeaf({
        organizationId: divisionInfo?.organizationId || '',
        scopeDivisionId: divisionInfo?.divisionId || '',
        employeeIds: inTarget.map((e) => e.id),
      });
      if (pc) return pc;
    }
  }

  if (divisionInfo) {
    const divCs = await prisma.department.findUnique({
      where: { id: divisionInfo.divisionId },
      select: { id: true, organizationId: true, externalCsDivisionId: true },
    });
    if (divCs) {
      const pc = await pickFromExternalCsDivision(divCs, exclude, opts.seed + ':cfgExtCs');
      if (pc) return pc;
    }
  }

  if (divisionInfo && anchorDept) {
    const sameDept = await prisma.employee.findMany({
      where: {
        ...resalesEmployeeFilter,
        id: { notIn: [...exclude] },
        departmentId: anchorDept,
      },
      select: { id: true },
    });
    const p0 = await pickFairResalesEmployeeInLeaf({
      organizationId: divisionInfo.organizationId,
      scopeDivisionId: divisionInfo.divisionId,
      employeeIds: sameDept.map((e) => e.id),
    });
    if (p0) return p0;
  }

  if (divisionInfo) {
    const subtree = await collectSubtreeDepartmentIds(divisionInfo.divisionId);
    const weightedCsLeaf = await pickCsLeafDeptFromDivisionTree(
      divisionInfo.divisionId,
      opts.seed + ':wstocs',
      divisionInfo.organizationId
    );
    if (weightedCsLeaf) {
      const inWeighted = await prisma.employee.findMany({
        where: {
          ...resalesEmployeeFilter,
          id: { notIn: [...exclude] },
          departmentId: weightedCsLeaf,
        },
        select: { id: true },
      });
      const p1w = await pickFairResalesEmployeeInLeaf({
        organizationId: divisionInfo.organizationId,
        scopeDivisionId: divisionInfo.divisionId,
        employeeIds: inWeighted.map((e) => e.id).filter((id) => !exclude.has(id)),
      });
      if (p1w) return p1w;
    }
    const inBlock = await prisma.employee.findMany({
      where: {
        ...resalesEmployeeFilter,
        id: { notIn: [...exclude] },
        departmentId: { in: [...subtree] },
      },
      select: { id: true },
    });
    const p1 = await pickFairResalesEmployeeInLeaf({
      organizationId: divisionInfo.organizationId,
      scopeDivisionId: divisionInfo.divisionId,
      employeeIds: inBlock.map((e) => e.id),
    });
    if (p1) return p1;

    const divRow = await loadDepartmentRow(divisionInfo.divisionId);
    if (divRow?.parentId) {
      const siblings = await prisma.department.findMany({
        where: { parentId: divRow.parentId, type: 'DIVISION' },
        select: { id: true },
      });
      const sibDeptIds = new Set<string>();
      for (const s of siblings) {
        if (s.id === divisionInfo.divisionId) continue;
        const sub = await collectSubtreeDepartmentIds(s.id);
        sub.forEach((x) => sibDeptIds.add(x));
      }
      if (sibDeptIds.size > 0) {
        const inSiblings = await prisma.employee.findMany({
          where: {
            ...resalesEmployeeFilter,
            id: { notIn: [...exclude] },
            departmentId: { in: [...sibDeptIds] },
          },
          select: { id: true },
        });
        const p2 = await pickFairResalesEmployeeInLeaf({
          organizationId: divisionInfo.organizationId,
          scopeDivisionId: divisionInfo.divisionId,
          employeeIds: inSiblings.map((e) => e.id).filter((id) => !exclude.has(id)),
        });
        if (p2) return p2;
      }
    }

    let walkerParentCs: string | null = divRow?.parentId ?? null;
    while (walkerParentCs) {
      const parentDiv = await prisma.department.findUnique({
        where: { id: walkerParentCs },
        select: { id: true, organizationId: true, parentId: true, type: true, externalCsDivisionId: true },
      });
      if (!parentDiv) break;
      if (parentDiv.type === 'DIVISION') {
        const pAnc = await pickFromExternalCsDivision(parentDiv, exclude, opts.seed + ':ancCs' + parentDiv.id);
        if (pAnc) return pAnc;
      }
      walkerParentCs = parentDiv.parentId;
    }

    const inOrg = await prisma.employee.findMany({
      where: {
        ...resalesEmployeeFilter,
        id: { notIn: [...exclude] },
        department: { organizationId: divisionInfo.organizationId },
      },
      select: { id: true },
    });
    const p3 = await pickFairResalesEmployeeInLeaf({
      organizationId: divisionInfo.organizationId,
      scopeDivisionId: divisionInfo.divisionId,
      employeeIds: inOrg.map((e) => e.id).filter((id) => !exclude.has(id)),
    });
    if (p3) return p3;
  }

  const all = await prisma.employee.findMany({
    where: { ...resalesEmployeeFilter, id: { notIn: [...exclude] } },
    select: { id: true },
  });
  return pickFairResalesEmployeeInLeaf({
    organizationId: 'ROOT',
    scopeDivisionId: 'GLOBAL',
    employeeIds: all.map((e) => e.id).filter((id) => !exclude.has(id)),
  });
}
