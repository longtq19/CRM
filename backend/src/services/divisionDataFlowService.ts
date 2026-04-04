import type { DivisionDataFlowSharesJson } from '../types/divisionDataFlow';

function sumPct(m: Record<string, number> | undefined): number {
  if (!m || typeof m !== 'object') return 0;
  let s = 0;
  for (const v of Object.values(m)) {
    const n = Number(v);
    if (Number.isFinite(n)) s += n;
  }
  return Math.round(s * 100) / 100;
}

function isLeafDept(id: string, all: { id: string; parentId: string | null }[]): boolean {
  return !all.some((r) => r.parentId === id);
}

function inDivision(
  divisionId: string,
  deptId: string,
  computeDivisionId: (id: string) => string | null
): boolean {
  return computeDivisionId(deptId) === divisionId;
}

function isSiblingDepartment(
  aId: string,
  bId: string,
  departments: { id: string; parentId: string | null; type: string }[]
): boolean {
  if (aId === bId) return false;
  const a = departments.find((d) => d.id === aId);
  const b = departments.find((d) => d.id === bId);
  if (!a || !b) return false;
  return (a.parentId || null) === (b.parentId || null);
}

function leafSalesInDivision(
  externalDivisionId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[],
  computeDivisionId: (id: string) => string | null
): string[] {
  const inDiv = departments.filter((d) => inDivision(externalDivisionId, d.id, computeDivisionId));
  const leaves = inDiv.filter((d) => d.type !== 'DIVISION' && isLeafDept(d.id, departments));
  return leaves.filter((d) => d.function === 'SALES').map((d) => d.id);
}

function leafCsKhInDivision(
  divisionRootId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[],
  computeDivisionId: (id: string) => string | null
): string[] {
  const inDiv = departments.filter((d) => inDivision(divisionRootId, d.id, computeDivisionId));
  const leaves = inDiv.filter((d) => d.type !== 'DIVISION' && isLeafDept(d.id, departments));
  return leaves.filter((d) => d.function === 'CSKH').map((d) => d.id);
}

/** Id mọi department trong cây con gốc rootId (theo parent_id). */
function collectSubtreeDeptIds(
  rootId: string,
  departments: { id: string; parentId: string | null }[]
): Set<string> {
  const set = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const d of departments) {
      if ((d.parentId || null) === id) {
        set.add(d.id);
        queue.push(d.id);
      }
    }
  }
  return set;
}

/** Đơn vị lá CSKH thuộc khối nhưng không nằm trong cây khối DIVISION con (đồng bộ leadRoutingService). */
function leafCsKhDirectUnderDivisionOnly(
  divisionId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[],
  computeDivisionId: (id: string) => string | null
): string[] {
  const allCs = leafCsKhInDivision(divisionId, departments, computeDivisionId);
  const childDivs = departments.filter((d) => (d.parentId || null) === divisionId && d.type === 'DIVISION');
  if (childDivs.length === 0) return allCs;
  const excluded = new Set<string>();
  for (const c of childDivs) {
    for (const id of collectSubtreeDeptIds(c.id, departments)) excluded.add(id);
  }
  return allCs.filter((id) => !excluded.has(id));
}

/** Mọi đơn vị lá Sales trong cây con gốc division (theo parent_id — khớp getSalesLeafDeptIdsInSubtree). */
function leafSalesInDivisionSubtree(
  divisionRootId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[]
): string[] {
  const inSubtree = collectSubtreeDeptIds(divisionRootId, departments);
  const out: string[] = [];
  for (const d of departments) {
    if (!inSubtree.has(d.id) || d.type === 'DIVISION') continue;
    if (!isLeafDept(d.id, departments)) continue;
    if (d.function === 'SALES') out.push(d.id);
  }
  return out;
}

/** Đơn vị lá Sales trực thuộc khối — không nằm trong cây khối DIVISION con (đồng bộ leadRoutingService). */
function leafSalesDirectUnderDivisionOnly(
  divisionId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[]
): string[] {
  const allSales = leafSalesInDivisionSubtree(divisionId, departments);
  const childDivs = departments.filter((d) => (d.parentId || null) === divisionId && d.type === 'DIVISION');
  if (childDivs.length === 0) return allSales;
  const excluded = new Set<string>();
  for (const c of childDivs) {
    for (const id of collectSubtreeDeptIds(c.id, departments)) excluded.add(id);
  }
  return allSales.filter((id) => !excluded.has(id));
}

/** Mọi đơn vị lá CSKH trong cây con gốc division (theo parent_id — khớp getCsKhLeafDeptIdsInSubtree). */
function leafCsKhInDivisionSubtree(
  divisionRootId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[]
): string[] {
  const inSubtree = collectSubtreeDeptIds(divisionRootId, departments);
  const out: string[] = [];
  for (const d of departments) {
    if (!inSubtree.has(d.id) || d.type === 'DIVISION') continue;
    if (!isLeafDept(d.id, departments)) continue;
    if (d.function === 'CSKH') out.push(d.id);
  }
  return out;
}

/** Mọi đơn vị lá Marketing trong cây con gốc division (theo parent_id). */
function leafMktInDivisionSubtree(
  divisionRootId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[]
): string[] {
  const inSubtree = collectSubtreeDeptIds(divisionRootId, departments);
  const out: string[] = [];
  for (const d of departments) {
    if (!inSubtree.has(d.id) || d.type === 'DIVISION') continue;
    if (!isLeafDept(d.id, departments)) continue;
    if (d.function === 'MARKETING') out.push(d.id);
  }
  return out;
}

/** Đơn vị lá Marketing trực thuộc khối — không nằm trong cây khối DIVISION con. */
function leafMktDirectUnderDivisionOnly(
  divisionId: string,
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[]
): string[] {
  const allMkt = leafMktInDivisionSubtree(divisionId, departments);
  const childDivs = departments.filter((d) => (d.parentId || null) === divisionId && d.type === 'DIVISION');
  if (childDivs.length === 0) return allMkt;
  const excluded = new Set<string>();
  for (const c of childDivs) {
    for (const id of collectSubtreeDeptIds(c.id, departments)) excluded.add(id);
  }
  return allMkt.filter((id) => !excluded.has(id));
}

export type ValidateDivisionDataFlowInput = {
  divisionId: string;
  organizationId: string;
  shares: DivisionDataFlowSharesJson | null | undefined;
  externalCsDivisionId: string | null | undefined;
  externalSalesDivisionId: string | null | undefined;
  /** Toàn bộ departments (DEPARTMENT/TEAM/DIVISION) cùng org, có type + parentId + function */
  departments: {
    id: string;
    parentId: string | null;
    type: string;
    function: string | null;
  }[];
  computeDivisionId: (deptId: string) => string | null;
};

/** Có ít nhất một đơn vị lá Sales thuộc cây khối (dùng khi strip/lưu `externalMarketingToSalesPct` chỉ trên khối nhận). */
export function divisionHasSalesLeafDepartment(
  divisionId: string,
  departments: ValidateDivisionDataFlowInput['departments'],
  computeDivisionId: (id: string) => string | null
): boolean {
  const inDiv = departments.filter((d) => inDivision(divisionId, d.id, computeDivisionId));
  const leaves = inDiv.filter((d) => d.type !== 'DIVISION' && isLeafDept(d.id, departments));
  return leaves.some((d) => d.function === 'SALES');
}

export function validateDivisionDataFlow(input: ValidateDivisionDataFlowInput): { ok: true } | { ok: false; message: string } {
  const { divisionId, shares, externalCsDivisionId, externalSalesDivisionId, departments, computeDivisionId } = input;

  const inDiv = departments.filter((d) => inDivision(divisionId, d.id, computeDivisionId));
  const leaves = inDiv.filter((d) => d.type !== 'DIVISION' && isLeafDept(d.id, departments));

  const mkt = leaves.filter((d) => d.function === 'MARKETING').map((d) => d.id);
  const sales = leaves.filter((d) => d.function === 'SALES').map((d) => d.id);
  const cs = leaves.filter((d) => d.function === 'CSKH').map((d) => d.id);

  const hasMkt = mkt.length > 0;
  const hasSales = sales.length > 0;
  const hasCs = cs.length > 0;
  const csOnly = !hasMkt && !hasSales && hasCs;

  /** Khối chỉ gom nhánh: MKT và Sales đều chỉ nằm trong cây khối DIVISION con (không lá trực thuộc khối này). */
  const suppressParentMktToSalesRouting =
    leafMktInDivisionSubtree(divisionId, departments).length > 0 &&
    leafSalesInDivisionSubtree(divisionId, departments).length > 0 &&
    leafMktDirectUnderDivisionOnly(divisionId, departments).length === 0 &&
    leafSalesDirectUnderDivisionOnly(divisionId, departments).length === 0;

  if (suppressParentMktToSalesRouting) {
    const mtosSup = shares?.marketingToSalesPct;
    const mtosChildSup = shares?.marketingToSalesChildDivisionPct;
    const extMtosSup = shares?.externalMarketingToSalesPct;
    if (
      (mtosSup && Object.keys(mtosSup).length > 0) ||
      (mtosChildSup && Object.keys(mtosChildSup).length > 0) ||
      (extMtosSup && Object.keys(extMtosSup).length > 0)
    ) {
      return {
        ok: false,
        message:
          'Không lưu tỉ lệ Marketing → Sales trên khối chỉ gom các khối con (MKT và Sales chỉ nằm dưới khối DIVISION con). Cấu hình nối MKT→Sales và % tại khối Marketing / khối Sales tương ứng.',
      };
    }
  }

  const mtos = shares?.marketingToSalesPct;
  if (mtos && Object.keys(mtos).length > 0) {
    if (!hasMkt || !hasSales) {
      return { ok: false, message: 'Tỉ lệ Marketing → Sales chỉ áp dụng khi khối có đủ đơn vị lá Marketing và Sales.' };
    }
    const saleSet = new Set(leafSalesDirectUnderDivisionOnly(divisionId, departments));
    for (const k of Object.keys(mtos)) {
      if (!saleSet.has(k)) {
        return {
          ok: false,
          message: `Mã đơn vị Sales không hợp lệ hoặc nằm trong cây khối con (chia tỉ lệ ở khối con): ${k}`,
        };
      }
      const v = Number(mtos[k]);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: 'Tỉ lệ phải từ 0 đến 100.' };
    }
    if (sumPct(mtos) > 100.01) {
      return { ok: false, message: 'Tổng tỉ lệ Marketing → Sales không được vượt quá 100%.' };
    }
  }

  const mtosChildDiv = shares?.marketingToSalesChildDivisionPct;
  if (mtosChildDiv && Object.keys(mtosChildDiv).length > 0) {
    if (!hasMkt || !hasSales) {
      return {
        ok: false,
        message:
          'Tỉ lệ Marketing → Sales (theo khối con trực tiếp) chỉ áp dụng khi trong cây khối có đơn vị lá Marketing và Sales.',
      };
    }
    const allowedChildDiv = new Set<string>();
    for (const dep of departments) {
      if ((dep.parentId || null) !== divisionId || dep.type !== 'DIVISION') continue;
      const saleLeaves = leafSalesInDivision(dep.id, departments, computeDivisionId);
      if (saleLeaves.length > 0) allowedChildDiv.add(dep.id);
    }
    for (const k of Object.keys(mtosChildDiv)) {
      if (!allowedChildDiv.has(k)) {
        return {
          ok: false,
          message: `Khối con không hợp lệ hoặc không có đơn vị lá Sales trong cây con: ${k}`,
        };
      }
      const v = Number(mtosChildDiv[k]);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: 'Tỉ lệ phải từ 0 đến 100.' };
    }
    if (sumPct(mtosChildDiv) > 100.01) {
      return { ok: false, message: 'Tổng tỉ lệ Marketing → Sales (theo khối con) không được vượt quá 100%.' };
    }
  }

  const stocs = shares?.salesToCsPct;
  if (stocs && Object.keys(stocs).length > 0) {
    if (!hasSales || !hasCs) {
      return { ok: false, message: 'Tỉ lệ Sales → CSKH chỉ áp dụng khi khối có đơn vị lá Sales và CSKH.' };
    }
    const csSet = new Set(cs);
    for (const k of Object.keys(stocs)) {
      if (!csSet.has(k)) return { ok: false, message: `Mã đơn vị CSKH không thuộc khối: ${k}` };
      const v = Number(stocs[k]);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: 'Tỉ lệ phải từ 0 đến 100.' };
    }
    if (sumPct(stocs) > 100.01) {
      return { ok: false, message: 'Tổng tỉ lệ Sales → CSKH không được vượt quá 100%.' };
    }
  }

  const stocsChildDiv = shares?.salesToCsChildDivisionPct;
  if (stocsChildDiv && Object.keys(stocsChildDiv).length > 0) {
    /** Toàn cây khối (theo parent_id), không chỉ đơn vị có computeDivisionId = khối này — tránh từ chối khi CSKH chỉ nằm dưới khối DIVISION con. */
    const hasMktSt = leafMktInDivisionSubtree(divisionId, departments).length > 0;
    const hasSalesSt = leafSalesInDivisionSubtree(divisionId, departments).length > 0;
    const hasCsSt = leafCsKhInDivisionSubtree(divisionId, departments).length > 0;
    const csOnlySubtree = !hasMktSt && !hasSalesSt && hasCsSt;
    const allowChildCs = hasCsSt && (csOnlySubtree || (hasSalesSt && hasCsSt));
    if (!allowChildCs) {
      return {
        ok: false,
        message:
          'Tỉ lệ theo khối con trực tiếp (có CSKH) chỉ áp dụng khi trong cây khối (gồm khối con) có đơn vị lá CSKH và (có Sales, hoặc khối chỉ CSKH).',
      };
    }
    const allowedChildDiv = new Set<string>();
    for (const dep of departments) {
      if ((dep.parentId || null) !== divisionId || dep.type !== 'DIVISION') continue;
      const csLeaves = leafCsKhInDivision(dep.id, departments, computeDivisionId);
      if (csLeaves.length > 0) allowedChildDiv.add(dep.id);
    }
    for (const k of Object.keys(stocsChildDiv)) {
      if (!allowedChildDiv.has(k)) {
        return {
          ok: false,
          message: `Khối con không hợp lệ hoặc không có đơn vị lá CSKH trong cây con: ${k}`,
        };
      }
      const v = Number(stocsChildDiv[k]);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: 'Tỉ lệ phải từ 0 đến 100.' };
    }
    if (sumPct(stocsChildDiv) > 100.01) {
      return { ok: false, message: 'Tổng tỉ lệ Sales → CSKH (theo khối con) không được vượt quá 100%.' };
    }
  }

  const csOnlyMap = shares?.csOnlyPct;
  if (csOnlyMap && Object.keys(csOnlyMap).length > 0) {
    if (!csOnly) {
      return { ok: false, message: 'Tỉ lệ giữa các CSKH chỉ áp dụng khi khối chỉ có đơn vị CSKH (không có Marketing/Sales).' };
    }
    const csSet = new Set(leafCsKhDirectUnderDivisionOnly(divisionId, departments, computeDivisionId));
    for (const k of Object.keys(csOnlyMap)) {
      if (!csSet.has(k)) {
        return {
          ok: false,
          message: `Mã đơn vị CSKH không hợp lệ hoặc nằm trong cây khối con (chia tỉ lệ ở khối con): ${k}`,
        };
      }
      const v = Number(csOnlyMap[k]);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: 'Tỉ lệ phải từ 0 đến 100.' };
    }
    if (sumPct(csOnlyMap) > 100.01) {
      return { ok: false, message: 'Tổng tỉ lệ giữa các đơn vị CSKH không được vượt quá 100%.' };
    }
  }

  /** Chỉ cấu hình trên khối nhận (có đơn vị lá Sales); key = đơn vị lá Sales thuộc chính khối đó. */
  const extMtos = shares?.externalMarketingToSalesPct;
  if (extMtos && Object.keys(extMtos).length > 0) {
    if (!hasSales) {
      return {
        ok: false,
        message:
          'Tỉ lệ Marketing → Sales (luồng từ khối đồng cấp có MKT) chỉ cấu hình trên khối nhận có đơn vị lá Sales.',
      };
    }
    const saleSet = new Set(leafSalesDirectUnderDivisionOnly(divisionId, departments));
    for (const k of Object.keys(extMtos)) {
      if (!saleSet.has(k)) {
        return {
          ok: false,
          message: `Mã đơn vị Sales không hợp lệ hoặc nằm trong cây khối con (chia tỉ lệ ở khối con): ${k}`,
        };
      }
      const v = Number(extMtos[k]);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: 'Tỉ lệ phải từ 0 đến 100.' };
    }
    if (sumPct(extMtos) > 100.01) {
      return { ok: false, message: 'Tổng tỉ lệ Marketing → Sales (luồng từ khối đồng cấp) không được vượt quá 100%.' };
    }
  }

  if (externalSalesDivisionId) {
    if (externalSalesDivisionId === divisionId) {
      return { ok: false, message: 'Không chọn chính khối làm khối Sales ngoài.' };
    }
    if (!isSiblingDepartment(divisionId, externalSalesDivisionId, departments)) {
      return { ok: false, message: 'Khối Sales ngoài phải là đơn vị đồng cấp (cùng nút cha).' };
    }
    if (hasSales) {
      return { ok: false, message: 'Không chọn khối Sales ngoài khi khối đã có đơn vị lá Sales.' };
    }
    const extSaleIds = leafSalesInDivision(externalSalesDivisionId, departments, computeDivisionId);
    if (extSaleIds.length === 0) {
      return { ok: false, message: 'Khối Sales ngoài phải có ít nhất một đơn vị lá Sales.' };
    }
  }

  if (externalCsDivisionId) {
    if (externalCsDivisionId === divisionId) {
      return { ok: false, message: 'Không chọn chính khối làm khối đích CS ngoài.' };
    }
    if (!isSiblingDepartment(divisionId, externalCsDivisionId, departments)) {
      return { ok: false, message: 'Khối đích CS ngoài phải là đơn vị đồng cấp (cùng nút cha).' };
    }
  }

  return { ok: true };
}
