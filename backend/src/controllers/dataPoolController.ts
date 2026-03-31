import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logAudit, getAuditUser } from '../utils/auditLog';
import { getPaginationParams } from '../utils/pagination';
import { parsePoolPushStatusesJson, POOL_PUSH_STATUS_DEFINITIONS } from '../constants/operationParams';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import { pickNextSalesEmployeeId } from '../services/leadRoutingService';
import { assignLeadsUsingTeamRatios } from '../services/teamRatioDistributionService';
import { resolveTargetEmployees, getDivisionIdForDept } from '../services/orgRoutingService';
import { isTechnicalAdminRoleCode, userHasCatalogPermission } from '../constants/rbac';
import {
  validateFloatingDistributeTarget,
  validateSalesDistributeTarget,
  getManagedTeamEmployeeIdsForPool,
} from '../utils/floatingPoolScopeHelper';
import {
  userCanAccessCustomerForResalesModule,
  userCanAccessCustomerForSalesModule,
} from '../utils/customerRowAccess';
import { appendCustomerImpactNote } from '../utils/customerImpact';

function assertFloatingDistributePermission(req: Request, res: Response): boolean {
  const u = (req as any).user;
  if (
    isTechnicalAdminRoleCode(u?.roleGroupCode) ||
    userHasCatalogPermission(u, [
      'DISTRIBUTE_FLOATING_POOL',
      'MANAGE_DATA_POOL',
      'DISTRIBUTE_FLOATING_CROSS_ORG',
    ])
  ) {
    return true;
  }
  res.status(403).json({
    message:
      'Cần một trong các quyền: DISTRIBUTE_FLOATING_POOL, MANAGE_DATA_POOL, DISTRIBUTE_FLOATING_CROSS_ORG (hoặc quản trị hệ thống).',
  });
  return false;
}

/**
 * Lấy danh sách kho số chung
 */
export const getDataPool = async (req: Request, res: Response) => {
  try {
    const {
      status,
      source,
      search,
      closedOpportunity,
      employeeId,
      tagIds,
      poolType,
      processingStatus,
      poolQueue,
      provinceId,
      mainCrop,
    } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const user = (req as any).user;
    const perms: string[] = user?.permissions || [];
    const canViewFloating =
      isTechnicalAdminRoleCode(user?.roleGroupCode) ||
      perms.includes('FULL_ACCESS') ||
      perms.includes('VIEW_FLOATING_POOL');
    const canViewSalesOpen = perms.includes('VIEW_SALES');
    const canViewManagedUnit = perms.includes('VIEW_MANAGED_UNIT_POOL');

    const useManagedTeamFilter = false;
    const managedTeamIds: string[] | null = null;
    const where: any = {};
    const customerConditions: any[] = [];

    if (poolType && poolType !== 'all') {
      where.poolType = String(poolType);
    }

    let pq = poolQueue && String(poolQueue) !== 'all' ? String(poolQueue) : null;
    if (!canViewFloating && canViewSalesOpen && !useManagedTeamFilter) {
      pq = DATA_POOL_QUEUE.SALES_OPEN;
    }
    if (pq) {
      where.poolQueue = pq;
    }

    if (pq === DATA_POOL_QUEUE.FLOATING) {
      // Fetch push-to-pool statuses from DB
      const pushStatuses = await prisma.leadProcessingStatus.findMany({
        where: { isPushToPool: true, isActive: true },
        select: { code: true }
      }).catch(() => []);
      const statuses = pushStatuses.map((s: { code: string }) => s.code);
      
      if (processingStatus && processingStatus !== 'all') {
        const p = String(processingStatus);
        where.processingStatus = statuses.includes(p) ? p : { in: [] };
      } else if (statuses.length > 0) {
        where.processingStatus = { in: statuses };
      }
    } else if (processingStatus && processingStatus !== 'all') {
      where.processingStatus = String(processingStatus);
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (source && source !== 'all') {
      where.source = source;
    }

    // Bỏ lọc theo manager unit
    if (employeeId && employeeId !== 'all') {
      where.assignedToId = String(employeeId);
    }

    if (tagIds && String(tagIds).trim()) {
      const tagIdArr = String(tagIds).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (tagIdArr.length > 0) {
        customerConditions.push({
          tags: { some: { tagId: { in: tagIdArr } } }
        });
      }
    }

    if (provinceId && provinceId !== 'all') {
      customerConditions.push({ provinceId: String(provinceId) });
    }
    if (mainCrop && mainCrop !== 'all') {
      customerConditions.push({ mainCrops: { has: String(mainCrop) } });
    }

    if (closedOpportunity === 'true') {
      customerConditions.push({ opportunities: { some: { status: 'LOST' } } });
    } else if (closedOpportunity === 'false') {
      customerConditions.push({ opportunities: { none: { status: 'LOST' } } });
    }

    if (search) {
      customerConditions.push({
        OR: [
          { name: { contains: String(search), mode: 'insensitive' } },
          { phone: { contains: String(search), mode: 'insensitive' } },
          { code: { contains: String(search), mode: 'insensitive' } }
        ]
      });
    }

    if (customerConditions.length > 0) {
      where.customer = customerConditions.length === 1 ? customerConditions[0] : { AND: customerConditions };
    }

    const [total, items] = await Promise.all([
      prisma.dataPool.count({ where }),
      prisma.dataPool.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { enteredAt: 'desc' }
        ],
        include: {
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              leadSource: { select: { id: true, name: true } },
              campaign: { select: { id: true, name: true } },
              leadStatus: true,
              province: { select: { id: true, name: true } },
              tags: {
                select: {
                  tag: {
                    select: { id: true, name: true, color: true, bgColor: true, code: true },
                  },
                },
              },
            },
          },
          assignedTo: {
            select: {
              id: true,
              code: true,
              fullName: true,
              avatarUrl: true
            }
          }
        }
      })
    ]);

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get data pool error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách kho số chung' });
  }
};

/**
 * Sales tự nhận khách từ kho số chung
 */
export const claimLead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { count = 1 } = req.body;

    const now = new Date();
    const salesKeepDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }).catch(() => null);
    const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
    const maxRoundsCfg = await prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null);
    const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;

    // Lấy lead có sẵn
    const availableLeads = await prisma.dataPool.findMany({
      where: { status: 'AVAILABLE', poolType: 'SALES', poolQueue: DATA_POOL_QUEUE.SALES_OPEN },
      orderBy: [
        { priority: 'desc' },
        { enteredAt: 'asc' }
      ],
      take: Number(count),
      include: {
        customer: { select: { id: true, name: true, phone: true } }
      }
    });

    if (availableLeads.length === 0) {
      return res.status(404).json({ message: 'Không còn lead nào trong kho số chung' });
    }

    // Cập nhật trạng thái
    const leadIds = availableLeads.map(l => l.id);
    await prisma.dataPool.updateMany({
      where: { id: { in: leadIds } },
      data: {
        status: 'ASSIGNED',
        poolType: 'SALES',
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
        assignedToId: user.id,
        assignedAt: now,
        deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
        maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5,
        awaitingSalesAfterCskh: false,
      }
    });

    // Cập nhật customer.employeeId
    const customerIds = availableLeads.map(l => l.customerId);
    await prisma.customer.updateMany({
      where: { id: { in: customerIds } },
      data: { employeeId: user.id }
    });

    // Ghi lịch sử
    for (const lead of availableLeads) {
      await prisma.leadDistributionHistory.create({
        data: {
          customerId: lead.customerId,
          employeeId: user.id,
          method: 'CLAIM'
        }
      });
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'CLAIM_LEAD',
      object: 'DATA_POOL',
      result: 'SUCCESS',
      details: `Claimed ${availableLeads.length} leads from data pool`,
      req
    });

    res.json({
      message: `Đã nhận ${availableLeads.length} khách hàng`,
      leads: availableLeads
    });
  } catch (error) {
    console.error('Claim lead error:', error);
    res.status(500).json({ message: 'Lỗi khi nhận khách' });
  }
};

/**
 * Admin phân số thủ công
 */
export const assignLeads = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { leadIds, employeeId } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn lead cần phân' });
    }

    if (!employeeId) {
      return res.status(400).json({ message: 'Vui lòng chọn nhân viên' });
    }

    // Kiểm tra nhân viên tồn tại
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true }
    });

    if (!employee) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const now = new Date();
    const salesKeepDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }).catch(() => null);
    const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
    const maxRoundsCfg = await prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null);
    const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;

    // Láº¥y leads
    const leads = await prisma.dataPool.findMany({
      where: {
        id: { in: leadIds },
        status: 'AVAILABLE',
        poolType: 'SALES',
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
      }
    });

    if (leads.length === 0) {
      return res.status(400).json({ message: 'Không có lead nào có thể phân' });
    }

    // Cập nhật
    await prisma.dataPool.updateMany({
      where: { id: { in: leads.map(l => l.id) } },
      data: {
        status: 'ASSIGNED',
        poolType: 'SALES',
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
        assignedToId: employeeId,
        assignedAt: now,
        deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
        maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5,
        awaitingSalesAfterCskh: false,
      }
    });

    // Cập nhật customer.employeeId
    await prisma.customer.updateMany({
      where: { id: { in: leads.map(l => l.customerId) } },
      data: { employeeId }
    });

    // Ghi lịch sử
    for (const lead of leads) {
      await prisma.leadDistributionHistory.create({
        data: {
          customerId: lead.customerId,
          employeeId,
          method: 'MANUAL'
        }
      });
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'ASSIGN_LEAD',
      object: 'DATA_POOL',
      result: 'SUCCESS',
      details: `Assigned ${leads.length} leads to ${employee.fullName}`,
      req
    });

    res.json({
      message: `Đã phân ${leads.length} khách hàng cho ${employee.fullName}`
    });
  } catch (error) {
    console.error('Assign leads error:', error);
    res.status(500).json({ message: 'Lỗi khi phân số' });
  }
};

/**
 * Phân số tự động — org-aware: nhóm lead theo marketingOwnerId → resolve đơn vị Sales đích.
 */
export const autoDistribute = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { count = 10 } = req.body;

    const now = new Date();
    const salesKeepDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }).catch(() => null);
    const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
    const maxRoundsCfg = await prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null);
    const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;
    const availableLeads = await prisma.dataPool.findMany({
      where: { status: 'AVAILABLE', poolType: 'SALES', poolQueue: DATA_POOL_QUEUE.SALES_OPEN },
      include: { customer: { select: { id: true, marketingOwnerId: true } } },
      orderBy: [{ priority: 'desc' }, { enteredAt: 'asc' }],
      take: Number(count),
    });

    if (availableLeads.length === 0) {
      return res.status(404).json({ message: 'Không còn lead nào trong kho số chung' });
    }

    const pickGlobalSales = async (): Promise<string | null> => {
      const all = await prisma.employee.findMany({
        where: {
          OR: [
            { salesType: { in: ['MARKETING', 'SALES', 'RESALES'] } },
            { roleGroup: { code: { in: ['sales_executive', 'sales_manager', 'customer_success_executive', 'customer_success_manager', 'marketing', 'marketing_manager'] } } },
          ],
          status: { code: 'WORKING' },
        },
        select: { id: true },
      });
      if (all.length === 0) return null;
      return all[Math.floor(Math.random() * all.length)]!.id;
    };

    const assignments: { leadId: string; customerId: string; employeeId: string }[] = [];
    for (const lead of availableLeads) {
      const ownerId = lead.customer?.marketingOwnerId ?? null;
      let empId = await pickNextSalesEmployeeId({
        seed: String(lead.id),
        excludeIds: [],
        anchorEmployeeId: ownerId,
      });
      if (!empId) empId = await pickGlobalSales();
      if (empId) assignments.push({ leadId: lead.id, customerId: lead.customerId, employeeId: empId });
    }

    if (assignments.length === 0) {
      return res.status(400).json({ message: 'Không có nhân viên sales nào để phân bổ' });
    }

    for (const assign of assignments) {
      await prisma.dataPool.update({
        where: { id: assign.leadId },
        data: {
          status: 'ASSIGNED', poolType: 'SALES', poolQueue: DATA_POOL_QUEUE.SALES_OPEN, assignedToId: assign.employeeId, assignedAt: now,
          deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
          maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5, awaitingSalesAfterCskh: false,
        },
      });
      await prisma.customer.update({ where: { id: assign.customerId }, data: { employeeId: assign.employeeId } });
      await prisma.leadDistributionHistory.create({ data: { customerId: assign.customerId, employeeId: assign.employeeId, method: 'AUTO' } });
    }

    await logAudit({ ...getAuditUser(req), action: 'AUTO_DISTRIBUTE', object: 'DATA_POOL', result: 'SUCCESS', details: `Auto distributed ${assignments.length} leads (org-aware)`, req });
    res.json({ message: `Đã phân tự động ${assignments.length} khách hàng`, count: assignments.length });
  } catch (error) {
    console.error('Auto distribute error:', error);
    res.status(500).json({ message: 'Lỗi khi phân số tự động' });
  }
};

/**
 * Thu hồi lead quá hạn
 */
export const recallLeads = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const perms: string[] = user?.permissions || [];
    const fullRecall =
      isTechnicalAdminRoleCode(user?.roleGroupCode) ||
      perms.includes('MANAGE_DATA_POOL');
    const managedRecall = perms.includes('RECALL_MANAGED_UNIT_LEADS');

    if (!fullRecall && !managedRecall) {
      return res.status(403).json({
        message:
          'Cần quyền MANAGE_DATA_POOL (thu hồi toàn hệ thống) hoặc RECALL_MANAGED_UNIT_LEADS (thu hồi trong phạm vi đơn vị).',
      });
    }

    const { leadIds, reason } = req.body;

    const recallConfig = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } });
    const autoRecallDays = recallConfig ? parseInt(recallConfig.value, 10) : 3;

    let managedTeamIds: string[] | null = null;
    if (!fullRecall && managedRecall) {
      managedTeamIds = await getManagedTeamEmployeeIdsForPool(user.id);
      if (!managedTeamIds) {
        return res.status(403).json({
          message:
            'Thu hồi theo đơn vị chỉ áp dụng khi bạn là trưởng đơn vị/khối (có phòng ban gán bạn là trưởng đơn vị).',
        });
      }
    }

    let whereCondition: any = {
      status: 'ASSIGNED',
    };

    if (managedTeamIds) {
      whereCondition.assignedToId = { in: managedTeamIds };
      whereCondition.poolType = { in: ['SALES', 'CSKH'] };
    } else {
      whereCondition.poolType = 'SALES';
    }

    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      whereCondition.id = { in: leadIds };
    } else {
      if (managedTeamIds) {
        return res.status(400).json({
          message:
            'Thu hồi trong phạm vi đơn vị: vui lòng chọn cụ thể lead (leadIds). Không thu hồi hàng loạt theo thời gian.',
        });
      }
      const recallDate = new Date();
      recallDate.setDate(recallDate.getDate() - autoRecallDays);
      whereCondition.assignedAt = { lt: recallDate };
    }

    const leadsToRecall = await prisma.dataPool.findMany({
      where: whereCondition,
      include: {
        customer: { select: { id: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
    });

    if (managedTeamIds && leadIds && Array.isArray(leadIds)) {
      for (const l of leadsToRecall) {
        if (l.assignedToId && !managedTeamIds.includes(l.assignedToId)) {
          return res.status(403).json({
            message: `Lead ${l.id} đang gán cho nhân viên ngoài phạm vi đơn vị bạn quản lý — không thu hồi.`,
          });
        }
      }
    }

    if (leadsToRecall.length === 0) {
      return res.json({ message: 'Không có lead nào cần thu hồi', count: 0 });
    }

    const baseRecallData = (poolType: 'SALES' | 'CSKH') => ({
      status: 'AVAILABLE' as const,
      poolType,
      poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
      assignedToId: null,
      assignedAt: null,
      deadline: null,
      source: 'RECALL' as const,
      awaitingSalesAfterCskh: false,
      processingStatus: null,
      note: reason || (managedTeamIds ? 'Thu hồi theo đơn vị quản lý' : 'Thu hồi do quá hạn xử lý'),
    });

    const salesRecallIds = leadsToRecall.filter((l) => l.poolType !== 'CSKH').map((l) => l.id);
    const cskhRecallIds = leadsToRecall.filter((l) => l.poolType === 'CSKH').map((l) => l.id);
    if (salesRecallIds.length > 0) {
      await prisma.dataPool.updateMany({
        where: { id: { in: salesRecallIds } },
        data: baseRecallData('SALES'),
      });
    }
    if (cskhRecallIds.length > 0) {
      await prisma.dataPool.updateMany({
        where: { id: { in: cskhRecallIds } },
        data: baseRecallData('CSKH'),
      });
    }

    await prisma.customer.updateMany({
      where: { id: { in: leadsToRecall.map((l) => l.customerId) } },
      data: { employeeId: null },
    });

    for (const lead of leadsToRecall) {
      if (lead.assignedTo) {
        await prisma.leadDistributionHistory.updateMany({
          where: {
            customerId: lead.customerId,
            employeeId: lead.assignedTo.id,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
            revokeReason: reason || (managedTeamIds ? 'Thu hồi theo đơn vị quản lý' : 'Quá hạn xử lý'),
          },
        });
      }
    }

    const auditDetails = managedTeamIds
      ? `Thu hồi ${leadsToRecall.length} lead trong phạm vi đơn vị quản lý (đưa về kho Sales chưa phân để phân lại cho NV trong đơn vị).`
      : `Thu hồi ${leadsToRecall.length} lead (toàn hệ thống hoặc theo thời hạn).`;

    await logAudit({
      ...getAuditUser(req),
      action: 'RECALL_LEAD',
      object: 'DATA_POOL',
      result: 'SUCCESS',
      details: auditDetails,
      req,
    });

    res.json({
      message: `Đã thu hồi ${leadsToRecall.length} khách hàng`,
      count: leadsToRecall.length,
    });
  } catch (error) {
    console.error('Recall leads error:', error);
    res.status(500).json({ message: 'Lỗi khi thu hồi lead' });
  }
};

/**
 * Thêm khách hàng vào kho số chung
 */
export const addToDataPool = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { customerIds, source = 'MANUAL', priority = 0 } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn khách hàng' });
    }

    // Kiểm tra khách hàng đã có trong pool chưa
    const existingInPool = await prisma.dataPool.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true }
    });

    const existingIds = existingInPool.map(e => e.customerId);
    const newCustomerIds = customerIds.filter((id: string) => !existingIds.includes(id));

    if (newCustomerIds.length === 0) {
      return res.status(400).json({ message: 'Tất cả khách hàng đã có trong kho số chung' });
    }

    // Thêm vào pool
    await prisma.dataPool.createMany({
      data: newCustomerIds.map((customerId: string) => ({
        customerId,
        source,
        priority,
        status: 'AVAILABLE',
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
      }))
    });

    // Xóa employeeId của customer
    await prisma.customer.updateMany({
      where: { id: { in: newCustomerIds } },
      data: { employeeId: null }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'ADD_TO_POOL',
      object: 'DATA_POOL',
      result: 'SUCCESS',
      details: `Added ${newCustomerIds.length} customers to data pool`,
      req
    });

    res.json({
      message: `Đã thêm ${newCustomerIds.length} khách hàng vào kho số chung`,
      added: newCustomerIds.length,
      skipped: existingIds.length
    });
  } catch (error) {
    console.error('Add to data pool error:', error);
    res.status(500).json({ message: 'Lỗi khi thêm vào kho số chung' });
  }
};

/**
 * Lấy cấu hình phân số (đọc từ SystemConfig)
 */
export const getDistributionConfig = async (req: Request, res: Response) => {
  try {
    const [methodConfig, recallConfig, autoAssignConfig] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: 'lead_assign_method' } }),
      prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }),
      prisma.systemConfig.findUnique({ where: { key: 'auto_assign_lead' } }),
    ]);

    res.json({
      method: (methodConfig?.value || 'round_robin').toUpperCase(),
      autoRecallDays: recallConfig ? parseInt(recallConfig.value, 10) : 3,
      autoAssign: autoAssignConfig?.value === 'true',
    });
  } catch (error) {
    console.error('Get distribution config error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy cấu hình' });
  }
};

/**
 * Cập nhật cấu hình phân số (ghi vào SystemConfig)
 */
export const updateDistributionConfig = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { method, autoRecallDays } = req.body;
    const userId = user?.id;

    if (method) {
      await prisma.systemConfig.upsert({
        where: { key: 'lead_assign_method' },
        update: { value: method.toLowerCase(), updatedBy: userId },
        create: { key: 'lead_assign_method', value: method.toLowerCase(), dataType: 'ENUM', category: 'lead_distribution', name: 'Phương pháp phân bổ lead', sortOrder: 2 },
      });
    }
    if (autoRecallDays !== undefined) {
      await prisma.systemConfig.upsert({
        where: { key: 'data_pool_auto_recall_days' },
        update: { value: String(autoRecallDays), updatedBy: userId },
        create: { key: 'data_pool_auto_recall_days', value: String(autoRecallDays), dataType: 'INTEGER', category: 'lead_distribution', name: 'Số ngày tự động thu hồi lead', sortOrder: 3 },
      });
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'SYSTEM_CONFIG',
      result: 'SUCCESS',
      details: `Updated distribution config: method=${method}, autoRecallDays=${autoRecallDays}`,
      req
    });

    const result = await getDistributionConfigValues();
    res.json(result);
  } catch (error) {
    console.error('Update distribution config error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cấu hình' });
  }
};

async function getDistributionConfigValues() {
  const [methodConfig, recallConfig, autoAssignConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'lead_assign_method' } }),
    prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }),
    prisma.systemConfig.findUnique({ where: { key: 'auto_assign_lead' } }),
  ]);
  return {
    method: (methodConfig?.value || 'round_robin').toUpperCase(),
    autoRecallDays: recallConfig ? parseInt(recallConfig.value, 10) : 3,
    autoAssign: autoAssignConfig?.value === 'true',
  };
}

/**
 * Thống kê kho số chung
 */
export const getDataPoolStats = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const perms: string[] = user?.permissions || [];
    const canViewFloating =
      isTechnicalAdminRoleCode(user?.roleGroupCode) ||
      perms.includes('FULL_ACCESS') ||
      perms.includes('VIEW_FLOATING_POOL');
    const canViewSalesOpen = perms.includes('VIEW_SALES');
    const canViewManagedUnit = perms.includes('VIEW_MANAGED_UNIT_POOL');

    if (!canViewFloating && !canViewSalesOpen && !canViewManagedUnit) {
      return res.status(403).json({
        message:
          'Cần quyền VIEW_FLOATING_POOL, VIEW_SALES hoặc VIEW_MANAGED_UNIT_POOL để xem thống kê kho số.',
      });
    }

    const managedStatsQuery =
      req.query.managedScope === '1' ||
      req.query.managedScope === 'true' ||
      String(req.query.managedScope || '').toLowerCase() === 'yes';

    const onlyManagedProfile = canViewManagedUnit && !canViewFloating && !canViewSalesOpen;
    const scopedManagedStats = managedStatsQuery && canViewManagedUnit && (canViewFloating || canViewSalesOpen);

    let teamScope: { assignedToId: { in: string[] } } | null = null;
    if (onlyManagedProfile || scopedManagedStats) {
      const teamIds = await getManagedTeamEmployeeIdsForPool(user.id);
      if (!teamIds) {
        return res.json({
          totalAvailable: 0,
          totalAvailableSalesOpen: 0,
          totalAvailableFloating: 0,
          totalAssigned: 0,
          totalProcessing: 0,
          totalConverted: 0,
          todayAdded: 0,
          todayAssigned: 0,
          total: 0,
          viewScopeDescription:
            'Chưa có phạm vi đơn vị — trưởng đơn vị cần được gán trên phòng ban.',
        });
      }
      teamScope = { assignedToId: { in: teamIds } };
    }

    const tw = teamScope || {};
    const hideGlobalAvailableCounts = onlyManagedProfile || scopedManagedStats;
    const [
      totalAvailable,
      totalAvailableSalesOpen,
      totalAvailableFloating,
      totalAssigned,
      totalProcessing,
      totalConverted,
      todayAdded,
      todayAssigned,
    ] = await Promise.all([
      hideGlobalAvailableCounts
        ? Promise.resolve(0)
        : prisma.dataPool.count({ where: { status: 'AVAILABLE' } }),
      hideGlobalAvailableCounts
        ? Promise.resolve(0)
        : prisma.dataPool.count({
            where: { status: 'AVAILABLE', poolQueue: DATA_POOL_QUEUE.SALES_OPEN },
          }),
      hideGlobalAvailableCounts
        ? Promise.resolve(0)
        : prisma.dataPool.count({
            where: { status: 'AVAILABLE', poolQueue: DATA_POOL_QUEUE.FLOATING },
          }),
      prisma.dataPool.count({ where: { status: 'ASSIGNED', ...tw } }),
      prisma.dataPool.count({ where: { status: 'PROCESSING', ...tw } }),
      prisma.dataPool.count({ where: { status: 'CONVERTED', ...tw } }),
      prisma.dataPool.count({
        where: {
          enteredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          ...tw,
        },
      }),
      prisma.dataPool.count({
        where: {
          assignedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          ...tw,
        },
      }),
    ]);

    res.json({
      totalAvailable,
      totalAvailableSalesOpen,
      totalAvailableFloating,
      totalAssigned,
      totalProcessing,
      totalConverted,
      todayAdded,
      todayAssigned,
      total: totalAvailable + totalAssigned + totalProcessing + totalConverted,
      ...(onlyManagedProfile || scopedManagedStats
        ? {
            viewScopeDescription:
              'Thống kê giới hạn trong phạm vi nhân viên thuộc đơn vị/khối do bạn quản lý.',
          }
        : {}),
    });
  } catch (error) {
    console.error('Get data pool stats error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê' });
  }
};

/**
 * Marketing push: phân số ngay lập tức theo tỷ lệ team
 */
export const immediateDistribute = async (req: Request, res: Response) => {
  try {
    const { dataPoolIds } = req.body;

    if (!dataPoolIds || !Array.isArray(dataPoolIds) || dataPoolIds.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn lead cần phân' });
    }

    const result = await assignLeadsUsingTeamRatios(dataPoolIds);
    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'IMMEDIATE_DISTRIBUTE',
      object: 'DATA_POOL',
      result: 'SUCCESS',
      details: `Đã phân ${result.assigned} lead theo tỉ lệ team`,
      req
    });

    res.json({
      message: `Đã phân ${result.assigned} lead`,
      count: result.assigned
    });
  } catch (error) {
    console.error('Immediate distribute error:', error);
    res.status(500).json({ message: 'Lỗi khi phân số ngay lập tức' });
  }
};

/**
 * Cập nhật tỷ lệ phân bổ team (admin)
 */
export const updateDistributionRatios = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { ratios } = req.body;

    if (!ratios || !Array.isArray(ratios)) {
      return res.status(400).json({ message: 'Vui lòng gửi ratios: [{departmentId, ratio}]' });
    }

    const total = ratios.reduce((sum: number, r: { departmentId: string; ratio: number }) => sum + (r.ratio || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      return res.status(400).json({ message: 'Tổng tỷ lệ phải bằng 100' });
    }

    for (const r of ratios) {
      if (!r.departmentId || r.ratio == null) continue;
      const existing = await prisma.teamDistributionRatio.findFirst({
        where: { departmentId: r.departmentId }
      });
      if (existing) {
        await prisma.teamDistributionRatio.update({
          where: { id: existing.id },
          data: { ratio: Number(r.ratio), isActive: true }
        });
      } else {
        await prisma.teamDistributionRatio.create({
          data: {
            departmentId: r.departmentId,
            ratio: Number(r.ratio),
            distributionCount: 0,
            isActive: true
          }
        });
      }
    }

    await prisma.teamDistributionRatio.updateMany({
      data: { distributionCount: 0 }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE_DISTRIBUTION_RATIOS',
      object: 'TEAM_DISTRIBUTION_RATIO',
      result: 'SUCCESS',
      details: 'Updated team distribution ratios',
      req
    });

    const updated = await prisma.teamDistributionRatio.findMany({
      where: { isActive: true },
      include: { department: { select: { id: true, name: true } } }
    });
    res.json(updated);
  } catch (error) {
    console.error('Update distribution ratios error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật tỷ lệ phân bổ' });
  }
};

/**
 * Lấy tỷ lệ phân bổ team hiện tại
 */
export const getDistributionRatios = async (req: Request, res: Response) => {
  try {
    const ratios = await prisma.teamDistributionRatio.findMany({
      where: { isActive: true },
      include: { department: { select: { id: true, name: true } } }
    });
    res.json(ratios);
  } catch (error) {
    console.error('Get distribution ratios error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy tỷ lệ phân bổ' });
  }
};

const VALID_PROCESSING_STATUSES = [
  ...POOL_PUSH_STATUS_DEFINITIONS.map((d) => d.code),
  'REMOVED',
];

/**
 * Cập nhật trạng thái xử lý lead (sales)
 */
export const updateProcessingStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { dataPoolId, processingStatus } = req.body;

    if (!dataPoolId || !processingStatus) {
      return res.status(400).json({ message: 'Vui lòng gửi dataPoolId và processingStatus' });
    }
    if (!VALID_PROCESSING_STATUSES.includes(processingStatus)) {
      return res.status(400).json({
        message: `processingStatus phải là một trong: ${VALID_PROCESSING_STATUSES.join(', ')}`,
      });
    }

    const lead = await prisma.dataPool.findUnique({
      where: { id: dataPoolId },
      include: { customer: { select: { id: true } } },
    });

    if (!lead) {
      return res.status(404).json({ message: 'Không tìm thấy lead' });
    }
    if (lead.assignedToId !== user.id) {
      return res.status(403).json({ message: 'Chỉ có thể cập nhật lead đã được phân cho bạn' });
    }

    const pushCfg = await prisma.systemConfig.findUnique({ where: { key: 'pool_push_processing_statuses' } });
    const pushSet = new Set(parsePoolPushStatusesJson(pushCfg?.value));

    const floatToSharedPool = async (status: string) => {
      await prisma.dataPool.update({
        where: { id: dataPoolId },
        data: {
          status: 'AVAILABLE',
          assignedToId: null,
          assignedAt: null,
          poolType: 'SALES',
          poolQueue: DATA_POOL_QUEUE.FLOATING,
          deadline: null,
          holdUntil: null,
          interactionDeadline: null,
          cskhStage: 1,
          roundCount: 0,
          awaitingSalesAfterCskh: false,
          processingStatus: status,
        },
      });
      await prisma.customer.update({
        where: { id: lead.customerId },
        data: { employeeId: null },
      });
    };

    if (processingStatus === 'DEAL_CLOSED') {
      await prisma.dataPool.update({
        where: { id: dataPoolId },
        data: { status: 'CONVERTED', processingStatus: 'DEAL_CLOSED' },
      });
      return res.json({ message: 'Đã đánh dấu chốt đơn' });
    }

    if (processingStatus === 'RELEASED') {
      await floatToSharedPool('RELEASED');
      return res.json({ message: 'Đã trả lead về kho thả nổi' });
    }

    if (pushSet.has(processingStatus)) {
      if (lead.assignedToId) {
        await prisma.leadDistributionHistory.updateMany({
          where: { customerId: lead.customerId, employeeId: lead.assignedToId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: `Trạng thái ${processingStatus} → kho thả nổi` },
        });
      }
      await floatToSharedPool(processingStatus);
      return res.json({ message: 'Đã đưa số về kho thả nổi theo cấu hình trạng thái' });
    }

    if (processingStatus === 'REMOVED' || processingStatus === 'WRONG_NUMBER') {
      await prisma.dataPool.update({
        where: { id: dataPoolId },
        data: {
          status: 'INVALID',
          poolType: 'UNASSIGNED',
          processingStatus,
          assignedToId: null,
          assignedAt: null,
          deadline: null,
          holdUntil: null,
          interactionDeadline: null,
          awaitingSalesAfterCskh: false,
        },
      });
      await prisma.customer.update({
        where: { id: lead.customerId },
        data: { employeeId: null },
      });
      return res.json({ message: 'Đã đánh dấu lead không hợp lệ' });
    }

    if (processingStatus === 'NO_ANSWER' || processingStatus === 'NO_NEED') {
      const now = new Date();

      const getIntConfig = async (key: string, fallback: number) => {
        const cfg = await prisma.systemConfig.findUnique({ where: { key } }).catch(() => null);
        if (!cfg) return fallback;
        const n = parseInt(cfg.value, 10);
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };

      const salesKeepDays = await getIntConfig('data_pool_auto_recall_days', 3);
      const maxRepartitionRounds = await getIntConfig('max_repartition_rounds', 5);

      const newRoundCount = (lead.roundCount || 0) + 1;
      const prevAssignees = lead.assignedToId
        ? [...(lead.previousAssignees || []), lead.assignedToId]
        : lead.previousAssignees || [];

      if (lead.assignedToId) {
        await prisma.leadDistributionHistory.updateMany({
          where: { customerId: lead.customerId, employeeId: lead.assignedToId, revokedAt: null },
          data: { revokedAt: now, revokeReason: `Sales chọn ${processingStatus}` },
        });
      }

      if (newRoundCount >= maxRepartitionRounds) {
        await prisma.dataPool.update({
          where: { id: dataPoolId },
          data: {
            status: 'AVAILABLE',
            poolType: 'SALES',
            poolQueue: DATA_POOL_QUEUE.FLOATING,
            assignedToId: null,
            assignedAt: null,
            deadline: null,
            holdUntil: null,
            interactionDeadline: null,
            roundCount: 0,
            maxRounds: maxRepartitionRounds,
            previousAssignees: prevAssignees,
            processingStatus,
            awaitingSalesAfterCskh: false,
            note: `Hết ${maxRepartitionRounds} vòng Sales → kho thả nổi`,
            source: 'RECALL',
          },
        });
        await prisma.customer.update({
          where: { id: lead.customerId },
          data: { employeeId: null },
        });
        return res.json({ message: 'Đã trả số về kho thả nổi (hết vòng phân bộ)' });
      }

      const excludeIds = [...new Set([...prevAssignees, ...(lead.assignedToId ? [lead.assignedToId] : [])])];
      const nextSalesEmployeeId = await pickNextSalesEmployeeId({
        seed: `${lead.customerId}:${newRoundCount}:${now.toISOString()}`,
        excludeIds,
        anchorEmployeeId: lead.assignedToId,
      });

      await prisma.dataPool.update({
        where: { id: dataPoolId },
        data: {
          roundCount: newRoundCount,
          poolType: 'SALES',
          status: 'ASSIGNED',
          assignedToId: nextSalesEmployeeId,
          assignedAt: now,
          deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
          holdUntil: null,
          interactionDeadline: null,
          maxRounds: maxRepartitionRounds,
          processingStatus,
          previousAssignees: prevAssignees,
          cskhStage: lead.cskhStage ?? 1,
          note: `Phân lại Sales vòng ${newRoundCount}`,
          source: 'RECALL',
          awaitingSalesAfterCskh: false,
        },
      });

      if (nextSalesEmployeeId) {
        await prisma.leadDistributionHistory.create({
          data: {
            customerId: lead.customerId,
            employeeId: nextSalesEmployeeId,
            method: 'AUTO',
          },
        });
        await prisma.customer.update({
          where: { id: lead.customerId },
          data: { employeeId: nextSalesEmployeeId },
        });
      }

      return res.json({ message: 'Chuyển sang Sales vòng tiếp theo' });
    }

    res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  } catch (error) {
    console.error('Update processing status error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái xử lý' });
  }
};

/** Hẹn gọi lại + cấu hình nhắc (Sales/CSKH) trên `data_pool`. */
export const updateCallbackSchedule = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { dataPoolId, callbackAt, callbackNotifyEnabled, callbackNotifyMinutesBefore } = req.body;

    if (!dataPoolId) {
      return res.status(400).json({ message: 'Thiếu dataPoolId' });
    }

    const lead = await prisma.dataPool.findUnique({
      where: { id: dataPoolId },
      include: { customer: { select: { id: true, name: true, code: true } } },
    });

    if (!lead) {
      return res.status(404).json({ message: 'Không tìm thấy lead' });
    }

    let canEdit = isTechnicalAdminRoleCode(user.roleGroupCode);
    if (!canEdit) {
      if (lead.poolType === 'SALES') {
        canEdit = await userCanAccessCustomerForSalesModule(user, lead.customerId);
      } else if (lead.poolType === 'CSKH') {
        canEdit = await userCanAccessCustomerForResalesModule(user, lead.customerId);
      }
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật hẹn gọi lại cho lead này' });
    }

    const enabled = Boolean(callbackNotifyEnabled);
    let at: Date | null = null;
    if (callbackAt != null && String(callbackAt).trim() !== '') {
      const d = new Date(String(callbackAt));
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ message: 'Thời điểm hẹn gọi lại không hợp lệ' });
      }
      at = d;
    }

    let minutesBefore: number | null = null;
    if (enabled) {
      if (!at) {
        return res.status(400).json({ message: 'Bật nhắc cần có thời điểm hẹn gọi lại' });
      }
      const raw = callbackNotifyMinutesBefore;
      const n =
        raw === null || raw === undefined || raw === ''
          ? 0
          : typeof raw === 'number'
            ? raw
            : parseInt(String(raw), 10);
      if (!Number.isFinite(n) || n < 0 || n > 7 * 24 * 60) {
        return res.status(400).json({ message: 'Số phút nhắc trước không hợp lệ (0–10080)' });
      }
      minutesBefore = Math.floor(n);
    }

    const beforeAt = lead.callbackAt;
    const beforeEnabled = lead.callbackNotifyEnabled;
    const beforeMin = lead.callbackNotifyMinutesBefore;

    await prisma.dataPool.update({
      where: { id: dataPoolId },
      data: {
        callbackAt: at,
        callbackNotifyEnabled: enabled && !!at,
        callbackNotifyMinutesBefore: enabled && at ? minutesBefore : null,
        callbackReminderSentAt: null,
      },
    });

    const fmt = (d: Date | null) =>
      d
        ? d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        : '(trống)';
    await appendCustomerImpactNote({
      customerId: lead.customerId,
      employeeId: user.id,
      contentVi: `Hẹn gọi lại: ${fmt(beforeAt)} → ${fmt(at)}; nhắc: ${beforeEnabled ? `bật (${beforeMin ?? 0} phút trước)` : 'tắt'} → ${enabled && at ? `bật (${minutesBefore ?? 0} phút trước)` : 'tắt'}`,
      interactionType: 'CALLBACK_SCHEDULE',
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DATA_POOL',
      objectId: dataPoolId,
      result: 'SUCCESS',
      details: `Cập nhật hẹn gọi lại khách ${lead.customer?.code || lead.customerId}: ${fmt(at)}; nhắc ${enabled && at ? 'bật' : 'tắt'}`,
      req,
    });

    res.json({
      message: 'Đã cập nhật hẹn gọi lại',
      callbackAt: at,
      callbackNotifyEnabled: enabled && !!at,
      callbackNotifyMinutesBefore: enabled && at ? minutesBefore : null,
      callbackReminderSentAt: null,
    });
  } catch (error) {
    console.error('updateCallbackSchedule error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật hẹn gọi lại' });
  }
};

/**
 * Phân chia số từ kho thả nổi — org-aware, fallback khi unit không có NV.
 */
export const distributeFromFloatingPool = async (req: Request, res: Response) => {
  try {
    if (!assertFloatingDistributePermission(req, res)) return;
    const user = (req as any).user;
    const { leadIds, targetEmployeeId, targetDepartmentId, count } = req.body;

    if (!leadIds && !targetDepartmentId && !targetEmployeeId) {
      return res.status(400).json({ message: 'Vui lòng chọn lead hoặc đơn vị/nhân viên đích' });
    }

    if (targetEmployeeId || targetDepartmentId) {
      const scope = await validateFloatingDistributeTarget(
        { id: user.id, roleGroupCode: user.roleGroupCode, permissions: user.permissions },
        targetEmployeeId,
        targetDepartmentId
      );
      if (!scope.ok) {
        return res.status(403).json({ message: scope.message });
      }
    }

    const now = new Date();
    const salesKeepDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }).catch(() => null);
    const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
    const maxRoundsCfg = await prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null);
    const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;

    let leadsToDistribute;
    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      leadsToDistribute = await prisma.dataPool.findMany({
        where: { id: { in: leadIds }, status: 'AVAILABLE', poolQueue: DATA_POOL_QUEUE.FLOATING },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
    } else {
      leadsToDistribute = await prisma.dataPool.findMany({
        where: { status: 'AVAILABLE', poolType: 'SALES', poolQueue: DATA_POOL_QUEUE.FLOATING },
        orderBy: [{ priority: 'desc' }, { enteredAt: 'asc' }],
        take: Number(count || 10),
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
    }

    if (leadsToDistribute.length === 0) {
      return res.status(404).json({ message: 'Không có lead nào để phân' });
    }

    let targetEmployees: { id: string }[] = [];
    if (targetEmployeeId) {
      targetEmployees = [{ id: targetEmployeeId }];
    } else if (targetDepartmentId) {
      const resolved = await resolveTargetEmployees(targetDepartmentId, 'SALES');
      targetEmployees = resolved.employees;
      if (targetEmployees.length === 0) {
        // fallback: lấy NV bất kỳ trong dept được chọn (kể cả không đúng function)
        targetEmployees = await prisma.employee.findMany({
          where: { departmentId: targetDepartmentId, status: { code: 'WORKING' } },
          select: { id: true },
        });
      }
    }

    if (targetEmployees.length === 0) {
      return res.status(400).json({ message: 'Không tìm thấy nhân viên để phân chia' });
    }

    const assignments: { leadId: string; customerId: string; employeeId: string }[] = [];
    leadsToDistribute.forEach((lead, index) => {
      const empIdx = index % targetEmployees.length;
      assignments.push({ leadId: lead.id, customerId: lead.customerId, employeeId: targetEmployees[empIdx].id });
    });

    for (const assign of assignments) {
      await prisma.dataPool.update({
        where: { id: assign.leadId },
        data: {
          status: 'ASSIGNED', poolType: 'SALES', poolQueue: DATA_POOL_QUEUE.SALES_OPEN, assignedToId: assign.employeeId, assignedAt: now,
          deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
          maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5, awaitingSalesAfterCskh: false, processingStatus: null,
        },
      });
      await prisma.customer.update({ where: { id: assign.customerId }, data: { employeeId: assign.employeeId } });
      await prisma.leadDistributionHistory.create({ data: { customerId: assign.customerId, employeeId: assign.employeeId, method: 'MANUAL' } });
    }

    await logAudit({ ...getAuditUser(req), action: 'DISTRIBUTE_FLOATING_POOL', object: 'DATA_POOL', result: 'SUCCESS',
      details: `Phân ${assignments.length} khách từ kho thả nổi (org-aware)`, req });

    res.json({ message: `Đã phân ${assignments.length} khách hàng`, count: assignments.length });
  } catch (error) {
    console.error('Distribute from floating pool error:', error);
    res.status(500).json({ message: 'Lỗi khi phân chia từ kho thả nổi' });
  }
};

/**
 * Nhận khách từ kho thả nổi — ưu tiên lead cùng division với NV.
 */
export const claimFromFloatingPool = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { count = 1 } = req.body;

    const emp = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { id: true, fullName: true, departmentId: true, employeeType: { select: { code: true } } }
    });
    if (!emp) return res.status(404).json({ message: 'Không tìm thấy thông tin nhân viên' });

    const empTypeCode = emp.employeeType?.code?.toLowerCase() || '';
    const isCskh = empTypeCode === 'customer_service';
    const poolTypeTarget = isCskh ? 'CSKH' : 'SALES';

    const now = new Date();
    const salesKeepDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }).catch(() => null);
    const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
    const maxRoundsCfg = await prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null);
    const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;

    const pushCfg = await prisma.systemConfig.findUnique({ where: { key: 'pool_push_processing_statuses' } });
    const statuses = parsePoolPushStatusesJson(pushCfg?.value);

    const allAvailable = await prisma.dataPool.findMany({
      where: { 
        status: 'AVAILABLE', 
        poolType: 'SALES', 
        poolQueue: DATA_POOL_QUEUE.FLOATING,
        processingStatus: statuses.length > 0 ? { in: statuses } : undefined
      },
      orderBy: [{ priority: 'desc' }, { enteredAt: 'asc' }],
      take: Number(count) * 10,
      include: { customer: { select: { id: true, name: true, phone: true, marketingOwnerId: true } } }
    });

    if (allAvailable.length === 0) {
      return res.status(404).json({ message: 'Không còn khách nào trong kho thả nổi' });
    }

    const userDivId = emp.departmentId ? await getDivisionIdForDept(emp.departmentId) : null;
    let prioritized = allAvailable;
    if (userDivId) {
      const ownerDivCache: Record<string, string | null> = {};
      const getOwnerDiv = async (ownerId: string | null): Promise<string | null> => {
        if (!ownerId) return null;
        if (ownerDivCache[ownerId] !== undefined) return ownerDivCache[ownerId];
        const o = await prisma.employee.findUnique({ where: { id: ownerId }, select: { departmentId: true } });
        ownerDivCache[ownerId] = o?.departmentId ? await getDivisionIdForDept(o.departmentId) : null;
        return ownerDivCache[ownerId];
      };
      const sameDivLeads: typeof allAvailable = [];
      const otherLeads: typeof allAvailable = [];
      for (const l of allAvailable) {
        const ownerDiv = await getOwnerDiv(l.customer?.marketingOwnerId ?? null);
        if (ownerDiv === userDivId) sameDivLeads.push(l);
        else otherLeads.push(l);
      }
      prioritized = [...sameDivLeads, ...otherLeads];
    }

    const selectedLeads = prioritized.slice(0, Number(count));
    const leadIds = selectedLeads.map(l => l.id);
    const customerIds = selectedLeads.map(l => l.customerId);

    const updateData: any = {
      status: 'ASSIGNED', poolType: poolTypeTarget, poolQueue: DATA_POOL_QUEUE.SALES_OPEN, assignedToId: user.id, assignedAt: now,
      maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5, awaitingSalesAfterCskh: false, processingStatus: null,
    };

    if (isCskh) {
      const cskhHoldDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'customer_recycle_days' } }).catch(() => null);
      const cskhHoldDays = cskhHoldDaysCfg ? parseInt(cskhHoldDaysCfg.value, 10) : 180;
      const cskhNoteDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'cskh_max_note_days' } }).catch(() => null);
      const cskhNoteDays = cskhNoteDaysCfg ? parseInt(cskhNoteDaysCfg.value, 10) : 15;
      updateData.holdUntil = new Date(now.getTime() + cskhHoldDays * 24 * 60 * 60 * 1000);
      updateData.interactionDeadline = new Date(now.getTime() + cskhNoteDays * 24 * 60 * 60 * 1000);
      updateData.cskhStage = 1;
    } else {
      updateData.deadline = new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000);
    }

    await prisma.dataPool.updateMany({ where: { id: { in: leadIds } }, data: updateData });
    await prisma.customer.updateMany({ where: { id: { in: customerIds } }, data: { employeeId: user.id } });

    for (const lead of selectedLeads) {
      await prisma.leadDistributionHistory.create({ data: { customerId: lead.customerId, employeeId: user.id, method: 'CLAIM' } });
    }

    await logAudit({ ...getAuditUser(req), action: 'CLAIM_FLOATING_POOL', object: 'DATA_POOL', result: 'SUCCESS',
      details: `Nhận ${selectedLeads.length} khách từ kho thả nổi (${poolTypeTarget}, ưu tiên cùng division)`, req });

    res.json({ message: `Đã nhận ${selectedLeads.length} khách`, leads: selectedLeads });
  } catch (error) {
    console.error('Claim from floating pool error:', error);
    res.status(500).json({ message: 'Lỗi khi nhận khách từ kho thả nổi' });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  Phân thủ công từ kho Sales (SALES_OPEN) — quản lý / cross-org
 * ═══════════════════════════════════════════════════════════════════════════ */

function assertSalesDistributePermission(req: Request, res: Response): boolean {
  const u = (req as any).user;
  if (
    isTechnicalAdminRoleCode(u?.roleGroupCode) ||
    userHasCatalogPermission(u, [
      'ASSIGN_LEAD',
      'MANAGE_DATA_POOL',
      'DISTRIBUTE_SALES_CROSS_ORG',
    ])
  ) {
    return true;
  }
  res.status(403).json({
    message:
      'Cần một trong các quyền: ASSIGN_LEAD, MANAGE_DATA_POOL, DISTRIBUTE_SALES_CROSS_ORG (hoặc quản trị hệ thống).',
  });
  return false;
}

export const distributeFromSalesPool = async (req: Request, res: Response) => {
  try {
    if (!assertSalesDistributePermission(req, res)) return;
    const user = (req as any).user;
    const { leadIds, targetEmployeeId, targetDepartmentId, count } = req.body;

    if (!leadIds && !targetDepartmentId && !targetEmployeeId) {
      return res.status(400).json({ message: 'Vui lòng chọn lead hoặc đơn vị/nhân viên đích' });
    }

    if (targetEmployeeId || targetDepartmentId) {
      const scope = await validateSalesDistributeTarget(
        { id: user.id, roleGroupCode: user.roleGroupCode, permissions: user.permissions },
        targetEmployeeId,
        targetDepartmentId,
        'SALES'
      );
      if (!scope.ok) {
        return res.status(403).json({ message: scope.message });
      }
    }

    const now = new Date();
    const salesKeepDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'data_pool_auto_recall_days' } }).catch(() => null);
    const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
    const maxRoundsCfg = await prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null);
    const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;

    let leadsToDistribute;
    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      leadsToDistribute = await prisma.dataPool.findMany({
        where: { id: { in: leadIds }, status: 'AVAILABLE', poolQueue: DATA_POOL_QUEUE.SALES_OPEN },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
    } else {
      leadsToDistribute = await prisma.dataPool.findMany({
        where: { status: 'AVAILABLE', poolType: 'SALES', poolQueue: DATA_POOL_QUEUE.SALES_OPEN },
        orderBy: [{ priority: 'desc' }, { enteredAt: 'asc' }],
        take: Number(count || 10),
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
    }

    if (leadsToDistribute.length === 0) {
      return res.status(404).json({ message: 'Không có lead nào để phân' });
    }

    let targetEmployees: { id: string }[] = [];
    if (targetEmployeeId) {
      targetEmployees = [{ id: targetEmployeeId }];
    } else if (targetDepartmentId) {
      const resolved = await resolveTargetEmployees(targetDepartmentId, 'SALES');
      targetEmployees = resolved.employees;
      if (targetEmployees.length === 0) {
        targetEmployees = await prisma.employee.findMany({
          where: { 
            departmentId: targetDepartmentId, 
            status: { code: 'WORKING' },
            OR: [
              { employeeType: { code: 'sales' } },
              { salesType: { in: ['SALES', 'MARKETING'] } }
            ]
          },
          select: { id: true },
        });
      }
    }

    if (targetEmployees.length === 0) {
      return res.status(400).json({ message: 'Không tìm thấy nhân viên để phân chia' });
    }

    const assignments: { leadId: string; customerId: string; employeeId: string }[] = [];
    leadsToDistribute.forEach((lead, index) => {
      const empIdx = index % targetEmployees.length;
      assignments.push({ leadId: lead.id, customerId: lead.customerId, employeeId: targetEmployees[empIdx].id });
    });

    for (const assign of assignments) {
      await prisma.dataPool.update({
        where: { id: assign.leadId },
        data: {
          status: 'ASSIGNED', poolType: 'SALES', poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
          assignedToId: assign.employeeId, assignedAt: now,
          deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
          maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5,
          awaitingSalesAfterCskh: false, processingStatus: null,
        },
      });
      await prisma.customer.update({ where: { id: assign.customerId }, data: { employeeId: assign.employeeId } });
      await prisma.leadDistributionHistory.create({ data: { customerId: assign.customerId, employeeId: assign.employeeId, method: 'MANUAL' } });
    }

    await logAudit({ ...getAuditUser(req), action: 'DISTRIBUTE_SALES_POOL', object: 'DATA_POOL', result: 'SUCCESS',
      details: `Phân ${assignments.length} khách từ kho Sales (chưa phân)`, req });

    res.json({ message: `Đã phân ${assignments.length} khách hàng`, count: assignments.length });
  } catch (error) {
    console.error('Distribute from sales pool error:', error);
    res.status(500).json({ message: 'Lỗi khi phân chia từ kho Sales' });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  Phân thủ công từ kho CSKH — quản lý / cross-org
 * ═══════════════════════════════════════════════════════════════════════════ */

function assertCskhDistributePermission(req: Request, res: Response): boolean {
  const u = (req as any).user;
  if (
    isTechnicalAdminRoleCode(u?.roleGroupCode) ||
    userHasCatalogPermission(u, [
      'MANAGE_CSKH_POOL',
      'MANAGE_DATA_POOL',
      'DISTRIBUTE_SALES_CROSS_ORG',
    ])
  ) {
    return true;
  }
  res.status(403).json({
    message:
      'Cần một trong các quyền: MANAGE_CSKH_POOL, MANAGE_DATA_POOL, DISTRIBUTE_SALES_CROSS_ORG (hoặc quản trị hệ thống).',
  });
  return false;
}

export const distributeFromCskhPool = async (req: Request, res: Response) => {
  try {
    if (!assertCskhDistributePermission(req, res)) return;
    const user = (req as any).user;
    const { leadIds, targetEmployeeId, targetDepartmentId, count } = req.body;

    if (!leadIds && !targetDepartmentId && !targetEmployeeId) {
      return res.status(400).json({ message: 'Vui lòng chọn lead hoặc đơn vị/nhân viên đích' });
    }

    if (targetEmployeeId || targetDepartmentId) {
      const scope = await validateSalesDistributeTarget(
        { id: user.id, roleGroupCode: user.roleGroupCode, permissions: user.permissions },
        targetEmployeeId,
        targetDepartmentId,
        'CSKH'
      );
      if (!scope.ok) {
        return res.status(403).json({ message: scope.message });
      }
    }

    const now = new Date();
    const cskhHoldDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'customer_recycle_days' } }).catch(() => null);
    const cskhHoldDays = cskhHoldDaysCfg ? parseInt(cskhHoldDaysCfg.value, 10) : 180;
    const cskhNoteDaysCfg = await prisma.systemConfig.findUnique({ where: { key: 'cskh_max_note_days' } }).catch(() => null);
    const cskhNoteDays = cskhNoteDaysCfg ? parseInt(cskhNoteDaysCfg.value, 10) : 15;

    // Lấy lead CSKH chưa phân: poolType=CSKH, status=AVAILABLE hoặc poolType=SALES trả lại CSKH
    let leadsToDistribute;
    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      leadsToDistribute = await prisma.dataPool.findMany({
        where: { id: { in: leadIds }, status: 'AVAILABLE', poolType: 'CSKH' },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
    } else {
      leadsToDistribute = await prisma.dataPool.findMany({
        where: { status: 'AVAILABLE', poolType: 'CSKH' },
        orderBy: [{ priority: 'desc' }, { enteredAt: 'asc' }],
        take: Number(count || 10),
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
    }

    if (leadsToDistribute.length === 0) {
      return res.status(404).json({ message: 'Không có lead CSKH nào để phân' });
    }

    let targetEmployees: { id: string }[] = [];
    if (targetEmployeeId) {
      targetEmployees = [{ id: targetEmployeeId }];
    } else if (targetDepartmentId) {
      const resolved = await resolveTargetEmployees(targetDepartmentId, 'CSKH');
      targetEmployees = resolved.employees;
      if (targetEmployees.length === 0) {
        targetEmployees = await prisma.employee.findMany({
          where: { 
            departmentId: targetDepartmentId, 
            status: { code: 'WORKING' },
            OR: [
              { employeeType: { code: 'customer_service' } },
              { salesType: 'RESALES' }
            ]
          },
          select: { id: true },
        });
      }
    }

    if (targetEmployees.length === 0) {
      return res.status(400).json({ message: 'Không tìm thấy nhân viên CSKH để phân chia' });
    }

    const assignments: { leadId: string; customerId: string; employeeId: string }[] = [];
    leadsToDistribute.forEach((lead, index) => {
      const empIdx = index % targetEmployees.length;
      assignments.push({ leadId: lead.id, customerId: lead.customerId, employeeId: targetEmployees[empIdx].id });
    });

    for (const assign of assignments) {
      await prisma.dataPool.update({
        where: { id: assign.leadId },
        data: {
          status: 'ASSIGNED', poolType: 'CSKH',
          assignedToId: assign.employeeId, assignedAt: now,
          holdUntil: new Date(now.getTime() + cskhHoldDays * 24 * 60 * 60 * 1000),
          interactionDeadline: new Date(now.getTime() + cskhNoteDays * 24 * 60 * 60 * 1000),
          cskhStage: 1,
          awaitingSalesAfterCskh: false, processingStatus: null,
        },
      });
      await prisma.customer.update({ where: { id: assign.customerId }, data: { employeeId: assign.employeeId } });
      await prisma.leadDistributionHistory.create({ data: { customerId: assign.customerId, employeeId: assign.employeeId, method: 'MANUAL' } });
    }

    await logAudit({ ...getAuditUser(req), action: 'DISTRIBUTE_CSKH_POOL', object: 'DATA_POOL', result: 'SUCCESS',
      details: `Phân ${assignments.length} khách từ kho CSKH (chưa phân)`, req });

    res.json({ message: `Đã phân ${assignments.length} khách hàng cho CSKH`, count: assignments.length });
  } catch (error) {
    console.error('Distribute from CSKH pool error:', error);
    res.status(500).json({ message: 'Lỗi khi phân chia từ kho CSKH' });
  }
};

