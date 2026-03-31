import { Request, Response } from 'express';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import { prisma } from '../config/database';
import { logAudit, getAuditUser } from '../utils/auditLog';
import { getPaginationParams } from '../utils/pagination';
import { viettelPostService } from '../services/viettelPostService';
import { updateCustomerRank } from './customerRankController';
import { getSubordinateIds, getVisibleEmployeeIds } from '../utils/viewScopeHelper';
import { getMarketingAttributionEffectiveDaysForCustomer } from '../services/leadDuplicateService';
import { resolveTargetEmployees } from '../services/orgRoutingService';
import { pickCskhEmployeeIdByTeamRatio } from '../services/teamRatioDistributionService';

async function getAllSubordinates(employeeId: string): Promise<string[]> {
  return getSubordinateIds(employeeId);
}

/** Tổng khối lượng (g) = Σ(weight × SL); SP không có weight → 500g/đơn vị (chuẩn nghiệp vụ HCRM). */
function sumOrderWeightGramsFromItems(
  items: Array<{ quantity: number; product: { weight: number | null } | null }>
): number {
  let total = 0;
  for (const i of items) {
    const w =
      i.product?.weight != null && Number(i.product.weight) > 0
        ? Number(i.product.weight)
        : 500;
    total += w * i.quantity;
  }
  return Math.max(100, Math.round(total));
}

/**
 * Xử lý khi đơn hàng đầu tiên được hoàn thành
 * - Kiểm tra KHỐI của nhân viên Sales có cấu hình pushToPoolAfterClose không
 * - Nếu có, đẩy KH về kho số chung (xóa employeeId) để phân cho các KHỐI Resales
 */
const handleFirstOrderCompletion = async (customerId: string, salesEmployeeId: string) => {
  try {
    const pool = await prisma.dataPool.findUnique({
      where: { customerId },
      select: { poolType: true },
    });
    if (pool?.poolType === 'CSKH') return;

    // Lấy thông tin KHỐI của nhân viên Sales
    const salesEmployee = await prisma.employee.findUnique({
      where: { id: salesEmployeeId },
      include: {
        department: {
          include: {
            parent: true
          }
        }
      }
    });

    if (!salesEmployee?.departmentId) return;

    // Ngay sau khi đơn đầu tiên được hoàn thành: chuyển khách sang vòng CSKH
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        employeeId: null,
        createdByRole: 'SALES'
      }
    });

    // Tự động phân cho các KHỐI Resales
    await autoDistributeCustomerToResales(customerId, salesEmployee.departmentId);

    const [customerAfter, firstHoldCfg, cskhMaxNoteCfg, maxRoundsCfg] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { employeeId: true }
      }),
      prisma.systemConfig.findUnique({ where: { key: 'customer_recycle_days' } }).catch(() => null),
      prisma.systemConfig.findUnique({ where: { key: 'cskh_max_note_days' } }).catch(() => null),
      prisma.systemConfig.findUnique({ where: { key: 'max_repartition_rounds' } }).catch(() => null),
    ]);

    const resalesEmployeeId = customerAfter?.employeeId ?? null;
    const cskhFirstHoldDays = firstHoldCfg ? parseInt(firstHoldCfg.value, 10) : 180;
    const cskhMaxNoteDays = cskhMaxNoteCfg ? parseInt(cskhMaxNoteCfg.value, 10) : 15;
    const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;

    if (resalesEmployeeId) {
      const now = new Date();
      await prisma.dataPool.update({
        where: { customerId },
        data: {
          poolType: 'CSKH',
          poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
          status: 'ASSIGNED',
          assignedToId: resalesEmployeeId,
          assignedAt: now,
          deadline: null,
          holdUntil: new Date(now.getTime() + cskhFirstHoldDays * 24 * 60 * 60 * 1000),
          interactionDeadline: new Date(now.getTime() + cskhMaxNoteDays * 24 * 60 * 60 * 1000),
          cskhStage: 1,
          roundCount: 0,
          maxRounds,
          processingStatus: null,
          awaitingSalesAfterCskh: false,
          note: 'CSKH bắt đầu sau đơn giao thành công đầu tiên'
        }
      });
    }
  } catch (error) {
    console.error('Handle first order completion error:', error);
  }
};

/**
 * Tự động phân KH cho CSKH — org-aware: resolve đơn vị CSKH đích từ Sales department.
 */
const autoDistributeCustomerToResales = async (customerId: string, salesDeptId: string | null) => {
  try {
    // Org-aware: tìm NV CSKH đích từ đơn vị Sales gốc
    if (salesDeptId) {
      const resolved = await resolveTargetEmployees(salesDeptId, 'CSKH');
      if (resolved.employees.length > 0) {
        let selectedEmpId: string | null = await pickCskhEmployeeIdByTeamRatio(resolved.employees);
        if (!selectedEmpId) {
          let rrConfig = await prisma.systemConfig.findFirst({ where: { key: 'RESALES_RR_INDEX' } });
          let currentIndex = rrConfig ? parseInt(rrConfig.value) : 0;
          selectedEmpId = resolved.employees[currentIndex % resolved.employees.length]!.id;
          await prisma.systemConfig.upsert({
            where: { key: 'RESALES_RR_INDEX' },
            update: { value: String((currentIndex + 1) % resolved.employees.length) },
            create: {
              key: 'RESALES_RR_INDEX',
              value: String((currentIndex + 1) % resolved.employees.length),
              name: 'Resales Round-Robin Index',
              description: 'Index để chia đều KH cho NV CSKH',
              category: 'system',
              dataType: 'INTEGER',
            },
          });
        }

        await prisma.customer.update({ where: { id: customerId }, data: { employeeId: selectedEmpId } });

        await prisma.userNotification.create({
          data: {
            employeeId: selectedEmpId,
            title: 'Khách hàng mới sau giao hàng thành công',
            content: 'Bạn có khách hàng mới được phân sang CSKH sau khi đơn giao thành công.',
            type: 'SALES',
            category: 'INFO',
            link: `/customers/${customerId}`,
          },
        });

        console.log(`[AutoDistribute] Customer ${customerId} assigned to CSKH employee ${selectedEmpId} (org-aware from sales dept ${salesDeptId})`);
        return;
      }
    }

    // Fallback: logic cũ — lấy tất cả CSKH divisions
    const resalesDivisions = await prisma.department.findMany({
      where: { function: 'CSKH', autoDistributeCustomer: true },
      include: { children: { include: { manager: true } } },
    });

    if (resalesDivisions.length === 0) return;

    const managers: string[] = [];
    for (const div of resalesDivisions) {
      for (const dept of div.children) {
        if (dept.managerId) managers.push(dept.managerId);
      }
      if (div.managerId) managers.push(div.managerId);
    }
    if (managers.length === 0) return;

    let rrConfig = await prisma.systemConfig.findFirst({ where: { key: 'RESALES_RR_INDEX' } });
    let currentIndex = rrConfig ? parseInt(rrConfig.value) : 0;
    const selectedManager = managers[currentIndex % managers.length];

    await prisma.customer.update({ where: { id: customerId }, data: { employeeId: selectedManager } });
    await prisma.systemConfig.upsert({
      where: { key: 'RESALES_RR_INDEX' },
      update: { value: String((currentIndex + 1) % managers.length) },
      create: { key: 'RESALES_RR_INDEX', value: String((currentIndex + 1) % managers.length), name: 'Resales Round-Robin Index', description: 'Index để chia đều KH cho các QL Resales', category: 'system', dataType: 'INTEGER' },
    });

    await prisma.userNotification.create({
      data: { employeeId: selectedManager, title: 'Khách hàng mới từ kho số chung', content: 'Bạn có khách hàng mới được phân từ kho số chung sau khi chốt đơn đầu tiên.', type: 'SALES', category: 'INFO', link: `/customers/${customerId}` },
    });

    console.log(`[AutoDistribute] Customer ${customerId} assigned to manager ${selectedManager} (fallback)`);
  } catch (error) {
    console.error('Auto distribute customer to resales error:', error);
  }
};

/**
 * Lấy danh sách đơn hàng
 */
export const getOrders = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { search, orderStatus, shippingStatus, customerId, employeeId, startDate, endDate } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};

    if (search) {
      where.OR = [
        { code: { contains: String(search), mode: 'insensitive' } },
        { trackingNumber: { contains: String(search), mode: 'insensitive' } },
        { shippingCode: { contains: String(search), mode: 'insensitive' } },
        { customer: { name: { contains: String(search), mode: 'insensitive' } } },
        { customer: { phone: { contains: String(search), mode: 'insensitive' } } },
        { receiverName: { contains: String(search), mode: 'insensitive' } },
        { receiverPhone: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    if (orderStatus && orderStatus !== 'all') {
      where.orderStatus = orderStatus;
    }

    if (shippingStatus && shippingStatus !== 'all') {
      where.shippingStatus = shippingStatus;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    const scopeUser = {
      id: user.id,
      roleGroupId: user.roleGroupId,
      departmentId: user.departmentId,
      permissions: user.permissions,
      roleGroupCode: user.roleGroupCode,
    };
    const visibleOrderIds = await getVisibleEmployeeIds(scopeUser, 'ORDER');

    if (employeeId && employeeId !== 'all') {
      if (visibleOrderIds && !visibleOrderIds.includes(String(employeeId))) {
        return res.status(403).json({ message: 'Không được lọc đơn theo nhân viên ngoài phạm vi quản lý của bạn.' });
      }
      where.employeeId = String(employeeId);
    } else if (visibleOrderIds) {
      where.employeeId = { in: visibleOrderIds };
    }

    if (startDate) {
      where.orderDate = { ...where.orderDate, gte: new Date(String(startDate)) };
    }

    if (endDate) {
      where.orderDate = { ...where.orderDate, lte: new Date(String(endDate)) };
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              phone: true,
              address: true
            }
          },
          employee: {
            select: {
              id: true,
              code: true,
              fullName: true,
              avatarUrl: true
            }
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  thumbnail: true
                }
              }
            }
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
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách đơn hàng' });
  }
};

/**
 * Lấy chi tiết đơn hàng
 */
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      include: {
        customer: true,
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            avatarUrl: true,
            phone: true
          }
        },
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    const user = (req as any).user;
    const visibleOrderIds = await getVisibleEmployeeIds(
      {
        id: user.id,
        roleGroupId: user.roleGroupId,
        departmentId: user.departmentId,
        permissions: user.permissions,
        roleGroupCode: user.roleGroupCode,
      },
      'ORDER'
    );
    if (visibleOrderIds && order.employeeId && !visibleOrderIds.includes(order.employeeId)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này.' });
    }

    // Lấy shipping logs (OrderShippingLog từ webhook VTP + ShippingLog legacy)
    const [orderLogs, legacyLogs] = await Promise.all([
      prisma.orderShippingLog.findMany({
        where: { orderId: id, orderDate: new Date(orderDate) },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.shippingLog.findMany({
        where: { orderId: id, orderDate: new Date(orderDate) },
        orderBy: { timestamp: 'desc' }
      })
    ]);
    const shippingLogs = [
      ...orderLogs.map((l: any) => ({ ...l, source: 'vtp' })),
      ...legacyLogs.map((l: any) => ({ status: l.status, statusCode: l.statusCode, description: l.description, timestamp: l.timestamp, source: 'legacy' }))
    ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ ...order, shippingLogs });
  } catch (error) {
    console.error('Get order by id error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin đơn hàng' });
  }
};

/**
 * Tạo đơn hàng mới
 */
export const createOrder = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      customerId,
      items,
      discount = 0,
      note,
      receiverName,
      receiverPhone,
      receiverAddress,
      receiverProvince,
      receiverDistrict,
      receiverWard,
      receiverProvinceId,
      receiverDistrictId,
      receiverWardId,
      warehouseId,
    } = req.body;

    if (!customerId || !items || items.length === 0) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    // Quyền tạo đơn: nhân viên chỉ được tạo đơn cho khách của mình; cấp trên được tạo đơn cho khách của mình và của cấp dưới
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, employeeId: true }
    });
    if (!customer) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }
    const allowedEmployeeIds = [user.id, ...(await getAllSubordinates(user.id))];
    const customerOwnerId = customer.employeeId;
    if (customerOwnerId == null) {
      return res.status(403).json({
        message: 'Chỉ được tạo đơn cho khách hàng đã được phân công (khách của bạn hoặc của cấp dưới).'
      });
    }
    if (!allowedEmployeeIds.includes(customerOwnerId)) {
      return res.status(403).json({
        message: 'Bạn chỉ được tạo đơn cho khách hàng của mình hoặc khách hàng của cấp dưới trực tiếp/gián tiếp.'
      });
    }

    // Tính tổng tiền
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId }
      });

      if (!product) {
        return res.status(400).json({ message: `Sản phẩm ${item.productId} không tồn tại` });
      }

      const unitPrice = parseFloat(String(product.listPriceNet));
      const itemTotal = unitPrice * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal
      });
    }

    const finalAmount = totalAmount - Number(discount);

    // Tạo mã đơn hàng
    const count = await prisma.order.count();
    const code = `DH-${String(count + 1).padStart(6, '0')}`;
    const orderDate = new Date();

    // Tạo đơn hàng
    const order = await prisma.order.create({
      data: {
        code,
        customerId,
        employeeId: user.id,
        orderDate,
        totalAmount,
        discount: Number(discount),
        finalAmount,
        paymentStatus: 'PENDING',
        orderStatus: 'DRAFT',
        shippingStatus: 'PENDING',
        note,
        receiverName,
        receiverPhone,
        receiverAddress,
        receiverProvince,
        receiverDistrict,
        receiverWard,
        receiverProvinceId: receiverProvinceId ? Number(receiverProvinceId) : null,
        receiverDistrictId: receiverDistrictId ? Number(receiverDistrictId) : null,
        receiverWardId: receiverWardId ? Number(receiverWardId) : null,
        items: {
          create: orderItems.map((item, index) => ({
            code: `${code}-${index + 1}`,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice
          }))
        }
      },
      include: {
        customer: true,
        items: {
          include: { product: true }
        }
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'ORDER',
      objectId: order.id,
      result: 'SUCCESS',
      details: `Created order ${code}`,
      req
    });

    // Cập nhật giá trị thực tế (actualAmount) của cơ hội WON từ tổng đơn hàng do nhân viên này tạo cho khách này
    try {
      const sumResult = await prisma.order.aggregate({
        where: {
          customerId,
          employeeId: user.id
        },
        _sum: { finalAmount: true }
      });
      const totalFromOrders = Number(sumResult._sum.finalAmount ?? 0);
      await prisma.leadOpportunity.updateMany({
        where: {
          customerId,
          assignedToEmployeeId: user.id,
          status: 'WON'
        },
        data: { actualAmount: totalFromOrders }
      });
    } catch (e) {
      console.error('Update opportunity actualAmount error:', e);
    }

    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo đơn hàng' });
  }
};

/**
 * Cập nhật đơn hàng
 */
export const updateOrder = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;
    const updates = req.body;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    const updateData: any = {};
    if (updates.orderStatus) updateData.orderStatus = updates.orderStatus;
    if (updates.paymentStatus) updateData.paymentStatus = updates.paymentStatus;
    if (updates.note !== undefined) updateData.note = updates.note;
    if (updates.receiverName) updateData.receiverName = updates.receiverName;
    if (updates.receiverPhone) updateData.receiverPhone = updates.receiverPhone;
    if (updates.receiverAddress) updateData.receiverAddress = updates.receiverAddress;
    if (updates.receiverProvince) updateData.receiverProvince = updates.receiverProvince;
    if (updates.receiverDistrict) updateData.receiverDistrict = updates.receiverDistrict;
    if (updates.receiverWard) updateData.receiverWard = updates.receiverWard;

    const updated = await prisma.order.update({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      data: updateData,
      include: {
        customer: true,
        items: { include: { product: true } }
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'ORDER',
      objectId: id,
      result: 'SUCCESS',
      details: `Updated order ${order.code}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật đơn hàng' });
  }
};

/**
 * Nhân viên vận đơn xác nhận đơn hàng
 */
export const confirmOrder = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    if (order.shippingStatus !== 'PENDING') {
      return res.status(400).json({ message: 'Đơn hàng không ở trạng thái chờ xác nhận' });
    }

    const updated = await prisma.order.update({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      data: {
        shippingStatus: 'CONFIRMED',
        confirmedById: user.id,
        confirmedAt: new Date(),
        orderStatus: 'CONFIRMED'
      },
      include: {
        customer: true,
        items: { include: { product: true } }
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CONFIRM',
      object: 'ORDER',
      objectId: id,
      result: 'SUCCESS',
      details: `Confirmed order ${order.code}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({ message: 'Lỗi khi xác nhận đơn hàng' });
  }
};

/**
 * Đẩy đơn hàng sang Viettel Post
 */
export const pushToViettelPost = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      include: {
        customer: true,
        items: {
          include: { product: true }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    if (order.shippingStatus !== 'CONFIRMED') {
      return res.status(400).json({ message: 'Đơn hàng chưa được xác nhận' });
    }

    if (!order.receiverName || !order.receiverPhone || !order.receiverAddress) {
      return res.status(400).json({ message: 'Thiếu thông tin người nhận' });
    }

    // Lấy thông tin sản phẩm (đơn ngoài hệ thống có [VTP_EXT] trong note)
    let productNames: string;
    let totalQuantity: number;
    let totalWeight: number;
    const extMatch = order.note?.match(/\[VTP_EXT\](.+)/);
    if (extMatch && order.customer?.code === 'EXTERNAL_GUEST') {
      try {
        const ext = JSON.parse(extMatch[1]);
        productNames = ext.productName || 'Sản phẩm';
        totalQuantity = order.items.reduce((s, i) => s + i.quantity, 0);
        totalWeight = (ext.productWeight || 500) * totalQuantity;
      } catch {
        productNames = order.items.map(i => i.product.name).join(', ');
        totalQuantity = order.items.reduce((s, i) => s + i.quantity, 0);
        totalWeight = 500 * totalQuantity;
      }
    } else {
      productNames = order.items.map(i => i.product.name).join(', ');
      totalQuantity = order.items.reduce((s, i) => s + i.quantity, 0);
      totalWeight = sumOrderWeightGramsFromItems(order.items);
    }

    // Sender: lấy từ warehouse nếu có warehouseId, fallback env vars
    const reqWarehouseId = req.body?.warehouseId;
    let senderName = process.env.VTP_SENDER_NAME || 'KAGRI BIO';
    let senderPhone = process.env.VTP_SENDER_PHONE || process.env.VTP_USERNAME || '0352737467';
    let senderAddress = process.env.VTP_SENDER_ADDRESS || 'Số 103, ngõ 95, Đạo Xuyên, Bát Tràng';
    let sProvinceId = parseInt(process.env.VTP_SENDER_PROVINCE || '1', 10);
    let sDistrictId = parseInt(process.env.VTP_SENDER_DISTRICT || '8', 10);
    let sWardId = parseInt(process.env.VTP_SENDER_WARD || '175', 10);

    if (reqWarehouseId) {
      const wh = await prisma.warehouse.findUnique({
        where: { id: reqWarehouseId },
        include: { province: true, district: true, ward: true }
      });
      if (wh) {
        senderName = wh.contactName || senderName;
        senderPhone = wh.contactPhone || senderPhone;
        senderAddress = wh.detailAddress || wh.address || senderAddress;
        if (wh.province?.code) sProvinceId = parseInt(wh.province.code, 10) || sProvinceId;
        if (wh.district?.code) sDistrictId = parseInt(wh.district.code, 10) || sDistrictId;
        if (wh.ward?.code) sWardId = parseInt(wh.ward.code, 10) || sWardId;
      }
    }

    const rProvinceId = order.receiverProvinceId ?? NaN;
    const rDistrictId = order.receiverDistrictId ?? NaN;
    const rWardId = order.receiverWardId ?? NaN;
    if (isNaN(rProvinceId) || isNaN(rDistrictId) || isNaN(rWardId)) {
      return res.status(400).json({
        message: 'Đơn hàng này chưa có ID địa chỉ VTP. Vui lòng tạo đơn mới với địa chỉ đầy đủ (chọn Tỉnh/Quận/Phường) rồi đẩy VTP.'
      });
    }
    try {
      const result = await viettelPostService.createOrder({
        orderId: order.code,
        orderDate: order.orderDate,
        senderName,
        senderPhone,
        senderAddress,
        senderProvince: sProvinceId,
        senderDistrict: sDistrictId,
        senderWard: sWardId,
        receiverName: order.receiverName!,
        receiverPhone: order.receiverPhone!,
        receiverAddress: order.receiverAddress!,
        receiverProvince: rProvinceId,
        receiverDistrict: rDistrictId,
        receiverWard: rWardId,
        productName: productNames.substring(0, 100),
        productQuantity: totalQuantity,
        productWeight: totalWeight,
        productPrice: Number(order.finalAmount),
        moneyCollection: Number(order.finalAmount),
        note: order.note || ''
      });

      // Cập nhật đơn hàng với tracking number
      const updated = await prisma.order.update({
        where: {
          id_orderDate: { id, orderDate: new Date(orderDate) }
        },
        data: {
          shippingStatus: 'SHIPPING',
          shippingProvider: 'VIETTEL_POST',
          trackingNumber: result.trackingNumber,
          shippedAt: new Date()
        },
        include: {
          customer: true,
          items: { include: { product: true } }
        }
      });

      // Ghi log (OrderShippingLog để đồng bộ với webhook)
      await prisma.orderShippingLog.create({
        data: {
          orderId: id,
          orderDate: new Date(orderDate),
          statusCode: 'VTP_CREATED',
          status: 'CREATED',
          description: 'Đã tạo đơn vận chuyển Viettel Post',
          vtpOrderCode: result.trackingNumber,
          timestamp: new Date()
        }
      });

      await logAudit({
        ...getAuditUser(req),
        action: 'PUSH_SHIPPING',
        object: 'ORDER',
        objectId: id,
        result: 'SUCCESS',
        details: `Pushed order ${order.code} to Viettel Post, tracking: ${result.trackingNumber}`,
        req
      });

      res.json({
        message: 'Đã đẩy đơn hàng sang Viettel Post',
        trackingNumber: result.trackingNumber,
        order: updated
      });
    } catch (vtpError: any) {
      // Không dùng dữ liệu giả - trả lỗi thật khi VTP API thất bại
      const errMsg = vtpError?.response?.data?.message || vtpError?.message || 'Không thể kết nối Viettel Post';
      console.error('Push to VTP failed:', vtpError);
      return res.status(400).json({
        message: `Đẩy đơn Viettel Post thất bại: ${errMsg}. Vui lòng kiểm tra cấu hình VTP_USERNAME, VTP_PASSWORD trong .env`
      });
    }
  } catch (error: any) {
    console.error('Push to Viettel Post error:', error);
    res.status(500).json({ message: error.message || 'Lỗi khi đẩy đơn hàng' });
  }
};

/**
 * Hủy vận đơn trên Viettel Post (UpdateOrder TYPE=4), cập nhật đơn nội bộ.
 */
export const cancelViettelPostOrder = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;
    const { note } = req.body as { note?: string };

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    if (!order.trackingNumber || order.shippingProvider !== 'VIETTEL_POST') {
      return res.status(400).json({
        message: 'Đơn không có mã vận đơn Viettel Post hoặc chưa đẩy VTP — không thể hủy qua API này.'
      });
    }

    const vtp = await viettelPostService.cancelOrder(order.trackingNumber, note);

    if (!vtp.ok) {
      return res.status(400).json({
        message: vtp.message || 'Viettel Post từ chối hủy đơn (kiểm tra trạng thái vận đơn trên cổng đối tác).'
      });
    }

    const updated = await prisma.order.update({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      data: {
        shippingStatus: 'CANCELLED',
        orderStatus: 'CANCELLED'
      },
      include: {
        customer: true,
        items: { include: { product: true } }
      }
    });

    await prisma.orderShippingLog.create({
      data: {
        orderId: id,
        orderDate: new Date(orderDate),
        statusCode: 'VTP_CANCELLED',
        status: 'CANCELLED',
        description: 'Đã hủy vận đơn trên Viettel Post (UpdateOrder)',
        vtpOrderCode: order.trackingNumber,
        timestamp: new Date()
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'ORDER',
      objectId: id,
      result: 'SUCCESS',
      details: `Hủy vận đơn Viettel Post mã "${order.trackingNumber}" cho đơn ${order.code}`,
      req
    });

    res.json({
      message: 'Đã hủy đơn trên Viettel Post',
      order: updated
    });
  } catch (error: any) {
    console.error('Cancel Viettel Post order error:', error);
    res.status(500).json({ message: error.message || 'Lỗi khi hủy đơn Viettel Post' });
  }
};

/**
 * Lấy trạng thái vận chuyển
 */
export const getShippingStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    // Lấy logs từ OrderShippingLog (webhook VTP) và ShippingLog (legacy)
    const [orderLogs, legacyLogs] = await Promise.all([
      prisma.orderShippingLog.findMany({
        where: { orderId: id, orderDate: new Date(orderDate) },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.shippingLog.findMany({
        where: { orderId: id, orderDate: new Date(orderDate) },
        orderBy: { timestamp: 'desc' }
      })
    ]);
    const logs = [
      ...orderLogs.map((l: any) => ({ status: l.status, statusCode: l.statusCode, description: l.description, timestamp: l.timestamp })),
      ...legacyLogs.map((l: any) => ({ status: l.status, statusCode: l.statusCode, description: l.description, timestamp: l.timestamp }))
    ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Nếu có tracking number, thử sync với Viettel Post
    if (order.trackingNumber && order.shippingProvider === 'VIETTEL_POST') {
      try {
        await viettelPostService.syncOrderStatus(id, new Date(orderDate));
      } catch (error) {
        console.error('Sync shipping status error:', error);
      }
    }

    res.json({
      shippingStatus: order.shippingStatus,
      trackingNumber: order.trackingNumber,
      shippingProvider: order.shippingProvider,
      logs
    });
  } catch (error) {
    console.error('Get shipping status error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy trạng thái vận chuyển' });
  }
};

/**
 * Cập nhật trạng thái vận chuyển thủ công
 */
export const updateShippingStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;
    const { status, note } = req.body;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    const updateData: any = { shippingStatus: status };

    if (
      order.shippingStatus === 'PENDING' &&
      status === 'CANCELLED'
    ) {
      updateData.shippingDeclinedById = user.id;
      updateData.shippingDeclinedAt = new Date();
    }

    if (status === 'DELIVERED') {
      const deliveredAt = new Date();
      updateData.deliveredAt = deliveredAt;
      updateData.orderStatus = 'COMPLETED';
      updateData.paymentStatus = 'PAID';
      updateData.revenueCountedAt = deliveredAt;
      
      // Cập nhật tổng chi tiêu và hạng khách hàng
      if (order.customerId) {
        const attributionDays = await getMarketingAttributionEffectiveDaysForCustomer(order.customerId);
        const customer = await prisma.customer.findUnique({
          where: { id: order.customerId },
          select: {
            totalOrdersValue: true,
            totalOrders: true,
            employeeId: true,
            marketingOwnerId: true,
          },
        });

        const currentTotal = customer?.totalOrdersValue || 0;
        const newTotal = Number(currentTotal) + Number(order.finalAmount);

        await prisma.customer.update({
          where: { id: order.customerId },
          data: {
            totalOrdersValue: newTotal,
            totalOrders: { increment: 1 },
            lastOrderAt: deliveredAt,
            attributionExpiredAt: customer?.marketingOwnerId
              ? new Date(deliveredAt.getTime() + attributionDays * 24 * 60 * 60 * 1000)
              : null,
          },
        });

        await updateCustomerRank(order.customerId);
      }
    } else if (status === 'RETURNED') {
      updateData.orderStatus = 'RETURNED';
    } else if (status === 'CANCELLED') {
      updateData.orderStatus = 'CANCELLED';
    }

    const updated = await prisma.order.update({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      data: updateData
    });

    if (status === 'DELIVERED' && order.customerId) {
      const thresholdCfg = await prisma.systemConfig
        .findUnique({ where: { key: 'sales_orders_before_cs_handoff' } })
        .catch(() => null);
      const thresholdRaw = thresholdCfg ? parseInt(thresholdCfg.value, 10) : 1;
      const threshold = Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 1;
      const deliveredCount = await prisma.order.count({
        where: { customerId: order.customerId, shippingStatus: 'DELIVERED' },
      });
      const customerAfter = await prisma.customer.findUnique({
        where: { id: order.customerId },
        select: { employeeId: true },
      });
      if (deliveredCount === threshold && customerAfter?.employeeId) {
        await handleFirstOrderCompletion(order.customerId, customerAfter.employeeId);
      }
    }

    // Ghi log
    await prisma.shippingLog.create({
      data: {
        orderId: id,
        orderDate: new Date(orderDate),
        status,
        statusCode: 'MANUAL',
        description: note || `Cập nhật trạng thái: ${status}`,
        timestamp: new Date()
      }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE_SHIPPING',
      object: 'ORDER',
      objectId: id,
      result: 'SUCCESS',
      details: `Updated shipping status to ${status}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Update shipping status error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái' });
  }
};

/**
 * Thống kê đơn hàng
 */
export const getOrderStats = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate } = req.query;

    const where: any = {};
    if (startDate) {
      where.orderDate = { ...where.orderDate, gte: new Date(String(startDate)) };
    }
    if (endDate) {
      where.orderDate = { ...where.orderDate, lte: new Date(String(endDate)) };
    }

    const scopeUser = {
      id: user.id,
      roleGroupId: user.roleGroupId,
      departmentId: user.departmentId,
      permissions: user.permissions,
      roleGroupCode: user.roleGroupCode,
    };
    const visibleOrderIds = await getVisibleEmployeeIds(scopeUser, 'ORDER');
    if (visibleOrderIds) {
      where.employeeId = { in: visibleOrderIds };
    }

    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippingOrders,
      deliveredOrders,
      returnedOrders,
      cancelledOrders
    ] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, shippingStatus: 'PENDING' } }),
      prisma.order.count({ where: { ...where, shippingStatus: 'CONFIRMED' } }),
      prisma.order.count({ where: { ...where, shippingStatus: 'SHIPPING' } }),
      prisma.order.count({ where: { ...where, shippingStatus: 'DELIVERED' } }),
      prisma.order.count({ where: { ...where, shippingStatus: 'RETURNED' } }),
      prisma.order.count({ where: { ...where, shippingStatus: 'CANCELLED' } })
    ]);

    // Tính tổng doanh thu
    const revenueResult = await prisma.order.aggregate({
      where: { ...where, shippingStatus: 'DELIVERED' },
      _sum: { finalAmount: true }
    });

    res.json({
      totalOrders,
      byStatus: {
        pending: pendingOrders,
        confirmed: confirmedOrders,
        shipping: shippingOrders,
        delivered: deliveredOrders,
        returned: returnedOrders,
        cancelled: cancelledOrders
      },
      totalRevenue: revenueResult._sum.finalAmount || 0
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê' });
  }
};

/**
 * Nhân viên vận đơn sửa đơn hàng
 */
export const shippingEditOrder = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;
    const { updates, notifyCreator, requestCreatorEdit, editNote } = req.body;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      include: {
        employee: { select: { id: true, fullName: true } }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    // Lưu lịch sử chỉnh sửa
    const editHistory = order.editHistory as any[] || [];
    editHistory.push({
      editedBy: user.id,
      editedByName: user.name,
      editedAt: new Date().toISOString(),
      changes: updates,
      note: editNote
    });

    const updateData: any = {
      lastEditedById: user.id,
      lastEditedAt: new Date(),
      editHistory
    };

    // Nếu nhân viên vận đơn tự sửa
    if (!requestCreatorEdit && updates) {
      if (updates.receiverName) updateData.receiverName = updates.receiverName;
      if (updates.receiverPhone) updateData.receiverPhone = updates.receiverPhone;
      if (updates.receiverAddress) updateData.receiverAddress = updates.receiverAddress;
      if (updates.receiverProvince) updateData.receiverProvince = updates.receiverProvince;
      if (updates.receiverDistrict) updateData.receiverDistrict = updates.receiverDistrict;
      if (updates.receiverWard) updateData.receiverWard = updates.receiverWard;
      if (updates.note !== undefined) updateData.note = updates.note;
    }

    const updated = await prisma.order.update({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      data: updateData
    });

    // Gửi thông báo cho người tạo đơn
    if ((notifyCreator || requestCreatorEdit) && order.employeeId) {
      const notificationType = requestCreatorEdit ? 'ORDER_EDIT_REQUEST' : 'ORDER_EDITED';
      const notificationTitle = requestCreatorEdit 
        ? `Yêu cầu sửa đơn hàng ${order.code}`
        : `Đơn hàng ${order.code} đã được sửa`;
      const notificationContent = requestCreatorEdit
        ? `Nhân viên vận đơn yêu cầu bạn sửa đơn hàng: ${editNote || 'Không có ghi chú'}`
        : `Nhân viên vận đơn đã sửa đơn hàng: ${editNote || 'Không có ghi chú'}`;

      await prisma.userNotification.create({
        data: {
          employeeId: order.employeeId,
          title: notificationTitle,
          content: notificationContent,
          type: notificationType,
          category: 'URGENT',
          link: `/orders?id=${order.id}`,
          metadata: { orderId: order.id, orderCode: order.code }
        }
      });

      // Emit socket event nếu có
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.to(`user:${order.employeeId}`).emit('notification:new', {
          type: notificationType,
          title: notificationTitle,
          orderId: order.id,
          orderCode: order.code
        });
      }
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'ORDER',
      objectId: id,
      result: 'SUCCESS',
      details: `Shipping staff edited order ${order.code}: ${editNote || 'No note'}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Shipping edit order error:', error);
    res.status(500).json({ message: 'Lỗi khi sửa đơn hàng' });
  }
};

/**
 * Xử lý hàng hoàn
 */
export const processReturnedOrder = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const orderDate = req.params.orderDate as string;
    const { returnReason, processNote, restockedQty, damagedQty } = req.body;

    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id, orderDate: new Date(orderDate) }
      },
      include: {
        items: { include: { product: true } }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    if (order.shippingStatus !== 'RETURNED') {
      return res.status(400).json({ message: 'Đơn hàng chưa ở trạng thái hoàn' });
    }

    // Tạo record hàng hoàn
    const returnedOrder = await prisma.returnedOrder.create({
      data: {
        orderId: order.id,
        orderCode: order.code,
        returnDate: new Date(),
        returnReason: returnReason || 'OTHER',
        status: 'PROCESSED',
        processedBy: user.id,
        processedAt: new Date(),
        processNote,
        restockedQty: restockedQty || 0,
        damagedQty: damagedQty || 0
      }
    });

    // Ghi log tồn kho nếu có nhập lại
    if (restockedQty > 0 || damagedQty > 0) {
      for (const item of order.items) {
        if (restockedQty > 0) {
          await prisma.inventoryLog.create({
            data: {
              productId: item.productId,
              type: 'RETURN',
              quantity: restockedQty,
              previousQty: 0, // Cần lấy từ product
              newQty: restockedQty,
              orderId: order.id,
              reason: `Nhập kho hàng hoàn từ đơn ${order.code}`,
              note: processNote,
              createdBy: user.id
            }
          });
        }

        if (damagedQty > 0) {
          await prisma.inventoryLog.create({
            data: {
              productId: item.productId,
              type: 'DAMAGED',
              quantity: -damagedQty,
              previousQty: 0,
              newQty: 0,
              orderId: order.id,
              reason: `Hàng hỏng từ đơn hoàn ${order.code}`,
              note: processNote,
              createdBy: user.id
            }
          });
        }
      }
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'ORDER',
      objectId: id,
      result: 'SUCCESS',
      details: `Processed returned order ${order.code}`,
      req
    });

    res.json(returnedOrder);
  } catch (error) {
    console.error('Process returned order error:', error);
    res.status(500).json({ message: 'Lỗi khi xử lý hàng hoàn' });
  }
};
