/**
 * Tự phân lead Marketing → NV Sales: **ưu tiên luồng khối** (`dataFlowShares` / pickNextSalesEmployeeId),
 * sau đó mới `team_distribution_ratios` (bảng tỉ lệ team — khác cấu hình khối).
 */
import { prisma } from '../config/database';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import { pickNextSalesEmployeeId } from './leadRoutingService';
import { assignLeadsUsingTeamRatios } from './teamRatioDistributionService';

export async function shouldTryAutoAssignMarketingSales(anchorEmployeeId: string): Promise<boolean> {
  const emp = await prisma.employee.findUnique({
    where: { id: anchorEmployeeId },
    select: { departmentId: true },
  });
  if (!emp?.departmentId) return true;
  const dept = await prisma.department.findUnique({
    where: { id: emp.departmentId },
    select: { autoDistributeLead: true },
  });
  return Boolean(dept?.autoDistributeLead);
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
