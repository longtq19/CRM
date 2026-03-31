/**
 * Tự phân lead Marketing → NV Sales: **ưu tiên luồng khối** (`dataFlowShares` / pickNextSalesEmployeeId),
 * sau đó mới `team_distribution_ratios` (bảng tỉ lệ team — khác cấu hình khối).
 */
import { prisma } from '../config/database';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import { pickNextSalesEmployeeId } from './leadRoutingService';
import { assignLeadsUsingTeamRatios } from './teamRatioDistributionService';

/**
 * Luôn `true`: tỉ lệ MKT→Sales nằm ở **khối** (`data_flow_shares` trên Vận hành), không phụ thuộc cờ `auto_distribute_lead`
 * trên đơn vị Marketing (cờ đó từng chặn cả lead website dù đã cấu hình khối).
 */
export async function shouldTryAutoAssignMarketingSales(_anchorEmployeeId?: string): Promise<boolean> {
  void _anchorEmployeeId;
  return true;
}

async function applyPoolAssignment(
  dpEntryId: string,
  customerId: string,
  pickId: string,
  now: Date
): Promise<void> {
  const salesKeepDaysCfg = await prisma.systemConfig
    .findUnique({ where: { key: 'data_pool_auto_recall_days' } })
    .catch(() => null);
  const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
  const maxRoundsCfg = await prisma.systemConfig
    .findUnique({ where: { key: 'max_repartition_rounds' } })
    .catch(() => null);
  const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;
  await prisma.dataPool.update({
    where: { id: dpEntryId },
    data: {
      status: 'ASSIGNED',
      poolType: 'SALES',
      poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
      assignedToId: pickId,
      assignedAt: now,
      deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
      maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5,
      awaitingSalesAfterCskh: false,
    },
  });
  await prisma.customer.update({ where: { id: customerId }, data: { employeeId: pickId } });
  await prisma.leadDistributionHistory.create({
    data: { customerId, employeeId: pickId, method: 'AUTO' },
  });
}

/**
 * @returns true nếu đã gán (pickNext hoặc team ratio)
 */
export async function assignSingleMarketingPoolToSales(opts: {
  dpEntryId: string;
  customerId: string;
  anchorEmployeeId: string;
  now: Date;
}): Promise<boolean> {
  const pickId = await pickNextSalesEmployeeId({
    seed: `${opts.dpEntryId}:${opts.customerId}`,
    excludeIds: [],
    anchorEmployeeId: opts.anchorEmployeeId,
  });
  if (pickId) {
    await applyPoolAssignment(opts.dpEntryId, opts.customerId, pickId, opts.now);
    return true;
  }
  const ratioResult = await assignLeadsUsingTeamRatios([opts.dpEntryId]);
  return ratioResult.ok && ratioResult.assigned > 0;
}
