import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logAudit, getAuditUser } from '../utils/auditLog';
import { getPaginationParams } from '../utils/pagination';
import { getSubordinateIds, buildCustomerWhereByScope, getVisibleEmployeeIds } from '../utils/viewScopeHelper';
import { isTechnicalAdminRoleCode } from '../constants/rbac';
import { userCanAccessCustomerForSalesModule } from '../utils/customerRowAccess';
import { appendCustomerImpactNote } from '../utils/customerImpact';
import { parsePoolPushStatusesJson } from '../constants/operationParams';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';

/**
 * Lấy danh sách Lead của tôi (Sales/Telesales). Quản lý có thể lọc theo nhân viên (employeeId).
 */
export const getMyLeads = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      status,
      search,
      employeeId,
      tagIds,
      processingStatus,
      priority,
      source,
      dateFrom,
      dateTo,
      provinceId,
      mainCrop,
      spendingRankCode,
    } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = { poolType: 'SALES' };
    const customerConditions: any[] = [];

    // View scope: xác định nhân viên được xem
    const visibleIds = await getVisibleEmployeeIds(user, 'CUSTOMER');
    if (visibleIds) {
      if (employeeId && String(employeeId).trim() && employeeId !== 'all') {
        const empId = String(employeeId).trim();
        if (visibleIds.includes(empId)) {
          where.assignedToId = empId;
        } else {
          where.assignedToId = user.id;
        }
      } else {
        where.assignedToId = { in: visibleIds };
      }
    } else {
      if (employeeId && String(employeeId).trim() && employeeId !== 'all') {
        where.assignedToId = String(employeeId).trim();
      }
    }

    if (status && status !== 'all') {
      where.status = status;
    } else {
      where.status = { in: ['ASSIGNED', 'PROCESSING'] };
    }

    if (processingStatus && processingStatus !== 'all') {
      where.processingStatus = String(processingStatus);
    }

    if (priority && priority !== 'all') {
      where.priority = Number(priority);
    }

    if (source && source !== 'all') {
      where.source = String(source);
    }

    if (dateFrom) {
      where.assignedAt = { ...(where.assignedAt || {}), gte: new Date(String(dateFrom)) };
    }
    if (dateTo) {
      const dt = new Date(String(dateTo));
      dt.setHours(23, 59, 59, 999);
      where.assignedAt = { ...(where.assignedAt || {}), lte: dt };
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

    if (typeof tagIds === 'string' && tagIds.trim()) {
      const tagIdArr = tagIds.split(',').map(s => s.trim()).filter(Boolean);
      if (tagIdArr.length > 0) {
        customerConditions.push({ tags: { some: { tagId: { in: tagIdArr } } } });
      }
    }

    if (provinceId && provinceId !== 'all') {
      customerConditions.push({ provinceId: String(provinceId) });
    }
    if (mainCrop && mainCrop !== 'all') {
      customerConditions.push({ mainCrops: { has: String(mainCrop) } });
    }
    if (spendingRankCode && spendingRankCode !== 'all') {
      const src = String(spendingRankCode);
      // FE: option «Chưa xếp hạng» gửi mã dành riêng (không trùng mã hạng trong DB)
      if (src === '__UNRANKED__') {
        customerConditions.push({ spendingRankCode: null });
      } else {
        customerConditions.push({ spendingRankCode: src });
      }
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
          { assignedAt: 'desc' }
        ],
        include: {
          customer: {
            include: {
              leadSource: { select: { id: true, name: true } },
              campaign: { select: { id: true, name: true } },
              province: { select: { id: true, name: true } },
              spendingRank: true,
              tags: { include: { tag: true } },
              marketingContributors: {
                include: {
                  employee: { select: { id: true, code: true, fullName: true } },
                },
              },
              interactions: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          assignedTo: { select: { id: true, code: true, fullName: true, avatarUrl: true } }
        }
      })
    ]);

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my leads error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách lead' });
  }
};

/**
 * Cập nhật trạng thái lead
 */
export const updateLeadStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const { status, note } = req.body;

    const lead = await prisma.dataPool.findFirst({
      where: {
        id,
        assignedToId: user.id
      },
      include: {
        customer: { select: { id: true, name: true } }
      }
    });

    if (!lead) {
      return res.status(404).json({ message: 'Không tìm thấy lead hoặc bạn không có quyền' });
    }

    const updatedLead = await prisma.dataPool.update({
      where: { id },
      data: {
        status,
        note: note || lead.note
      },
      include: {
        customer: true
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE_STATUS',
      object: 'LEAD',
      objectId: id,
      result: 'SUCCESS',
      details: `Updated lead status to ${status}`,
      req
    });

    res.json(updatedLead);
  } catch (error) {
    console.error('Update lead status error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái' });
  }
};

/**
 * Chuyển Lead → Opportunity
 */
export const convertToOpportunity = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const { expectedAmount, probability = 50, note } = req.body;

    const lead = await prisma.dataPool.findFirst({
      where: {
        id,
        assignedToId: user.id
      },
      include: {
        customer: true
      }
    });

    if (!lead) {
      return res.status(404).json({ message: 'Không tìm thấy lead hoặc bạn không có quyền' });
    }

    // Tạo mã opportunity
    const count = await prisma.leadOpportunity.count();
    const code = `OPP-${String(count + 1).padStart(6, '0')}`;

    // Tạo opportunity
    const opportunity = await prisma.leadOpportunity.create({
      data: {
        code,
        customerId: lead.customerId,
        assignedToEmployeeId: user.id,
        status: 'NEW',
        expectedAmount: expectedAmount || 0,
        probability
      }
    });

    // Đánh dấu lead đã chuyển thành cơ hội (theo logic CRM: không còn trong danh sách Lead mặc định)
    await prisma.dataPool.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        note: note || 'Đã chuyển thành cơ hội'
      }
    });

    // Cập nhật customer lead status
    await prisma.customer.update({
      where: { id: lead.customerId },
      data: { leadStatus: 'OPPORTUNITY' }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CONVERT_TO_OPPORTUNITY',
      object: 'LEAD',
      objectId: id,
      result: 'SUCCESS',
      details: `Converted lead to opportunity ${code}`,
      req
    });

    res.json({
      message: 'Đã chuyển thành cơ hội',
      opportunity
    });
  } catch (error) {
    console.error('Convert to opportunity error:', error);
    res.status(500).json({ message: 'Lỗi khi chuyển đổi' });
  }
};

/**
 * Lấy danh sách cơ hội
 */
export const getOpportunities = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { status, search, all } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};

    // Nếu không phải admin/manager, chỉ xem của mình
    if (all !== 'true') {
      where.assignedToEmployeeId = user.id;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { code: { contains: String(search), mode: 'insensitive' } },
        { customer: { name: { contains: String(search), mode: 'insensitive' } } },
        { customer: { phone: { contains: String(search), mode: 'insensitive' } } }
      ];
    }

    const [total, items] = await Promise.all([
      prisma.leadOpportunity.count({ where }),
      prisma.leadOpportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              phone: true,
              email: true,
              address: true
            }
          },
          assignedToEmployee: {
            select: {
              id: true,
              code: true,
              fullName: true,
              avatarUrl: true
            }
          },
          campaign: {
            select: { id: true, name: true }
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
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get opportunities error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách cơ hội' });
  }
};

/**
 * Cập nhật cơ hội (bao gồm đóng cơ hội LOST).
 * ADM: full quyền. MARKETING_MGR: đóng cơ hội của khách của mình hoặc của nhân viên mình. Còn lại: chỉ cơ hội gán cho mình.
 */
export const updateOpportunity = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const { status, expectedAmount, actualAmount, probability, loseReason } = req.body;

    const opportunity = await prisma.leadOpportunity.findUnique({
      where: { id },
      include: { customer: true }
    });

    if (!opportunity) {
      return res.status(404).json({ message: 'Không tìm thấy cơ hội' });
    }

    const roleCode = user.roleGroupCode || '';
    const isAdm = isTechnicalAdminRoleCode(roleCode);
    const isMarketingMgr = roleCode === 'MARKETING_MGR';

    let canUpdate = false;
    if (isAdm) {
      canUpdate = true;
    } else if (isMarketingMgr) {
      const cust = opportunity.customer;
      if (cust.marketingOwnerId === user.id) canUpdate = true;
      else {
        const subordinateIds = await getSubordinateIds(user.id);
        if (cust.marketingOwnerId && subordinateIds.includes(cust.marketingOwnerId)) canUpdate = true;
      }
    } else {
      canUpdate = opportunity.assignedToEmployeeId === user.id;
    }

    if (!canUpdate) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật/đóng cơ hội này' });
    }

    if (status === 'LOST') {
      const reason = typeof loseReason === 'string' ? loseReason.trim() : '';
      if (!reason) {
        return res.status(400).json({ message: 'Vui lòng nhập lý do đóng cơ hội' });
      }
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (expectedAmount !== undefined) updateData.expectedAmount = expectedAmount;
    if (actualAmount !== undefined) updateData.actualAmount = actualAmount;
    if (probability !== undefined) updateData.probability = probability;
    if (loseReason !== undefined) updateData.loseReason = loseReason;

    if (status === 'WON' || status === 'LOST') {
      updateData.closedAt = new Date();
    }

    const updated = await prisma.leadOpportunity.update({
      where: { id },
      data: updateData,
      include: {
        customer: true
      }
    });

    if (status === 'LOST' && updated.loseReason) {
      const intCount = await prisma.customerInteraction.count();
      await prisma.customerInteraction.create({
        data: {
          code: `INT-${String(intCount + 1).padStart(6, '0')}`,
          customerId: opportunity.customerId,
          employeeId: user.id,
          type: 'OPPORTUNITY_CLOSED',
          content: `Đóng cơ hội. Lý do: ${updated.loseReason}`
        }
      });
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'OPPORTUNITY',
      objectId: id,
      result: 'SUCCESS',
      details: `Updated opportunity ${opportunity.code}${status === 'LOST' ? ' (đóng cơ hội)' : ''}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Update opportunity error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cơ hội' });
  }
};

/**
 * Chuyển đổi Opportunity → Customer (Chốt đơn đầu tiên).
 * Giá trị thực tế (actualAmount) không nhập tay; được cập nhật từ đơn hàng do nhân viên tạo trong mục Đơn hàng.
 */
export const convertToCustomer = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;

    const opportunity = await prisma.leadOpportunity.findFirst({
      where: {
        id,
        assignedToEmployeeId: user.id
      },
      include: {
        customer: true
      }
    });

    if (!opportunity) {
      return res.status(404).json({ message: 'Không tìm thấy cơ hội hoặc bạn không có quyền' });
    }

    // Cập nhật opportunity: không gán actualAmount từ input; sẽ cập nhật khi có đơn hàng
    await prisma.leadOpportunity.update({
      where: { id },
      data: {
        status: 'WON',
        actualAmount: null,
        closedAt: new Date()
      }
    });

    // Cập nhật customer
    await prisma.customer.update({
      where: { id: opportunity.customerId },
      data: {
        leadStatus: 'CUSTOMER'
      }
    });

    // Cập nhật data pool
    await prisma.dataPool.updateMany({
      where: { customerId: opportunity.customerId },
      data: { status: 'CONVERTED' }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CONVERT_TO_CUSTOMER',
      object: 'OPPORTUNITY',
      objectId: id,
      result: 'SUCCESS',
      details: `Converted opportunity ${opportunity.code} to customer`,
      req
    });

    res.json({
      message: 'Đã chuyển đổi thành khách hàng',
      customerId: opportunity.customerId
    });
  } catch (error) {
    console.error('Convert to customer error:', error);
    res.status(500).json({ message: 'Lỗi khi chuyển đổi' });
  }
};

/**
 * Ghi nhận tương tác với khách hàng
 */
export const addInteraction = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      customerId,
      type,
      content,
      result,
      nextActionAt,
      detail,
      processingStatus,
      syncProcessingToDataPool,
    } = req.body;

    if (!customerId || !type || !content) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    const minNoteCfg = await prisma.systemConfig.findUnique({ where: { key: 'min_note_characters' } }).catch(() => null);
    const minNoteChars = minNoteCfg ? parseInt(minNoteCfg.value, 10) : 10;
    const textToCheck = detail != null && String(detail).trim() !== '' ? String(detail).trim() : String(content).trim();
    const pushCfg = await prisma.systemConfig.findUnique({ where: { key: 'pool_push_processing_statuses' } }).catch(() => null);
    const poolPushStatuses = parsePoolPushStatusesJson(pushCfg?.value);
    const ps = processingStatus != null ? String(processingStatus).trim() : '';
    const skipMinNoteForPool = ps !== '' && poolPushStatuses.includes(ps);
    if (!skipMinNoteForPool && textToCheck.length < minNoteChars) {
      return res.status(400).json({
        message:
          detail != null && String(detail).trim() !== ''
            ? `Chi tiết tương tác phải tối thiểu ${minNoteChars} ký tự`
            : `Nội dung ghi chú phải tối thiểu ${minNoteChars} ký tự`,
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    const canAccess = await userCanAccessCustomerForSalesModule(user, customerId);
    if (!canAccess && !isTechnicalAdminRoleCode(user.roleGroupCode)) {
      return res.status(403).json({ message: 'Bạn không có quyền ghi tương tác cho khách hàng này' });
    }

    // Tạo mã interaction
    const count = await prisma.customerInteraction.count();
    const code = `INT-${String(count + 1).padStart(6, '0')}`;

    const interaction = await prisma.customerInteraction.create({
      data: {
        code,
        customerId,
        employeeId: user.id,
        type,
        content: String(content).trim(),
        detail: detail != null && String(detail).trim() !== '' ? String(detail).trim() : null,
        processingStatusAtTime: processingStatus ? String(processingStatus).trim() : null,
        result,
        kind: 'USER_NOTE',
        nextActionAt: nextActionAt ? new Date(nextActionAt) : null,
      },
    });

    if (syncProcessingToDataPool && processingStatus) {
      const dp = await prisma.dataPool.findFirst({
        where: { customerId, poolType: 'SALES' },
      });
      if (dp) {
        if (skipMinNoteForPool) {
          // Push to floating pool
          if (dp.assignedToId) {
            await prisma.leadDistributionHistory.updateMany({
              where: { customerId, employeeId: dp.assignedToId, revokedAt: null },
              data: { revokedAt: new Date(), revokeReason: `Trạng thái ${processingStatus} → kho thả nổi (Interaction History)` },
            });
          }
          await prisma.dataPool.update({
            where: { id: dp.id },
            data: {
              status: 'AVAILABLE',
              assignedToId: null,
              assignedAt: null,
              poolQueue: DATA_POOL_QUEUE.FLOATING,
              deadline: null,
              holdUntil: null,
              interactionDeadline: null,
              processingStatus: String(processingStatus).trim(),
            },
          });
          await prisma.customer.update({
            where: { id: customerId },
            data: { employeeId: null },
          });
        } else {
          // Only update status
          await prisma.dataPool.update({
            where: { id: dp.id },
            data: { processingStatus: String(processingStatus).trim() },
          });
        }
      }
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'INTERACTION',
      objectId: interaction.id,
      result: 'SUCCESS',
      details: `Tạo lịch sử tác động ${code} cho khách ${customer.name || customerId}`,
      req,
    });

    res.json(interaction);
  } catch (error) {
    console.error('Add interaction error:', error);
    res.status(500).json({ message: 'Lỗi khi ghi nhận tương tác' });
  }
};

/**
 * Lấy lịch sử tương tác của khách hàng
 */
export const getInteractions = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const customerId = req.params.customerId as string;
    const { page, limit, skip } = getPaginationParams(req.query);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    const canAccess = await userCanAccessCustomerForSalesModule(user, customerId);
    if (!canAccess && !isTechnicalAdminRoleCode(user.roleGroupCode)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem lịch sử tác động của khách này' });
    }

    const [total, items] = await Promise.all([
      prisma.customerInteraction.count({ where: { customerId } }),
      prisma.customerInteraction.findMany({
        where: { customerId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
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
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get interactions error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử tương tác' });
  }
};

/** Cập nhật mức ưu tiên lead (data_pool Sales). */
export const updateLeadPriority = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const priority = Number(req.body?.priority);

    if (!Number.isFinite(priority) || priority < 1 || priority > 5) {
      return res.status(400).json({ message: 'Ưu tiên phải từ 1 đến 5' });
    }

    const dp = await prisma.dataPool.findFirst({
      where: { id, poolType: 'SALES' },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!dp) {
      return res.status(404).json({ message: 'Không tìm thấy lead Sales' });
    }

    const canAccess = await userCanAccessCustomerForSalesModule(user, dp.customerId);
    if (!canAccess && !isTechnicalAdminRoleCode(user.roleGroupCode)) {
      return res.status(403).json({ message: 'Không có quyền đổi ưu tiên lead này' });
    }

    const oldP = dp.priority;
    await prisma.dataPool.update({
      where: { id },
      data: { priority },
    });

    await appendCustomerImpactNote({
      customerId: dp.customerId,
      employeeId: user.id,
      contentVi: `Đổi mức ưu tiên lead từ "${oldP}" sang "${priority}"`,
      interactionType: 'LEAD_PRIORITY',
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DATA_POOL',
      objectId: id,
      result: 'SUCCESS',
      details: `Đổi ưu tiên lead (Sales) từ ${oldP} sang ${priority} — khách ${dp.customer?.name || dp.customerId}`,
      req,
    });

    res.json({ message: 'Đã cập nhật ưu tiên', priority });
  } catch (error) {
    console.error('Update lead priority error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật ưu tiên' });
  }
};

/**
 * Thống kê Sales
 */
export const getSalesStats = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const visibleIds = await getVisibleEmployeeIds(user, 'CUSTOMER');
    const empFilter = visibleIds ? { assignedToId: { in: visibleIds } } : {};

    const [
      totalLeads,
      leadsProcessing,
      leadsConverted,
      todayInteractions,
    ] = await Promise.all([
      prisma.dataPool.count({ where: { ...empFilter, poolType: 'SALES' } }),
      prisma.dataPool.count({ where: { ...empFilter, poolType: 'SALES', status: 'ASSIGNED' } }),
      prisma.dataPool.count({ where: { ...empFilter, poolType: 'SALES', processingStatus: 'DEAL_CLOSED' } }),
      prisma.customerInteraction.count({
        where: {
          employeeId: visibleIds ? { in: visibleIds } : user.id,
          createdAt: { gte: today }
        }
      }),
    ]);

    res.json({
      leads: {
        total: totalLeads,
        processing: leadsProcessing,
        converted: leadsConverted,
      },
      interactions: { today: todayInteractions }
    });
  } catch (error) {
    console.error('Get sales stats error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê' });
  }
};

/**
 * Lấy pipeline view
 */
export const getPipeline = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const [newLeads, processing, opportunities, customers] = await Promise.all([
      // Leads mới (ASSIGNED)
      prisma.dataPool.count({
        where: { assignedToId: user.id, status: 'ASSIGNED' }
      }),
      // Đang xử lý (PROCESSING)
      prisma.dataPool.count({
        where: { assignedToId: user.id, status: 'PROCESSING' }
      }),
      // Opportunities đang mở
      prisma.leadOpportunity.count({
        where: {
          assignedToEmployeeId: user.id,
          status: { in: ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'] }
        }
      }),
      // Đã chuyển đổi
      prisma.dataPool.count({
        where: { assignedToId: user.id, status: 'CONVERTED' }
      })
    ]);

    res.json({
      pipeline: [
        { stage: 'LEAD', label: 'Lead mới', count: newLeads },
        { stage: 'PROCESSING', label: 'Đang xử lý', count: processing },
        { stage: 'OPPORTUNITY', label: 'Cơ hội', count: opportunities },
        { stage: 'CUSTOMER', label: 'Khách hàng', count: customers }
      ]
    });
  } catch (error) {
    console.error('Get pipeline error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy pipeline' });
  }
};
