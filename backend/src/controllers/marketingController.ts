import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logAudit, getAuditUser } from '../utils/auditLog';
import { describeChangesVi } from '../utils/vietnameseAuditDiff';
import {
  checkDuplicateAndHandle,
  getMarketingAttributionDays,
  getAttributionExpiredAt,
  normalizePhone,
  findExistingByPhone,
  addDuplicateNote,
  logDuplicateAction,
  getDuplicateStaffDisplayForClient,
  notifyDuplicateStakeholders,
} from '../services/leadDuplicateService';
import { Decimal } from '@prisma/client/runtime/library';
import * as ExcelJS from 'exceljs';
import { marketingEmployeeWhere } from '../constants/roleIdentification';
import {
  getSubordinateIds,
  buildCustomerWhereByScope,
  canViewAllCompanyMarketingCampaigns,
  getAllowedMarketingCampaignCreatorIds,
  isSalesKdCampaignDropdownQuery,
  canAccessMarketingCampaignByCreator,
} from '../utils/viewScopeHelper';
import { isTechnicalAdminRoleCode, userHasCatalogPermission } from '../constants/rbac';
import { ROOT_COUNTABLE_CROPS } from '../constants/cropConfigs';
import {
  normalizeMainCropsRootCounts,
  validateMainCropsAndRootCounts,
} from '../utils/mainCropsRootCounts';
import { upsertMarketingContributor } from '../utils/customerMarketingContributors';
import {
  CUSTOMER_EXCEL_COLUMNS,
  CUSTOMER_IMPORT_TEMPLATE_FILENAME,
  CUSTOMER_EXPORT_FILENAME_PREFIX,
} from '../constants/customerExcelColumns';
import { assignSingleMarketingPoolToSales } from '../services/marketingLeadAutoAssignService';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import { DEFAULT_LEAD_PROCESSING_STATUS_CODE } from '../constants/operationParams';
import { notifySalesMarketingLeadAssigned } from '../utils/notifySalesLeadFromMarketing';
import { formatICTDate } from '../utils/dateFormatter';
import {
  isPastCampaignEndDateInclusiveVietnam,
  isStrictCampaignStartBeforeEnd,
} from '../utils/campaignSchedule';

const MK_SOURCE_LABELS: Record<string, string> = {
  code: 'Mã nền tảng',
  name: 'Tên nền tảng',
  description: 'Mô tả',
  isActive: 'Đang dùng',
};

const MK_CAMPAIGN_LABELS: Record<string, string> = {
  code: 'Mã chiến dịch',
  name: 'Tên chiến dịch',
  description: 'Mô tả',
  status: 'Trạng thái',
  startDate: 'Ngày bắt đầu',
  endDate: 'Ngày kết thúc',
  totalBudget: 'Ngân sách dự kiến',
  sourceId: 'Mã nền tảng (ID)',
  createdByEmployeeId: 'Người tạo (ID)',
};

function mkCampaignPlain(c: {
  code: string;
  name: string;
  description: string | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  totalBudget: unknown;
  sourceId: string | null;
  createdByEmployeeId: string | null;
}) {
  return {
    code: c.code,
    name: c.name,
    description: c.description ?? '',
    status: c.status,
    startDate: c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : null,
    endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : null,
    totalBudget: c.totalBudget != null ? Number(c.totalBudget as number) : null,
    sourceId: c.sourceId,
    createdByEmployeeId: c.createdByEmployeeId,
  };
}

const MK_COST_LABELS: Record<string, string> = {
  costDate: 'Ngày chi phí',
  amount: 'Số tiền',
  costType: 'Loại chi phí',
  platform: 'Nền tảng',
  adAccountId: 'Tài khoản quảng cáo',
  impressions: 'Lượt hiển thị',
  clicks: 'Lượt click',
  reach: 'Tiếp cận',
  description: 'Mô tả',
  attachmentUrl: 'Tệp đính kèm',
  sourceId: 'Nền tảng (ID)',
  employeeGroupId: 'Nhóm nhân viên (ID)',
};

/** Chuỗi `platform` lưu DB (khớp bảng chi phí / lọc) — đồng bộ với nền tảng chiến dịch, không nhận từ client. */
function deriveCostPlatformFromMarketingSource(source: { name: string; code: string }): string {
  const nameLower = source.name.toLowerCase();
  const known = [
    'facebook',
    'google',
    'tiktok',
    'zalo',
    'youtube',
    'instagram',
    'shopee',
    'lazada',
  ] as const;
  for (const k of known) {
    if (nameLower.includes(k)) return k;
  }
  return source.code?.trim() || source.name.trim();
}

function mkCostPlain(c: any) {
  return {
    costDate: c.costDate ? new Date(c.costDate).toISOString().split('T')[0] : null,
    amount: c.amount != null ? Number(c.amount) : null,
    costType: c.costType,
    platform: c.platform,
    adAccountId: c.adAccountId,
    impressions: c.impressions,
    clicks: c.clicks,
    reach: c.reach,
    description: c.description,
    attachmentUrl: c.attachmentUrl,
    sourceId: c.sourceId,
    employeeGroupId: c.employeeGroupId,
  };
}

/** Danh sách nền tảng: một danh mục dùng chung toàn công ty (không phân đơn vị/NV); mọi nhân viên đã đăng nhập có thể GET. */
export const getMarketingSources = async (req: Request, res: Response) => {
  try {
    const { search, isActive } = req.query;

    const where: any = {};
    if (typeof search === 'string' && search.trim() !== '') {
      where.OR = [
        { code: { contains: search.trim(), mode: 'insensitive' } },
        { name: { contains: search.trim(), mode: 'insensitive' } }
      ];
    }
    if (typeof isActive === 'string' && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    const sources = await prisma.marketingSource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { campaigns: true } } }
    });

    res.json(sources);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nền tảng' });
  }
};

function generateSourceCode(): string {
  return 'SRC_' + Date.now();
}

export const createMarketingSource = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    if (!userHasCatalogPermission(actor, 'CREATE_MARKETING_PLATFORM')) {
      return res.status(403).json({ message: 'Bạn không có quyền tạo nền tảng marketing' });
    }

    const { code, name, description, isActive } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedDesc = typeof description === 'string' ? description.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ message: 'Tên nền tảng là bắt buộc' });
    }
    if (!trimmedDesc) {
      return res.status(400).json({ message: 'Mô tả nền tảng là bắt buộc' });
    }

    const finalCode = (typeof code === 'string' && code.trim()) ? code.trim() : generateSourceCode();
    const existing = await prisma.marketingSource.findUnique({ where: { code: finalCode } });
    if (existing) {
      return res.status(400).json({ message: 'Mã nền tảng đã tồn tại' });
    }

    const source = await prisma.marketingSource.create({
      data: {
        code: finalCode,
        name: trimmedName,
        description: trimmedDesc,
        isActive: typeof isActive === 'boolean' ? isActive : true
      }
    });

    if (actor) {
      await logAudit({
        ...getAuditUser(req),
        action: 'Tạo mới',
        object: 'Nền tảng marketing',
        objectId: source.id,
        result: 'SUCCESS',
        details: `Tạo nền tảng "${source.name}" (mã ${source.code}).\nMô tả: ${source.description}`,
        newValues: { code: source.code, name: source.name },
        req,
      });
    }

    res.status(201).json(source);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo nền tảng' });
  }
};

export const updateMarketingSource = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { code, name, description, isActive } = req.body;
    const actor = (req as any).user;

    if (!userHasCatalogPermission(actor, 'UPDATE_MARKETING_PLATFORM')) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa nền tảng marketing' });
    }

    const existing = await prisma.marketingSource.findUnique({
      where: { id },
      include: { _count: { select: { campaigns: true } } }
    });
    if (!existing) {
      return res.status(404).json({ message: 'Nền tảng không tồn tại' });
    }
    if (existing._count.campaigns > 0) {
      return res.status(403).json({ message: 'Không thể sửa nền tảng đang được sử dụng bởi chiến dịch' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedDesc = typeof description === 'string' ? description.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ message: 'Tên nền tảng là bắt buộc' });
    }
    if (!trimmedDesc) {
      return res.status(400).json({ message: 'Mô tả nền tảng là bắt buộc' });
    }

    const finalCode = (typeof code === 'string' && code.trim()) ? code.trim() : existing.code;
    if (finalCode !== existing.code) {
      const codeConflict = await prisma.marketingSource.findUnique({ where: { code: finalCode } });
      if (codeConflict) {
        return res.status(400).json({ message: 'Mã nền tảng đã tồn tại' });
      }
    }

    const updated = await prisma.marketingSource.update({
      where: { id },
      data: {
        code: finalCode,
        name: trimmedName,
        description: trimmedDesc,
        isActive: typeof isActive === 'boolean' ? isActive : existing.isActive
      }
    });

    if (actor) {
      const oldP = {
        code: existing.code,
        name: existing.name,
        description: existing.description,
        isActive: existing.isActive,
      };
      const newP = {
        code: updated.code,
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
      };
      let details = describeChangesVi(oldP, newP, MK_SOURCE_LABELS);
      if (!details.trim()) {
        details = `Cập nhật nền tảng "${updated.name}" — không phát hiện thay đổi nội dung.`;
      }
      await logAudit({
        ...getAuditUser(req),
        action: 'Cập nhật',
        object: 'Nền tảng marketing',
        objectId: updated.id,
        result: 'SUCCESS',
        details,
        oldValues: oldP,
        newValues: newP,
        req,
      });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật nền tảng' });
  }
};

export const deleteMarketingSource = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const actor = (req as any).user;

    if (!userHasCatalogPermission(actor, 'DELETE_MARKETING_PLATFORM')) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa nền tảng marketing' });
    }

    const existing = await prisma.marketingSource.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            campaigns: true,
            customers: true,
            costs: true,
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Nền tảng không tồn tại' });
    }

    const inUse = existing._count.campaigns > 0 || existing._count.customers > 0 || existing._count.costs > 0;
    if (inUse) {
      return res.status(403).json({
        message: 'Không thể xóa nền tảng đang được sử dụng (có chiến dịch, khách hàng hoặc bản ghi chi phí liên quan)'
      });
    }

    await prisma.marketingSource.delete({ where: { id } });
    if (actor) {
      await logAudit({
        ...getAuditUser(req),
        action: 'Xóa',
        object: 'Nền tảng marketing',
        objectId: id,
        result: 'SUCCESS',
        details: `Xóa nền tảng "${existing.name}" (mã ${existing.code}).`,
        oldValues: { code: existing.code, name: existing.name },
        req,
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa nền tảng' });
  }
};

export const getMarketingCampaigns = async (req: Request, res: Response) => {
  try {
    const { sourceId, status, search, createdByEmployeeId } = req.query;
    const actor = (req as any).user;

    const where: any = {};
    if (typeof sourceId === 'string' && sourceId !== '') {
      where.sourceId = sourceId;
    }
    if (typeof status === 'string' && status !== '') {
      where.status = status;
    }

    const qCreatedBy =
      typeof createdByEmployeeId === 'string' && createdByEmployeeId !== '' ? createdByEmployeeId : null;

    if (actor?.id) {
      const fullCompany = await canViewAllCompanyMarketingCampaigns(actor);
      if (!fullCompany) {
        const allowed = await getAllowedMarketingCampaignCreatorIds(actor);
        if (qCreatedBy) {
          if (allowed.includes(qCreatedBy)) {
            where.createdByEmployeeId = qCreatedBy;
          } else if (isSalesKdCampaignDropdownQuery(actor)) {
            where.createdByEmployeeId = qCreatedBy;
          } else {
            return res.json([]);
          }
        } else {
          where.createdByEmployeeId = { in: allowed };
        }
      } else if (qCreatedBy) {
        where.createdByEmployeeId = qCreatedBy;
      }
    } else if (qCreatedBy) {
      where.createdByEmployeeId = qCreatedBy;
    }

    if (typeof search === 'string' && search.trim() !== '') {
      const term = search.trim();
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { code: { contains: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const campaigns = await prisma.marketingCampaign.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        source: true,
        createdByEmployee: {
          select: { id: true, code: true, fullName: true, avatarUrl: true }
        },
        members: {
          include: {
            employee: { select: { id: true, code: true, fullName: true, avatarUrl: true } }
          }
        }
      }
    });

    const ids = campaigns.map((c) => c.id);
    const costSums =
      ids.length === 0
        ? []
        : await prisma.marketingCampaignCost.groupBy({
            by: ['campaignId'],
            where: { campaignId: { in: ids } },
            _sum: { amount: true },
          });
    const spentByCampaign = new Map<string, number>();
    for (const row of costSums) {
      const v = row._sum.amount;
      spentByCampaign.set(row.campaignId, v != null ? Number(v) : 0);
    }

    // totalSpentActual: tổng amount marketing_campaign_costs (cùng logic totalCost trong effectiveness)
    const payload = campaigns.map((c) => ({
      ...c,
      totalSpentActual: spentByCampaign.get(c.id) ?? 0,
    }));

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách chiến dịch' });
  }
};

function generateCampaignCode(): string {
  return 'CAMP_' + Date.now();
}

export const createMarketingCampaign = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { code, name, description, status, startDate, endDate, totalBudget, sourceId } = req.body;

    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedDesc = typeof description === 'string' ? description.trim() : '';
    if (!trimmedName) return res.status(400).json({ message: 'Tên chiến dịch là bắt buộc' });
    if (!trimmedDesc) return res.status(400).json({ message: 'Mô tả chiến dịch là bắt buộc' });
    if (!status) return res.status(400).json({ message: 'Trạng thái là bắt buộc' });
    if (!startDate) return res.status(400).json({ message: 'Ngày bắt đầu là bắt buộc' });
    if (!endDate) return res.status(400).json({ message: 'Ngày kết thúc là bắt buộc' });
    if (totalBudget === undefined || totalBudget === null || totalBudget === '') {
      return res.status(400).json({ message: 'Ngân sách dự kiến là bắt buộc' });
    }
    if (!sourceId) return res.status(400).json({ message: 'Nền tảng chiến dịch là bắt buộc' });

    const sd = new Date(startDate);
    const ed = new Date(endDate);
    if (!isStrictCampaignStartBeforeEnd(sd, ed)) {
      return res.status(400).json({
        message: 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc (không trùng ngày).',
      });
    }
    const nowCreate = new Date();
    const st = String(status || 'DRAFT');
    if (
      (st === 'ACTIVE' || st === 'PAUSED') &&
      isPastCampaignEndDateInclusiveVietnam(nowCreate, ed)
    ) {
      return res.status(400).json({
        message:
          'Ngày kết thúc đã qua theo lịch; không thể đặt trạng thái «Đang chạy» hoặc «Tạm dừng».',
      });
    }

    const finalCode = (typeof code === 'string' && code.trim()) ? code.trim() : generateCampaignCode();
    const exists = await prisma.marketingCampaign.findUnique({ where: { code: finalCode } });
    if (exists) {
      return res.status(400).json({ message: 'Mã chiến dịch đã tồn tại' });
    }

    const campaign = await prisma.marketingCampaign.create({
      data: {
        code: finalCode,
        name: trimmedName,
        description: trimmedDesc,
        status: status || 'DRAFT',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalBudget: totalBudget !== undefined && totalBudget !== null ? new Decimal(totalBudget) : null,
        sourceId: sourceId || null,
        createdByEmployeeId: actor.id,
        members: {
          create: [{ employeeId: actor.id, role: 'MEMBER' }]
        }
      },
      include: {
        source: true,
        createdByEmployee: { select: { id: true, code: true, fullName: true, avatarUrl: true } },
        members: {
          include: {
            employee: { select: { id: true, code: true, fullName: true, avatarUrl: true } }
          }
        }
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'Tạo mới',
      object: 'Chiến dịch marketing',
      objectId: campaign.id,
      result: 'SUCCESS',
      details: `Tạo chiến dịch "${campaign.name}" (mã ${campaign.code}).\nNgân sách dự kiến: ${Number(campaign.totalBudget)}.`,
      newValues: { code: campaign.code, name: campaign.name },
      req,
    });

    res.status(201).json(campaign);
  } catch (error: any) {
    console.error('[createMarketingCampaign] Error:', error?.message || error);
    res.status(500).json({ message: 'Lỗi khi tạo chiến dịch', detail: error?.message });
  }
};

async function isMarketingAdmin(actor: any): Promise<boolean> {
  if (!actor?.id) return false;
  if (userHasCatalogPermission(actor, ['MANAGE_MARKETING_GROUPS', 'FULL_ACCESS'])) {
    return true;
  }
  const emp = await prisma.employee.findUnique({
    where: { id: actor.id },
    select: { roleGroup: { select: { code: true } } },
  });
  return isTechnicalAdminRoleCode(emp?.roleGroup?.code);
}

export const updateMarketingCampaign = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { code, name, description, status, startDate, endDate, totalBudget, sourceId, employeeIds, createdByEmployeeId } = req.body;
    const actor = (req as any).user;

    const existing = await prisma.marketingCampaign.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Chiến dịch không tồn tại' });
    }

    const admin = await isMarketingAdmin(actor);
    if (
      !admin &&
      !(await canAccessMarketingCampaignByCreator(actor, existing.createdByEmployeeId))
    ) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa chiến dịch này' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedDesc = typeof description === 'string' ? description.trim() : '';
    if (!trimmedName) return res.status(400).json({ message: 'Tên chiến dịch là bắt buộc' });
    if (!trimmedDesc) return res.status(400).json({ message: 'Mô tả chiến dịch là bắt buộc' });
    if (!status) return res.status(400).json({ message: 'Trạng thái là bắt buộc' });
    if (!startDate) return res.status(400).json({ message: 'Ngày bắt đầu là bắt buộc' });
    if (!endDate) return res.status(400).json({ message: 'Ngày kết thúc là bắt buộc' });
    if (totalBudget === undefined || totalBudget === null || totalBudget === '') {
      return res.status(400).json({ message: 'Ngân sách dự kiến là bắt buộc' });
    }
    if (!sourceId) return res.status(400).json({ message: 'Nền tảng chiến dịch là bắt buộc' });

    const sd = new Date(startDate);
    const ed = new Date(endDate);
    if (!isStrictCampaignStartBeforeEnd(sd, ed)) {
      return res.status(400).json({
        message: 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc (không trùng ngày).',
      });
    }
    const nowUpd = new Date();
    const st = String(status ?? existing.status);
    if (
      (st === 'ACTIVE' || st === 'PAUSED') &&
      isPastCampaignEndDateInclusiveVietnam(nowUpd, ed)
    ) {
      return res.status(400).json({
        message:
          'Ngày kết thúc đã qua theo lịch; không thể đặt trạng thái «Đang chạy» hoặc «Tạm dừng».',
      });
    }

    const finalCode = (typeof code === 'string' && code.trim()) ? code.trim() : existing.code;
    if (finalCode !== existing.code) {
      const exists = await prisma.marketingCampaign.findUnique({ where: { code: finalCode } });
      if (exists) {
        return res.status(400).json({ message: 'Mã chiến dịch đã tồn tại' });
      }
    }

    const adminCanChangeOwner = await isMarketingAdmin(actor);
    let ownerId = existing.createdByEmployeeId;
    if (adminCanChangeOwner && (createdByEmployeeId || (Array.isArray(employeeIds) && employeeIds.length > 0))) {
      ownerId = createdByEmployeeId || employeeIds[0];
    }

    const updated = await prisma.marketingCampaign.update({
      where: { id },
      data: {
        code: finalCode,
        name: trimmedName,
        description: trimmedDesc,
        status: status ?? existing.status,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalBudget: totalBudget !== undefined && totalBudget !== null ? new Decimal(totalBudget) : existing.totalBudget,
        sourceId: sourceId || null,
        createdByEmployeeId: ownerId
      },
      include: {
        source: true,
        createdByEmployee: { select: { id: true, code: true, fullName: true, avatarUrl: true } },
        members: {
          include: {
            employee: { select: { id: true, code: true, fullName: true, avatarUrl: true } }
          }
        }
      }
    });

    if (adminCanChangeOwner && (createdByEmployeeId || (Array.isArray(employeeIds) && employeeIds.length > 0))) {
      const memberIds = Array.isArray(employeeIds) && employeeIds.length > 0 ? employeeIds : [ownerId];
      await prisma.marketingCampaignMember.deleteMany({ where: { campaignId: id } });
      await prisma.marketingCampaignMember.createMany({
        data: memberIds.map((empId: string) => ({
          campaignId: id,
          employeeId: empId,
          role: 'MEMBER'
        }))
      });
      const withMembers = await prisma.marketingCampaign.findUnique({
        where: { id },
        include: {
          source: true,
          createdByEmployee: { select: { id: true, code: true, fullName: true, avatarUrl: true } },
          members: {
            include: {
              employee: { select: { id: true, code: true, fullName: true, avatarUrl: true } }
            }
          }
        }
      });
      if (!withMembers) {
        return res.status(500).json({ message: 'Không tải được chiến dịch sau cập nhật.' });
      }
      if (actor) {
        const beforePlain = mkCampaignPlain(existing);
        const afterPlain = mkCampaignPlain(withMembers);
        let details = describeChangesVi(
          beforePlain as Record<string, unknown>,
          afterPlain as Record<string, unknown>,
          MK_CAMPAIGN_LABELS,
        );
        const memberLine = `Cập nhật thành viên chiến dịch: ${withMembers.members?.length ?? 0} người.`;
        details = details ? `${details}\n${memberLine}` : memberLine;
        if (!details.trim()) {
          details = `Cập nhật chiến dịch "${withMembers.name}".`;
        }
        await logAudit({
          ...getAuditUser(req),
          action: 'Cập nhật',
          object: 'Chiến dịch marketing',
          objectId: withMembers.id,
          result: 'SUCCESS',
          details,
          oldValues: beforePlain,
          newValues: afterPlain,
          req,
        });
      }
      return res.json(withMembers);
    }

    if (actor) {
      const beforePlain = mkCampaignPlain(existing);
      const afterPlain = mkCampaignPlain(updated);
      let details = describeChangesVi(
        beforePlain as Record<string, unknown>,
        afterPlain as Record<string, unknown>,
        MK_CAMPAIGN_LABELS,
      );
      if (!details.trim()) {
        details = `Cập nhật chiến dịch "${updated.name}" — không phát hiện thay đổi nội dung.`;
      }
      await logAudit({
        ...getAuditUser(req),
        action: 'Cập nhật',
        object: 'Chiến dịch marketing',
        objectId: updated.id,
        result: 'SUCCESS',
        details,
        oldValues: beforePlain,
        newValues: afterPlain,
        req,
      });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật chiến dịch' });
  }
};

/**
 * Xóa chiến dịch: gỡ gán khách hàng (campaign_id → null), xóa cơ hội/lead gắn chiến dịch, chi phí, thành viên, sản phẩm.
 */
export const deleteMarketingCampaign = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const actor = (req as any).user;

    const existing = await prisma.marketingCampaign.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            customers: true,
            costs: true,
            opportunities: true,
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Chiến dịch không tồn tại' });
    }

    const admin = await isMarketingAdmin(actor);
    if (
      !admin &&
      !(await canAccessMarketingCampaignByCreator(actor, existing.createdByEmployeeId))
    ) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa chiến dịch này' });
    }

    // Quyền xóa: middleware DELETE_MARKETING_CAMPAIGN (và quản trị kỹ thuật bypass).

    // Xóa an toàn: khi không có sử dụng mới được xóa
    const inUse = existing._count.customers > 0 || existing._count.costs > 0 || existing._count.opportunities > 0;
    if (inUse) {
      return res.status(403).json({
        message: 'Chiến dịch đang có khách hàng, cơ hội hoặc bản ghi chi phí liên quan. Hãy kết thúc chiến dịch này trước khi xóa (nếu không còn cần thiết).'
      });
    }

    const beforePlain = mkCampaignPlain(existing);

    await prisma.$transaction(
      async (tx) => {
        // Xóa các bảng liên kết phụ
        await tx.marketingCampaignProduct.deleteMany({ where: { campaignId: id } });
        await tx.marketingCampaignMember.deleteMany({ where: { campaignId: id } });
        await tx.marketingCampaign.delete({ where: { id } });
      },
      { timeout: 120_000 }
    );

    if (actor) {
      await logAudit({
        ...getAuditUser(req),
        action: 'Xóa',
        object: 'Chiến dịch marketing',
        objectId: id,
        result: 'SUCCESS',
        details: `Xóa chiến dịch "${existing.name}" (mã ${existing.code}).`,
        oldValues: beforePlain,
        req,
      });
    }

    res.json({ id, deleted: true });
  } catch (error) {
    console.error('deleteMarketingCampaign error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa chiến dịch' });
  }
};

export const getMarketingLeads = async (req: Request, res: Response) => {
  try {
    const { sourceId, campaignId, status, search, tagIds, isDuplicate } = req.query;
    const actor = (req as any).user;

    const scopeWhere = await buildCustomerWhereByScope(actor, 'CUSTOMER');
    const where: any = { ...scopeWhere };

    if (typeof sourceId === 'string' && sourceId !== '') {
      where.leadSourceId = sourceId;
    }
    if (typeof campaignId === 'string' && campaignId !== '') {
      where.campaignId = campaignId;
    }
    if (typeof status === 'string' && status !== '') {
      where.leadStatus = status;
    }
    if (isDuplicate === 'true') {
      where.marketingContributors = { _count: { gte: 2 } };
    }
    if (typeof search === 'string' && search.trim() !== '') {
      const term = search.trim();
      where.AND = [
        ...(where.AND || []),
        { OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } }
        ]}
      ];
    }

    if (typeof req.query.employeeId === 'string' && req.query.employeeId !== '') {
      where.marketingOwnerId = req.query.employeeId;
    }

    if (typeof tagIds === 'string' && tagIds.trim()) {
      const tagIdArr = tagIds.split(',').map(s => s.trim()).filter(Boolean);
      if (tagIdArr.length > 0) {
        where.AND = [
          ...(where.AND || []),
          { tags: { some: { tagId: { in: tagIdArr } } } }
        ];
      }
    }

    const leads = await prisma.customer.findMany({
      where,
      orderBy: { joinedDate: 'desc' },
      include: {
        leadSource: true,
        campaign: true,
        marketingOwner: {
          select: { id: true, fullName: true, avatarUrl: true }
        },
        employee: {
          select: { id: true, fullName: true, phone: true }
        },
        tags: { include: { tag: true } },
        interactions: {
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: {
            id: true,
            type: true,
            content: true,
            detail: true,
            createdAt: true,
            employee: { select: { fullName: true, phone: true } },
          },
        },
        _count: {
          select: { marketingContributors: true }
        }
      }
    });

    const ids = leads.map((l) => l.id);
    let firstAmountByCustomer = new Map<string, number>();
    let duplicateNoteByCustomer = new Map<string, string>();
    if (ids.length > 0) {
      const [deliveredOrders, dupRows] = await Promise.all([
        prisma.order.findMany({
          where: { customerId: { in: ids }, shippingStatus: 'DELIVERED' },
          orderBy: [{ orderDate: 'asc' }],
          select: { customerId: true, finalAmount: true, orderDate: true, deliveredAt: true },
        }),
        prisma.customerInteraction.findMany({
          where: { customerId: { in: ids }, type: 'marketing_duplicate_interaction' },
          orderBy: { createdAt: 'desc' },
          select: { customerId: true, content: true },
        }),
      ]);
      for (const o of deliveredOrders) {
        if (!firstAmountByCustomer.has(o.customerId)) {
          firstAmountByCustomer.set(o.customerId, Number(o.finalAmount || 0));
        }
      }
      for (const d of dupRows) {
        const prev = duplicateNoteByCustomer.get(d.customerId);
        duplicateNoteByCustomer.set(d.customerId, prev ? prev + '\n' + d.content : d.content);
      }
    }

    const enriched = leads.map((row) => {
      const { interactions, ...rest } = row as any;
      return {
        ...rest,
        firstDeliveredOrderAmount: firstAmountByCustomer.get(row.id) ?? null,
        duplicatePhoneNote: duplicateNoteByCustomer.get(row.id) ?? null,
        impactHistory: interactions ?? [],
        marketingContributorsCount: row._count?.marketingContributors || 0,
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách khách hàng Marketing' });
  }
};

const LEAD_STATUS_VI: Record<string, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  NEGOTIATING: 'Đang đàm phán',
  WON: 'Thành công',
  LOST: 'Thất bại',
  INVALID: 'Không hợp lệ',
  IN_PROGRESS: 'Đang xử lý',
  UNQUALIFIED: 'Loại',
  CONVERTED: 'Đã chuyển đổi',
};

export const exportMarketingLeads = async (req: Request, res: Response) => {
  try {
    const { sourceId, campaignId, status, search, isDuplicate, marketingOwnerId, tagId } = req.query;
    const actor = (req as any).user;

    const where: any = {};

    const admin = await isMarketingAdmin(actor);
    if (!admin) {
      const subordinateIds = await getSubordinateIds(actor.id);
      const allowedEmployeeIds = [actor.id, ...subordinateIds];
      where.OR = [
        { marketingOwnerId: { in: allowedEmployeeIds } },
        { createdById: { in: allowedEmployeeIds } },
      ];
    }

    if (typeof sourceId === 'string' && sourceId !== '') where.leadSourceId = sourceId;
    if (typeof campaignId === 'string' && campaignId !== '') where.campaignId = campaignId;
    if (typeof status === 'string' && status !== '') where.leadStatus = status;
    if (isDuplicate === 'true') {
      where.marketingContributors = { _count: { gte: 2 } };
    }
    if (typeof marketingOwnerId === 'string' && marketingOwnerId !== '') {
      where.marketingOwnerId = marketingOwnerId;
    }
    if (typeof tagId === 'string' && tagId !== '') {
      where.tags = { some: { tagId } };
    }
    if (typeof search === 'string' && search.trim() !== '') {
      const term = search.trim();
      where.AND = [
        ...(where.AND || []),
        { OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } }
        ]}
      ];
    }

    const leads = await prisma.customer.findMany({
      where,
      orderBy: { joinedDate: 'desc' },
      include: {
        leadSource: true,
        campaign: true,
        province: { select: { name: true } },
        district: { select: { name: true } },
        ward: { select: { name: true } },
        tags: { include: { tag: true } },
        marketingOwner: { select: { fullName: true } },
        employee: { select: { fullName: true } },
        spendingRank: { select: { name: true, code: true } },
        regionRank: { select: { name: true, code: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Khách hàng');

    ws.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Mã KH', key: 'code', width: 14 },
      { header: 'Họ tên', key: 'name', width: 22 },
      { header: 'SĐT', key: 'phone', width: 14 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Giới tính', key: 'gender', width: 10 },
      { header: 'Ngày sinh', key: 'dateOfBirth', width: 12 },
      { header: 'Địa chỉ', key: 'address', width: 28 },
      { header: 'Tỉnh/TP', key: 'province', width: 16 },
      { header: 'Quận/Huyện', key: 'district', width: 16 },
      { header: 'Phường/Xã', key: 'ward', width: 16 },
      { header: 'Loại hình KD', key: 'businessType', width: 14 },
      { header: 'Kênh tiếp cận', key: 'salesChannel', width: 24 },
      { header: 'Ghi chú kênh', key: 'salesChannelNote', width: 22 },
      { header: 'Thẻ khách hàng', key: 'tags', width: 24 },
      { header: 'Ghi chú', key: 'note', width: 24 },
      { header: 'Vườn/Nông trại', key: 'farmName', width: 18 },
      { header: 'Diện tích', key: 'farmArea', width: 10 },
      { header: 'Đơn vị DT', key: 'farmAreaUnit', width: 12 },
      { header: 'Cây trồng chính', key: 'mainCrops', width: 22 },
      { header: 'Số gốc', key: 'mainCropsRootCounts', width: 14 },
      { header: 'Số năm KN', key: 'farmingYears', width: 10 },
      { header: 'Loại đất', key: 'soilType', width: 14 },
      { header: 'Phương pháp canh tác', key: 'farmingMethod', width: 18 },
      { header: 'Loại tưới tiêu', key: 'irrigationType', width: 14 },
      { header: 'MST', key: 'taxCode', width: 14 },
      { header: 'Số TK', key: 'bankAccount', width: 18 },
      { header: 'Ngân hàng', key: 'bankName', width: 18 },
      { header: 'Nền tảng lead', key: 'leadSource', width: 18 },
      { header: 'Chiến dịch', key: 'campaign', width: 20 },
      { header: 'Trạng thái lead', key: 'leadStatus', width: 14 },
      { header: 'NV Marketing', key: 'marketingOwner', width: 18 },
      { header: 'NV phụ trách', key: 'employee', width: 18 },
      { header: 'Trạng thái', key: 'status', width: 12 },
      { header: 'Hạng chi tiêu', key: 'spendingRank', width: 14 },
      { header: 'Hạng khu vực', key: 'regionRank', width: 14 },
      { header: 'Lead hợp lệ', key: 'isValidLead', width: 12 },
      { header: 'Lý do không hợp lệ', key: 'invalidReason', width: 22 },
      { header: 'Ngày tham gia', key: 'joinedDate', width: 14 },
      { header: 'Hết hạn attribution', key: 'attributionExpiredAt', width: 18 },
      { header: 'Nguồn tạo', key: 'createdByRole', width: 12 },
      { header: 'Tổng đơn', key: 'totalOrders', width: 10 },
      { header: 'Tổng giá trị đơn', key: 'totalOrdersValue', width: 14 },
      { header: 'Đơn cuối', key: 'lastOrderAt', width: 14 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    const genderMap: Record<string, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' };

    leads.forEach((lead: any, idx: number) => {
      ws.addRow({
        stt: idx + 1,
        code: lead.code || '',
        name: lead.name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        gender: genderMap[lead.gender] || lead.gender || '',
        dateOfBirth: lead.dateOfBirth ? new Date(lead.dateOfBirth).toLocaleDateString('vi-VN') : '',
        address: lead.address || '',
        province: lead.province?.name || '',
        district: lead.district?.name || '',
        ward: lead.ward?.name || '',
        businessType: lead.businessType || '',
        salesChannel: lead.salesChannel || '',
        salesChannelNote: (lead.salesChannelNote || '').slice(0, 100),
        tags: lead.tags?.map((t: any) => t.tag?.name).filter(Boolean).join('; ') || '',
        note: (lead.note || '').slice(0, 300),
        farmName: lead.farmName || '',
        farmArea: lead.farmArea != null ? lead.farmArea : '',
        farmAreaUnit: lead.farmAreaUnit || '',
        mainCrops: Array.isArray(lead.mainCrops) ? lead.mainCrops.join(', ') : '',
        mainCropsRootCounts:
          Array.isArray(lead.mainCrops) && lead.mainCropsRootCounts && typeof lead.mainCropsRootCounts === 'object' && !Array.isArray(lead.mainCropsRootCounts)
            ? lead.mainCrops
                .filter((crop: string) => ROOT_COUNTABLE_CROPS.has(crop))
                .map((crop: string) => `${crop}:${(lead.mainCropsRootCounts as any)[crop] ?? ''}`)
                .join('; ')
            : '',
        farmingYears: lead.farmingYears != null ? lead.farmingYears : '',
        soilType: lead.soilType || '',
        farmingMethod: lead.farmingMethod || '',
        irrigationType: lead.irrigationType || '',
        taxCode: lead.taxCode || '',
        bankAccount: lead.bankAccount || '',
        bankName: lead.bankName || '',
        leadSource: lead.leadSource?.name || '',
        campaign: lead.campaign?.name || '',
        leadStatus: LEAD_STATUS_VI[lead.leadStatus] || lead.leadStatus || '',
        marketingOwner: lead.marketingOwner?.fullName || '',
        employee: lead.employee?.fullName || '',
        status: lead.status || '',
        spendingRank: lead.spendingRank?.name || lead.spendingRankCode || '',
        regionRank: lead.regionRank?.name || lead.regionRankCode || '',
        isValidLead: lead.isValidLead != null ? (lead.isValidLead ? 'Có' : 'Không') : '',
        invalidReason: (lead.invalidReason || '').slice(0, 200),
        joinedDate: formatICTDate(lead.joinedDate),
        attributionExpiredAt: formatICTDate(lead.attributionExpiredAt),
        createdByRole: lead.createdByRole || '',
        totalOrders: lead.totalOrders != null ? lead.totalOrders : '',
        totalOrdersValue: lead.totalOrdersValue != null ? lead.totalOrdersValue : '',
        lastOrderAt: formatICTDate(lead.lastOrderAt),
      });
    });

    ws.autoFilter = { from: 'A1', to: `AL${leads.length + 1}` };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${CUSTOMER_EXPORT_FILENAME_PREFIX}-marketing.xlsx`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error('Export marketing leads error:', error);
    res.status(500).json({ message: 'Lỗi khi xuất danh sách khách hàng Marketing' });
  }
};

/**
 * Lấy chi tiết khách hàng Marketing: thông tin cơ bản, lịch sử tác động, đơn hàng đầu tiên
 */
export const getMarketingLeadDetail = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const actor = (req as any).user;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        leadSource: true,
        campaign: true,
        tags: {
          include: { tag: true }
        },
        province: { select: { name: true } },
        district: { select: { name: true } },
        ward: { select: { name: true } },
        marketingOwner: {
          select: {
            id: true, fullName: true, avatarUrl: true, phone: true, emailCompany: true
          }
        },
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            employee: {
              select: { id: true, fullName: true, avatarUrl: true }
            }
          }
        },
        orders: {
          orderBy: { orderDate: 'asc' },
          take: 1,
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, code: true } }
              }
            }
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    const adminCheck = await isMarketingAdmin(actor);
    if (!adminCheck) {
      const subordinateIds = await getSubordinateIds(actor.id);
      const allowedEmployeeIds = [actor.id, ...subordinateIds];
      const hasAccess = (customer.marketingOwnerId && allowedEmployeeIds.includes(customer.marketingOwnerId)) ||
                        (customer.createdById && allowedEmployeeIds.includes(customer.createdById));
      if (!hasAccess) {
        return res.status(403).json({ message: 'Bạn không có quyền xem khách hàng này' });
      }
    }

    res.json(customer);
  } catch (error) {
    console.error('Get marketing lead detail error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết khách hàng' });
  }
};

/**
 * Tải file mẫu import khách hàng — đồng nhất với Sales/CSKH/Kho số chung (đủ trường DB)
 */
export const getMarketingLeadImportTemplate = async (_req: Request, res: Response) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Khách hàng');
    ws.columns = CUSTOMER_EXCEL_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    const sampleRow: Record<string, string | number> = {
      phone: '0901234567',
      name: 'Nguyễn Văn A',
      email: 'example@email.com',
      gender: 'Nam',
      dateOfBirth: '15/06/1990',
      address: '123 Đường ABC',
      province: '',
      district: '',
      ward: '',
      businessType: 'Cá nhân',
      salesChannel: 'Giới thiệu (từ KH cũ, đối tác)',
      salesChannelNote: '',
      tags: 'VIP; Tiềm năng',
      note: 'Khách tiềm năng',
      farmName: '',
      farmArea: '5',
      farmAreaUnit: 'ha',
      mainCrops: 'Lúa, Rau màu',
      farmingYears: '10',
      soilType: 'Đất phù sa',
      farmingMethod: 'Truyền thống',
      irrigationType: 'Tưới tay',
      taxCode: '',
      bankAccount: '',
      bankName: '',
      leadStatus: 'NEW',
      leadSource: '',
      campaign: '',
      status: 'ACTIVE',
      employeeCode: '',
      marketingOwnerCode: '',
      spendingRankCode: '',
      regionRankCode: '',
      isValidLead: 'true',
      invalidReason: '',
      joinedDate: '',
      attributionExpiredAt: '',
      createdByRole: 'MARKETING',
    };
    ws.addRow(sampleRow);

    const noteWs = workbook.addWorksheet('Hướng dẫn');
    noteWs.columns = [
      { header: 'Cột', key: 'col', width: 28 },
      { header: 'Bắt buộc', key: 'req', width: 10 },
      { header: 'Ghi chú', key: 'desc', width: 55 },
    ];
    const noteHeader = noteWs.getRow(1);
    noteHeader.font = { bold: true };
    noteHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    const notes = [
      ['Số điện thoại (*)', 'Có', 'Không trùng trong hệ thống'],
      ['Ghi chú (*)', 'Có', 'Mô tả ngắn gọn về khách hàng'],
      ['Họ và tên', 'Không', ''],
      ['Chiến dịch/Nền tảng', 'Không', 'Có thể chọn khi Import (form) thay vì ghi trong file'],
      ['Cây trồng chính', 'Không', 'Cách nhau dấu phẩy'],
      ['Số gốc', 'Không', 'Bắt buộc nếu cây trồng chính thuộc nhóm tính theo gốc. Nhập 1 số.'],
    ];
    notes.forEach(n => noteWs.addRow({ col: n[0], req: n[1], desc: n[2] }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${CUSTOMER_IMPORT_TEMPLATE_FILENAME}`);
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error('Get marketing lead import template error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo file mẫu' });
  }
};

export const importMarketingLeads = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng tải lên file Excel' });
    }
    const actor = (req as any).user;
    const { campaignId, sourceId, employeeId } = req.body;

    let ownerId = actor.id;
    if (employeeId) {
      const admin = await isMarketingAdmin(actor);
      if (admin) {
        const targetEmp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
        if (targetEmp) {
          ownerId = targetEmp.id;
        }
      }
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(req.file.buffer) as any);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount <= 1) {
      return res.status(400).json({ message: 'File Excel trống hoặc không có dữ liệu' });
    }

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = cell.value != null ? String(cell.value).trim() : '';
    });

    const COL_MAP: Record<string, string> = {
      'Họ và tên': 'name', 'Tên': 'name', 'Ho va ten': 'name',
      'Số điện thoại': 'phone', 'SĐT': 'phone', 'Phone': 'phone', 'SDT': 'phone',
      'Email': 'email',
      'Giới tính': 'gender', 'Gioi tinh': 'gender',
      'Ngày sinh': 'dateOfBirth', 'Ngay sinh': 'dateOfBirth',
      'Địa chỉ': 'address', 'Dia chi': 'address',
      'Ghi chú': 'note', 'Ghi chu': 'note', 'Note': 'note',
      'Loại hình KD': 'businessType', 'Loại hình': 'businessType',
      'Diện tích': 'farmArea', 'Dien tich': 'farmArea',
      'Đơn vị DT': 'farmAreaUnit', 'Don vi': 'farmAreaUnit',
      'Loại đất': 'soilType', 'Loai dat': 'soilType',
      'Năm KN': 'farmingYears', 'Nam kinh nghiem': 'farmingYears',
      'Cây trồng chính': 'mainCrops', 'Cay trong': 'mainCrops',
      'Số gốc': 'mainCropsRootCounts',
    };

    const colIndex: Record<string, number> = {};
    headers.forEach((h, i) => {
      const mapped = COL_MAP[h];
      if (mapped) colIndex[mapped] = i;
    });

    if (!colIndex['phone']) {
      return res.status(400).json({ message: 'File Excel thiếu cột "Số điện thoại" hoặc "SĐT"' });
    }

    const results = { total: 0, success: 0, failed: 0, duplicates: 0, errors: [] as string[] };

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const getVal = (key: string) => {
        const ci = colIndex[key];
        if (!ci) return null;
        const v = row.getCell(ci).value;
        return v != null ? String(v).trim() : null;
      };

      const phone = getVal('phone');
      if (!phone) continue;
      results.total++;

      const trimmedPhone = normalizePhone(phone);

      try {
        const existing = await findExistingByPhone(trimmedPhone);
        if (existing) {
          results.duplicates++;
          const rowNote = getVal('note') || `Import dòng ${i}`;
          await addDuplicateNote(existing.id, actor.id, actor.fullName || actor.name || 'Unknown', rowNote, 'marketing_duplicate_interaction');
          await upsertMarketingContributor(existing.id, actor.id);
          logDuplicateAction(actor.id, actor.fullName || actor.name || 'Unknown', actor.phone, 'duplicate_lead_detected', existing.id, `Import Excel: SĐT trùng ${trimmedPhone}. ${rowNote}`);
          await notifyDuplicateStakeholders({
            existingCustomer: existing,
            normalizedPhone: trimmedPhone,
            actorId: actor.id,
            actorName: actor.fullName || actor.name || 'N/A',
            actorPhone: actor.phone,
            sourceLabel: 'Marketing (Import Excel)',
            note: rowNote,
            customerId: existing.id,
          });
          results.errors.push(`Dòng ${i}: SĐT ${trimmedPhone} đã tồn tại - đã ghi note và gửi thông báo`);
          continue;
        }

        const count = await prisma.customer.count();
        const code = `KH-${String(count + 1).padStart(6, '0')}`;
        const attributionDays = await getMarketingAttributionDays();
        const now = new Date();
        const attributionExpiredAt = getAttributionExpiredAt(now, attributionDays);

        const genderRaw = getVal('gender');
        let gender: string | null = null;
        if (genderRaw) {
          const g = genderRaw.toLowerCase();
          if (g === 'nam' || g === 'male') gender = 'male';
          else if (g === 'nữ' || g === 'nu' || g === 'female') gender = 'female';
          else gender = 'other';
        }

        let dateOfBirth: Date | null = null;
        const dobRaw = getVal('dateOfBirth');
        if (dobRaw) {
          const parsed = new Date(dobRaw);
          if (!isNaN(parsed.getTime())) dateOfBirth = parsed;
        }

        const mainCropsRaw = getVal('mainCrops');
        const mainCrops = mainCropsRaw ? mainCropsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        const rowNote = getVal('note');
        if (!rowNote) {
          throw new Error('Ghi chú là bắt buộc');
        }

        let mainCropsRootCounts: Record<string, number> = {};
        if (mainCrops.length > 0) {
          const selectedRootCrops = mainCrops.filter((c) => ROOT_COUNTABLE_CROPS.has(c));
          if (selectedRootCrops.length > 0) {
            const rootCountRaw = getVal('mainCropsRootCounts');
            const rootCount = rootCountRaw ? parseInt(rootCountRaw) : NaN;
            if (!Number.isFinite(rootCount) || rootCount <= 0) {
              throw new Error(
                `Số gốc là bắt buộc và phải > 0 cho các cây: ${selectedRootCrops.join(', ')}`
              );
            }

            for (const crop of selectedRootCrops) mainCropsRootCounts[crop] = rootCount;
          }
        }

        const validation = validateMainCropsAndRootCounts({
          mainCrops,
          mainCropsRootCounts,
        });
        if (!validation.isValid) {
          throw new Error(validation.errors.join('\n'));
        }

        const newCustomer = await prisma.customer.create({
          data: {
            code,
            name: getVal('name') || null,
            phone: trimmedPhone,
            email: getVal('email') || null,
            gender,
            dateOfBirth,
            address: getVal('address') || null,
            note: rowNote,
            businessType: getVal('businessType') || null,
            farmArea: getVal('farmArea') ? parseFloat(getVal('farmArea')!) : null,
            farmAreaUnit: getVal('farmAreaUnit') || null,
            soilType: getVal('soilType') || null,
            farmingYears: getVal('farmingYears') ? parseInt(getVal('farmingYears')!) : null,
            mainCrops,
            mainCropsRootCounts: Object.keys(mainCropsRootCounts).length
              ? mainCropsRootCounts
              : undefined,
            createdByRole: 'MARKETING',
            createdById: actor.id,
            marketingOwnerId: ownerId,
            employeeId: null,
            attributionExpiredAt,
            leadSourceId: sourceId || null,
            campaignId: campaignId || null,
            leadStatus: 'NEW',
            isValidLead: true,
          }
        });
        await upsertMarketingContributor(newCustomer.id, actor.id);
        if (ownerId) await upsertMarketingContributor(newCustomer.id, ownerId);
        const dpEntry = await prisma.dataPool.create({
          data: {
            customerId: newCustomer.id,
            source: 'IMPORT',
            status: 'AVAILABLE',
            priority: 1,
            poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
            note: `Import Excel bởi ${actor.fullName || actor.id}`,
            processingStatus: DEFAULT_LEAD_PROCESSING_STATUS_CODE,
          }
        }).catch(() => null);

        if (dpEntry && ownerId) {
          await assignSingleMarketingPoolToSales({
            dpEntryId: dpEntry.id,
            customerId: newCustomer.id,
            anchorEmployeeId: ownerId,
            now,
          }).catch(() => {});
        }
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Dòng ${i}: ${err.message || 'Lỗi không xác định'}`);
      }
    }

    res.json({
      message: `Import hoàn tất: ${results.success} thành công, ${results.duplicates} trùng, ${results.failed} lỗi`,
      ...results
    });
  } catch (error) {
    console.error('Import marketing leads error:', error);
    res.status(500).json({ message: 'Lỗi khi import file Excel' });
  }
};

export const createMarketingLead = async (req: Request, res: Response) => {
  try {
    const {
      name, phone, email, address, leadSourceId, campaignId,
      gender, dateOfBirth, note,
      wardId, districtId, provinceId,
      farmName, farmArea, farmAreaUnit, mainCrops, mainCropsRootCounts,
      farmingYears,
      farmingMethod, irrigationType, soilType,
      businessType, taxCode, bankAccount, bankName,
      tagIds
    } = req.body;
    const actor = (req as any).user;

    if (!phone) {
      return res.status(400).json({ message: 'Số điện thoại là bắt buộc' });
    }

    const campaignIdStr =
      typeof campaignId === 'string' && campaignId.trim() ? campaignId.trim() : '';

    const noteTrim =
      note !== undefined && note !== null && String(note).trim() !== '' ? String(note).trim() : '';
    if (!noteTrim) {
      return res.status(400).json({ message: 'Ghi chú là bắt buộc' });
    }

    const trimmedPhone = normalizePhone(String(phone));

    if (!actor?.id) {
      return res.status(401).json({
        message: 'Chưa đăng nhập hoặc không xác định được người dùng.',
      });
    }

    const existingSameCampaign = await findExistingByPhone(trimmedPhone);
    if (existingSameCampaign?.campaignId === campaignIdStr) {
      await logAudit({
        ...getAuditUser(req),
        action: 'Cảnh báo',
        object: 'Lead marketing',
        objectId: existingSameCampaign.id,
        result: 'SUCCESS',
        details: `Nhập số trùng trong cùng chiến dịch. SĐT ${trimmedPhone}, chiến dịch ${campaignIdStr}.`,
        req,
      });
      await addDuplicateNote(
        existingSameCampaign.id,
        actor.id,
        actor.fullName || actor.name || 'Unknown',
        noteTrim,
        'marketing_duplicate_interaction'
      );
      await notifyDuplicateStakeholders({
        existingCustomer: existingSameCampaign,
        normalizedPhone: trimmedPhone,
        actorId: actor.id,
        actorName: actor.fullName || actor.name || 'N/A',
        actorPhone: actor.phone,
        sourceLabel: 'Marketing (cùng chiến dịch)',
        note: noteTrim,
        customerId: existingSameCampaign.id,
      });
      return res.status(200).json({
        duplicate: true,
        sameCampaignWarning: true,
        customerId: existingSameCampaign.id,
        message: 'Số điện thoại đã tồn tại trong chiến dịch này.',
        responsibleStaff: getDuplicateStaffDisplayForClient(existingSameCampaign),
      });
    }

    // Kiểm tra trùng (chiến dịch khác / khách đã có): ghi note, lịch sử, thông báo NV phụ trách
    const duplicateResult = await checkDuplicateAndHandle({
      phone: trimmedPhone,
      actorId: actor.id,
      actorName: actor.fullName || actor.name || 'Unknown',
      actorPhone: actor.phone,
      note: noteTrim || undefined,
      campaignId: campaignIdStr,
    });

    if (duplicateResult.rejectedDuplicate) {
      if (duplicateResult.existingCustomer) {
        await notifyDuplicateStakeholders({
          existingCustomer: duplicateResult.existingCustomer,
          normalizedPhone: trimmedPhone,
          actorId: actor.id,
          actorName: actor.fullName || actor.name || 'N/A',
          actorPhone: actor.phone,
          sourceLabel: 'Marketing (từ chối trùng)',
          note: noteTrim,
          customerId: duplicateResult.customerId!,
        });
      }
      return res.status(400).json({
        message:
          duplicateResult.message ||
          'Hệ thống không cho phép nhập số trùng. Bật «cho phép marketing nhập số trùng» trong Tham số vận hành nếu cần.',
        duplicate: true,
        rejectedDuplicate: true,
        customerId: duplicateResult.customerId,
        responsibleStaff: duplicateResult.existingCustomer
          ? getDuplicateStaffDisplayForClient(duplicateResult.existingCustomer)
          : undefined,
      });
    }

    if (duplicateResult.duplicate && duplicateResult.existingCustomer) {
      await notifyDuplicateStakeholders({
        existingCustomer: duplicateResult.existingCustomer,
        normalizedPhone: trimmedPhone,
        actorId: actor.id,
        actorName: actor.fullName || actor.name || 'N/A',
        actorPhone: actor.phone,
        sourceLabel: 'Marketing',
        note: noteTrim,
        customerId: duplicateResult.customerId!,
      });
      return res.status(200).json({
        isNew: false,
        duplicate: true,
        case: duplicateResult.case,
        customerId: duplicateResult.customerId,
        message: duplicateResult.message,
        duplicateLead: duplicateResult.duplicateLead,
        responsibleStaff: getDuplicateStaffDisplayForClient(duplicateResult.existingCustomer),
      });
    }

    const mainCropsNormalized = Array.isArray(mainCrops)
      ? mainCrops.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
      : [];
    const mainCropsRootCountsNormalized = normalizeMainCropsRootCounts(mainCropsRootCounts);
    if (mainCropsNormalized.length > 0) {
      const validation = validateMainCropsAndRootCounts({
        mainCrops: mainCropsNormalized,
        mainCropsRootCounts: mainCropsRootCountsNormalized,
      });
      if (!validation.isValid) {
        return res.status(400).json({ message: validation.errors.join('\n') });
      }
    }

    const count = await prisma.customer.count();
    const code = `KH-${String(count + 1).padStart(6, '0')}`;
    const attributionDays = await getMarketingAttributionDays();
    const now = new Date();
    const attributionExpiredAt = getAttributionExpiredAt(now, attributionDays);

    const lead = await prisma.customer.create({
      data: {
        code,
        name: name || null,
        phone: trimmedPhone,
        email: email || null,
        gender: gender || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || null,
        wardId: wardId || null,
        districtId: districtId || null,
        provinceId: provinceId || null,
        farmName: farmName || null,
        farmArea: farmArea ? parseFloat(farmArea) : null,
        farmAreaUnit: farmAreaUnit || null,
        mainCrops: mainCropsNormalized,
        mainCropsRootCounts: Object.keys(mainCropsRootCountsNormalized).length
          ? mainCropsRootCountsNormalized
          : undefined,
        farmingYears: farmingYears ? parseInt(farmingYears) : null,
        farmingMethod: farmingMethod || null,
        irrigationType: irrigationType || null,
        soilType: soilType || null,
        businessType: businessType || null,
        taxCode: taxCode || null,
        bankAccount: bankAccount || null,
        bankName: bankName || null,
        note: noteTrim || null,
        createdByRole: 'MARKETING',
        createdById: actor.id,
        employeeId: null,
        marketingOwnerId: actor.id,
        attributionExpiredAt,
        leadSourceId: leadSourceId || null,
        campaignId: campaignId || null,
        leadStatus: 'NEW',
        isValidLead: true
      }
    });

    await upsertMarketingContributor(lead.id, actor.id);

    if (tagIds && tagIds.length > 0) {
      await prisma.customerTagAssignment.createMany({
        data: tagIds.map((tagId: string) => ({
          customerId: lead.id,
          tagId,
          assignedBy: actor.id
        }))
      });
    }

    const intCount = await prisma.customerInteraction.count();
    await prisma.customerInteraction.create({
      data: {
        code: `INT-${String(intCount + 1).padStart(6, '0')}`,
        customerId: lead.id,
        employeeId: actor.id,
        type: 'lead_created',
        content: noteTrim
          ? noteTrim
          : `[Hệ thống] Lead được tạo bởi ${actor.fullName || actor.id} lúc ${new Date().toLocaleString('vi-VN')}`,
      }
    });

    const dpEntry = await prisma.dataPool.create({
      data: {
        customerId: lead.id,
        source: 'MARKETING',
        status: 'AVAILABLE',
        priority: 1,
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
        note: `Tạo thủ công bởi ${actor.fullName || actor.id || 'Marketing'}`,
        processingStatus: DEFAULT_LEAD_PROCESSING_STATUS_CODE,
      }
    }).catch(() => null);

    // Auto-assign: luôn thử — ưu tiên luồng khối (dataFlowShares) + chia đều NV trong đơn vị lá; fallback team_distribution_ratios
    if (dpEntry) {
      await assignSingleMarketingPoolToSales({
        dpEntryId: dpEntry.id,
        customerId: lead.id,
        anchorEmployeeId: actor.id,
        now,
      });
    }

    if (dpEntry) {
      await notifySalesMarketingLeadAssigned([dpEntry.id]);
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'Tạo mới',
      object: 'Lead marketing',
      objectId: lead.id,
      result: 'SUCCESS',
      details: `Tạo lead "${lead.name || lead.phone}" — SĐT: ${lead.phone} (mã KH: ${lead.code}).`,
      newValues: { phone: lead.phone, name: lead.name },
      req,
    });

    res.status(201).json(lead);
  } catch (error) {
    console.error('Create marketing lead error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo khách hàng Marketing' });
  }
};

// ==================== MARKETING COST APIs ====================

/**
 * Lấy danh sách chi phí của chiến dịch
 */
export const getCampaignCosts = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const actor = (req as any).user;
    const { startDate, endDate, costType, platform } = req.query;

    const camp = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { createdByEmployeeId: true },
    });
    if (!camp) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (
      !(await canAccessMarketingCampaignByCreator(actor, camp.createdByEmployeeId)) &&
      !(await isMarketingAdmin(actor))
    ) {
      return res.status(403).json({ message: 'Bạn không có quyền xem chi phí chiến dịch này' });
    }

    const where: any = { campaignId };

    if (startDate) {
      where.costDate = { ...where.costDate, gte: new Date(startDate as string) };
    }
    if (endDate) {
      where.costDate = { ...where.costDate, lte: new Date(endDate as string) };
    }
    if (costType) {
      where.costType = costType;
    }
    if (platform) {
      where.platform = platform;
    }

    const costs = await prisma.marketingCampaignCost.findMany({
      where,
      include: {
        source: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } }
      },
      orderBy: { costDate: 'desc' }
    });

    // Tính tổng
    const totalAmount = costs.reduce((sum, c) => sum + Number(c.amount), 0);
    const totalImpressions = costs.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalClicks = costs.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalReach = costs.reduce((sum, c) => sum + (c.reach || 0), 0);

    res.json({
      data: costs,
      summary: {
        totalAmount,
        totalImpressions,
        totalClicks,
        totalReach,
        avgCTR: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0, // Click-Through Rate
        avgCPC: totalClicks > 0 ? (totalAmount / totalClicks).toFixed(0) : 0 // Cost Per Click
      }
    });
  } catch (error) {
    console.error('Get campaign costs error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi phí chiến dịch' });
  }
};

/**
 * Thêm chi phí cho chiến dịch
 * Bắt buộc phải chọn nhân viên hoặc nhóm nhân viên để phân bổ chi phí
 */
export const createCampaignCost = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const actor = (req as any).user;
    const {
      costDate,
      amount,
      costType,
      adAccountId,
      impressions,
      clicks,
      reach,
      description,
      attachmentUrl,
    } = req.body;

    if (!costDate || !amount) {
      return res.status(400).json({ message: 'Ngày và số tiền là bắt buộc' });
    }

    // Chiến dịch bắt buộc có nền tảng; chi phí kế thừa sourceId + platform từ chiến dịch (không gửi từ client).
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: {
        createdByEmployeeId: true,
        sourceId: true,
        source: { select: { id: true, name: true, code: true } },
      },
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (!campaign.sourceId || !campaign.source) {
      return res
        .status(400)
        .json({ message: 'Chiến dịch chưa gắn nền tảng; không thể thêm chi phí.' });
    }
    const platformResolved = deriveCostPlatformFromMarketingSource(campaign.source);

    if (
      !(await canAccessMarketingCampaignByCreator(actor, campaign.createdByEmployeeId)) &&
      !(await isMarketingAdmin(actor))
    ) {
      return res.status(403).json({ message: 'Bạn không có quyền nhập chi phí cho chiến dịch này' });
    }

    // Gán chi phí cho người tạo chiến dịch
    const assignedEmployeeIds = [campaign.createdByEmployeeId];
    const allocatedAmount = Number(amount);

    const cost = await prisma.marketingCampaignCost.create({
      data: {
        campaignId,
        costDate: new Date(costDate),
        amount: new Decimal(amount),
        costType: costType || 'AD_SPEND',
        platform: platformResolved,
        adAccountId: adAccountId || null,
        impressions: impressions ? parseInt(impressions) : null,
        clicks: clicks ? parseInt(clicks) : null,
        reach: reach ? parseInt(reach) : null,
        description: description || null,
        attachmentUrl: attachmentUrl || null,
        sourceId: campaign.sourceId,
        createdById: actor.id,
        assignedEmployees: {
          create: assignedEmployeeIds.map(empId => ({
            employeeId: empId,
            allocatedAmount: new Decimal(allocatedAmount)
          }))
        }
      },
      include: {
        source: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        employeeGroup: { select: { id: true, name: true } },
        assignedEmployees: {
          include: {
            // Get employee info
          }
        }
      }
    });

    // Get employee names for response
    const employees = await prisma.employee.findMany({
      where: { id: { in: assignedEmployeeIds } },
      select: { id: true, fullName: true }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'Tạo mới',
      object: 'Chi phí chiến dịch',
      objectId: cost.id,
      result: 'SUCCESS',
      details: `Thêm chi phí ${Number(amount).toLocaleString('vi-VN')}đ (ngày ${mkCostPlain(cost).costDate}).\nPhân bổ cho ${assignedEmployeeIds.length} nhân viên.`,
      newValues: mkCostPlain(cost),
      req,
    });

    res.status(201).json({
      ...cost,
      assignedEmployeeNames: employees.map(e => e.fullName),
      allocatedAmountPerEmployee: allocatedAmount
    });
  } catch (error) {
    console.error('Create campaign cost error:', error);
    res.status(500).json({ message: 'Lỗi khi thêm chi phí' });
  }
};

/**
 * Cập nhật chi phí
 */
export const updateCampaignCost = async (req: Request, res: Response) => {
  try {
    const costId = req.params.costId as string;
    const actor = (req as any).user;
    const updates = req.body;

    const beforeCost = await prisma.marketingCampaignCost.findUnique({ where: { id: costId } });
    if (!beforeCost) {
      return res.status(404).json({ message: 'Không tìm thấy chi phí' });
    }

    const campaignForCost = await prisma.marketingCampaign.findUnique({
      where: { id: beforeCost.campaignId },
      select: {
        createdByEmployeeId: true,
        sourceId: true,
        source: { select: { id: true, name: true, code: true } },
      },
    });
    if (!campaignForCost?.sourceId || !campaignForCost.source) {
      return res
        .status(400)
        .json({ message: 'Chiến dịch chưa gắn nền tảng; không thể cập nhật chi phí.' });
    }
    if (
      !(await canAccessMarketingCampaignByCreator(actor, campaignForCost.createdByEmployeeId)) &&
      !(await isMarketingAdmin(actor))
    ) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật chi phí chiến dịch này' });
    }
    const platformResolved = deriveCostPlatformFromMarketingSource(campaignForCost.source);
    // Không cho client đổi nền tảng / sourceId — luôn theo chiến dịch
    const { platform: _ignorePlat, sourceId: _ignoreSrc, ...updatesRest } = updates;

    // Nếu thay đổi nhân viên/nhóm hoặc số tiền, cần cập nhật lại phân bổ
    const needReassign = updatesRest.employeeGroupId !== undefined || 
                         updatesRest.employeeIds !== undefined || 
                         updatesRest.amount !== undefined;

    let assignedEmployeeIds: string[] = [];
    let newAmount = updatesRest.amount;

    if (needReassign) {
      // Get current cost if amount not provided
      if (newAmount === undefined) {
        const currentCost = await prisma.marketingCampaignCost.findUnique({
          where: { id: costId }
        });
        newAmount = currentCost?.amount;
      }

      // Determine employees to assign
      if (updatesRest.employeeGroupId) {
        const groupMembers = await prisma.marketingEmployeeGroupMember.findMany({
          where: { groupId: updatesRest.employeeGroupId }
        });
        assignedEmployeeIds = groupMembers.map(m => m.employeeId);
      } else if (updatesRest.employeeIds?.length) {
        assignedEmployeeIds = updatesRest.employeeIds;
      } else {
        // Keep existing assignments
        const existingAssignments = await prisma.marketingCostAssignment.findMany({
          where: { costId }
        });
        assignedEmployeeIds = existingAssignments.map(a => a.employeeId);
      }

      // Delete existing assignments
      await prisma.marketingCostAssignment.deleteMany({
        where: { costId }
      });

      // Create new assignments
      if (assignedEmployeeIds.length > 0) {
        const allocatedAmount = Number(newAmount) / assignedEmployeeIds.length;
        await prisma.marketingCostAssignment.createMany({
          data: assignedEmployeeIds.map(empId => ({
            costId,
            employeeId: empId,
            allocatedAmount
          }))
        });
      }
    }

    const cost = await prisma.marketingCampaignCost.update({
      where: { id: costId },
      data: {
        platform: platformResolved,
        sourceId: campaignForCost.sourceId,
        ...(updatesRest.costDate && { costDate: new Date(updatesRest.costDate) }),
        ...(updatesRest.amount !== undefined && { amount: new Decimal(updatesRest.amount) }),
        ...(updatesRest.costType && { costType: updatesRest.costType }),
        ...(updatesRest.adAccountId !== undefined && { adAccountId: updatesRest.adAccountId }),
        ...(updatesRest.impressions !== undefined && { impressions: updatesRest.impressions ? parseInt(updatesRest.impressions, 10) : null }),
        ...(updatesRest.clicks !== undefined && { clicks: updatesRest.clicks ? parseInt(updatesRest.clicks, 10) : null }),
        ...(updatesRest.reach !== undefined && { reach: updatesRest.reach ? parseInt(updatesRest.reach, 10) : null }),
        ...(updatesRest.description !== undefined && { description: updatesRest.description }),
        ...(updatesRest.attachmentUrl !== undefined && { attachmentUrl: updatesRest.attachmentUrl }),
        ...(updatesRest.employeeGroupId !== undefined && { employeeGroupId: updatesRest.employeeGroupId || null })
      },
      include: {
        source: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        employeeGroup: { select: { id: true, name: true } },
        assignedEmployees: true
      }
    });

    const beforePlain = mkCostPlain(beforeCost);
    const afterPlain = mkCostPlain(cost);
    let costDetails = describeChangesVi(
      beforePlain as Record<string, unknown>,
      afterPlain as Record<string, unknown>,
      MK_COST_LABELS,
    );
    const assignN = cost.assignedEmployees?.length ?? 0;
    const assignLine = `Phân bổ nhân viên: ${assignN} người.`;
    costDetails = costDetails ? `${costDetails}\n${assignLine}` : assignLine;
    if (!costDetails.trim()) {
      costDetails = 'Cập nhật chi phí — không phát hiện thay đổi nội dung.';
    }
    await logAudit({
      ...getAuditUser(req),
      action: 'Cập nhật',
      object: 'Chi phí chiến dịch',
      objectId: costId,
      result: 'SUCCESS',
      details: costDetails,
      oldValues: beforePlain,
      newValues: afterPlain,
      req,
    });

    res.json(cost);
  } catch (error) {
    console.error('Update campaign cost error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật chi phí' });
  }
};

/**
 * Xóa chi phí
 */
export const deleteCampaignCost = async (req: Request, res: Response) => {
  try {
    const costId = req.params.costId as string;
    const actor = (req as any).user;

    const existingCost = await prisma.marketingCampaignCost.findUnique({ where: { id: costId } });
    if (!existingCost) {
      return res.status(404).json({ message: 'Không tìm thấy chi phí' });
    }

    const campaignForCost = await prisma.marketingCampaign.findUnique({
      where: { id: existingCost.campaignId },
      select: { createdByEmployeeId: true },
    });
    if (!campaignForCost) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (
      !(await canAccessMarketingCampaignByCreator(actor, campaignForCost.createdByEmployeeId)) &&
      !(await isMarketingAdmin(actor))
    ) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa chi phí chiến dịch này' });
    }

    await prisma.marketingCampaignCost.delete({ where: { id: costId } });

    await logAudit({
      ...getAuditUser(req),
      action: 'Xóa',
      object: 'Chi phí chiến dịch',
      objectId: costId,
      result: 'SUCCESS',
      details: `Xóa chi phí ngày ${mkCostPlain(existingCost).costDate}, số tiền ${Number(existingCost.amount).toLocaleString('vi-VN')}đ.`,
      oldValues: mkCostPlain(existingCost),
      req,
    });

    res.json({ message: 'Đã xóa chi phí' });
  } catch (error) {
    console.error('Delete campaign cost error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa chi phí' });
  }
};

/**
 * Đẩy lead từ Marketing sang DataPool (bulk)
 */
export const pushLeadsToDataPool = async (req: Request, res: Response) => {
  try {
    const { customerIds } = req.body;
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 khách hàng' });
    }

    const existingPool = await prisma.dataPool.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true },
    });
    const alreadyInPool = new Set(existingPool.map((p) => p.customerId));
    const newIds = customerIds.filter((id: string) => !alreadyInPool.has(id));

    if (newIds.length === 0) {
      return res.json({ message: 'Tất cả khách hàng đã có trong kho Sales / DataPool', added: 0, skipped: customerIds.length });
    }

    await prisma.dataPool.createMany({
      data: newIds.map((customerId: string) => ({
        customerId,
        source: 'MARKETING' as any,
        status: 'AVAILABLE' as any,
        priority: 1,
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
        note: 'Chuyển thủ công từ Marketing',
        processingStatus: DEFAULT_LEAD_PROCESSING_STATUS_CODE,
      })),
      skipDuplicates: true,
    });

    const createdPoolRows = await prisma.dataPool.findMany({
      where: { customerId: { in: newIds } },
      select: { id: true },
    });
    const newPoolIds = createdPoolRows.map((p) => p.id);

    const actor = (req as any).user;
    const autoAttempted = Boolean(actor?.id && newPoolIds.length > 0);
    const pushNow = new Date();

    if (autoAttempted && actor?.id) {
      for (const poolId of newPoolIds) {
        const pool = await prisma.dataPool.findUnique({
          where: { id: poolId },
          select: { customerId: true, status: true },
        });
        if (!pool || pool.status !== 'AVAILABLE') continue;
        await assignSingleMarketingPoolToSales({
          dpEntryId: poolId,
          customerId: pool.customerId,
          anchorEmployeeId: actor.id,
          now: pushNow,
        });
      }
    }

    await notifySalesMarketingLeadAssigned(newPoolIds);

    const assignedCount = await prisma.dataPool.count({
      where: { id: { in: newPoolIds }, status: 'ASSIGNED' },
    });

    const autoPart = autoAttempted
      ? `${assignedCount}/${newPoolIds.length} lead đã gán (luồng khối trước, fallback tỉ lệ team)`
      : 'không neo NV (thiếu actor JWT) — lead chưa phân tự động';

    await logAudit({
      ...getAuditUser(req),
      action: 'PUSH_TO_DATA_POOL',
      object: 'DATA_POOL',
      result: 'SUCCESS',
      details: `Đẩy ${newIds.length} khách từ Marketing vào kho Sales; phân tự động: ${autoPart}`,
      req,
    });

    res.json({
      message: autoAttempted
        ? `Đã chuyển ${newIds.length} khách vào kho; ${assignedCount} lead đã phân cho NV Sales.`
        : `Đã chuyển ${newIds.length} khách vào kho Sales (chưa phân tự động — không xác định NV neo).`,
      added: newIds.length,
      skipped: alreadyInPool.size,
      ratioAssigned: assignedCount,
      autoDistributeApplied: autoAttempted,
    });
  } catch (error) {
    console.error('Push leads to data pool error:', error);
    res.status(500).json({ message: 'Lỗi khi chuyển vào kho số chung' });
  }
};

/**
 * Cập nhật trạng thái lead từ Marketing
 */
export const updateMarketingLeadStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { leadStatus, campaignId, leadSourceId } = req.body;

    const validStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'INVALID', 'CONVERTED'];
    
    const updateData: any = {};
    if (leadStatus) {
      if (!validStatuses.includes(leadStatus)) {
        return res.status(400).json({ message: `Trạng thái không hợp lệ. Cho phép: ${validStatuses.join(', ')}` });
      }
      updateData.leadStatus = leadStatus;
    }

    if (campaignId !== undefined) {
      updateData.campaignId = campaignId || null;
    }
    if (leadSourceId !== undefined) {
      updateData.leadSourceId = leadSourceId || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật' });
    }

    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, createdByRole: true, campaignId: true, leadSourceId: true } });
    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    const actor = (req as any).user;
    if (actor) {
      const intCount = await prisma.customerInteraction.count();
      let content = '';
      if (leadStatus) content += `Cập nhật trạng thái lead: ${leadStatus}. `;
      if (campaignId !== undefined) content += `Cập nhật chiến dịch: ${campaignId || 'Gỡ gán'}. `;
      if (leadSourceId !== undefined) content += `Cập nhật nền tảng: ${leadSourceId || 'Gỡ gán'}. `;

      await prisma.customerInteraction.create({
        data: {
          code: `INT-${String(intCount + 1).padStart(6, '0')}`,
          customerId: id,
          employeeId: actor.id,
          type: 'FIELD_UPDATE',
          content: content.trim(),
        },
      });
    }

    res.json({ message: 'Cập nhật thành công', updatedFields: Object.keys(updateData) });
  } catch (error) {
    console.error('Update marketing lead status error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái' });
  }
};

/**
 * Báo cáo hiệu quả marketing - Xếp hạng theo doanh số
 * Tính các chỉ số: CPL, CPA, ROAS, ROI, CVR
 */
export const getMarketingEffectiveness = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, sourceId } = req.query;
    const actor = (req as any).user;

    const campaignWhere: any = {
      ...(sourceId && { sourceId: sourceId as string }),
      ...(startDate && { startDate: { gte: new Date(startDate as string) } }),
      ...(endDate && { endDate: { lte: new Date(endDate as string) } }),
    };
    if (actor?.id && !(await canViewAllCompanyMarketingCampaigns(actor))) {
      const allowed = await getAllowedMarketingCampaignCreatorIds(actor);
      campaignWhere.createdByEmployeeId = { in: allowed };
    }

    // Lấy chiến dịch (theo phạm vi người tạo) với chi phí và lead
    const campaigns = await prisma.marketingCampaign.findMany({
      where: campaignWhere,
      include: {
        source: { select: { id: true, name: true } },
        costs: true,
        customers: {
          select: {
            id: true,
            leadStatus: true,
            totalOrdersValue: true,
            orders: {
              where: { shippingStatus: 'DELIVERED' },
              select: { finalAmount: true }
            }
          }
        },
        createdByEmployee: { select: { id: true, fullName: true } }
      }
    });

    // Tính toán hiệu quả cho từng chiến dịch
    const effectivenessData = campaigns.map((campaign: any) => {
      // Tổng chi phí
      const totalCost = campaign.costs.reduce((sum: number, c: any) => sum + Number(c.amount), 0);
      
      // Tổng impressions, clicks, reach
      const totalImpressions = campaign.costs.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0);
      const totalClicks = campaign.costs.reduce((sum: number, c: any) => sum + (c.clicks || 0), 0);
      const totalReach = campaign.costs.reduce((sum: number, c: any) => sum + (c.reach || 0), 0);
      
      // Số lead
      const totalLeads = campaign.customers.length;
      
      // Số khách hàng đã mua (converted)
      const convertedCustomers = campaign.customers.filter((c: any) => c.leadStatus === 'CUSTOMER').length;
      
      // Tổng doanh số từ chiến dịch
      const totalRevenue = campaign.customers.reduce((sum: number, c: any) => {
        return sum + c.orders.reduce((orderSum: number, o: any) => orderSum + Number(o.finalAmount), 0);
      }, 0);

      // Tính các chỉ số
      const cpl = totalLeads > 0 ? totalCost / totalLeads : 0; // Cost Per Lead
      const cpa = convertedCustomers > 0 ? totalCost / convertedCustomers : 0; // Cost Per Acquisition
      const cvr = totalLeads > 0 ? (convertedCustomers / totalLeads) * 100 : 0; // Conversion Rate
      const roas = totalCost > 0 ? totalRevenue / totalCost : 0; // Return On Ad Spend
      const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0; // Return On Investment
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0; // Click-Through Rate
      const cpc = totalClicks > 0 ? totalCost / totalClicks : 0; // Cost Per Click
      const cpm = totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0; // Cost Per Mille (1000 impressions)

      return {
        campaignId: campaign.id,
        campaignCode: campaign.code,
        campaignName: campaign.name,
        status: campaign.status,
        source: campaign.source,
        createdBy: campaign.createdByEmployee,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        budget: campaign.totalBudget ? Number(campaign.totalBudget) : 0,
        
        // Metrics
        metrics: {
          totalCost,
          totalImpressions,
          totalClicks,
          totalReach,
          totalLeads,
          convertedCustomers,
          totalRevenue
        },
        
        // KPIs
        kpis: {
          cpl: Math.round(cpl), // Chi phí trên mỗi lead
          cpa: Math.round(cpa), // Chi phí trên mỗi khách hàng
          cvr: parseFloat(cvr.toFixed(2)), // Tỷ lệ chuyển đổi (%)
          roas: parseFloat(roas.toFixed(2)), // Doanh thu / Chi phí
          roi: parseFloat(roi.toFixed(2)), // Lợi nhuận / Chi phí (%)
          ctr: parseFloat(ctr.toFixed(2)), // Tỷ lệ click (%)
          cpc: Math.round(cpc), // Chi phí mỗi click
          cpm: Math.round(cpm) // Chi phí 1000 lượt hiển thị
        }
      };
    });

    // Xếp hạng theo doanh số (totalRevenue)
    const rankedByRevenue = [...effectivenessData]
      .sort((a, b) => b.metrics.totalRevenue - a.metrics.totalRevenue)
      .map((item, index) => ({ ...item, revenueRank: index + 1 }));

    // Xếp hạng theo ROI
    const rankedByROI = [...effectivenessData]
      .sort((a, b) => b.kpis.roi - a.kpis.roi)
      .map((item, index) => ({ ...item, roiRank: index + 1 }));

    // Xếp hạng theo ROAS
    const rankedByROAS = [...effectivenessData]
      .sort((a, b) => b.kpis.roas - a.kpis.roas)
      .map((item, index) => ({ ...item, roasRank: index + 1 }));

    // Merge rankings
    const finalData = rankedByRevenue.map(item => {
      const roiItem = rankedByROI.find(r => r.campaignId === item.campaignId);
      const roasItem = rankedByROAS.find(r => r.campaignId === item.campaignId);
      return {
        ...item,
        roiRank: roiItem?.roiRank || 0,
        roasRank: roasItem?.roasRank || 0
      };
    });

    // Tổng hợp toàn bộ
    const overallSummary = {
      totalCampaigns: campaigns.length,
      totalCost: effectivenessData.reduce((sum, c) => sum + c.metrics.totalCost, 0),
      totalLeads: effectivenessData.reduce((sum, c) => sum + c.metrics.totalLeads, 0),
      totalConversions: effectivenessData.reduce((sum, c) => sum + c.metrics.convertedCustomers, 0),
      totalRevenue: effectivenessData.reduce((sum, c) => sum + c.metrics.totalRevenue, 0),
      totalImpressions: effectivenessData.reduce((sum, c) => sum + c.metrics.totalImpressions, 0),
      totalClicks: effectivenessData.reduce((sum, c) => sum + c.metrics.totalClicks, 0),
      avgCPL: 0,
      avgCPA: 0,
      avgCVR: 0,
      overallROAS: 0,
      overallROI: 0
    };

    // Tính trung bình
    if (overallSummary.totalLeads > 0) {
      overallSummary.avgCPL = Math.round(overallSummary.totalCost / overallSummary.totalLeads);
    }
    if (overallSummary.totalConversions > 0) {
      overallSummary.avgCPA = Math.round(overallSummary.totalCost / overallSummary.totalConversions);
    }
    if (overallSummary.totalLeads > 0) {
      overallSummary.avgCVR = parseFloat(((overallSummary.totalConversions / overallSummary.totalLeads) * 100).toFixed(2));
    }
    if (overallSummary.totalCost > 0) {
      overallSummary.overallROAS = parseFloat((overallSummary.totalRevenue / overallSummary.totalCost).toFixed(2));
      overallSummary.overallROI = parseFloat((((overallSummary.totalRevenue - overallSummary.totalCost) / overallSummary.totalCost) * 100).toFixed(2));
    }

    res.json({
      campaigns: finalData,
      summary: overallSummary
    });
  } catch (error) {
    console.error('Get marketing effectiveness error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo hiệu quả' });
  }
};

/**
 * Lấy chi tiết hiệu quả của một chiến dịch
 */
export const getCampaignEffectiveness = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;

    const campaign: any = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        source: true,
        costs: {
          orderBy: { costDate: 'desc' }
        },
        customers: {
          include: {
            orders: {
              where: { shippingStatus: 'DELIVERED' },
              select: { id: true, code: true, finalAmount: true, createdAt: true }
            }
          }
        },
        createdByEmployee: { select: { id: true, fullName: true } }
      }
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }

    const actor = (req as any).user;
    if (
      !(await canAccessMarketingCampaignByCreator(actor, campaign.createdByEmployeeId)) &&
      !(await isMarketingAdmin(actor))
    ) {
      return res.status(403).json({ message: 'Bạn không có quyền xem hiệu quả chiến dịch này' });
    }

    // Tính toán chi tiết
    const totalCost = campaign.costs.reduce((sum: number, c: any) => sum + Number(c.amount), 0);
    const totalImpressions = campaign.costs.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0);
    const totalClicks = campaign.costs.reduce((sum: number, c: any) => sum + (c.clicks || 0), 0);
    const totalReach = campaign.costs.reduce((sum: number, c: any) => sum + (c.reach || 0), 0);
    
    const totalLeads = campaign.customers.length;
    const convertedCustomers = campaign.customers.filter((c: any) => c.leadStatus === 'CUSTOMER').length;
    const totalRevenue = campaign.customers.reduce((sum: number, c: any) => {
      return sum + c.orders.reduce((orderSum: number, o: any) => orderSum + Number(o.finalAmount), 0);
    }, 0);

    // Chi phí theo loại
    const costByType = campaign.costs.reduce((acc: any, cost: any) => {
      const type = cost.costType || 'OTHER';
      acc[type] = (acc[type] || 0) + Number(cost.amount);
      return acc;
    }, {});

    // Chi phí theo nền tảng
    const costByPlatform = campaign.costs.reduce((acc: any, cost: any) => {
      const platform = cost.platform || 'OTHER';
      acc[platform] = (acc[platform] || 0) + Number(cost.amount);
      return acc;
    }, {});

    // Chi phí theo ngày (cho biểu đồ)
    const costByDate = campaign.costs.reduce((acc: any, cost: any) => {
      const date = cost.costDate.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { amount: 0, impressions: 0, clicks: 0 };
      }
      acc[date].amount += Number(cost.amount);
      acc[date].impressions += cost.impressions || 0;
      acc[date].clicks += cost.clicks || 0;
      return acc;
    }, {});

    // Lead theo trạng thái
    const leadsByStatus = campaign.customers.reduce((acc: any, customer: any) => {
      const status = customer.leadStatus || 'NEW';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Tính KPIs
    const cpl = totalLeads > 0 ? totalCost / totalLeads : 0;
    const cpa = convertedCustomers > 0 ? totalCost / convertedCustomers : 0;
    const cvr = totalLeads > 0 ? (convertedCustomers / totalLeads) * 100 : 0;
    const roas = totalCost > 0 ? totalRevenue / totalCost : 0;
    const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;
    const cpm = totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0;

    res.json({
      campaign: {
        id: campaign.id,
        code: campaign.code,
        name: campaign.name,
        status: campaign.status,
        source: campaign.source,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        budget: campaign.totalBudget ? Number(campaign.totalBudget) : 0,
        createdBy: campaign.createdByEmployee
      },
      metrics: {
        totalCost,
        totalImpressions,
        totalClicks,
        totalReach,
        totalLeads,
        convertedCustomers,
        totalRevenue,
        budgetUsed: campaign.totalBudget ? (totalCost / Number(campaign.totalBudget)) * 100 : 0
      },
      kpis: {
        cpl: Math.round(cpl),
        cpa: Math.round(cpa),
        cvr: parseFloat(cvr.toFixed(2)),
        roas: parseFloat(roas.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        ctr: parseFloat(ctr.toFixed(2)),
        cpc: Math.round(cpc),
        cpm: Math.round(cpm)
      },
      breakdown: {
        costByType,
        costByPlatform,
        costByDate: Object.entries(costByDate).map(([date, data]: [string, any]) => ({
          date,
          ...data
        })).sort((a, b) => a.date.localeCompare(b.date)),
        leadsByStatus
      }
    });
  } catch (error) {
    console.error('Get campaign effectiveness error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết hiệu quả' });
  }
};

// Get Employee Rankings for Marketing
export const getEmployeeRankings = async (req: Request, res: Response) => {
  try {
    const { period = 'month' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(now.getFullYear(), now.getMonth(), diff);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // Get employees with Marketing role (nguồn chân lý chung)
    const employees = await prisma.employee.findMany({
      where: marketingEmployeeWhere(),
      include: {
        department: true,
        roleGroup: true
      }
    });

    // Get all leads created by these employees in the period
    const employeeIds = employees.map(e => e.id);

    // Calculate metrics for each employee
    const rankings = await Promise.all(employees.map(async (emp) => {
      // Total leads created
      const totalLeads = await prisma.customer.count({
        where: {
          marketingOwnerId: emp.id,
          createdAt: { gte: startDate }
        }
      });

      // Qualified leads
      const qualifiedLeads = await prisma.customer.count({
        where: {
          marketingOwnerId: emp.id,
          createdAt: { gte: startDate },
          leadStatus: { in: ['QUALIFIED', 'CONVERTED'] }
        }
      });

      // Converted customers (have orders)
      const convertedCustomers = await prisma.customer.count({
        where: {
          marketingOwnerId: emp.id,
          createdAt: { gte: startDate },
          leadStatus: 'CONVERTED'
        }
      });

      // Total revenue from converted customers
      const revenueResult = await prisma.order.aggregate({
        where: {
          customer: {
            marketingOwnerId: emp.id,
            createdAt: { gte: startDate }
          },
          shippingStatus: 'DELIVERED'
        },
        _sum: {
          totalAmount: true
        }
      });

      // Campaigns contributed
      const campaignsContributed = await prisma.marketingCampaign.count({
        where: {
          createdByEmployeeId: emp.id,
          createdAt: { gte: startDate }
        }
      });

      // Also count campaigns where employee created leads
      const campaignsWithLeads = await prisma.customer.findMany({
        where: {
          marketingOwnerId: emp.id,
          createdAt: { gte: startDate },
          campaignId: { not: null }
        },
        select: { campaignId: true },
        distinct: ['campaignId']
      });

      const totalCampaigns = Math.max(campaignsContributed, campaignsWithLeads.length);

      const totalRevenue = revenueResult._sum.totalAmount 
        ? Number(revenueResult._sum.totalAmount) 
        : 0;

      const conversionRate = totalLeads > 0 
        ? (convertedCustomers / totalLeads) * 100 
        : 0;

      return {
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.fullName,
        department: emp.department?.name || 'Marketing',
        totalLeads,
        qualifiedLeads,
        convertedCustomers,
        conversionRate: parseFloat(conversionRate.toFixed(1)),
        campaignsContributed: totalCampaigns,
        totalRevenue,
        rank: 0
      };
    }));

    // Sort by totalLeads and assign ranks
    rankings.sort((a, b) => b.totalLeads - a.totalLeads);
    rankings.forEach((r, index) => {
      r.rank = index + 1;
    });

    res.json(rankings);
  } catch (error) {
    console.error('Get employee rankings error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy xếp hạng nhân viên' });
  }
};

