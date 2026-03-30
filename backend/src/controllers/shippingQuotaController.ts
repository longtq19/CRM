import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logAudit, getAuditUser } from '../utils/auditLog';
/** Biên ngày theo giờ VN (YYYY-MM-DD) */
function vnDayBounds(ymd: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00+07:00`);
  const end = new Date(`${ymd}T23:59:59.999+07:00`);
  return { start, end };
}

function parseWorkDate(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

async function employeeHasManageShipping(employeeId: string): Promise<boolean> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      roleGroup: { select: { permissions: { select: { code: true } } } },
    },
  });
  return emp?.roleGroup?.permissions?.some((p) => p.code === 'MANAGE_SHIPPING') ?? false;
}

async function assertAssignableTarget(actorId: string, targetId: string): Promise<string | null> {
  if (targetId === actorId) return null;
  const ok = await employeeHasManageShipping(targetId);
  return ok ? null : 'Chỉ được gán chỉ tiêu cho nhân viên có quyền Quản lý vận đơn hoặc cho chính mình.';
}

export async function getShippingAssignableEmployees(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const groups = await prisma.roleGroup.findMany({
      where: { permissions: { some: { code: 'MANAGE_SHIPPING' } } },
      select: { id: true },
    });
    const rgIds = groups.map((g) => g.id);
    const employees =
      rgIds.length === 0
        ? []
        : await prisma.employee.findMany({
            where: {
              roleGroupId: { in: rgIds },
              status: { isActive: true },
            },
            select: { id: true, fullName: true, code: true },
            orderBy: { fullName: 'asc' },
          });

    const byId = new Map(employees.map((e) => [e.id, e]));
    if (user?.id && !byId.has(user.id)) {
      const self = await prisma.employee.findUnique({
        where: { id: user.id },
        select: { id: true, fullName: true, code: true },
      });
      if (self) {
        employees.unshift(self);
      }
    }

    res.json(employees);
  } catch (e) {
    console.error('getShippingAssignableEmployees', e);
    res.status(500).json({ message: 'Không lấy được danh sách NV vận đơn.' });
  }
}

export async function getMyShippingDailyQuota(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const workDateRaw = String(req.query.workDate || '').trim();
    const ymd =
      workDateRaw ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const bounds = vnDayBounds(ymd);
    if (!bounds) {
      return res.status(400).json({ message: 'Tham số workDate không hợp lệ (YYYY-MM-DD).' });
    }
    const wd = parseWorkDate(ymd);
    if (!wd) return res.status(400).json({ message: 'Ngày không hợp lệ.' });

    const [quota, confirmedCount, declinedCount] = await Promise.all([
      prisma.shippingDailyQuota.findUnique({
        where: {
          employeeId_workDate: { employeeId: user.id, workDate: wd },
        },
      }),
      prisma.order.count({
        where: {
          confirmedById: user.id,
          confirmedAt: { gte: bounds.start, lte: bounds.end },
        },
      }),
      prisma.order.count({
        where: {
          shippingDeclinedById: user.id,
          shippingDeclinedAt: { gte: bounds.start, lte: bounds.end },
        },
      }),
    ]);

    const doneTotal = confirmedCount + declinedCount;
    res.json({
      workDate: ymd,
      targetCount: quota?.targetCount ?? 0,
      confirmedCount,
      declinedCount,
      doneTotal,
      hasQuotaRow: !!quota,
    });
  } catch (e) {
    console.error('getMyShippingDailyQuota', e);
    res.status(500).json({ message: 'Không lấy được chỉ tiêu vận đơn.' });
  }
}

export async function listShippingDailyQuotas(req: Request, res: Response) {
  try {
    const workDateRaw = String(req.query.workDate || '').trim();
    const ymd =
      workDateRaw ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const wd = parseWorkDate(ymd);
    if (!wd) return res.status(400).json({ message: 'Tham số workDate không hợp lệ (YYYY-MM-DD).' });
    const bounds = vnDayBounds(ymd);
    if (!bounds) return res.status(400).json({ message: 'Ngày không hợp lệ.' });

    const rows = await prisma.shippingDailyQuota.findMany({
      where: { workDate: wd },
      include: {
        employee: { select: { id: true, fullName: true, code: true } },
        assignedBy: { select: { id: true, fullName: true, code: true } },
      },
      orderBy: { employee: { fullName: 'asc' } },
    });

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const [confirmedCount, declinedCount] = await Promise.all([
          prisma.order.count({
            where: {
              confirmedById: r.employeeId,
              confirmedAt: { gte: bounds.start, lte: bounds.end },
            },
          }),
          prisma.order.count({
            where: {
              shippingDeclinedById: r.employeeId,
              shippingDeclinedAt: { gte: bounds.start, lte: bounds.end },
            },
          }),
        ]);
        return {
          ...r,
          confirmedCount,
          declinedCount,
          doneTotal: confirmedCount + declinedCount,
        };
      })
    );

    res.json({ workDate: ymd, items: enriched });
  } catch (e) {
    console.error('listShippingDailyQuotas', e);
    res.status(500).json({ message: 'Không lấy được danh sách chỉ tiêu.' });
  }
}

export async function upsertShippingDailyQuotas(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const body = req.body || {};
    const workDateStr = String(body.workDate || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];

    const wd = parseWorkDate(workDateStr);
    if (!wd) {
      return res.status(400).json({ message: 'workDate bắt buộc (YYYY-MM-DD).' });
    }

    const beforeRows = await prisma.shippingDailyQuota.findMany({
      where: { workDate: wd },
      include: {
        employee: { select: { fullName: true, code: true } },
      },
    });
    const beforeMap = new Map(beforeRows.map((r) => [r.employeeId, r.targetCount]));

    const lines: string[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        for (const raw of items) {
          const employeeId = raw?.employeeId != null ? String(raw.employeeId).trim() : '';
          const targetCount = Math.max(0, Math.floor(Number(raw?.targetCount ?? 0)));
          if (!employeeId) {
            throw new Error('Mỗi dòng cần employeeId.');
          }

          const err = await assertAssignableTarget(user.id, employeeId);
          if (err) {
            throw new Error(err);
          }

          const emp = await tx.employee.findUnique({
            where: { id: employeeId },
            select: { fullName: true, code: true },
          });
          if (!emp) {
            throw new Error(`Nhân viên ${employeeId} không tồn tại.`);
          }

          const prev = beforeMap.get(employeeId);

          if (targetCount === 0) {
            await tx.shippingDailyQuota.deleteMany({
              where: { employeeId, workDate: wd },
            });
            if (prev !== undefined) {
              const label = `${emp.fullName}${emp.code ? ` (${emp.code})` : ''}`;
              lines.push(`Xóa chỉ tiêu ${label} cho ngày ${workDateStr} (đặt về 0).`);
            }
            continue;
          }

          await tx.shippingDailyQuota.upsert({
            where: {
              employeeId_workDate: { employeeId, workDate: wd },
            },
            create: {
              employeeId,
              workDate: wd,
              targetCount,
              assignedById: user.id,
            },
            update: {
              targetCount,
              assignedById: user.id,
            },
          });

          const label = `${emp.fullName}${emp.code ? ` (${emp.code})` : ''}`;
          if (prev === undefined) {
            lines.push(`Gán chỉ tiêu cho ${label}: ${targetCount} đơn/ngày ${workDateStr}.`);
          } else if (prev !== targetCount) {
            lines.push(`Đổi chỉ tiêu ${label} từ ${prev} sang ${targetCount} đơn/ngày ${workDateStr}.`);
          }
        }
      });
    } catch (e: any) {
      const msg = e?.message || 'Không lưu được chỉ tiêu.';
      return res.status(400).json({ message: msg });
    }

    const auditUser = getAuditUser(req);
    const oldValues: Record<string, number> = {};
    beforeRows.forEach((r) => {
      oldValues[`${r.employee.fullName || r.employeeId}`] = r.targetCount;
    });

    await logAudit({
      ...auditUser,
      action: 'Cập nhật',
      object: 'Chỉ tiêu vận đơn theo ngày',
      objectId: workDateStr,
      result: 'SUCCESS',
      details: lines.length ? lines.join('\n') : `Không có thay đổi chỉ tiêu cho ngày ${workDateStr}.`,
      oldValues: Object.keys(oldValues).length ? oldValues : undefined,
      newValues: { workDate: workDateStr, items },
      req,
    });

    res.json({ ok: true, workDate: workDateStr, updated: items.length });
  } catch (e) {
    console.error('upsertShippingDailyQuotas', e);
    res.status(500).json({ message: 'Không lưu được chỉ tiêu vận đơn.' });
  }
}
