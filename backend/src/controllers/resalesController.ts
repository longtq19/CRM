import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { getPaginationParams } from '../utils/pagination';
import { logAudit, getAuditUser } from '../utils/auditLog';
import { getSubordinateIds, getVisibleEmployeeIds } from '../utils/viewScopeHelper';
import { userCanAccessCustomerForResalesModule } from '../utils/customerRowAccess';
import { isTechnicalAdminRoleCode } from '../constants/rbac';
import { appendCustomerImpactNote } from '../utils/customerImpact';
import { parsePoolPushStatusesJson } from '../constants/operationParams';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';


/**
 * Lấy danh sách khách hàng của tôi (Resales)
 */
export const getMyCustomers = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { search, spendingRankCode, employeeId, tagIds, processingStatus, cskhStage, interactionDeadline, priority, source, dateFrom, dateTo, provinceId, mainCrop } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const visibleIds = await getVisibleEmployeeIds(user, 'CUSTOMER');

    const where: any = {
      leadStatus: 'CUSTOMER'
    };

    if (visibleIds) {
      where.employeeId = { in: visibleIds };
    }

    if (employeeId && employeeId !== 'all' && String(employeeId).trim()) {
      const eid = String(employeeId);
      if (!visibleIds || visibleIds.includes(eid)) {
        where.employeeId = eid;
      }
    }

    if (tagIds && String(tagIds).trim()) {
      const tagIdArr = String(tagIds).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (tagIdArr.length > 0) {
        where.tags = { some: { tagId: { in: tagIdArr } } };
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    if (spendingRankCode && spendingRankCode !== 'all') {
      const src = String(spendingRankCode);
      if (src === '__UNRANKED__') {
        where.spendingRankCode = null;
      } else {
        where.spendingRankCode = src;
      }
    }

    if (provinceId && provinceId !== 'all') {
      where.provinceId = String(provinceId);
    }
    if (mainCrop && mainCrop !== 'all') {
      where.mainCrops = { has: String(mainCrop) };
    }

    // DataPool-level filters: build subquery
    const dpWhere: any = {};
    if (processingStatus && processingStatus !== 'all') dpWhere.processingStatus = String(processingStatus);
    if (cskhStage && cskhStage !== 'all') dpWhere.cskhStage = Number(cskhStage);
    if (priority && priority !== 'all') dpWhere.priority = Number(priority);
    if (source && source !== 'all') dpWhere.source = String(source);
    if (interactionDeadline === 'overdue') dpWhere.interactionDeadline = { lt: new Date() };
    else if (interactionDeadline === 'soon') dpWhere.interactionDeadline = { gte: new Date(), lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) };
    else if (interactionDeadline === 'ok') dpWhere.interactionDeadline = { gt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) };

    if (Object.keys(dpWhere).length > 0) {
      where.dataPool = { is: dpWhere };
    }

    if (dateFrom) where.updatedAt = { ...(where.updatedAt || {}), gte: new Date(String(dateFrom)) };
    if (dateTo) {
      const dt = new Date(String(dateTo)); dt.setHours(23, 59, 59, 999);
      where.updatedAt = { ...(where.updatedAt || {}), lte: dt };
    }

    const [total, items] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              code: true,
              fullName: true,
              avatarUrl: true
            }
          },
          province: { select: { id: true, name: true } },
          leadSource: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          aggregate: true,
          spendingRank: true,
          tags: { include: { tag: true } },
          marketingContributors: {
            include: {
              employee: { select: { id: true, code: true, fullName: true } },
            },
          },
          dataPool: {
            select: {
              id: true,
              priority: true,
              processingStatus: true,
              source: true,
              poolType: true,
              callbackAt: true,
              callbackNotifyEnabled: true,
              callbackNotifyMinutesBefore: true,
              callbackReminderSentAt: true,
            },
          },
          interactions: {
            orderBy: { createdAt: 'desc' },
            take: 1
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
    console.error('Get my customers error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách khách hàng' });
  }
};

/**
 * Lấy chi tiết khách hàng
 */
export const getCustomerDetail = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;

    // Lấy danh sách nhân viên có quyền xem
    const subordinates = await getSubordinateIds(user.id);
    const allowedEmployees = [user.id, ...subordinates];

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        OR: [
          { employeeId: { in: allowedEmployees } },
          { employeeId: null }
        ]
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            avatarUrl: true,
            phone: true
          }
        },
        province: true,
        leadSource: true,
        campaign: true,
        aggregate: true,
        spendingRank: true,
        tags: { include: { tag: true } },
        marketingContributors: {
          include: {
            employee: { select: { id: true, code: true, fullName: true } },
          },
        },
        addressRecord: {
          include: {
            province: true,
            district: true,
            ward: true
          }
        },
        orders: {
          orderBy: { orderDate: 'desc' },
          take: 10,
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, code: true } }
              }
            }
          }
        },
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            employee: {
              select: { id: true, fullName: true, avatarUrl: true }
            }
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng hoặc bạn không có quyền' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Get customer detail error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin khách hàng' });
  }
};

/**
 * Lấy lịch chăm sóc
 */
export const getCareSchedule = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate, includeSubordinates } = req.query;

    let employeeIds = [user.id];

    if (includeSubordinates === 'true') {
      const subordinates = await getSubordinateIds(user.id);
      employeeIds = [...employeeIds, ...subordinates];
    }

    const where: any = {
      employeeId: { in: employeeIds },
      nextActionAt: { not: null }
    };

    if (startDate) {
      where.nextActionAt = { ...where.nextActionAt, gte: new Date(String(startDate)) };
    }

    if (endDate) {
      where.nextActionAt = { ...where.nextActionAt, lte: new Date(String(endDate)) };
    }

    const schedules = await prisma.customerInteraction.findMany({
      where,
      orderBy: { nextActionAt: 'asc' },
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true
          }
        },
        employee: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true
          }
        }
      }
    });

    res.json(schedules);
  } catch (error) {
    console.error('Get care schedule error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch chăm sóc' });
  }
};

/**
 * Ghi nhận tương tác chăm sóc
 */
export const addCareInteraction = async (req: Request, res: Response) => {
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

    // Kiểm tra quyền
    const subordinates = await getSubordinateIds(user.id);
    const allowedEmployees = [user.id, ...subordinates];

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        employeeId: { in: allowedEmployees }
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng hoặc bạn không có quyền' });
    }

    // Tạo mã interaction
    const count = await prisma.customerInteraction.count();
    const code = `CARE-${String(count + 1).padStart(6, '0')}`;

    const interaction = await prisma.customerInteraction.create({
      data: {
        code,
        customerId,
        employeeId: user.id,
        type,
        content: String(content).trim(),
        detail: detail != null && String(detail).trim() !== '' ? String(detail).trim() : null,
        processingStatusAtTime: processingStatus ? String(processingStatus).trim() : null,
        kind: 'USER_NOTE',
        result,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : null
      },
      include: {
        customer: { select: { id: true, name: true } },
        employee: { select: { id: true, fullName: true } }
      }
    });

    if (syncProcessingToDataPool && processingStatus) {
      if (skipMinNoteForPool) {
        // Find existing DP
        const dp = await prisma.dataPool.findFirst({
          where: { customerId, poolType: 'CSKH' },
        });
        if (dp) {
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
        }
      } else {
        await prisma.dataPool.updateMany({
          where: { customerId, poolType: 'CSKH' },
          data: { processingStatus: String(processingStatus).trim() },
        });
      }
    }

    // Reset CSKH interaction deadline based on the last care interaction content.
    const cskhMaxNoteCfg = await prisma.systemConfig.findUnique({ where: { key: 'cskh_max_note_days' } }).catch(() => null);
    const cskhMaxNoteDays = cskhMaxNoteCfg ? parseInt(cskhMaxNoteCfg.value, 10) : 15;
    const now = new Date();
    await prisma.dataPool.updateMany({
      where: {
        customerId,
        poolType: 'CSKH',
        status: 'ASSIGNED',
        assignedToId: user.id,
      },
      data: {
        interactionDeadline: new Date(now.getTime() + cskhMaxNoteDays * 24 * 60 * 60 * 1000),
      },
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'CARE_INTERACTION',
      objectId: interaction.id,
      result: 'SUCCESS',
      details: `Created care interaction for ${customer.name}`,
      req
    });

    res.json(interaction);
  } catch (error) {
    console.error('Add care interaction error:', error);
    res.status(500).json({ message: 'Lỗi khi ghi nhận tương tác' });
  }
};

/**
 * Lấy lịch sử đơn hàng của khách
 */
export const getCustomerOrders = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const customerId = req.params.customerId as string;
    const { page, limit, skip } = getPaginationParams(req.query);

    // Kiểm tra quyền
    const subordinates = await getSubordinateIds(user.id);
    const allowedEmployees = [user.id, ...subordinates];

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        employeeId: { in: allowedEmployees }
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng hoặc bạn không có quyền' });
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where: { customerId } }),
      prisma.order.findMany({
        where: { customerId },
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: {
          items: {
            include: {
              product: { select: { id: true, code: true, name: true, thumbnail: true } }
            }
          },
          employee: {
            select: { id: true, fullName: true }
          }
        }
      })
    ]);

    res.json({
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử đơn hàng' });
  }
};

/**
 * Thống kê Resales
 */
export const getResalesStats = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { includeSubordinates } = req.query;

    let employeeIds = [user.id];

    if (includeSubordinates === 'true') {
      const subordinates = await getSubordinateIds(user.id);
      employeeIds = [...employeeIds, ...subordinates];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalCustomers,
      customersByTier,
      todayInteractions,
      monthInteractions,
      upcomingCare,
      overdueCare
    ] = await Promise.all([
      prisma.customer.count({
        where: {
          employeeId: { in: employeeIds },
          leadStatus: 'CUSTOMER'
        }
      }),
      prisma.customer.groupBy({
        by: ['spendingRankCode'],
        where: {
          employeeId: { in: employeeIds },
          leadStatus: 'CUSTOMER'
        },
        _count: true
      }),
      prisma.customerInteraction.count({
        where: {
          employeeId: { in: employeeIds },
          createdAt: { gte: today }
        }
      }),
      prisma.customerInteraction.count({
        where: {
          employeeId: { in: employeeIds },
          createdAt: { gte: thisMonth }
        }
      }),
      prisma.customerInteraction.count({
        where: {
          employeeId: { in: employeeIds },
          nextActionAt: {
            gte: today,
            lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.customerInteraction.count({
        where: {
          employeeId: { in: employeeIds },
          nextActionAt: { lt: today }
        }
      })
    ]);

    // Chuyển đổi customersByTier thành object
    const tierStats: Record<string, number> = {};
    customersByTier.forEach((item: any) => {
      tierStats[item.spendingRankCode || 'NONE'] = item._count;
    });

    res.json({
      totalCustomers,
      customersByTier: tierStats,
      interactions: {
        today: todayInteractions,
        thisMonth: monthInteractions
      },
      care: {
        upcoming: upcomingCare,
        overdue: overdueCare
      }
    });
  } catch (error) {
    console.error('Get resales stats error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê' });
  }
};

/**
 * Cập nhật thông tin khách hàng
 */
export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const { name, email, address, dateOfBirth, gender, note, marketingAttributionExtraDays, cskhInteractionDeadlineDays } =
      req.body;

    // Kiểm tra quyền
    const subordinates = await getSubordinateIds(user.id);
    const allowedEmployees = [user.id, ...subordinates];

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        employeeId: { in: allowedEmployees }
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng hoặc bạn không có quyền' });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (address !== undefined) updateData.address = address;
    if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
    if (gender) updateData.gender = gender;
    if (note !== undefined) updateData.note = note;
    if (marketingAttributionExtraDays !== undefined) {
      if (marketingAttributionExtraDays === null || marketingAttributionExtraDays === '') {
        updateData.marketingAttributionExtraDays = null;
      } else {
        const n = parseInt(String(marketingAttributionExtraDays), 10);
        if (Number.isFinite(n) && n >= 0) {
          updateData.marketingAttributionExtraDays = n;
        }
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: updateData,
      include: {
        employee: { select: { id: true, fullName: true } },
        province: true
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'CUSTOMER',
      objectId: id,
      result: 'SUCCESS',
      details: `Updated customer ${customer.name}`,
      req
    });

    if (cskhInteractionDeadlineDays !== undefined && cskhInteractionDeadlineDays !== null && cskhInteractionDeadlineDays !== '') {
      const days = parseInt(String(cskhInteractionDeadlineDays), 10);
      if (Number.isFinite(days) && days > 0) {
        const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await prisma.dataPool.updateMany({
          where: {
            customerId: id,
            poolType: 'CSKH',
            status: 'ASSIGNED',
            assignedToId: user.id,
          },
          data: { interactionDeadline: until },
        });
      }
    }

    res.json(updated);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật khách hàng' });
  }
};

/**
 * Chuyển khách hàng cho nhân viên khác
 */
export const transferCustomer = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { customerId, toEmployeeId, reason } = req.body;

    if (!customerId || !toEmployeeId) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    // Kiểm tra quyền (chỉ quản lý mới được chuyển)
    const subordinates = await getSubordinateIds(user.id);

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        employeeId: { in: [user.id, ...subordinates] }
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng hoặc bạn không có quyền' });
    }

    // Kiểm tra nhân viên đích
    const toEmployee = await prisma.employee.findUnique({
      where: { id: toEmployeeId },
      select: { id: true, fullName: true }
    });

    if (!toEmployee) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    // Cập nhật
    await prisma.customer.update({
      where: { id: customerId },
      data: { employeeId: toEmployeeId }
    });

    // Ghi nhận tương tác
    const count = await prisma.customerInteraction.count();
    await prisma.customerInteraction.create({
      data: {
        code: `TRANS-${String(count + 1).padStart(6, '0')}`,
        customerId,
        employeeId: user.id,
        type: 'TRANSFER',
        content: `Chuyển khách hàng cho ${toEmployee.fullName}`,
        result: reason || 'Chuyển giao'
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'TRANSFER',
      object: 'CUSTOMER',
      objectId: customerId,
      result: 'SUCCESS',
      details: `Transferred customer ${customer.name} to ${toEmployee.fullName}`,
      req
    });

    res.json({
      message: `Đã chuyển khách hàng cho ${toEmployee.fullName}`
    });
  } catch (error) {
    console.error('Transfer customer error:', error);
    res.status(500).json({ message: 'Lỗi khi chuyển khách hàng' });
  }
};

/** Lịch sử tác động / tương tác (CSKH) — cùng bảng customer_interactions. */
export const getCustomerInteractions = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const customerId = req.params.customerId as string;
    const { page, limit, skip } = getPaginationParams(req.query);

    const exists = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!exists) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    const can = await userCanAccessCustomerForResalesModule(user, customerId);
    if (!can && !isTechnicalAdminRoleCode(user.roleGroupCode)) {
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
            select: { id: true, code: true, fullName: true, avatarUrl: true },
          },
        },
      }),
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
    console.error('getCustomerInteractions error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử tác động' });
  }
};

/** Cập nhật mức ưu tiên lead (data_pool CSKH). */
export const updateCskhLeadPriority = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const priority = Number(req.body?.priority);

    if (!Number.isFinite(priority) || priority < 1 || priority > 5) {
      return res.status(400).json({ message: 'Ưu tiên phải từ 1 đến 5' });
    }

    const dp = await prisma.dataPool.findFirst({
      where: { id, poolType: 'CSKH' },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!dp) {
      return res.status(404).json({ message: 'Không tìm thấy lead CSKH' });
    }

    const canAccess = await userCanAccessCustomerForResalesModule(user, dp.customerId);
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
      contentVi: `Đổi mức ưu tiên lead CSKH từ "${oldP}" sang "${priority}"`,
      interactionType: 'LEAD_PRIORITY',
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DATA_POOL',
      objectId: id,
      result: 'SUCCESS',
      details: `Đổi ưu tiên lead (CSKH) từ ${oldP} sang ${priority} — khách ${dp.customer?.name || dp.customerId}`,
      req,
    });

    res.json({ message: 'Đã cập nhật ưu tiên', priority });
  } catch (error) {
    console.error('Update CSKH lead priority error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật ưu tiên' });
  }
};
