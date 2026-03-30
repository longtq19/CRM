/**
 * Phân lead theo tỉ lệ team (TeamDistributionRatio + distributionCount) — dùng chung Marketing push và API immediate-distribute.
 */
import { prisma } from '../config/database';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';

export type TeamRatioAssignResult =
  | { ok: true; assigned: number; skippedReason?: string }
  | { ok: false; message: string };

/**
 * Gán các lead (data_pool id) cho NV theo tỉ lệ đơn vị; cập nhật customer.employeeId, leadDistributionHistory, distributionCount.
 * Lead phải tồn tại; thường dùng với status AVAILABLE + poolQueue SALES_OPEN.
 */
export async function assignLeadsUsingTeamRatios(leadIds: string[]): Promise<TeamRatioAssignResult> {
  if (!leadIds.length) {
    return { ok: false, message: 'Không có lead để phân' };
  }

  const ratios = await prisma.teamDistributionRatio.findMany({
    where: { isActive: true },
    include: { department: true },
    orderBy: { departmentId: 'asc' },
  });

  if (ratios.length === 0) {
    return { ok: false, message: 'Chưa cấu hình tỷ lệ phân bổ team' };
  }

  const totalRatio = ratios.reduce((sum, r) => sum + r.ratio, 0);
  if (Math.abs(totalRatio - 100) > 0.01) {
    return { ok: false, message: 'Tổng tỷ lệ phân bổ phải bằng 100' };
  }

  const leads = await prisma.dataPool.findMany({
    where: { id: { in: leadIds } },
    include: { customer: { select: { id: true } } },
  });

  if (leads.length === 0) {
    return { ok: false, message: 'Không tìm thấy lead' };
  }

  const now = new Date();
  const salesKeepDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }).catch(() => null);
  const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
  const maxRoundsCfg = await prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null);
  const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;
  const deadline = new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000);

  const sortedTeams = [...ratios].sort((a, b) => {
    const scoreA = a.ratio > 0 ? a.distributionCount / a.ratio : 0;
    const scoreB = b.ratio > 0 ? b.distributionCount / b.ratio : 0;
    return scoreA - scoreB;
  });

  const deptEmployees: Record<string, { id: string }[]> = {};
  for (const team of sortedTeams) {
    const emps = await prisma.employee.findMany({
      where: {
        departmentId: team.departmentId,
        status: { code: 'WORKING' },
      },
      select: { id: true },
    });
    deptEmployees[team.departmentId] = emps;
  }

  const assignments: { leadId: string; customerId: string; employeeId: string; departmentId: string }[] = [];
  let leadIndex = 0;

  const countAssignmentsForDept = (deptId: string) =>
    assignments.filter((a) => a.departmentId === deptId).length;

  for (const team of sortedTeams) {
    const count = Math.round((leads.length * team.ratio) / 100);
    const emps = deptEmployees[team.departmentId] || [];
    if (emps.length === 0 || count <= 0) continue;

    for (let i = 0; i < count && leadIndex < leads.length; i++, leadIndex++) {
      const lead = leads[leadIndex];
      const empIndex = i % emps.length;
      assignments.push({
        leadId: lead.id,
        customerId: lead.customerId,
        employeeId: emps[empIndex].id,
        departmentId: team.departmentId,
      });
    }
  }

  /** Phần dư (làm tròn) và team không có NV ở vòng trên: chỉ xét team còn NV, cân bằng theo tỉ lệ (distributionCount + đã gán lần này). */
  while (leadIndex < leads.length) {
    const teamsWithEmps = sortedTeams.filter((t) => (deptEmployees[t.departmentId] || []).length > 0);
    if (teamsWithEmps.length === 0) break;

    teamsWithEmps.sort((a, b) => {
      const cntA = a.distributionCount + countAssignmentsForDept(a.departmentId);
      const cntB = b.distributionCount + countAssignmentsForDept(b.departmentId);
      const scoreA = a.ratio > 0 ? cntA / a.ratio : 0;
      const scoreB = b.ratio > 0 ? cntB / b.ratio : 0;
      return scoreA - scoreB;
    });

    const team = teamsWithEmps[0]!;
    const emps = deptEmployees[team.departmentId] || [];
    const lead = leads[leadIndex];
    const empIndex = countAssignmentsForDept(team.departmentId) % emps.length;
    assignments.push({
      leadId: lead.id,
      customerId: lead.customerId,
      employeeId: emps[empIndex]!.id,
      departmentId: team.departmentId,
    });
    leadIndex++;
  }

  if (assignments.length === 0 && leads.length > 0) {
    return { ok: false, message: 'Chưa phân được lead: kiểm tra NV đang làm việc trong các đơn vị theo tỉ lệ' };
  }

  if (assignments.length < leads.length) {
    return {
      ok: false,
      message: `Chỉ phân được ${assignments.length}/${leads.length} lead: mọi đơn vị trong tỉ lệ đều không có nhân viên đang làm việc cho phần còn lại.`,
    };
  }

  for (const a of assignments) {
    await prisma.dataPool.update({
      where: { id: a.leadId },
      data: {
        status: 'ASSIGNED',
        assignedToId: a.employeeId,
        assignedAt: now,
        poolType: 'SALES',
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
        deadline,
        maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5,
        awaitingSalesAfterCskh: false,
      },
    });
    await prisma.customer.update({
      where: { id: a.customerId },
      data: { employeeId: a.employeeId },
    });
    await prisma.leadDistributionHistory.create({
      data: {
        customerId: a.customerId,
        employeeId: a.employeeId,
        method: 'IMMEDIATE',
      },
    });
  }

  const deptCounts: Record<string, number> = {};
  for (const a of assignments) {
    deptCounts[a.departmentId] = (deptCounts[a.departmentId] || 0) + 1;
  }
  for (const [deptId, count] of Object.entries(deptCounts)) {
    await prisma.teamDistributionRatio.updateMany({
      where: { departmentId: deptId },
      data: { distributionCount: { increment: count } },
    });
  }

  return { ok: true, assigned: assignments.length };
}

/**
 * Chọn một NV CSKH trong danh sách ứng viên (cùng đơn vị CSKH đã cấu hình tỉ lệ) theo cân bằng distributionCount/ratio.
 * Trả về null nếu không có tỉ lệ CSKH khớp — gọi code gọi fallback RR.
 */
export async function pickCskhEmployeeIdByTeamRatio(
  candidates: { id: string; departmentId: string | null }[]
): Promise<string | null> {
  if (candidates.length === 0) return null;

  const ratios = await prisma.teamDistributionRatio.findMany({
    where: { isActive: true },
    include: { department: { select: { id: true, function: true } } },
  });
  const cskhRatios = ratios.filter(
    (r) => r.department?.function === 'CSKH' && candidates.some((c) => c.departmentId === r.departmentId)
  );
  if (cskhRatios.length === 0) return null;

  const sorted = [...cskhRatios].sort((a, b) => {
    const scoreA = a.ratio > 0 ? a.distributionCount / a.ratio : 0;
    const scoreB = b.ratio > 0 ? b.distributionCount / b.ratio : 0;
    return scoreA - scoreB;
  });

  for (const team of sorted) {
    const emps = candidates.filter((c) => c.departmentId === team.departmentId);
    if (emps.length === 0) continue;
    const idx =
      team.distributionCount % emps.length;
    const pick = emps[idx]!;
    await prisma.teamDistributionRatio.updateMany({
      where: { departmentId: team.departmentId },
      data: { distributionCount: { increment: 1 } },
    });
    return pick.id;
  }
  return null;
}
