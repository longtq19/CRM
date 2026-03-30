import { Request, Response } from 'express';
import * as ExcelJS from 'exceljs';
import { customerModel, Customer } from '../models/customerModel';
import { prisma } from '../config/database';
import { getSubordinateIds, getVisibleEmployeeIds, describeCustomerListScopeVi } from '../utils/viewScopeHelper';
import { isTechnicalAdminRoleCode, userHasCatalogPermission } from '../constants/rbac';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import {
  CUSTOMER_EXCEL_COLUMNS,
  CUSTOMER_IMPORT_TEMPLATE_FILENAME,
  CUSTOMER_EXPORT_FILENAME_PREFIX,
} from '../constants/customerExcelColumns';

import { logAudit, getAuditUser } from '../utils/auditLog';
import { describeCustomerAuditDiff } from '../utils/vietnameseAuditDiff';
import { CUSTOMER_FIELD_LABELS, formatValueForHistory } from '../constants/customerFieldLabels';
import { describeChangesVi } from '../utils/vietnameseAuditDiff';
import { userCanAccessCustomerForSalesModule, userCanAccessCustomerForResalesModule } from '../utils/customerRowAccess';
import { normalizePhone } from '../services/leadDuplicateService';
import { appendCustomerImpactNote } from '../utils/customerImpact';

const TAG_AUDIT_LABELS: Record<string, string> = {
  code: 'Mã thẻ',
  name: 'Tên thẻ',
  color: 'Màu chữ',
  bgColor: 'Màu nền',
  description: 'Mô tả',
  category: 'Danh mục',
  sortOrder: 'Thứ tự',
  isActive: 'Đang dùng',
};

const FARM_AUDIT_LABELS: Record<string, string> = {
  name: 'Tên vườn',
  area: 'Diện tích',
  areaUnit: 'Đơn vị diện tích',
  address: 'Địa chỉ',
  wardId: 'Phường/Xã',
  districtId: 'Quận/Huyện',
  provinceId: 'Tỉnh/Thành',
  coordinates: 'Tọa độ',
  crops: 'Cây trồng',
  soilType: 'Loại đất',
  irrigationType: 'Tưới tiêu',
  farmingMethod: 'Phương pháp canh tác',
  hasIoTDevice: 'Thiết bị IoT',
  iotDeviceIds: 'Mã thiết bị IoT',
  note: 'Ghi chú',
  isActive: 'Đang dùng',
};
import { getPaginationParams } from '../utils/pagination';
import { isMarketingRole, isResalesRole, isSalesRole } from '../constants/roleIdentification';
import { ALL_CROPS_SET, ROOT_COUNTABLE_CROPS } from '../constants/cropConfigs';
import {
  normalizeMainCropsRootCounts,
  validateMainCropsAndRootCounts,
} from '../utils/mainCropsRootCounts';
import { deleteCustomerCascade } from '../services/customerDeleteCascade';

/**
 * So sánh khách hàng cũ và mới, trả về danh sách nội dung ghi lịch sử tác động: "Sửa [trường] từ [cũ] thành [mới]"
 */
function buildCustomerChangeHistory(
  oldCustomer: Record<string, unknown>,
  updateData: Record<string, unknown>
): string[] {
  const lines: string[] = [];
  const labelKeys = Object.keys(CUSTOMER_FIELD_LABELS);

  for (const key of labelKeys) {
    if (!(key in updateData)) continue;
    const oldVal = oldCustomer[key];
    const newVal = updateData[key];
    if (oldVal === newVal) continue;
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    const label = CUSTOMER_FIELD_LABELS[key];
    const oldDisplay = formatValueForHistory(oldVal);
    const newDisplay = formatValueForHistory(newVal);
    lines.push(`Sửa ${label} từ "${oldDisplay}" thành "${newDisplay}".`);
  }
  return lines;
}

/**
 * Helper: Kiểm tra user có phải admin không
 * Dùng select để tránh lỗi khi DB chưa có cột is_locked / session_invalidated_at
 */
async function isAdminUser(userId: string): Promise<boolean> {
  const employee = await prisma.employee.findUnique({
    where: { id: userId },
    select: { id: true, roleGroup: { select: { code: true } } }
  });
  return isTechnicalAdminRoleCode(employee?.roleGroup?.code);
}

async function canQuickEditCustomerRow(user: { id: string }, customerId: string): Promise<boolean> {
  if (await isAdminUser(user.id)) return true;
  if (await userCanAccessCustomerForSalesModule(user, customerId)) return true;
  if (await userCanAccessCustomerForResalesModule(user, customerId)) return true;
  return false;
}

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { search, status, employeeId, includeSubordinates, tagIds, createdByRole, provinceId, mainCrop } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    let where: any = {};

    // Phạm vi xem theo cấu hình (Cài đặt -> Phạm vi xem được)
    const emp = user?.id ? await prisma.employee.findUnique({
      where: { id: user.id },
      select: { id: true, departmentId: true, roleGroupId: true },
    }) : null;

    const scopeUser = {
      id: emp?.id as string,
      roleGroupId: emp?.roleGroupId ?? null,
      departmentId: emp?.departmentId ?? null,
      permissions: user.permissions,
      roleGroupCode: user.roleGroupCode,
    };

    const visibleIds = emp ? await getVisibleEmployeeIds(scopeUser, 'CUSTOMER') : null;

    const viewScopeDescriptionVi = emp ? await describeCustomerListScopeVi(scopeUser) : '';

    if (visibleIds !== null) {
      // Có giới hạn phạm vi: chỉ xem khách của các employee trong visibleIds + khách chưa phân
      where.OR = [
        { employeeId: { in: visibleIds } },
        { marketingOwnerId: { in: visibleIds } },
        { createdById: { in: visibleIds } },
        { employeeId: null }, // Khách chưa được phân
      ];
    }

    // Filter theo employeeId cụ thể (nếu có quyền)
    if (employeeId && employeeId !== 'all') {
      if (visibleIds === null) {
        where.employeeId = employeeId;
      } else if (visibleIds.includes(String(employeeId))) {
        where.employeeId = employeeId;
      }
    }

    // Filter theo tag
    if (tagIds) {
      const tagIdArray = String(tagIds).split(',');
      where.tags = {
        some: {
          tagId: { in: tagIdArray }
        }
      };
    }

    // Filter theo nguồn tạo (MARKETING, SALES, RESALES)
    if (createdByRole && createdByRole !== 'all') {
      where.createdByRole = createdByRole;
    }

    // Filter theo tỉnh
    if (provinceId && provinceId !== 'all') {
      where.provinceId = provinceId;
    }

    // Filter theo cây trồng
    if (mainCrop) {
      where.mainCrops = { has: String(mainCrop) };
    }

    // Search
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { name: { contains: String(search), mode: 'insensitive' } },
            { phone: { contains: String(search), mode: 'insensitive' } },
            { code: { contains: String(search), mode: 'insensitive' } },
            { email: { contains: String(search), mode: 'insensitive' } },
            { farmName: { contains: String(search), mode: 'insensitive' } }
          ]
        }
      ];
    }

    // Status filter
    if (status && status !== 'all') {
      where.status = status;
    }

    const [total, customers] = await Promise.all([
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
          district: { select: { id: true, name: true } },
          ward: { select: { id: true, name: true } },
          leadSource: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          spendingRank: { select: { code: true, name: true, color: true } },
          customerStatus: { select: { id: true, code: true, name: true, color: true } },
          tags: {
            include: {
              tag: { select: { id: true, code: true, name: true, color: true, bgColor: true } }
            }
          },
          aggregate: true
        }
      })
    ]);

    res.json({
      data: customers,
      viewScopeDescription: viewScopeDescriptionVi,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách khách hàng' });
  }
};

export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const isAdmin = await isAdminUser(user.id);

    let whereCondition: any = { id };

    // Nếu không phải admin, kiểm tra quyền
    if (!isAdmin) {
      const subordinates = await getSubordinateIds(user.id);
      const allowedEmployeeIds = [user.id, ...subordinates];

      whereCondition = {
        id,
        OR: [
          { employeeId: { in: allowedEmployeeIds } },
          { employeeId: null }
        ]
      };
    }

    const customer = await prisma.customer.findFirst({
      where: whereCondition,
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
        district: true,
        ward: true,
        leadSource: true,
        campaign: true,
        spendingRank: true,
        regionRank: true,
        customerStatus: true,
        aggregate: true,
        addressRecord: {
          include: {
            province: true,
            district: true,
            ward: true
          }
        },
        tags: {
          include: {
            tag: true
          }
        },
        marketingContributors: {
          include: {
            employee: { select: { id: true, code: true, fullName: true } },
          },
        },
        farms: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' }
        },
        orders: {
          orderBy: { orderDate: 'desc' },
          take: 10,
          select: {
            id: true,
            code: true,
            customerId: true,
            employeeId: true,
            orderDate: true,
            totalAmount: true,
            discount: true,
            finalAmount: true,
            paymentStatus: true,
            orderStatus: true,
            createdAt: true,
            confirmedAt: true,
            confirmedById: true,
            deliveredAt: true,
            note: true,
            receiverAddress: true,
            receiverDistrict: true,
            receiverName: true,
            receiverPhone: true,
            receiverProvince: true,
            receiverWard: true,
            shippedAt: true,
            shippingFee: true,
            shippingProvider: true,
            trackingNumber: true,
            updatedAt: true,
            codAmount: true,
            shippingCode: true,
            shippingStatus: true,
            isFirstOrder: true,
            salesEmployeeId: true,
            resalesEmployeeId: true,
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
        },
        opportunities: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        dataPool: true
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng hoặc bạn không có quyền' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Get customer by id error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin khách hàng' });
  }
};

export const getCustomerStats = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { includeSubordinates } = req.query;

        let where: any = {};

        const emp = user?.id ? await prisma.employee.findUnique({
          where: { id: user.id },
          select: { id: true, departmentId: true, roleGroupId: true },
        }) : null;

        const visibleIds = emp ? await getVisibleEmployeeIds({
          id: emp.id,
          roleGroupId: emp.roleGroupId,
          departmentId: emp.departmentId,
          permissions: user.permissions,
          roleGroupCode: user.roleGroupCode,
        }, 'CUSTOMER') : null;

        if (visibleIds !== null) {
          where.OR = [
            { employeeId: { in: visibleIds } },
            { marketingOwnerId: { in: visibleIds } },
            { createdById: { in: visibleIds } },
            { employeeId: null }
          ];
        }

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);

        const [
          totalCustomers,
          newCustomers,
          leadCustomers,
          convertedCustomers
        ] = await Promise.all([
          prisma.customer.count({ where }),
          prisma.customer.count({
            where: {
              ...where,
              createdAt: { gte: firstDayOfMonth }
            }
          }),
          prisma.customer.count({
            where: {
              ...where,
              leadStatus: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] }
            }
          }),
          prisma.customer.count({
            where: {
              ...where,
              leadStatus: 'CUSTOMER'
            }
          })
        ]);

        res.json({
            totalCustomers,
            newCustomers,
            leadCustomers,
            convertedCustomers,
            conversionRate: totalCustomers > 0 ? Math.round((convertedCustomers / totalCustomers) * 100) : 0
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi khi lấy thống kê khách hàng' });
    }
};

// Chuẩn hóa giá trị optional: rỗng hoặc không hợp lệ -> null
const emptyToNull = (v: any): string | null => (v && String(v).trim()) ? String(v).trim() : null;
const toNum = (v: any, parser: (x: string) => number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = parser(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
const toMainCrops = (v: any): string[] => {
  if (!Array.isArray(v)) return [];
  return v.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map(c => c.trim());
};
const toValidDate = (v: any): Date | null => {
  if (!v || !String(v).trim()) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    if (!actor?.id) {
      return res.status(401).json({ message: 'Bạn cần đăng nhập để tạo khách hàng' });
    }

    const {
      phone, name, email, dateOfBirth, gender,
      address, wardId, districtId, provinceId,
      farmName, farmArea, farmAreaUnit, mainCrops, mainCropsRootCounts,
      farmingYears, farmingMethod, irrigationType, soilType,
      businessType, taxCode, bankAccount, bankName,
      salesChannel, salesChannelNote,
      leadSourceId, campaignId, employeeId,
      note,
      tagIds,
      statusId
    } = req.body;

    const phoneTrim = phone ? String(phone).trim() : '';
    if (!phoneTrim) {
      return res.status(400).json({ message: 'Số điện thoại là bắt buộc' });
    }

    const existingCustomer = await prisma.customer.findFirst({
      where: { phone: phoneTrim }
    });

    if (existingCustomer) {
      return res.status(400).json({
        message: 'Số điện thoại đã tồn tại trong hệ thống',
        existingCustomer: {
          id: existingCustomer.id,
          name: existingCustomer.name,
          code: existingCustomer.code
        }
      });
    }

    const mainCropsNormalized = toMainCrops(mainCrops);
    const mainCropsRootCountsNormalized = normalizeMainCropsRootCounts(mainCropsRootCounts);
    const validation = validateMainCropsAndRootCounts({
      mainCrops: mainCropsNormalized,
      mainCropsRootCounts: mainCropsRootCountsNormalized,
    });
    if (!validation.isValid) {
      return res.status(400).json({ message: validation.errors.join('\n') });
    }

    // Chỉ select roleGroup.code để tránh lỗi khi DB chưa có cột is_locked / session_invalidated_at
    const creatorEmployee = await prisma.employee.findUnique({
      where: { id: actor.id },
      select: { id: true, roleGroup: { select: { code: true } } }
    });

    let createdByRole = 'SALES';
    if (creatorEmployee?.roleGroup?.code) {
      const roleCode = creatorEmployee.roleGroup.code;
      if (isMarketingRole(roleCode)) createdByRole = 'MARKETING';
      else if (isResalesRole(roleCode)) createdByRole = 'RESALES';
      else if (isSalesRole(roleCode)) createdByRole = 'SALES';
    }

    const count = await prisma.customer.count();
    const code = `KH-${String(count + 1).padStart(6, '0')}`;

    const wardIdVal = emptyToNull(wardId);
    const districtIdVal = emptyToNull(districtId);
    const provinceIdVal = emptyToNull(provinceId);
    const leadSourceIdVal = emptyToNull(leadSourceId);
    const campaignIdVal = emptyToNull(campaignId);
    const employeeIdVal = emptyToNull(employeeId) || actor.id;

    const { upsertMarketingContributor } = await import('../utils/customerMarketingContributors');

    const newCustomer = await prisma.customer.create({
      data: {
        code,
        phone: phoneTrim,
        name: emptyToNull(name),
        email: emptyToNull(email),
        dateOfBirth: toValidDate(dateOfBirth),
        gender: emptyToNull(gender),
        address: emptyToNull(address),
        wardId: wardIdVal,
        districtId: districtIdVal,
        provinceId: provinceIdVal,
        farmName: emptyToNull(farmName),
        farmArea: toNum(farmArea, parseFloat),
        farmAreaUnit: emptyToNull(farmAreaUnit),
        mainCrops: mainCropsNormalized,
        mainCropsRootCounts: Object.keys(mainCropsRootCountsNormalized).length
          ? mainCropsRootCountsNormalized
          : undefined,
        farmingYears: toNum(farmingYears, parseInt),
        farmingMethod: emptyToNull(farmingMethod),
        irrigationType: emptyToNull(irrigationType),
        soilType: emptyToNull(soilType),
        businessType: emptyToNull(businessType),
        taxCode: emptyToNull(taxCode),
        bankAccount: emptyToNull(bankAccount),
        bankName: emptyToNull(bankName),
        createdById: actor.id,
        createdByRole,
        employeeId: employeeIdVal,
        marketingOwnerId: createdByRole === 'MARKETING' ? actor.id : null,
        leadSourceId: leadSourceIdVal,
        campaignId: campaignIdVal,
        salesChannel: emptyToNull(salesChannel),
        salesChannelNote: emptyToNull(salesChannelNote),
        leadStatus: 'NEW',
        statusId: emptyToNull(statusId),
        note: emptyToNull(note)
      },
      include: {
        employee: { select: { id: true, fullName: true } },
        province: { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } }
      }
    });

    if (createdByRole === 'MARKETING') {
      await upsertMarketingContributor(newCustomer.id, actor.id);
    }
    if (newCustomer.marketingOwnerId) {
      await upsertMarketingContributor(newCustomer.id, newCustomer.marketingOwnerId);
    }

    const tagIdsNormalized = Array.isArray(tagIds) ? tagIds.filter((t: any) => t && String(t).trim()) : [];
    if (tagIdsNormalized.length > 0) {
      await prisma.customerTagAssignment.createMany({
        data: tagIdsNormalized.map((tagId: string) => ({
          customerId: newCustomer.id,
          tagId: String(tagId).trim(),
          assignedBy: actor.id
        }))
      });
    }

    if (emptyToNull(note)) {
      const intCount = await prisma.customerInteraction.count();
      await prisma.customerInteraction.create({
        data: {
          code: `INT-${String(intCount + 1).padStart(6, '0')}`,
          customerId: newCustomer.id,
          employeeId: actor.id,
          type: 'NOTE',
          content: String(note).trim(),
        }
      });
    }

    const auditUser = getAuditUser(req);
    const createDetails = [
      `Tạo mới khách hàng: ${newCustomer.name || newCustomer.phone || '—'}.`,
      `Số điện thoại: ${newCustomer.phone}.`,
      `Mã: ${newCustomer.code}.`,
    ].join('\n');
    await logAudit({
      ...auditUser,
      action: 'Tạo mới',
      object: 'Khách hàng',
      objectId: newCustomer.id,
      result: 'SUCCESS',
      details: createDetails,
      newValues: {
        code: newCustomer.code,
        name: newCustomer.name,
        phone: newCustomer.phone,
      },
      req,
    });

    // Gắn khách vừa tạo vào Lead của tôi (DataPool) để hiện trong danh sách Sales
    if (createdByRole === 'SALES') {
      try {
        await prisma.dataPool.create({
          data: {
            customerId: newCustomer.id,
            source: 'MANUAL',
            assignedToId: actor.id,
            assignedAt: new Date(),
            status: 'ASSIGNED',
            poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
            priority: 0
          }
        });
      } catch (dpErr: any) {
        if (dpErr?.code !== 'P2002') {
          console.error('Create DataPool for new customer error:', dpErr);
        }
      }
    }

    res.status(201).json(newCustomer);
  } catch (error: any) {
    console.error('Create customer error:', error);

    const code = error?.code;
    const msg = error?.message || '';

    if (code === 'P2002') {
      return res.status(400).json({ message: 'Số điện thoại hoặc mã khách hàng đã tồn tại. Vui lòng kiểm tra lại.' });
    }
    if (code === 'P2003') {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ (địa chỉ hoặc thẻ khách hàng). Vui lòng chọn lại Tỉnh/Phường hoặc thẻ.' });
    }
    if (code === 'P2025') {
      return res.status(400).json({ message: 'Bản ghi tham chiếu không tồn tại. Vui lòng làm mới trang và thử lại.' });
    }

    const safeMessage = msg && typeof msg === 'string' && msg.length < 200 ? msg : 'Lỗi khi tạo khách hàng';
    res.status(500).json({ message: safeMessage });
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const updates = req.body;
    const actor = (req as any).user;

    const isAdmin = await isAdminUser(actor.id);
    
    // Kiểm tra quyền
    let whereCondition: any = { id };
    if (!isAdmin) {
      const subordinates = await getSubordinateIds(actor.id);
      const allowedEmployeeIds = [actor.id, ...subordinates];

      whereCondition = {
        id,
        OR: [
          { employeeId: { in: allowedEmployeeIds } },
          { employeeId: null }
        ]
      };
    }

    const oldCustomer = await prisma.customer.findFirst({
      where: whereCondition,
      include: {
        province: { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        employee: { select: { id: true, fullName: true } },
        leadSource: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    if (!oldCustomer) {
      return res.status(404).json({ message: 'Khách hàng không tồn tại hoặc bạn không có quyền' });
    }

    // Chuẩn bị data update
    const updateData: any = {};
    
    // Thông tin cơ bản
    if (updates.name !== undefined) updateData.name = updates.name || null;
    if (updates.email !== undefined) updateData.email = updates.email || null;
    if (updates.dateOfBirth !== undefined) updateData.dateOfBirth = updates.dateOfBirth ? new Date(updates.dateOfBirth) : null;
    if (updates.gender !== undefined) updateData.gender = updates.gender || null;
    
    // Địa chỉ
    if (updates.address !== undefined) updateData.address = updates.address || null;
    if (updates.wardId !== undefined) updateData.wardId = updates.wardId || null;
    if (updates.districtId !== undefined) updateData.districtId = updates.districtId || null;
    if (updates.provinceId !== undefined) updateData.provinceId = updates.provinceId || null;
    
    // Thông tin nông nghiệp
    if (updates.farmName !== undefined) updateData.farmName = updates.farmName || null;
    if (updates.farmArea !== undefined) updateData.farmArea = updates.farmArea ? parseFloat(updates.farmArea) : null;
    if (updates.farmAreaUnit !== undefined) updateData.farmAreaUnit = updates.farmAreaUnit || null;
    if (updates.mainCrops !== undefined) updateData.mainCrops = toMainCrops(updates.mainCrops);
    if (updates.mainCropsRootCounts !== undefined) {
      const normalized = normalizeMainCropsRootCounts(updates.mainCropsRootCounts);
      updateData.mainCropsRootCounts = Object.keys(normalized).length ? normalized : undefined;
    }
    if (updates.farmingYears !== undefined) updateData.farmingYears = updates.farmingYears ? parseInt(updates.farmingYears) : null;
    if (updates.farmingMethod !== undefined) updateData.farmingMethod = updates.farmingMethod || null;
    if (updates.irrigationType !== undefined) updateData.irrigationType = updates.irrigationType || null;
    if (updates.soilType !== undefined) updateData.soilType = updates.soilType || null;
    
    // Thông tin kinh doanh
    if (updates.businessType !== undefined) updateData.businessType = updates.businessType || null;
    if (updates.taxCode !== undefined) updateData.taxCode = updates.taxCode || null;
    if (updates.bankAccount !== undefined) updateData.bankAccount = updates.bankAccount || null;
    if (updates.bankName !== undefined) updateData.bankName = updates.bankName || null;
    
    // Kênh tiếp cận (Sales)
    if (updates.salesChannel !== undefined) updateData.salesChannel = updates.salesChannel || null;
    if (updates.salesChannelNote !== undefined) updateData.salesChannelNote = updates.salesChannelNote || null;
    
    // Marketing
    if (updates.leadSourceId !== undefined) updateData.leadSourceId = updates.leadSourceId || null;
    if (updates.campaignId !== undefined) updateData.campaignId = updates.campaignId || null;
    if (updates.leadStatus !== undefined) updateData.leadStatus = updates.leadStatus;
    
    // Ghi chú
    if (updates.note !== undefined) updateData.note = updates.note || null;
    
    // Trạng thái tuỳ chỉnh
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.statusId !== undefined) updateData.statusId = updates.statusId || null;

    // Chỉ admin mới được đổi employeeId
    if (isAdmin && updates.employeeId !== undefined) {
      updateData.employeeId = updates.employeeId || null;
    }

    // Validate nghiệp vụ "cây trồng chính bắt buộc" + "cây tính theo gốc phải có số gốc"
    const shouldValidateAgriculture =
      updates.mainCrops !== undefined ||
      updates.mainCropsRootCounts !== undefined ||
      updates.farmName !== undefined ||
      updates.farmArea !== undefined ||
      updates.farmAreaUnit !== undefined ||
      updates.farmingYears !== undefined ||
      updates.farmingMethod !== undefined ||
      updates.irrigationType !== undefined ||
      updates.soilType !== undefined;

    if (shouldValidateAgriculture) {
      const nextMainCrops = updates.mainCrops !== undefined ? toMainCrops(updates.mainCrops) : oldCustomer.mainCrops as string[];
      const nextRootCounts =
        updates.mainCropsRootCounts !== undefined
          ? normalizeMainCropsRootCounts(updates.mainCropsRootCounts)
          : normalizeMainCropsRootCounts((oldCustomer as any).mainCropsRootCounts);

      const validation = validateMainCropsAndRootCounts({
        mainCrops: nextMainCrops,
        mainCropsRootCounts: nextRootCounts,
      });
      if (!validation.isValid) {
        return res.status(400).json({ message: validation.errors.join('\n') });
      }
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: updateData,
      include: {
        employee: { select: { id: true, fullName: true } },
        province: { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        tags: { include: { tag: true } }
      }
    });

    // Cập nhật tags nếu có
    if (updates.tagIds !== undefined) {
      // Xóa tags cũ
      await prisma.customerTagAssignment.deleteMany({
        where: { customerId: id }
      });
      // Thêm tags mới
      if (updates.tagIds && updates.tagIds.length > 0) {
        await prisma.customerTagAssignment.createMany({
          data: updates.tagIds.map((tagId: string) => ({
            customerId: id,
            tagId,
            assignedBy: actor.id
          }))
        });
      }
    }

    // Ghi lịch sử tác động: mỗi trường thay đổi một dòng "Sửa ... từ ... thành ..."
    const changeLines = buildCustomerChangeHistory(
      oldCustomer as Record<string, unknown>,
      updateData as Record<string, unknown>
    );
    if (updates.tagIds !== undefined) {
      const newCount = Array.isArray(updates.tagIds) ? updates.tagIds.length : 0;
      changeLines.push(`Sửa Thẻ khách hàng thành ${newCount} thẻ.`);
    }
    if (changeLines.length > 0 && actor) {
      const intCount = await prisma.customerInteraction.count();
      for (let i = 0; i < changeLines.length; i++) {
        await prisma.customerInteraction.create({
          data: {
            code: `INT-${String(intCount + i + 1).padStart(6, '0')}`,
            customerId: id,
            employeeId: actor.id,
            type: 'FIELD_UPDATE',
            content: changeLines[i],
            kind: 'SYSTEM_CHANGE',
          }
        });
      }
    }
    
    if (actor && updatedCustomer) {
      const auditUser = getAuditUser(req);
      let details = describeCustomerAuditDiff(oldCustomer as Record<string, any>, updatedCustomer as Record<string, any>);
      if (updates.tagIds !== undefined) {
        const newCount = Array.isArray(updates.tagIds) ? updates.tagIds.length : 0;
        const tagLine = `Cập nhật danh sách thẻ khách hàng thành ${newCount} thẻ.`;
        details = details ? `${details}\n${tagLine}` : tagLine;
      }
      if (!details.trim()) {
        details = `Cập nhật khách hàng ${updatedCustomer.name || updatedCustomer.phone} — không phát hiện thay đổi nội dung so với bản ghi trước.`;
      }
      await logAudit({
        ...auditUser,
        action: 'Cập nhật',
        object: 'Khách hàng',
        objectId: updatedCustomer.id,
        result: 'SUCCESS',
        details,
        oldValues: { id: oldCustomer.id, code: oldCustomer.code, phone: oldCustomer.phone, name: oldCustomer.name },
        newValues: { id: updatedCustomer.id, code: updatedCustomer.code, phone: updatedCustomer.phone, name: updatedCustomer.name },
        req,
      });
    }

    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật khách hàng' });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const actor = (req as any).user;

    const isAdmin = await isAdminUser(actor.id);

    let whereCondition: any = { id };
    if (!isAdmin) {
      const subordinates = await getSubordinateIds(actor.id);
      const allowedEmployeeIds = [actor.id, ...subordinates];

      whereCondition = {
        id,
        OR: [
          { employeeId: { in: allowedEmployeeIds } },
          { employeeId: null },
        ],
      };
    }

    const customer = await prisma.customer.findFirst({
      where: whereCondition,
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Khách hàng không tồn tại hoặc bạn không có quyền' });
    }

    await prisma.$transaction(
      async (tx) => {
        await deleteCustomerCascade(tx, customer.id);
      },
      { timeout: 120_000 }
    );

    if (actor) {
      await logAudit({
        ...getAuditUser(req),
        action: 'Xóa',
        object: 'Khách hàng',
        objectId: customer.id,
        result: 'SUCCESS',
        details: `Xóa khách hàng: ${customer.name || customer.phone} (SĐT: ${customer.phone}, mã: ${customer.code}).`,
        oldValues: { code: customer.code, name: customer.name, phone: customer.phone },
        req,
      });
    }

    res.json({ id: customer.id, code: customer.code, deleted: true });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa khách hàng' });
  }
};

// ==================== CUSTOMER TAGS ====================

export const getCustomerTags = async (req: Request, res: Response) => {
  try {
    const { category, isActive } = req.query;
    
    let where: any = {};
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    
    const tags = await prisma.customerTag.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
    
    res.json(tags);
  } catch (error) {
    console.error('Get customer tags error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách thẻ' });
  }
};

export const createCustomerTag = async (req: Request, res: Response) => {
  try {
    const { code, name, color, bgColor, description, category, sortOrder } = req.body;
    const actor = (req as any).user;
    
    if (!code || !name) {
      return res.status(400).json({ message: 'Mã và tên thẻ là bắt buộc' });
    }
    
    // Kiểm tra mã trùng
    const existing = await prisma.customerTag.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Mã thẻ đã tồn tại' });
    }
    
    const tag = await prisma.customerTag.create({
      data: {
        code,
        name,
        color: color || '#3B82F6',
        bgColor: bgColor || null,
        description: description || null,
        category: category || null,
        sortOrder: sortOrder || 0
      }
    });
    
    await logAudit({
      ...getAuditUser(req),
      action: 'Tạo mới',
      object: 'Thẻ khách hàng',
      objectId: tag.id,
      result: 'SUCCESS',
      details: `Tạo thẻ "${tag.name}" (mã ${tag.code}).`,
      newValues: { code: tag.code, name: tag.name },
      req,
    });

    res.status(201).json(tag);
  } catch (error) {
    console.error('Create customer tag error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo thẻ' });
  }
};

export const updateCustomerTag = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, color, bgColor, description, category, sortOrder, isActive } = req.body;
    const actor = (req as any).user;

    const before = await prisma.customerTag.findUnique({ where: { id } });
    if (!before) {
      return res.status(404).json({ message: 'Không tìm thấy thẻ' });
    }

    const tag = await prisma.customerTag.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(color && { color }),
        ...(bgColor !== undefined && { bgColor }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive })
      }
    });

    let details = describeChangesVi(before as unknown as Record<string, unknown>, tag as unknown as Record<string, unknown>, TAG_AUDIT_LABELS);
    if (!details.trim()) {
      details = `Cập nhật thẻ "${tag.name}" — không phát hiện thay đổi nội dung.`;
    }
    await logAudit({
      ...getAuditUser(req),
      action: 'Cập nhật',
      object: 'Thẻ khách hàng',
      objectId: tag.id,
      result: 'SUCCESS',
      details,
      oldValues: { code: before.code, name: before.name },
      newValues: { code: tag.code, name: tag.name },
      req,
    });

    res.json(tag);
  } catch (error) {
    console.error('Update customer tag error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật thẻ' });
  }
};

export const deleteCustomerTag = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const actor = (req as any).user;
    
    const tag = await prisma.customerTag.findUnique({ where: { id } });
    if (!tag) {
      return res.status(404).json({ message: 'Không tìm thấy thẻ' });
    }
    
    // Xóa assignments trước
    await prisma.customerTagAssignment.deleteMany({ where: { tagId: id } });
    
    await prisma.customerTag.delete({ where: { id } });

    await logAudit({
      ...getAuditUser(req),
      action: 'Xóa',
      object: 'Thẻ khách hàng',
      objectId: id,
      result: 'SUCCESS',
      details: `Xóa thẻ "${tag.name}" (mã ${tag.code}).`,
      oldValues: { code: tag.code, name: tag.name },
      req,
    });

    res.json({ message: 'Đã xóa thẻ' });
  } catch (error) {
    console.error('Delete customer tag error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa thẻ' });
  }
};

// Gắn/bỏ tag cho khách hàng
export const assignTagToCustomer = async (req: Request, res: Response) => {
  try {
    const { customerId, tagId } = req.body;
    const actor = (req as any).user;

    if (!customerId || !tagId) {
      return res.status(400).json({ message: 'Thiếu customerId hoặc tagId' });
    }

    const [customer, tag] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, phone: true, code: true },
      }),
      prisma.customerTag.findUnique({ where: { id: tagId }, select: { id: true, name: true, code: true } }),
    ]);

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }
    if (!tag) {
      return res.status(404).json({ message: 'Không tìm thấy thẻ' });
    }

    const assignment = await prisma.customerTagAssignment.create({
      data: {
        customerId,
        tagId,
        assignedBy: actor.id,
      },
      include: {
        tag: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'Cập nhật',
      object: 'Khách hàng',
      objectId: customerId,
      result: 'SUCCESS',
      details: `Gắn thẻ "${tag.name}" cho khách "${customer.name}" (${customer.phone || 'không SĐT'}).`,
      newValues: { tagId: tag.id, tagName: tag.name, tagCode: tag.code },
      req,
    });

    await appendCustomerImpactNote({
      customerId,
      employeeId: actor.id,
      contentVi: `Gắn thẻ "${tag.name}" (mã ${tag.code})`,
      interactionType: 'TAG_ASSIGN',
    });

    res.status(201).json(assignment);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Khách hàng đã có thẻ này' });
    }
    console.error('Assign tag error:', error);
    res.status(500).json({ message: 'Lỗi khi gắn thẻ' });
  }
};

export const removeTagFromCustomer = async (req: Request, res: Response) => {
  try {
    const customerId = req.params.customerId as string;
    const tagId = req.params.tagId as string;

    const [customer, tag] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, phone: true, code: true },
      }),
      prisma.customerTag.findUnique({ where: { id: tagId }, select: { id: true, name: true, code: true } }),
    ]);

    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }
    if (!tag) {
      return res.status(404).json({ message: 'Không tìm thấy thẻ' });
    }

    const deleted = await prisma.customerTagAssignment.deleteMany({
      where: { customerId, tagId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ message: 'Khách hàng chưa có thẻ này' });
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'Cập nhật',
      object: 'Khách hàng',
      objectId: customerId,
      result: 'SUCCESS',
      details: `Bỏ thẻ "${tag.name}" khỏi khách "${customer.name}" (${customer.phone || 'không SĐT'}).`,
      oldValues: { tagId: tag.id, tagName: tag.name, tagCode: tag.code },
      req,
    });

    const actor = (req as any).user;
    await appendCustomerImpactNote({
      customerId,
      employeeId: actor.id,
      contentVi: `Bỏ thẻ "${tag.name}" (mã ${tag.code})`,
      interactionType: 'TAG_REMOVE',
    });

    res.json({ message: 'Đã bỏ thẻ' });
  } catch (error) {
    console.error('Remove tag error:', error);
    res.status(500).json({ message: 'Lỗi khi bỏ thẻ' });
  }
};

// ==================== CUSTOMER FARMS ====================

export const getCustomerFarms = async (req: Request, res: Response) => {
  try {
    const customerId = req.params.customerId as string;
    
    const farms = await prisma.customerFarm.findMany({
      where: { customerId, isActive: true },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(farms);
  } catch (error) {
    console.error('Get customer farms error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách vườn' });
  }
};

export const createCustomerFarm = async (req: Request, res: Response) => {
  try {
    const customerId = req.params.customerId as string;
    const { name, area, areaUnit, address, wardId, districtId, provinceId, coordinates, crops, soilType, irrigationType, farmingMethod, hasIoTDevice, iotDeviceIds, note } = req.body;
    const actor = (req as any).user;
    
    if (!name) {
      return res.status(400).json({ message: 'Tên vườn là bắt buộc' });
    }
    
    const farm = await prisma.customerFarm.create({
      data: {
        customerId,
        name,
        area: area ? parseFloat(area) : null,
        areaUnit: areaUnit || null,
        address: address || null,
        wardId: wardId || null,
        districtId: districtId || null,
        provinceId: provinceId || null,
        coordinates: coordinates || null,
        crops: crops || [],
        soilType: soilType || null,
        irrigationType: irrigationType || null,
        farmingMethod: farmingMethod || null,
        hasIoTDevice: hasIoTDevice || false,
        iotDeviceIds: iotDeviceIds || [],
        note: note || null
      }
    });
    
    await logAudit({
      ...getAuditUser(req),
      action: 'Tạo mới',
      object: 'Nông trại khách hàng',
      objectId: farm.id,
      result: 'SUCCESS',
      details: `Thêm vườn/nông trại "${farm.name}" cho khách hàng (${customerId}).`,
      newValues: { name: farm.name, customerId },
      req,
    });

    res.status(201).json(farm);
  } catch (error) {
    console.error('Create customer farm error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo vườn' });
  }
};

export const updateCustomerFarm = async (req: Request, res: Response) => {
  try {
    const farmId = req.params.farmId as string;
    const updates = req.body;
    const actor = (req as any).user;

    const beforeFarm = await prisma.customerFarm.findUnique({ where: { id: farmId } });
    if (!beforeFarm) {
      return res.status(404).json({ message: 'Không tìm thấy vườn' });
    }

    const farm = await prisma.customerFarm.update({
      where: { id: farmId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.area !== undefined && { area: updates.area ? parseFloat(updates.area) : null }),
        ...(updates.areaUnit !== undefined && { areaUnit: updates.areaUnit }),
        ...(updates.address !== undefined && { address: updates.address }),
        ...(updates.wardId !== undefined && { wardId: updates.wardId }),
        ...(updates.districtId !== undefined && { districtId: updates.districtId }),
        ...(updates.provinceId !== undefined && { provinceId: updates.provinceId }),
        ...(updates.coordinates !== undefined && { coordinates: updates.coordinates }),
        ...(updates.crops !== undefined && { crops: updates.crops }),
        ...(updates.soilType !== undefined && { soilType: updates.soilType }),
        ...(updates.irrigationType !== undefined && { irrigationType: updates.irrigationType }),
        ...(updates.farmingMethod !== undefined && { farmingMethod: updates.farmingMethod }),
        ...(updates.hasIoTDevice !== undefined && { hasIoTDevice: updates.hasIoTDevice }),
        ...(updates.iotDeviceIds !== undefined && { iotDeviceIds: updates.iotDeviceIds }),
        ...(updates.note !== undefined && { note: updates.note }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive })
      }
    });

    let farmDetails = describeChangesVi(
      beforeFarm as unknown as Record<string, unknown>,
      farm as unknown as Record<string, unknown>,
      FARM_AUDIT_LABELS,
    );
    if (!farmDetails.trim()) {
      farmDetails = `Cập nhật vườn "${farm.name}" — không phát hiện thay đổi nội dung.`;
    }
    await logAudit({
      ...getAuditUser(req),
      action: 'Cập nhật',
      object: 'Nông trại khách hàng',
      objectId: farm.id,
      result: 'SUCCESS',
      details: farmDetails,
      oldValues: { name: beforeFarm.name },
      newValues: { name: farm.name },
      req,
    });

    res.json(farm);
  } catch (error) {
    console.error('Update customer farm error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật vườn' });
  }
};

export const deleteCustomerFarm = async (req: Request, res: Response) => {
  try {
    const farmId = req.params.farmId as string;
    const actor = (req as any).user;

    const beforeDel = await prisma.customerFarm.findUnique({ where: { id: farmId } });
    if (!beforeDel) {
      return res.status(404).json({ message: 'Không tìm thấy vườn' });
    }

    const farm = await prisma.customerFarm.update({
      where: { id: farmId },
      data: { isActive: false }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'Xóa',
      object: 'Nông trại khách hàng',
      objectId: farmId,
      result: 'SUCCESS',
      details: `Ngừng sử dụng vườn/nông trại "${beforeDel.name}" (khách hàng ${beforeDel.customerId}).`,
      oldValues: { name: beforeDel.name, isActive: beforeDel.isActive },
      newValues: { isActive: farm.isActive },
      req,
    });

    res.json({ message: 'Đã xóa vườn' });
  } catch (error) {
    console.error('Delete customer farm error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa vườn' });
  }
};

/**
 * Lấy danh sách nhân viên có thể xem (cho filter)
 */
export const getViewableEmployees = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isAdmin = await isAdminUser(user.id);

    let employees;

    if (isAdmin) {
      employees = await prisma.employee.findMany({
        where: {
          OR: [
            { salesType: { in: ['MARKETING', 'SALES', 'RESALES'] } },
            { roleGroup: { code: { in: ['TELESALES', 'TELESALES_MGR', 'MARKETING', 'MARKETING_MGR', 'REALSALES', 'REALSALES_MGR'] } } }
          ]
        },
        select: {
          id: true,
          code: true,
          fullName: true,
          avatarUrl: true,
          department: { select: { name: true } }
        },
        orderBy: { fullName: 'asc' }
      });
    } else {
      const subordinates = await getSubordinateIds(user.id);
      const allowedIds = [user.id, ...subordinates];

      employees = await prisma.employee.findMany({
        where: { id: { in: allowedIds } },
        select: {
          id: true,
          code: true,
          fullName: true,
          avatarUrl: true,
          department: { select: { name: true } }
        },
        orderBy: { fullName: 'asc' }
      });
    }

    res.json(employees);
  } catch (error) {
    console.error('Get viewable employees error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nhân viên' });
  }
};

/** Cho phép export/import Excel khách hàng: quyền catalog hoặc vai Sales/Resales (nhận diện nghiệp vụ). */
async function canExportImportCustomers(user: { id: string; roleGroupCode?: string | null; permissions?: string[] }): Promise<boolean> {
  if (userHasCatalogPermission(user, ['MANAGE_CUSTOMERS', 'FULL_ACCESS'])) return true;
  const emp = await prisma.employee.findUnique({
    where: { id: user.id },
    select: { id: true, roleGroup: { select: { code: true } } },
  });
  if (!emp?.roleGroup?.code) return false;
  const code = emp.roleGroup.code;
  return isSalesRole(code) || isResalesRole(code);
}

/**
 * Export danh sách khách hàng ra Excel (Sales/Resales/ADM, cùng bộ lọc như GET /customers)
 */
export const exportCustomersExcel = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const can = await canExportImportCustomers(user);
    if (!can) {
      return res.status(403).json({ message: 'Chỉ nhân viên Sales, Resales hoặc Quản trị viên mới được xuất Excel khách hàng' });
    }

    const { search, status, employeeId, tagIds, createdByRole, provinceId, mainCrop } = req.query;
    let where: any = {};

    const emp = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { id: true, departmentId: true, roleGroupId: true },
    });
    const visibleIds = emp ? await getVisibleEmployeeIds({
      id: emp.id,
      roleGroupId: emp.roleGroupId,
      departmentId: emp.departmentId,
      permissions: user.permissions,
      roleGroupCode: user.roleGroupCode,
    }, 'CUSTOMER') : null;

    if (visibleIds !== null) {
      where.OR = [
        { employeeId: { in: visibleIds } },
        { marketingOwnerId: { in: visibleIds } },
        { createdById: { in: visibleIds } },
        { employeeId: null },
      ];
    }
    if (employeeId && employeeId !== 'all') {
      if (visibleIds === null) where.employeeId = employeeId;
      else if (visibleIds.includes(String(employeeId))) where.employeeId = employeeId;
    }
    if (tagIds) {
      const tagIdArray = String(tagIds).split(',');
      where.tags = { some: { tagId: { in: tagIdArray } } };
    }
    if (createdByRole && createdByRole !== 'all') where.createdByRole = createdByRole;
    if (provinceId && provinceId !== 'all') where.provinceId = provinceId;
    if (mainCrop) where.mainCrops = { has: String(mainCrop) };
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { name: { contains: String(search), mode: 'insensitive' } },
            { phone: { contains: String(search), mode: 'insensitive' } },
            { code: { contains: String(search), mode: 'insensitive' } },
            { email: { contains: String(search), mode: 'insensitive' } },
            { farmName: { contains: String(search), mode: 'insensitive' } },
          ],
        },
      ];
    }
    if (status && status !== 'all') where.status = status;

    const customers = await prisma.customer.findMany({
      where,
      take: 10000,
      orderBy: { updatedAt: 'desc' },
      include: {
        employee: { select: { fullName: true } },
        marketingOwner: { select: { fullName: true } },
        province: { select: { name: true } },
        district: { select: { name: true } },
        ward: { select: { name: true } },
        leadSource: { select: { name: true } },
        campaign: { select: { name: true } },
        spendingRank: { select: { name: true, code: true } },
        regionRank: { select: { name: true, code: true } },
        tags: { include: { tag: { select: { name: true, code: true } } } },
      },
    });

    const BUSINESS_TYPE_LABELS: Record<string, string> = {
      INDIVIDUAL: 'Cá nhân',
      COOPERATIVE: 'Hợp tác xã',
      COMPANY: 'Doanh nghiệp',
    };
    const SALES_CHANNEL_LABELS: Record<string, string> = {
      REFERRAL: 'Giới thiệu (từ KH cũ, đối tác)',
      WALK_IN: 'Khách đến trực tiếp',
      COLD_CALL: 'Gọi điện (cold call)',
      SOCIAL_MEDIA: 'MXH cá nhân nhân viên',
      EVENT: 'Sự kiện / hội thảo',
      FIELD_VISIT: 'Khảo sát thực địa',
      RETURNING: 'Khách hàng cũ quay lại',
    };

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Khách hàng');
    ws.columns = [
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
      { header: 'NV phụ trách', key: 'employee', width: 18 },
      { header: 'NV Marketing', key: 'marketingOwner', width: 18 },
      { header: 'Nguồn tạo', key: 'createdByRole', width: 12 },
      { header: 'Trạng thái lead', key: 'leadStatus', width: 14 },
      { header: 'Nguồn lead', key: 'leadSource', width: 18 },
      { header: 'Chiến dịch', key: 'campaign', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 12 },
      { header: 'Hạng chi tiêu', key: 'spendingRank', width: 14 },
      { header: 'Hạng khu vực', key: 'regionRank', width: 14 },
      { header: 'Lead hợp lệ', key: 'isValidLead', width: 12 },
      { header: 'Lý do không hợp lệ', key: 'invalidReason', width: 22 },
      { header: 'Ngày tham gia', key: 'joinedDate', width: 14 },
      { header: 'Hết hạn attribution', key: 'attributionExpiredAt', width: 18 },
      { header: 'Tổng đơn', key: 'totalOrders', width: 10 },
      { header: 'Tổng giá trị đơn', key: 'totalOrdersValue', width: 14 },
      { header: 'Đơn cuối', key: 'lastOrderAt', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    customers.forEach((c: any) => {
      const rootCounts =
        c.mainCropsRootCounts && typeof c.mainCropsRootCounts === 'object' && !Array.isArray(c.mainCropsRootCounts)
          ? c.mainCropsRootCounts
          : {};

      const selectedRootCrops = Array.isArray(c.mainCrops)
        ? c.mainCrops.filter((crop: string) => ROOT_COUNTABLE_CROPS.has(crop))
        : [];

      ws.addRow({
        code: c.code || '',
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || '',
        gender: c.gender || '',
        dateOfBirth: c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString('vi-VN') : '',
        address: c.address || '',
        province: c.province?.name || '',
        district: c.district?.name || '',
        ward: c.ward?.name || '',
        businessType: BUSINESS_TYPE_LABELS[c.businessType as string] || c.businessType || '',
        salesChannel: SALES_CHANNEL_LABELS[c.salesChannel as string] || c.salesChannel || '',
        salesChannelNote: (c.salesChannelNote || '').slice(0, 100),
        tags: (c.tags || []).map((t: any) => t.tag?.name).filter(Boolean).join('; ') || '',
        note: (c.note || '').slice(0, 300),
        farmName: c.farmName || '',
        farmArea: c.farmArea != null ? c.farmArea : '',
        farmAreaUnit: c.farmAreaUnit || '',
        mainCrops: Array.isArray(c.mainCrops) ? c.mainCrops.join(', ') : '',
        mainCropsRootCounts: selectedRootCrops.length
          ? selectedRootCrops.map((crop: string) => `${crop}:${(rootCounts as any)?.[crop] ?? ''}`).join('; ')
          : '',
        farmingYears: c.farmingYears != null ? c.farmingYears : '',
        soilType: c.soilType || '',
        farmingMethod: c.farmingMethod || '',
        irrigationType: c.irrigationType || '',
        taxCode: c.taxCode || '',
        bankAccount: c.bankAccount || '',
        bankName: c.bankName || '',
        employee: c.employee?.fullName || '',
        marketingOwner: c.marketingOwner?.fullName || '',
        createdByRole: c.createdByRole || '',
        leadStatus: c.leadStatus || '',
        leadSource: c.leadSource?.name || '',
        campaign: c.campaign?.name || '',
        status: c.status || '',
        spendingRank: c.spendingRank?.name || c.spendingRankCode || '',
        regionRank: c.regionRank?.name || c.regionRankCode || '',
        isValidLead: c.isValidLead != null ? (c.isValidLead ? 'Có' : 'Không') : '',
        invalidReason: (c.invalidReason || '').slice(0, 200),
        joinedDate: c.joinedDate ? new Date(c.joinedDate).toLocaleDateString('vi-VN') : '',
        attributionExpiredAt: c.attributionExpiredAt ? new Date(c.attributionExpiredAt).toLocaleDateString('vi-VN') : '',
        totalOrders: c.totalOrders != null ? c.totalOrders : '',
        totalOrdersValue: c.totalOrdersValue != null ? c.totalOrdersValue : '',
        lastOrderAt: c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('vi-VN') : '',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${CUSTOMER_EXPORT_FILENAME_PREFIX}.xlsx`);
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Export customers Excel error:', error);
    res.status(500).json({ message: 'Lỗi khi xuất Excel khách hàng' });
  }
};

/**
 * Tải file mẫu import khách hàng (Marketing, Kho số chung, Sales, CSKH) — đủ trường DB
 */
export const getCustomerImportTemplate = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const can = await canExportImportCustomers(user);
    if (!can) {
      return res.status(403).json({ message: 'Chỉ nhân viên Sales, Resales hoặc Quản trị viên mới được tải mẫu import' });
    }
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Khách hàng');
    ws.columns = CUSTOMER_EXCEL_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };
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
      salesChannelNote: 'Anh B giới thiệu',
      tags: 'VIP; Tiềm năng',
      note: 'Ghi chú mẫu',
      farmName: '',
      farmArea: '',
      farmAreaUnit: 'ha',
      mainCrops: 'Lúa, Rau màu',
      mainCropsRootCounts: '',
      farmingYears: '5',
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
      createdByRole: 'SALES',
    };
    ws.addRow(sampleRow);

    const noteWs = workbook.addWorksheet('Hướng dẫn');
    noteWs.columns = [
      { header: 'Cột', key: 'col', width: 28 },
      { header: 'Bắt buộc', key: 'req', width: 10 },
      { header: 'Giá trị hợp lệ / Ghi chú', key: 'desc', width: 55 },
    ];
    noteWs.getRow(1).font = { bold: true };
    const notes = [
      ['Số điện thoại (*)', 'Có', 'Không trùng trong hệ thống'],
      ['Họ và tên', 'Không', ''],
      ['Email', 'Không', ''],
      ['Giới tính', 'Không', 'Nam / Nữ / Khác'],
      ['Ngày sinh', 'Không', 'DD/MM/YYYY hoặc YYYY-MM-DD'],
      ['Địa chỉ', 'Không', ''],
      ['Tỉnh/TP, Quận/Huyện, Phường/Xã', 'Không', 'Ghi chú địa chỉ (không map ID)'],
      ['Loại hình KD (*)', 'Có', 'Cá nhân | Hợp tác xã | Doanh nghiệp'],
      ['Kênh tiếp cận (*)', 'Có', 'Giới thiệu... | Khách đến trực tiếp | Gọi điện... | MXH... | Sự kiện... | Khảo sát thực địa | Khách hàng cũ quay lại'],
      ['Thẻ khách hàng (*)', 'Có', 'Tên thẻ cách nhau bởi ; (VD: VIP; Tiềm năng). Thẻ phải tồn tại trong hệ thống'],
      ['Cây trồng chính', 'Không', 'Cách nhau dấu phẩy'],
      ['Số gốc', 'Không', 'Bắt buộc nếu cây trồng chính thuộc nhóm tính theo gốc. Nhập 1 số.'],
      ['Đơn vị DT', 'Không', 'ha | m2 | công | sào'],
      ['Trạng thái lead', 'Không', 'NEW | CONTACTED | QUALIFIED | CUSTOMER | ...'],
      ['Nguồn lead / Chiến dịch', 'Không', 'Tên hoặc mã (nếu có trong hệ thống)'],
      ['Trạng thái', 'Không', 'ACTIVE | INACTIVE'],
      ['NV phụ trách / NV Marketing', 'Không', 'Mã nhân viên (nếu phân công)'],
      ['Hạng chi tiêu / Hạng khu vực', 'Không', 'Mã hạng (nếu có)'],
      ['Lead hợp lệ', 'Không', 'true | false'],
      ['Ngày tham gia / Hết hạn attribution', 'Không', 'DD/MM/YYYY hoặc YYYY-MM-DD'],
      ['Nguồn tạo', 'Không', 'MARKETING | SALES | RESALES'],
    ];
    notes.forEach((n: string[]) => noteWs.addRow({ col: n[0], req: n[1], desc: n[2] }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${CUSTOMER_IMPORT_TEMPLATE_FILENAME}`);
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Get customer import template error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo file mẫu' });
  }
};

const BUSINESS_TYPE_FROM_LABEL: Record<string, string> = {
  'Cá nhân': 'INDIVIDUAL',
  'Hợp tác xã': 'COOPERATIVE',
  'Doanh nghiệp': 'COMPANY',
  'INDIVIDUAL': 'INDIVIDUAL',
  'COOPERATIVE': 'COOPERATIVE',
  'COMPANY': 'COMPANY',
};
const SALES_CHANNEL_FROM_LABEL: Record<string, string> = {
  'Giới thiệu (từ KH cũ, đối tác)': 'REFERRAL',
  'Khách đến trực tiếp': 'WALK_IN',
  'Gọi điện (cold call)': 'COLD_CALL',
  'MXH cá nhân nhân viên': 'SOCIAL_MEDIA',
  'Sự kiện / hội thảo': 'EVENT',
  'Khảo sát thực địa': 'FIELD_VISIT',
  'Khách hàng cũ quay lại': 'RETURNING',
  'REFERRAL': 'REFERRAL',
  'WALK_IN': 'WALK_IN',
  'COLD_CALL': 'COLD_CALL',
  'SOCIAL_MEDIA': 'SOCIAL_MEDIA',
  'EVENT': 'EVENT',
  'FIELD_VISIT': 'FIELD_VISIT',
  'RETURNING': 'RETURNING',
};

function toStr(v: any): string {
  if (v == null || v === undefined) return '';
  return String(v).trim();
}
function toDate(v: any): Date | null {
  const s = toStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Import khách hàng từ Excel (Sales/Resales/ADM) — bắt buộc: SĐT, Loại hình KD, Kênh tiếp cận, Thẻ
 */
export const importCustomersExcel = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const can = await canExportImportCustomers(user);
    if (!can) {
      return res.status(403).json({ message: 'Chỉ nhân viên Sales, Resales hoặc Quản trị viên mới được import khách hàng' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng tải lên file Excel' });
    }

    const emp = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { id: true, roleGroup: { select: { code: true } } }
    });
    let createdByRole = 'SALES';
    if (emp?.roleGroup?.code) {
      const code = emp.roleGroup.code;
      if (isResalesRole(code)) createdByRole = 'RESALES';
      else if (isSalesRole(code)) createdByRole = 'SALES';
    }

    const allTags = await prisma.customerTag.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });
    const tagByNameOrCode = (nameOrCode: string) => {
      const t = toStr(nameOrCode);
      if (!t) return null;
      const found = allTags.find(
        (tag) => tag.name.toLowerCase() === t.toLowerCase() || tag.code.toLowerCase() === t.toLowerCase()
      );
      return found?.id ?? null;
    };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(req.file.buffer) as any);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount <= 1) {
      return res.status(400).json({ message: 'File Excel trống hoặc không có dữ liệu' });
    }

    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = cell.value != null ? String(cell.value).trim() : '';
    });
    const getCol = (keys: string[]): number => {
      for (const key of keys) {
        const i = headers.findIndex((h: string) => h && String(h).toLowerCase().replace(/\s*\(\*\)\s*/, '').includes(key.toLowerCase()));
        if (i >= 0) return i + 1;
      }
      return 0;
    };

    const phoneCol = getCol(['Số điện thoại', 'SĐT', 'phone']);
    if (!phoneCol) {
      return res.status(400).json({ message: 'File phải có cột Số điện thoại (bắt buộc)' });
    }
    const nameCol = getCol(['Họ và tên', 'Họ tên', 'name', 'Tên']) || 2;
    const emailCol = getCol(['Email']) || 3;
    const genderCol = getCol(['Giới tính', 'gender']) || 4;
    const dobCol = getCol(['Ngày sinh', 'dateOfBirth']) || 5;
    const addressCol = getCol(['Địa chỉ', 'address']) || 6;
    const businessTypeCol = getCol(['Loại hình', 'businessType']) || 10;
    const salesChannelCol = getCol(['Kênh tiếp cận', 'salesChannel']) || 11;
    const salesChannelNoteCol = getCol(['Ghi chú kênh', 'salesChannelNote']) || 12;
    const tagsCol = getCol(['Thẻ khách hàng', 'tags']) || 13;
    const noteCol = getCol(['Ghi chú', 'note']) || 14;
    const farmNameCol = getCol(['Vườn', 'farmName']) || 15;
    const farmAreaCol = getCol(['Diện tích', 'farmArea']) || 16;
    const farmAreaUnitCol = getCol(['Đơn vị DT', 'farmAreaUnit']) || 17;
    const mainCropsCol = getCol(['Cây trồng', 'mainCrops']) || 18;
    const mainCropsRootCountsCol = getCol(['Số gốc', 'mainCropsRootCounts']);
    const farmingYearsCol = getCol(['Số năm KN', 'farmingYears']) || 19;
    const soilTypeCol = getCol(['Loại đất', 'soilType']) || 20;
    const farmingMethodCol = getCol(['Phương pháp canh tác', 'farmingMethod']) || 21;
    const irrigationTypeCol = getCol(['Loại tưới tiêu', 'irrigationType']) || 22;
    const taxCodeCol = getCol(['MST', 'taxCode']) || 23;
    const bankAccountCol = getCol(['Số TK', 'bankAccount']) || 24;
    const bankNameCol = getCol(['Ngân hàng', 'bankName']) || 25;

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      const phone = toStr(row.getCell(phoneCol).value);
      if (!phone) continue;

      const existing = await prisma.customer.findFirst({ where: { phone } });
      if (existing) {
        skipped++;
        continue;
      }

      const businessTypeRaw = toStr(row.getCell(businessTypeCol).value);
      const businessType = BUSINESS_TYPE_FROM_LABEL[businessTypeRaw] || businessTypeRaw || null;
      if (!businessType || !['INDIVIDUAL', 'COOPERATIVE', 'COMPANY'].includes(businessType)) {
        errors.push(`Dòng ${rowIndex}: Loại hình kinh doanh bắt buộc (Cá nhân / Hợp tác xã / Doanh nghiệp)`);
        continue;
      }

      const salesChannelRaw = toStr(row.getCell(salesChannelCol).value);
      const salesChannel = SALES_CHANNEL_FROM_LABEL[salesChannelRaw] || salesChannelRaw || null;
      if (!salesChannel) {
        errors.push(`Dòng ${rowIndex}: Kênh tiếp cận bắt buộc`);
        continue;
      }

      const tagsRaw = toStr(row.getCell(tagsCol).value);
      const tagNames = tagsRaw ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [];
      const tagIds: string[] = [];
      for (const name of tagNames) {
        const id = tagByNameOrCode(name);
        if (id && !tagIds.includes(id)) tagIds.push(id);
      }
      if (tagIds.length === 0) {
        errors.push(`Dòng ${rowIndex}: Thẻ khách hàng bắt buộc (ít nhất 1 thẻ tồn tại trong hệ thống). VD: VIP; Tiềm năng`);
        continue;
      }

      const name = toStr(row.getCell(nameCol).value);
      const email = toStr(row.getCell(emailCol).value);
      const gender = toStr(row.getCell(genderCol).value) || null;
      const dateOfBirth = toDate(row.getCell(dobCol).value);
      const address = toStr(row.getCell(addressCol).value);
      const salesChannelNote = toStr(row.getCell(salesChannelNoteCol).value);
      const note = toStr(row.getCell(noteCol).value);
      const farmName = toStr(row.getCell(farmNameCol).value);
      const farmArea = toNum(row.getCell(farmAreaCol).value, parseFloat);
      const farmAreaUnit = toStr(row.getCell(farmAreaUnitCol).value);
      const mainCropsStr = toStr(row.getCell(mainCropsCol).value);
      const mainCrops = mainCropsStr ? mainCropsStr.split(',').map((c) => c.trim()).filter(Boolean) : [];

      if (mainCrops.length === 0) {
        errors.push(`Dòng ${rowIndex}: Cây trồng chính là bắt buộc`);
        continue;
      }

      const selectedRootCrops = mainCrops.filter((c) => ROOT_COUNTABLE_CROPS.has(c));
      let mainCropsRootCounts: Record<string, number> | null = null;
      if (selectedRootCrops.length > 0) {
        const rootCountRaw = mainCropsRootCountsCol
          ? toNum(row.getCell(mainCropsRootCountsCol).value, parseInt)
          : null;

        if (!rootCountRaw || rootCountRaw <= 0) {
          errors.push(
            `Dòng ${rowIndex}: Số gốc là bắt buộc và phải > 0 cho các cây: ${selectedRootCrops.join(', ')}`
          );
          continue;
        }

        mainCropsRootCounts = {};
        for (const crop of selectedRootCrops) mainCropsRootCounts[crop] = rootCountRaw;
      }

      const farmingYears = toNum(row.getCell(farmingYearsCol).value, parseInt);
      const soilType = toStr(row.getCell(soilTypeCol).value);
      const farmingMethod = toStr(row.getCell(farmingMethodCol).value);
      const irrigationType = toStr(row.getCell(irrigationTypeCol).value);
      const taxCode = toStr(row.getCell(taxCodeCol).value);
      const bankAccount = toStr(row.getCell(bankAccountCol).value);
      const bankName = toStr(row.getCell(bankNameCol).value);

      const count = await prisma.customer.count();
      const code = `KH-${String(count + 1).padStart(6, '0')}`;
      const newCustomer = await prisma.customer.create({
        data: {
          code,
          phone,
          name: name || null,
          email: email || null,
          gender: gender || null,
          dateOfBirth,
          address: address || null,
          businessType,
          salesChannel,
          salesChannelNote: salesChannelNote || null,
          note: note || null,
          farmName: farmName || null,
          farmArea,
          farmAreaUnit: farmAreaUnit || null,
          mainCrops,
          mainCropsRootCounts: mainCropsRootCounts || undefined,
          farmingYears,
          soilType: soilType || null,
          farmingMethod: farmingMethod || null,
          irrigationType: irrigationType || null,
          taxCode: taxCode || null,
          bankAccount: bankAccount || null,
          bankName: bankName || null,
          createdById: user.id,
          createdByRole,
          employeeId: user.id,
          leadStatus: 'NEW',
        },
      });
      await prisma.customerTagAssignment.createMany({
        data: tagIds.map((tagId) => ({
          customerId: newCustomer.id,
          tagId,
          assignedBy: user.id,
        })),
      });
      created++;
    }

    let message = `Import xong: ${created} khách hàng mới, ${skipped} SĐT đã tồn tại (bỏ qua).`;
    if (errors.length > 0) {
      message += ` Lỗi/bỏ qua ${errors.length} dòng: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`;
    }
    res.json({ message, created, skipped, errors: errors.slice(0, 20) });
  } catch (error) {
    console.error('Import customers Excel error:', error);
    res.status(500).json({ message: 'Lỗi khi import khách hàng' });
  }
};

/** Gán SĐT phụ một lần (Sales / CSKH / quản lý khách). */
export const setPhoneSecondary = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const raw = req.body?.phoneSecondary ?? req.body?.phone_secondary;
    if (raw === undefined || raw === null) {
      return res.status(400).json({ message: 'Thiếu số điện thoại phụ' });
    }
    const phoneSecondary = normalizePhone(String(raw));
    if (!phoneSecondary) {
      return res.status(400).json({ message: 'Số điện thoại phụ không hợp lệ' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, phone: true, phoneSecondary: true, name: true },
    });
    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    if (!(await canQuickEditCustomerRow(user, id))) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật khách hàng này' });
    }

    if (customer.phoneSecondary) {
      return res.status(400).json({ message: 'Đã có số điện thoại phụ, không thể thêm hoặc sửa' });
    }
    if (phoneSecondary === normalizePhone(customer.phone)) {
      return res.status(400).json({ message: 'Số phụ phải khác số chính' });
    }

    const dup = await prisma.customer.findFirst({
      where: {
        OR: [{ phone: phoneSecondary }, { phoneSecondary: phoneSecondary }],
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      return res.status(400).json({ message: 'Số điện thoại đã tồn tại trên khách khác' });
    }

    await prisma.customer.update({
      where: { id },
      data: { phoneSecondary },
    });

    await appendCustomerImpactNote({
      customerId: id,
      employeeId: user.id,
      contentVi: `Thêm số điện thoại phụ: "${phoneSecondary}"`,
      interactionType: 'CONTACT',
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'Khách hàng',
      objectId: id,
      result: 'SUCCESS',
      details: `Thêm SĐT phụ cho khách ${customer.name || id}: ${phoneSecondary}`,
      req,
    });

    res.json({ message: 'Đã lưu số điện thoại phụ', phoneSecondary });
  } catch (error) {
    console.error('setPhoneSecondary error:', error);
    res.status(500).json({ message: 'Lỗi khi lưu số phụ' });
  }
};

/** Đổi tên nhanh từ bảng Sales/CSKH. */
export const patchCustomerQuickName = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const name = req.body?.name != null ? String(req.body.name).trim() : '';
    if (!name) {
      return res.status(400).json({ message: 'Họ tên không được để trống' });
    }

    const before = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!before) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    if (!(await canQuickEditCustomerRow(user, id))) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật khách hàng này' });
    }

    await prisma.customer.update({
      where: { id },
      data: { name },
    });

    await appendCustomerImpactNote({
      customerId: id,
      employeeId: user.id,
      contentVi: `Đổi họ tên từ "${before.name ?? '(trống)'}" sang "${name}"`,
      interactionType: 'CUSTOMER_NAME',
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'Khách hàng',
      objectId: id,
      result: 'SUCCESS',
      details: `Đổi tên khách ${id}: "${before.name ?? ''}" → "${name}"`,
      req,
    });

    res.json({ message: 'Đã cập nhật tên', name });
  } catch (error) {
    console.error('patchCustomerQuickName error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật tên' });
  }
};

/** Đổi cây trồng chính nhanh từ bảng Sales/CSKH (một giá trị trong danh mục; ghi đè mảng mainCrops). */
export const patchCustomerQuickMainCrop = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const mainCropRaw = req.body?.mainCrop != null ? String(req.body.mainCrop).trim() : '';
    if (!mainCropRaw || !ALL_CROPS_SET.has(mainCropRaw)) {
      return res.status(400).json({ message: 'Cây trồng chính không hợp lệ hoặc không nằm trong danh mục hệ thống' });
    }

    const before = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, code: true, mainCrops: true, mainCropsRootCounts: true },
    });
    if (!before) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    if (!(await canQuickEditCustomerRow(user, id))) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật khách hàng này' });
    }

    const nextMainCrops = [mainCropRaw];
    const oldCounts = normalizeMainCropsRootCounts(before.mainCropsRootCounts);
    const nextRootCounts: Record<string, number> = {};
    if (ROOT_COUNTABLE_CROPS.has(mainCropRaw)) {
      const sameSingle =
        Array.isArray(before.mainCrops) &&
        before.mainCrops.length === 1 &&
        before.mainCrops[0] === mainCropRaw;
      const n =
        sameSingle && oldCounts[mainCropRaw] && oldCounts[mainCropRaw] > 0 ? oldCounts[mainCropRaw] : 1;
      nextRootCounts[mainCropRaw] = n;
    }

    const validation = validateMainCropsAndRootCounts({
      mainCrops: nextMainCrops,
      mainCropsRootCounts: nextRootCounts,
    });
    if (!validation.isValid) {
      return res.status(400).json({ message: validation.errors.join('\n') });
    }

    await prisma.customer.update({
      where: { id },
      data: {
        mainCrops: nextMainCrops,
        mainCropsRootCounts: Object.keys(nextRootCounts).length > 0 ? nextRootCounts : {},
      },
    });

    const oldLabel =
      before.mainCrops && before.mainCrops.length > 0 ? before.mainCrops.join(', ') : '(chưa có)';
    await appendCustomerImpactNote({
      customerId: id,
      employeeId: user.id,
      contentVi: `Đổi cây trồng chính từ "${oldLabel}" sang "${mainCropRaw}"`,
      interactionType: 'MAIN_CROPS',
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'Khách hàng',
      objectId: id,
      result: 'SUCCESS',
      details: `Đổi cây trồng chính khách ${before.code || id}: "${oldLabel}" → "${mainCropRaw}"`,
      req,
    });

    res.json({
      message: 'Đã cập nhật cây trồng chính',
      mainCrops: nextMainCrops,
      mainCropsRootCounts: nextRootCounts,
    });
  } catch (error) {
    console.error('patchCustomerQuickMainCrop error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cây trồng chính' });
  }
};

/** Đổi danh sách cây trồng chính nhanh (nhiều giá trị); có thể kèm `mainCropsRootCounts` cho cây tính gốc. */
export const patchCustomerQuickMainCrops = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const raw = req.body?.mainCrops;
    const arr = Array.isArray(raw) ? raw : [];
    const mainCropsIn = toMainCrops(arr).filter((c) => ALL_CROPS_SET.has(c));
    const nextMainCrops = [...new Set(mainCropsIn)];
    if (nextMainCrops.length === 0) {
      return res.status(400).json({ message: 'Chọn ít nhất một cây trong danh mục hệ thống' });
    }

    const before = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, code: true, mainCrops: true, mainCropsRootCounts: true },
    });
    if (!before) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    if (!(await canQuickEditCustomerRow(user, id))) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật khách hàng này' });
    }

    const oldCounts = normalizeMainCropsRootCounts(before.mainCropsRootCounts);
    const bodyCountsRaw = req.body?.mainCropsRootCounts;
    const bodyCountsNormalized =
      bodyCountsRaw !== undefined &&
      bodyCountsRaw !== null &&
      typeof bodyCountsRaw === 'object' &&
      !Array.isArray(bodyCountsRaw)
        ? normalizeMainCropsRootCounts(bodyCountsRaw)
        : null;

    const nextRootCounts: Record<string, number> = {};
    for (const crop of nextMainCrops) {
      if (!ROOT_COUNTABLE_CROPS.has(crop)) continue;
      let n: number | undefined;
      if (bodyCountsNormalized) {
        const v = bodyCountsNormalized[crop];
        if (Number.isFinite(v) && (v as number) > 0) n = Math.floor(v as number);
      }
      if (n === undefined) {
        const prev = oldCounts[crop];
        n = prev && prev > 0 ? prev : 1;
      }
      nextRootCounts[crop] = n;
    }

    const validation = validateMainCropsAndRootCounts({
      mainCrops: nextMainCrops,
      mainCropsRootCounts: nextRootCounts,
    });
    if (!validation.isValid) {
      return res.status(400).json({ message: validation.errors.join('\n') });
    }

    await prisma.customer.update({
      where: { id },
      data: {
        mainCrops: nextMainCrops,
        mainCropsRootCounts: Object.keys(nextRootCounts).length > 0 ? nextRootCounts : {},
      },
    });

    const oldLabel =
      before.mainCrops && before.mainCrops.length > 0 ? before.mainCrops.join(', ') : '(chưa có)';
    const newLabel = nextMainCrops.join(', ');
    await appendCustomerImpactNote({
      customerId: id,
      employeeId: user.id,
      contentVi: `Đổi cây trồng chính từ "${oldLabel}" sang "${newLabel}"`,
      interactionType: 'MAIN_CROPS',
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'Khách hàng',
      objectId: id,
      result: 'SUCCESS',
      details: `Đổi danh sách cây trồng chính khách ${before.code || id}: "${oldLabel}" → "${newLabel}"`,
      req,
    });

    res.json({
      message: 'Đã cập nhật cây trồng chính',
      mainCrops: nextMainCrops,
      mainCropsRootCounts: nextRootCounts,
    });
  } catch (error) {
    console.error('patchCustomerQuickMainCrops error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cây trồng chính' });
  }
};
