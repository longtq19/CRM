import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import type { Department, Division, DivisionDataFlowShares } from '../types';
import { translate } from '../utils/dictionary';

export function getLeafDepartmentsInDivision(divisionId: string, all: Department[]): Department[] {
  const inDiv = all.filter((d) => d.divisionId === divisionId);
  const hasChild = (id: string) => inDiv.some((c) => c.parentId === id);
  return inDiv.filter((d) => !hasChild(d.id));
}

/** Toàn bộ id khối (DIVISION) trong cây gốc tại divisionId — gồm khối con. */
export function collectDivisionSubtreeIds(divisionId: string, allDivisions: Division[]): Set<string> {
  const set = new Set<string>([divisionId]);
  const queue = [divisionId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const d of allDivisions) {
      if (d.parentId === id) {
        set.add(d.id);
        queue.push(d.id);
      }
    }
  }
  return set;
}

/** Gộp nút DIVISION + đơn vị (cùng bảng DB) để duyệt cây theo parent_id — khớp collectSubtreeDepartmentIds / leadRoutingService. */
function buildFlowTreeNodesForDivision(departments: Department[], allDivisions: Division[]): { id: string; parentId: string | null }[] {
  const out: { id: string; parentId: string | null }[] = [];
  for (const d of allDivisions) {
    out.push({ id: d.id, parentId: d.parentId ?? null });
  }
  for (const d of departments) {
    out.push({ id: d.id, parentId: d.parentId ?? null });
  }
  return out;
}

function collectSubtreeDeptIdsFromNodes(
  rootId: string,
  nodes: { id: string; parentId: string | null }[]
): Set<string> {
  const set = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of nodes) {
      if ((n.parentId || null) === id && !set.has(n.id)) {
        set.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return set;
}

function isLeafUnitInNodeTree(id: string, nodes: { id: string; parentId: string | null }[]): boolean {
  return !nodes.some((n) => (n.parentId || null) === id);
}

/** Lá chức năng trực thuộc khối (theo parent_id), không gồm lá nằm trong cây khối DIVISION con — đồng bộ divisionDataFlowService / leadRoutingService. */
function getLeafDepartmentsDirectUnderDivisionOnlyByParentTree(
  divisionId: string,
  departments: Department[],
  allDivisions: Division[],
  func: 'MARKETING' | 'SALES' | 'CSKH'
): Department[] {
  const nodes = buildFlowTreeNodesForDivision(departments, allDivisions);
  const subtree = collectSubtreeDeptIdsFromNodes(divisionId, nodes);
  const childDivs = allDivisions.filter((d) => (d.parentId || null) === divisionId);
  const excluded = new Set<string>();
  for (const c of childDivs) {
    for (const id of collectSubtreeDeptIdsFromNodes(c.id, nodes)) excluded.add(id);
  }
  return departments.filter(
    (d) =>
      subtree.has(d.id) &&
      !excluded.has(d.id) &&
      isLeafUnitInNodeTree(d.id, nodes) &&
      d.function === func
  );
}

/** Đơn vị lá thuộc khối hoặc bất kỳ khối con (divisionId gán trên đơn vị). */
export function getLeafDepartmentsInDivisionSubtree(
  divisionId: string,
  departments: Department[],
  allDivisions: Division[]
): Department[] {
  const subDivIds = collectDivisionSubtreeIds(divisionId, allDivisions);
  const hasChild = (id: string) => departments.some((c) => c.parentId === id);
  return departments.filter((d) => subDivIds.has(d.divisionId) && !hasChild(d.id));
}

/** Đơn vị lá CSKH trực thuộc khối (không nằm trong cây khối DIVISION con) — đồng bộ leadRoutingService / validate. */
export function getCsKhLeafDepartmentsDirectUnderDivisionOnly(
  divisionId: string,
  departments: Department[],
  allDivisions: Division[]
): Department[] {
  return getLeafDepartmentsDirectUnderDivisionOnlyByParentTree(divisionId, departments, allDivisions, 'CSKH');
}

/** Đơn vị lá Sales trực thuộc khối (không nằm trong cây khối DIVISION con) — đồng bộ leadRoutingService / validate. */
export function getSalesLeafDepartmentsDirectUnderDivisionOnly(
  divisionId: string,
  departments: Department[],
  allDivisions: Division[]
): Department[] {
  return getLeafDepartmentsDirectUnderDivisionOnlyByParentTree(divisionId, departments, allDivisions, 'SALES');
}

/** Đơn vị lá Marketing trực thuộc khối (không nằm trong cây khối DIVISION con). */
export function getMktLeafDepartmentsDirectUnderDivisionOnly(
  divisionId: string,
  departments: Department[],
  allDivisions: Division[]
): Department[] {
  return getLeafDepartmentsDirectUnderDivisionOnlyByParentTree(divisionId, departments, allDivisions, 'MARKETING');
}

function sumPctValues(m: Record<string, number>): number {
  let s = 0;
  for (const v of Object.values(m)) {
    const n = Number(v);
    if (Number.isFinite(n)) s += n;
  }
  return Math.round(s * 100) / 100;
}

function parsePctMap(rec: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    const t = String(v).trim();
    if (t === '') continue;
    const n = Number(t);
    if (!Number.isFinite(n)) continue;
    out[k] = n;
  }
  return out;
}

/** Khung «nối mặc định» — đồng cấp duy nhất hoặc nối về khối cha (đồng nhất UI). */
const FLOW_DEFAULT_LOCK_CARD_CLASS =
  'w-full max-w-md rounded border border-slate-200 bg-white px-3 py-2.5 text-sm text-secondary shadow-sm';

type Props = {
  division: Division;
  departments: Department[];
  allDivisions: Division[];
  canEdit: boolean;
  onSaved: (d: Division) => void;
  showNotification: (msg: string, type?: 'success' | 'error') => void;
};

export default function DivisionDataFlowPanel({
  division,
  departments,
  allDivisions,
  canEdit,
  onSaved,
  showNotification,
}: Props) {
  const leaves = useMemo(
    () => getLeafDepartmentsInDivisionSubtree(division.id, departments, allDivisions),
    [division.id, departments, allDivisions]
  );
  const sales = useMemo(() => leaves.filter((d) => d.function === 'SALES'), [leaves]);
  const salesDirectOnly = useMemo(
    () => getSalesLeafDepartmentsDirectUnderDivisionOnly(division.id, departments, allDivisions),
    [division.id, departments, allDivisions]
  );
  const mktDirectOnly = useMemo(
    () => getMktLeafDepartmentsDirectUnderDivisionOnly(division.id, departments, allDivisions),
    [division.id, departments, allDivisions]
  );
  const cs = useMemo(() => leaves.filter((d) => d.function === 'CSKH'), [leaves]);
  const csDirectOnly = useMemo(
    () => getCsKhLeafDepartmentsDirectUnderDivisionOnly(division.id, departments, allDivisions),
    [division.id, departments, allDivisions]
  );
  const hasMkt = useMemo(() => leaves.some((d) => d.function === 'MARKETING'), [leaves]);
  const hasSales = sales.length > 0;
  const hasCs = cs.length > 0;
  const csOnly = !hasMkt && !hasSales && hasCs;

  const peerOptions = useMemo(() => {
    const siblingDivisions = allDivisions.filter(
      (d) => d.id !== division.id && (d.parentId || null) === (division.parentId || null)
    );

    const withCsLeaf = siblingDivisions.filter((d) =>
      getLeafDepartmentsInDivisionSubtree(d.id, departments, allDivisions).some((leaf) => leaf.function === 'CSKH')
    );

    const byName = new Set<string>();
    const uniqueByName = withCsLeaf.filter((d) => {
      const key = String(d.name || '')
        .trim()
        .toLowerCase();
      if (!key) return true;
      if (byName.has(key)) return false;
      byName.add(key);
      return true;
    });

    return uniqueByName.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' })
    );
  }, [allDivisions, division.id, division.parentId, departments]);

  const peerOptionsSales = useMemo(() => {
    const siblingDivisions = allDivisions.filter(
      (d) => d.id !== division.id && (d.parentId || null) === (division.parentId || null)
    );
    const withSalesLeaf = siblingDivisions.filter((d) =>
      getLeafDepartmentsInDivisionSubtree(d.id, departments, allDivisions).some((leaf) => leaf.function === 'SALES')
    );
    const byName = new Set<string>();
    const uniqueByName = withSalesLeaf.filter((d) => {
      const key = String(d.name || '')
        .trim()
        .toLowerCase();
      if (!key) return true;
      if (byName.has(key)) return false;
      byName.add(key);
      return true;
    });
    return uniqueByName.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' })
    );
  }, [allDivisions, division.id, division.parentId, departments]);

  /** Khối DIVISION con trực tiếp có ít nhất một đơn vị lá Sales trong cây con. */
  const directChildDivisionsWithSalesLeaf = useMemo(
    () =>
      allDivisions.filter((d) => {
        if ((d.parentId || null) !== division.id) return false;
        return getLeafDepartmentsInDivisionSubtree(d.id, departments, allDivisions).some(
          (leaf) => leaf.function === 'SALES'
        );
      }),
    [allDivisions, division.id, departments]
  );

  /** Khối DIVISION con trực tiếp có ít nhất một đơn vị lá CSKH trong cây con. */
  const directChildDivisionsWithCsLeaf = useMemo(
    () =>
      allDivisions.filter((d) => {
        if ((d.parentId || null) !== division.id) return false;
        return getLeafDepartmentsInDivisionSubtree(d.id, departments, allDivisions).some(
          (leaf) => leaf.function === 'CSKH'
        );
      }),
    [allDivisions, division.id, departments]
  );

  /** Khối cha trực tiếp trong danh sách khối (không phải nút COMPANY). */
  const parentDivisionInTree = useMemo(() => {
    if (!division.parentId) return null;
    return allDivisions.find((d) => d.id === division.parentId) ?? null;
  }, [allDivisions, division.parentId]);

  /** Chỉ một khối đồng cấp có Sales/CSKH — nối cố định, không cho chọn khác. */
  const lockedSinglePeerSalesId = useMemo(
    () => (peerOptionsSales.length === 1 ? peerOptionsSales[0]!.id : null),
    [peerOptionsSales]
  );
  const lockedSinglePeerCsId = useMemo(
    () => (peerOptions.length === 1 ? peerOptions[0]!.id : null),
    [peerOptions]
  );

  const sharesKey = JSON.stringify(division.dataFlowShares ?? null);
  const salesKey = sales.map((x) => x.id).join(',');
  const salesDirectKey = salesDirectOnly.map((x) => x.id).join(',');
  const csKey = cs.map((x) => x.id).join(',');
  const csDirectKey = csDirectOnly.map((x) => x.id).join(',');

  const [marketingToSalesPct, setMtos] = useState<Record<string, string>>({});
  const [salesToCsPct, setStocs] = useState<Record<string, string>>({});
  const [csOnlyPct, setCsOnlyPct] = useState<Record<string, string>>({});
  const [externalCsDivisionId, setExternalCsDivisionId] = useState('');
  const [externalSalesDivisionId, setExternalSalesDivisionId] = useState('');
  const [externalMarketingToSalesPct, setExtMtos] = useState<Record<string, string>>({});
  const [marketingToSalesChildDivisionPct, setMtosChild] = useState<Record<string, string>>({});
  const [salesToCsChildDivisionPct, setStocsChild] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /** Có khối đồng cấp (có MKT) trỏ `externalSalesDivisionId` vào khối hiện tại — tỉ lệ % chia Sales nằm trên khối nhận (có Sales). */
  const showReceiverExternalMktPct = useMemo(
    () =>
      hasSales &&
      allDivisions.some(
        (d) =>
          d.id !== division.id &&
          (d.parentId || null) === (division.parentId || null) &&
          d.externalSalesDivisionId === division.id
      ),
    [allDivisions, division.id, division.parentId, hasSales]
  );

  useEffect(() => {
    const s = (division.dataFlowShares || {}) as DivisionDataFlowShares;
    setStocs(
      Object.fromEntries(
        cs.map((x) => [x.id, s.salesToCsPct?.[x.id] != null ? String(s.salesToCsPct![x.id]) : ''])
      )
    );
    setExternalCsDivisionId(division.externalCsDivisionId || '');
    setExternalSalesDivisionId(division.externalSalesDivisionId || '');
  }, [division.id, division.externalCsDivisionId, division.externalSalesDivisionId, sharesKey, csKey]);

  useEffect(() => {
    const s = (division.dataFlowShares || {}) as DivisionDataFlowShares;
    setMtos(
      Object.fromEntries(
        salesDirectOnly.map((x) => [
          x.id,
          s.marketingToSalesPct?.[x.id] != null ? String(s.marketingToSalesPct![x.id]) : '',
        ])
      )
    );
  }, [division.id, sharesKey, salesDirectKey]);

  useEffect(() => {
    const s = (division.dataFlowShares || {}) as DivisionDataFlowShares;
    setCsOnlyPct(
      Object.fromEntries(
        csDirectOnly.map((x) => [x.id, s.csOnlyPct?.[x.id] != null ? String(s.csOnlyPct![x.id]) : ''])
      )
    );
  }, [division.id, sharesKey, csDirectKey]);

  const childSalesKey = directChildDivisionsWithSalesLeaf.map((x) => x.id).join(',');
  const childCsKey = directChildDivisionsWithCsLeaf.map((x) => x.id).join(',');

  useEffect(() => {
    const s = (division.dataFlowShares || {}) as DivisionDataFlowShares;
    setMtosChild(
      Object.fromEntries(
        directChildDivisionsWithSalesLeaf.map((x) => [
          x.id,
          s.marketingToSalesChildDivisionPct?.[x.id] != null
            ? String(s.marketingToSalesChildDivisionPct![x.id])
            : '',
        ])
      )
    );
  }, [division.id, sharesKey, childSalesKey]);

  useEffect(() => {
    const s = (division.dataFlowShares || {}) as DivisionDataFlowShares;
    setStocsChild(
      Object.fromEntries(
        directChildDivisionsWithCsLeaf.map((x) => [
          x.id,
          s.salesToCsChildDivisionPct?.[x.id] != null ? String(s.salesToCsChildDivisionPct![x.id]) : '',
        ])
      )
    );
  }, [division.id, sharesKey, childCsKey]);

  useEffect(() => {
    if (!showReceiverExternalMktPct) return;
    const s = (division.dataFlowShares || {}) as DivisionDataFlowShares;
    setExtMtos(
      Object.fromEntries(
        salesDirectOnly.map((x) => [
          x.id,
          s.externalMarketingToSalesPct?.[x.id] != null ? String(s.externalMarketingToSalesPct![x.id]) : '',
        ])
      )
    );
  }, [division.id, sharesKey, salesDirectKey, showReceiverExternalMktPct]);

  useEffect(() => {
    if (!hasSales || hasCs) return;
    if (peerOptions.length === 1) {
      setExternalCsDivisionId(peerOptions[0]!.id);
      return;
    }
    if (!externalCsDivisionId) return;
    const stillValid = peerOptions.some((d) => d.id === externalCsDivisionId);
    if (!stillValid) setExternalCsDivisionId('');
  }, [hasSales, hasCs, externalCsDivisionId, peerOptions]);

  useEffect(() => {
    if (!hasMkt || hasSales) return;
    if (peerOptionsSales.length === 1) {
      setExternalSalesDivisionId(peerOptionsSales[0]!.id);
      return;
    }
    if (!externalSalesDivisionId) return;
    const stillValid = peerOptionsSales.some((d) => d.id === externalSalesDivisionId);
    if (!stillValid) setExternalSalesDivisionId('');
  }, [hasMkt, hasSales, externalSalesDivisionId, peerOptionsSales]);

  const mtosSum = sumPctValues(parsePctMap(marketingToSalesPct));
  const stocsSum = sumPctValues(parsePctMap(salesToCsPct));
  const csonlySum = sumPctValues(parsePctMap(csOnlyPct));
  const extMtosSum = sumPctValues(parsePctMap(externalMarketingToSalesPct));
  const mtosChildSum = sumPctValues(parsePctMap(marketingToSalesChildDivisionPct));
  const stocsChildSum = sumPctValues(parsePctMap(salesToCsChildDivisionPct));

  const showMtos = hasMkt && hasSales;
  /**
   * Khối cha chỉ gom cây con: cả MKT và Sales đều chỉ nằm dưới khối DIVISION con (không có lá MKT/Sales trực thuộc khối này).
   * Không hiển thị / không lưu phân tỉ lệ MKT→Sales tại đây (cấu hình ở khối Marketing + khối Sales con).
   */
  const suppressMktToSalesRoutingAtThisBlock =
    showMtos && mktDirectOnly.length === 0 && salesDirectOnly.length === 0;
  /** MKT → đơn vị Sales lá trực thuộc khối (không gồm Sales trong cây khối con). */
  const showMtosLeafSection =
    showMtos && salesDirectOnly.length > 0 && !suppressMktToSalesRoutingAtThisBlock;
  /** MKT đồng cấp → Sales trên khối nhận: chỉ ô % cho đơn vị Sales lá trực thuộc khối. */
  const showReceiverExternalMktPctLeafSection =
    showReceiverExternalMktPct &&
    salesDirectOnly.length > 0 &&
    !suppressMktToSalesRoutingAtThisBlock;
  const showStocs = hasSales && hasCs && !csOnly;
  const showMtosChildSection =
    showMtos &&
    directChildDivisionsWithSalesLeaf.length >= 1 &&
    !suppressMktToSalesRoutingAtThisBlock;
  const showStocsChildSection = showStocs && directChildDivisionsWithCsLeaf.length >= 1;
  /** Khối chỉ CSKH: chia trước cho khối DIVISION con trực tiếp có CSKH (cùng key `salesToCsChildDivisionPct`). */
  const showCsOnlyChildSection = csOnly && directChildDivisionsWithCsLeaf.length >= 1;
  /** Chỉ đơn vị lá CSKH trực thuộc khối (không nằm trong cây khối con). */
  const showCsOnlyLeafSection = csOnly && csDirectOnly.length > 0;
  const showCsOnly = csOnly;
  /** Chỉ cần nối CS sang khối đồng cấp khi có Sales trong khối nhưng chưa có CSKH lá (Sales chưa được nối tới CSKH). */
  const showExternalCs = hasSales && !hasCs;
  const showExternalSales = hasMkt && !hasSales;
  /** Không có khối đồng cấp đủ điều kiện — gợi ý mặc định «nối về khối cha» (value rỗng = không gán external trên khối này). */
  const defaultViaParentSales =
    Boolean(parentDivisionInTree) && peerOptionsSales.length === 0 && showExternalSales;
  const defaultViaParentCs =
    Boolean(parentDivisionInTree) && peerOptions.length === 0 && showExternalCs;
  /**
   * Nút «Lưu luồng phân data»: ẩn khi chỉ còn khung nối mặc định về khối cha (không gán external, không có ô tỉ lệ).
   * Các trường hợp còn lại (đồng cấp đơn, chọn khối, nhập %, MKT→Sales/CS trong khối, …) vẫn hiện Lưu.
   */
  const salesExtNeedsSave = showExternalSales && !defaultViaParentSales;
  const csExtNeedsSave = showExternalCs && !defaultViaParentCs;
  const showFlowSaveButton =
    showMtosChildSection ||
    showMtosLeafSection ||
    showStocs ||
    showCsOnlyLeafSection ||
    showCsOnlyChildSection ||
    salesExtNeedsSave ||
    csExtNeedsSave ||
    showStocsChildSection ||
    showReceiverExternalMktPctLeafSection;
  /** Đã chọn khối Sales đích (đang sửa hoặc đã lưu) — không hiện khối «nối luồng lần đầu», chỉ còn tỉ lệ / đổi đích. */
  const linkedExternalSales =
    Boolean(lockedSinglePeerSalesId) ||
    Boolean(String(externalSalesDivisionId || '').trim()) ||
    Boolean(division.externalSalesDivisionId);

  const hasAnyFlowSection =
    showMtosChildSection ||
    showMtosLeafSection ||
    showReceiverExternalMktPctLeafSection ||
    showStocs ||
    showStocsChildSection ||
    showCsOnlyChildSection ||
    showCsOnlyLeafSection ||
    showExternalCs ||
    showExternalSales ||
    showReceiverExternalMktPct;

  if (!hasAnyFlowSection) return null;

  const savedShares = (division.dataFlowShares || {}) as DivisionDataFlowShares;

  const save = async () => {
    setSaving(true);
    try {
      const dataFlowShares: DivisionDataFlowShares = {};
      if (showMtosLeafSection) {
        const m = parsePctMap(marketingToSalesPct);
        if (Object.keys(m).length) dataFlowShares.marketingToSalesPct = m;
      }
      if (showMtosChildSection) {
        const m = parsePctMap(marketingToSalesChildDivisionPct);
        if (Object.keys(m).length) dataFlowShares.marketingToSalesChildDivisionPct = m;
      }
      if (showStocs) {
        const m = parsePctMap(salesToCsPct);
        if (Object.keys(m).length) dataFlowShares.salesToCsPct = m;
      }
      if (showStocsChildSection || showCsOnlyChildSection) {
        const m = parsePctMap(salesToCsChildDivisionPct);
        if (Object.keys(m).length) dataFlowShares.salesToCsChildDivisionPct = m;
      }
      if (showCsOnlyLeafSection) {
        const m = parsePctMap(csOnlyPct);
        if (Object.keys(m).length) dataFlowShares.csOnlyPct = m;
      }
      if (showReceiverExternalMktPctLeafSection) {
        const m = parsePctMap(externalMarketingToSalesPct);
        if (Object.keys(m).length) dataFlowShares.externalMarketingToSalesPct = m;
      }
      const salesExtResolved = lockedSinglePeerSalesId || externalSalesDivisionId.trim() || null;

      const body: {
        dataFlowShares: DivisionDataFlowShares;
        externalCsDivisionId?: string | null;
        externalSalesDivisionId?: string | null;
      } = { dataFlowShares };

      const csExtResolved = lockedSinglePeerCsId || externalCsDivisionId.trim() || null;

      /** Chỉ ghi FK ngoài khi UI có phần nối tương ứng — tránh gán nhầm lockedSinglePeer* cho khối chỉ CSKH / chỉ cấu hình %. */
      if (hasCs) body.externalCsDivisionId = null;
      else if (showExternalCs) body.externalCsDivisionId = csExtResolved;
      else body.externalCsDivisionId = null;

      if (hasSales) body.externalSalesDivisionId = null;
      else if (showExternalSales) body.externalSalesDivisionId = salesExtResolved;
      else body.externalSalesDivisionId = null;

      const updated = (await apiClient.put(`/hr/divisions/${division.id}/data-flow`, body)) as Division;
      onSaved(updated);
      showNotification('Đã lưu luồng phân data');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Không lưu được';
      showNotification(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled =
    saving ||
    (showMtosLeafSection && mtosSum > 100.01) ||
    stocsSum > 100.01 ||
    (showReceiverExternalMktPctLeafSection && extMtosSum > 100.01) ||
    (showMtosChildSection && mtosChildSum > 100.01) ||
    ((showStocsChildSection || showCsOnlyChildSection) && stocsChildSum > 100.01) ||
    (showCsOnlyLeafSection && csonlySum > 100.01);

  /** Có ít nhất một nhóm nhập % trên khối này — mới hiện dòng mô tả về % / README; khối chỉ «cho» (chỉ nối đồng cấp) không hiện. */
  const showIntroPercentExplanation =
    showMtosChildSection ||
    showMtosLeafSection ||
    showStocs ||
    showStocsChildSection ||
    showCsOnlyChildSection ||
    showCsOnlyLeafSection ||
    showReceiverExternalMktPctLeafSection;

  return (
    <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-100 text-sm space-y-2">
      <div className="font-medium text-secondary text-sm">Phân luồng (MKT → Sales → CSKH)</div>
      {showIntroPercentExplanation && (
        <p className="text-[11px] text-secondary/65 leading-snug">
          <strong>Khối nhận</strong> luồng mới nhập % và được đếm cân bằng theo thời gian. Khối chỉ nối đích mặc định không nhập %. 0–100%, tổng mỗi nhóm ≤ 100%. Chi tiết: README.
        </p>
      )}

      {showMtosChildSection && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
            MKT → khối con trực tiếp (có Sales) %
          </div>
          {canEdit ? (
            <>
              {directChildDivisionsWithSalesLeaf.map((u) => (
                <label key={u.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-[140px] text-secondary">{translate(u.name)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-24 border rounded px-2 py-1 text-sm"
                    value={marketingToSalesChildDivisionPct[u.id] ?? ''}
                    onChange={(e) => setMtosChild((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <span className="text-xs text-secondary/60">%</span>
                </label>
              ))}
              <div className={mtosChildSum > 100 ? 'text-xs text-red-600 font-medium' : 'text-xs text-secondary/60'}>
                Tổng: {mtosChildSum}% {mtosChildSum > 100 ? '(vượt 100%)' : ''}
              </div>
            </>
          ) : (
            <div className="space-y-1 pl-1">
              {directChildDivisionsWithSalesLeaf.map((u) => {
                const pct = savedShares.marketingToSalesChildDivisionPct?.[u.id];
                return (
                  <div key={u.id} className="flex justify-between gap-2 text-xs text-secondary/90">
                    <span className="truncate">{translate(u.name)}</span>
                    <span className="tabular-nums font-medium">
                      {pct != null && Number.isFinite(pct) ? `${pct}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showMtosLeafSection && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
            MKT → đơn vị Sales trực thuộc khối %
          </div>
          {canEdit ? (
            <>
              {salesDirectOnly.map((u) => (
                <label key={u.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-[140px] text-secondary">{translate(u.name)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-24 border rounded px-2 py-1 text-sm"
                    value={marketingToSalesPct[u.id] ?? ''}
                    onChange={(e) => setMtos((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <span className="text-xs text-secondary/60">%</span>
                </label>
              ))}
              <div className={mtosSum > 100 ? 'text-xs text-red-600 font-medium' : 'text-xs text-secondary/60'}>
                Tổng: {mtosSum}% {mtosSum > 100 ? '(vượt 100%)' : ''}
              </div>
            </>
          ) : (
            <div className="space-y-1 pl-1">
              {salesDirectOnly.map((u) => {
                const pct = savedShares.marketingToSalesPct?.[u.id];
                return (
                  <div key={u.id} className="flex justify-between gap-2 text-xs text-secondary/90">
                    <span className="truncate">{translate(u.name)}</span>
                    <span className="tabular-nums font-medium">
                      {pct != null && Number.isFinite(pct) ? `${pct}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showReceiverExternalMktPctLeafSection && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
            MKT đồng cấp → Sales (khối nhận) %
          </div>
          {canEdit ? (
            <>
              {salesDirectOnly.map((u) => (
                <label key={u.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-[140px] text-secondary">{translate(u.name)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-24 border rounded px-2 py-1 text-sm"
                    value={externalMarketingToSalesPct[u.id] ?? ''}
                    onChange={(e) => setExtMtos((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <span className="text-xs text-secondary/60">%</span>
                </label>
              ))}
              <div className={extMtosSum > 100 ? 'text-xs text-red-600 font-medium' : 'text-xs text-secondary/60'}>
                Tổng: {extMtosSum}% {extMtosSum > 100 ? '(vượt 100%)' : ''}
              </div>
            </>
          ) : (
            <div className="space-y-1 pl-1">
              {salesDirectOnly.map((u) => {
                const pct = savedShares.externalMarketingToSalesPct?.[u.id];
                return (
                  <div key={u.id} className="flex justify-between gap-2 text-xs text-secondary/90">
                    <span className="truncate">{translate(u.name)}</span>
                    <span className="tabular-nums font-medium">
                      {pct != null && Number.isFinite(pct) ? `${pct}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showExternalSales && (
        <div className="space-y-2">
          {!linkedExternalSales ? (
            <>
              <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
                Chưa có Sales — nối sang khối đồng cấp
              </div>
              <p className="text-[11px] text-secondary/65">
                {defaultViaParentSales && parentDivisionInTree
                  ? 'Luồng theo khối cha (khung dưới).'
                  : 'Chọn khối có Sales. % đích: mở khối Sales nhận.'}
              </p>
            </>
          ) : (
            <>
              <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
                Đích Sales (đã nối)
              </div>
              <p className="text-[11px] text-secondary/65">
                {lockedSinglePeerSalesId
                  ? 'Một khối đồng cấp có Sales — nối cố định. % đích: khối Sales nhận.'
                  : 'Chọn khối đích. % đích: khối Sales nhận.'}
              </p>
            </>
          )}
          {canEdit ? (
            <>
              {lockedSinglePeerSalesId && peerOptionsSales[0] ? (
                <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                    Nối mặc định (không chọn khác)
                  </div>
                  <div className="mt-1">
                    Khối Sales đích: <strong>{translate(peerOptionsSales[0].name)}</strong>
                  </div>
                  <p className="mt-1 text-xs text-secondary/65">Chỉ có một khối đồng cấp có đơn vị lá Sales.</p>
                </div>
              ) : defaultViaParentSales && parentDivisionInTree ? (
                <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                    Nối mặc định (không chọn khác)
                  </div>
                  <div className="mt-1">
                    Luồng qua khối cha: <strong>{translate(parentDivisionInTree.name)}</strong>
                  </div>
                  <p className="mt-1 text-xs text-secondary/65">
                    Không có khối đồng cấp có Sales — không trỏ khối ngoài trên khối này; cấu hình nối Sales (nếu cần) tại khối
                    cha.
                  </p>
                </div>
              ) : (
                <select
                  className="w-full max-w-md border rounded px-2 py-2 text-sm bg-white"
                  value={externalSalesDivisionId}
                  onChange={(e) => setExternalSalesDivisionId(e.target.value)}
                >
                  <option value="">— Không chọn —</option>
                  {peerOptionsSales.map((d) => (
                    <option key={d.id} value={d.id}>
                      {translate(d.name)}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <div className="text-xs text-secondary/90 space-y-1">
              {division.externalSalesDivision ? (
                <div>Khối Sales ngoài: {translate(division.externalSalesDivision.name)}</div>
              ) : lockedSinglePeerSalesId && peerOptionsSales[0] ? (
                <div className="space-y-2">
                  <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                      Nối mặc định (không chọn khác)
                    </div>
                    <div className="mt-1">
                      Khối Sales đích: <strong>{translate(peerOptionsSales[0].name)}</strong>
                    </div>
                    <p className="mt-1 text-xs text-secondary/65">Chỉ một khối đồng cấp có Sales — không đổi được.</p>
                  </div>
                </div>
              ) : defaultViaParentSales && parentDivisionInTree ? (
                <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                    Nối mặc định (không chọn khác)
                  </div>
                  <div className="mt-1">
                    Luồng qua khối cha: <strong>{translate(parentDivisionInTree.name)}</strong>
                  </div>
                  <p className="mt-1 text-xs text-secondary/65">
                    Không có khối đồng cấp có Sales — không trỏ khối ngoài trên khối này.
                  </p>
                </div>
              ) : (
                <div>Chưa chọn khối Sales ngoài.</div>
              )}
            </div>
          )}
        </div>
      )}

      {(showStocsChildSection || showCsOnlyChildSection) && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
            {showStocsChildSection ? 'Sales → khối con (có CSKH) %' : 'CSKH → khối con trực tiếp (có CSKH) %'}
          </div>
          {canEdit ? (
            <>
              {directChildDivisionsWithCsLeaf.map((u) => (
                <label key={u.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-[140px] text-secondary">{translate(u.name)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-24 border rounded px-2 py-1 text-sm"
                    value={salesToCsChildDivisionPct[u.id] ?? ''}
                    onChange={(e) => setStocsChild((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <span className="text-xs text-secondary/60">%</span>
                </label>
              ))}
              <div className={stocsChildSum > 100 ? 'text-xs text-red-600 font-medium' : 'text-xs text-secondary/60'}>
                Tổng: {stocsChildSum}% {stocsChildSum > 100 ? '(vượt 100%)' : ''}
              </div>
            </>
          ) : (
            <div className="space-y-1 pl-1">
              {directChildDivisionsWithCsLeaf.map((u) => {
                const pct = savedShares.salesToCsChildDivisionPct?.[u.id];
                return (
                  <div key={u.id} className="flex justify-between gap-2 text-xs text-secondary/90">
                    <span className="truncate">{translate(u.name)}</span>
                    <span className="tabular-nums font-medium">
                      {pct != null && Number.isFinite(pct) ? `${pct}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showStocs && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
            Sales → đơn vị CSKH (cùng khối) %
          </div>
          {canEdit ? (
            <>
              {cs.map((u) => (
                <label key={u.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-[140px] text-secondary">{translate(u.name)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-24 border rounded px-2 py-1 text-sm"
                    value={salesToCsPct[u.id] ?? ''}
                    onChange={(e) => setStocs((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <span className="text-xs text-secondary/60">%</span>
                </label>
              ))}
              <div className={stocsSum > 100 ? 'text-xs text-red-600 font-medium' : 'text-xs text-secondary/60'}>
                Tổng: {stocsSum}% {stocsSum > 100 ? '(vượt 100%)' : ''}
              </div>
            </>
          ) : (
            <div className="space-y-1 pl-1">
              {cs.map((u) => {
                const pct = savedShares.salesToCsPct?.[u.id];
                return (
                  <div key={u.id} className="flex justify-between gap-2 text-xs text-secondary/90">
                    <span className="truncate">{translate(u.name)}</span>
                    <span className="tabular-nums font-medium">
                      {pct != null && Number.isFinite(pct) ? `${pct}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showCsOnlyLeafSection && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
            Chỉ CSKH — đơn vị lá trực thuộc khối %
          </div>
          {canEdit ? (
            <>
              {csDirectOnly.map((u) => (
                <label key={u.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-[140px] text-secondary">{translate(u.name)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-24 border rounded px-2 py-1 text-sm"
                    value={csOnlyPct[u.id] ?? ''}
                    onChange={(e) => setCsOnlyPct((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <span className="text-xs text-secondary/60">%</span>
                </label>
              ))}
              <div className={csonlySum > 100 ? 'text-xs text-red-600 font-medium' : 'text-xs text-secondary/60'}>
                Tổng: {csonlySum}% {csonlySum > 100 ? '(vượt 100%)' : ''}
              </div>
            </>
          ) : (
            <div className="space-y-1 pl-1">
              {csDirectOnly.map((u) => {
                const pct = savedShares.csOnlyPct?.[u.id];
                return (
                  <div key={u.id} className="flex justify-between gap-2 text-xs text-secondary/90">
                    <span className="truncate">{translate(u.name)}</span>
                    <span className="tabular-nums font-medium">
                      {pct != null && Number.isFinite(pct) ? `${pct}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showExternalCs && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">
            Có Sales, chưa có CSKH — nối khối đồng cấp
          </div>
          {canEdit ? (
            lockedSinglePeerCsId && peerOptions[0] ? (
              <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                  Nối mặc định (không chọn khác)
                </div>
                <div className="mt-1">
                  Khối CSKH đích: <strong>{translate(peerOptions[0].name)}</strong>
                </div>
                <p className="mt-1 text-xs text-secondary/65">Chỉ có một khối đồng cấp có đơn vị lá CSKH.</p>
              </div>
            ) : defaultViaParentCs && parentDivisionInTree ? (
              <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                  Nối mặc định (không chọn khác)
                </div>
                <div className="mt-1">
                  Luồng qua khối cha: <strong>{translate(parentDivisionInTree.name)}</strong>
                </div>
                <p className="mt-1 text-xs text-secondary/65">
                  Không có khối đồng cấp có CSKH — không trỏ khối ngoài trên khối này; cấu hình nối CSKH (nếu cần) tại khối cha.
                </p>
              </div>
            ) : (
              <select
                className="w-full max-w-md border rounded px-2 py-2 text-sm bg-white"
                value={externalCsDivisionId}
                onChange={(e) => setExternalCsDivisionId(e.target.value)}
              >
                <option value="">— Không chọn —</option>
                {peerOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {translate(d.name)}
                  </option>
                ))}
              </select>
            )
          ) : (
            <div className="text-xs text-secondary/90 space-y-2">
              {division.externalCsDivision ? (
                <div>Khối đích: {translate(division.externalCsDivision.name)}</div>
              ) : lockedSinglePeerCsId && peerOptions[0] ? (
                <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                    Nối mặc định (không chọn khác)
                  </div>
                  <div className="mt-1">
                    Khối CSKH đích: <strong>{translate(peerOptions[0].name)}</strong>
                  </div>
                  <p className="mt-1 text-xs text-secondary/65">Chỉ một khối đồng cấp có CSKH — không đổi được.</p>
                </div>
              ) : defaultViaParentCs && parentDivisionInTree ? (
                <div className={FLOW_DEFAULT_LOCK_CARD_CLASS}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                    Nối mặc định (không chọn khác)
                  </div>
                  <div className="mt-1">
                    Luồng qua khối cha: <strong>{translate(parentDivisionInTree.name)}</strong>
                  </div>
                  <p className="mt-1 text-xs text-secondary/65">
                    Không có khối đồng cấp có CSKH — không trỏ khối ngoài trên khối này.
                  </p>
                </div>
              ) : (
                <div>Chưa chọn khối đích.</div>
              )}
            </div>
          )}
        </div>
      )}

      {canEdit && showFlowSaveButton && (
        <div className="pt-1">
          <button
            type="button"
            disabled={saveDisabled}
            onClick={() => void save()}
            className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Đang lưu…' : 'Lưu luồng phân data'}
          </button>
        </div>
      )}
    </div>
  );
}
