/**
 * Đếm số lần đã phân theo từng nhánh (target) dưới một khối cấu hình (`scope_division_id`),
 * để mỗi lần nhận lead vẫn bám tỉ lệ dài hạn (ưu tiên nhánh đang thiếu so với kỳ vọng).
 * Riêng `EXT_MKT_SALES_LEAF`: scope = khối **nhận** (Sales đích), vì `externalMarketingToSalesPct` lưu trên khối đó.
 */
import { prisma } from '../config/database';

export const ROUTING_COUNTER_KIND = {
  /** marketingToSalesChildDivisionPct trên scopeDivisionId */
  MKT_SALES_CHILD_DIV: 'MKT_SALES_CHILD_DIV',
  /** marketingToSalesPct có trong JSON */
  MKT_SALES_LEAF: 'MKT_SALES_LEAF',
  /** Nhiều lá Sales, không cấu hình % — chia đều có đếm */
  MKT_SALES_LEAF_UNIFORM: 'MKT_SALES_LEAF_UNIFORM',
  SALES_CS_CHILD_DIV: 'SALES_CS_CHILD_DIV',
  SALES_CS_LEAF: 'SALES_CS_LEAF',
  SALES_CS_LEAF_UNIFORM: 'SALES_CS_LEAF_UNIFORM',
  /** externalMarketingToSalesPct trên khối nhận (Sales), target = đơn vị lá Sales đích */
  EXT_MKT_SALES_LEAF: 'EXT_MKT_SALES_LEAF',
  /** Sau khi đã chọn đơn vị lá Sales — chia đều giữa các NV Sales trong đơn vị (đếm thiếu) */
  MKT_SALES_EMPLOYEE_IN_LEAF: 'MKT_SALES_EMPLOYEE_IN_LEAF',
} as const;

export type RoutingCounterKind = (typeof ROUTING_COUNTER_KIND)[keyof typeof ROUTING_COUNTER_KIND];

/**
 * Chọn target theo thiếu so với kỳ vọng: expected_i = (w_i/sumW)*100 * (T+1) / 100, chọn argmax(expected - count).
 * Ghi tăng assignedCount cho target được chọn (transaction).
 */
export async function pickWeightedDeficitTargetAndRecord(input: {
  organizationId: string;
  scopeDivisionId: string;
  kind: string;
  weights: Record<string, number>;
  candidateIds: string[];
}): Promise<string | null> {
  const { organizationId, scopeDivisionId, kind, weights, candidateIds } = input;
  const withW = candidateIds
    .map((id) => ({ id, w: Math.max(0, Number(weights[id]) || 0) }))
    .filter((x) => x.w > 0);
  if (withW.length === 0) return null;
  const sumW = withW.reduce((s, x) => s + x.w, 0);
  if (sumW <= 0) return null;

  return prisma.$transaction(async (tx) => {
    const targets = withW.map((x) => x.id);
    const rows = await tx.divisionFlowRoutingCounter.findMany({
      where: {
        scopeDivisionId,
        kind,
        targetId: { in: targets },
      },
      select: { targetId: true, assignedCount: true },
    });
    const countMap = new Map(rows.map((r) => [r.targetId, r.assignedCount]));
    let T = 0;
    for (const id of targets) {
      T += countMap.get(id) ?? 0;
    }
    const nextTotal = T + 1;

    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (const { id, w } of withW) {
      const normP = (w / sumW) * 100;
      const expected = (normP * nextTotal) / 100;
      const c = countMap.get(id) ?? 0;
      const deficit = expected - c;
      if (deficit > bestScore + 1e-9) {
        bestScore = deficit;
        bestId = id;
      } else if (Math.abs(deficit - bestScore) < 1e-9 && bestId !== null) {
        if (id.localeCompare(bestId) < 0) bestId = id;
      }
    }
    if (!bestId) return null;

    await tx.divisionFlowRoutingCounter.upsert({
      where: {
        scopeDivisionId_kind_targetId: {
          scopeDivisionId,
          kind,
          targetId: bestId,
        },
      },
      create: {
        organizationId,
        scopeDivisionId,
        kind,
        targetId: bestId,
        assignedCount: 1,
      },
      update: {
        assignedCount: { increment: 1 },
      },
    });
    return bestId;
  });
}

/** Chọn NV Sales trong cùng đơn vị lá — chia đều có đếm (thiếu so với kỳ vọng). */
export async function pickFairSalesEmployeeInLeaf(opts: {
  organizationId: string;
  scopeDivisionId: string;
  employeeIds: string[];
}): Promise<string | null> {
  const ids = [...new Set(opts.employeeIds)].filter(Boolean);
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0]!;
  const eq = Object.fromEntries(ids.map((id) => [id, 100 / ids.length]));
  return pickWeightedDeficitTargetAndRecord({
    organizationId: opts.organizationId,
    scopeDivisionId: opts.scopeDivisionId,
    kind: ROUTING_COUNTER_KIND.MKT_SALES_EMPLOYEE_IN_LEAF,
    weights: eq,
    candidateIds: ids,
  });
}
