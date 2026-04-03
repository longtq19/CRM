
import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Prisma, TransactionType, TransactionStatus } from '@prisma/client';
import { getPaginationParams } from '../utils/pagination';
import { logAudit, getAuditUser } from '../utils/auditLog';
import { describeWarehouseChanges } from '../utils/auditChangeDescriptions';

const warehouseAuditInclude = {
  province: { select: { name: true } },
  district: { select: { name: true } },
  ward: { select: { name: true } },
} as const;

// --- Warehouse Management ---

export const getWarehouses = async (req: Request, res: Response) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        province: { select: { id: true, name: true, code: true } },
        district: { select: { id: true, name: true, code: true } },
        ward: { select: { id: true, name: true, code: true, vtpDistrictId: true } },
      },
    });
    res.json(warehouses);
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách kho' });
  }
};

export const getWarehouseDetail = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        province: { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
      },
    });
    if (!warehouse) return res.status(404).json({ message: 'Không tìm thấy kho' });
    res.json(warehouse);
  } catch (error) {
    console.error('Get warehouse detail error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết kho' });
  }
};

export const createWarehouse = async (req: Request, res: Response) => {
  try {
    const { code, name, address, manager, type, contactName, contactPhone, detailAddress, provinceId, districtId, wardId } = req.body;
    const codeTrim = String(code ?? '').trim().toUpperCase();
    const nameTrim = String(name ?? '').trim();
    if (!codeTrim || !nameTrim) {
      return res.status(400).json({ message: 'Mã kho và tên kho là bắt buộc' });
    }

    // Validate code: 2 chars, uppercase alphanumeric
    if (!/^[A-Z0-9]{2}$/.test(codeTrim)) {
      return res.status(400).json({ message: 'Mã kho phải đúng 2 ký tự (chữ in hoa hoặc số), không chứa khoảng trắng hay ký tự đặc biệt' });
    }

    const existed = await prisma.warehouse.findUnique({ where: { code: codeTrim } });
    if (existed) {
      return res.status(400).json({ message: `Mã kho '${codeTrim}' đã tồn tại` });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        code: codeTrim, name: nameTrim, address: address ?? null, manager: manager ?? null, type,
        contactName: contactName ?? null, contactPhone: contactPhone ?? null,
        detailAddress: detailAddress ?? null, provinceId: provinceId ?? null,
        districtId: districtId ?? null, wardId: wardId ?? null,
      },
      include: { province: { select: { id: true, name: true } }, district: { select: { id: true, name: true } }, ward: { select: { id: true, name: true } } },
    });
    const auditUser = getAuditUser(req);
    const parts = [`Tạo kho "${warehouse.name}" (mã ${warehouse.code})`];
    if (warehouse.detailAddress) parts.push(`địa chỉ chi tiết: ${warehouse.detailAddress}`);
    await logAudit({
      ...auditUser,
      action: 'Tạo mới',
      object: 'Kho hàng',
      objectId: warehouse.id,
      result: 'SUCCESS',
      details: parts.join('; ') + '.',
      newValues: { code: warehouse.code, name: warehouse.name },
      req,
    });
    return res.status(201).json(warehouse);
  } catch (error) {
    console.error('Create warehouse error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(400).json({ message: 'Mã kho đã tồn tại' });
    }
    return res.status(500).json({ message: 'Lỗi khi tạo kho' });
  }
};

export const updateWarehouse = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { code, name, address, manager, type, contactName, contactPhone, detailAddress, provinceId, districtId, wardId } = req.body;
    const codeTrim = String(code ?? '').trim().toUpperCase();
    const nameTrim = String(name ?? '').trim();
    if (!codeTrim || !nameTrim) {
      return res.status(400).json({ message: 'Mã kho và tên kho là bắt buộc' });
    }

    // Validate code: 2 chars, uppercase alphanumeric
    if (!/^[A-Z0-9]{2}$/.test(codeTrim)) {
      return res.status(400).json({ message: 'Mã kho phải đúng 2 ký tự (chữ in hoa hoặc số), không chứa khoảng trắng hay ký tự đặc biệt' });
    }

    const existedByCode = await prisma.warehouse.findUnique({ where: { code: codeTrim } });
    if (existedByCode && existedByCode.id !== id) {
      return res.status(400).json({ message: `Mã kho '${codeTrim}' đã tồn tại` });
    }

    const before = await prisma.warehouse.findUnique({
      where: { id },
      include: warehouseAuditInclude,
    });
    if (!before) {
      return res.status(404).json({ message: 'Không tìm thấy kho' });
    }

    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: {
        code: codeTrim, name: nameTrim, address: address ?? null, manager: manager ?? null, type,
        contactName: contactName ?? null, contactPhone: contactPhone ?? null,
        detailAddress: detailAddress ?? null, provinceId: provinceId ?? null,
        districtId: districtId ?? null, wardId: wardId ?? null,
      },
      include: { province: { select: { id: true, name: true } }, district: { select: { id: true, name: true } }, ward: { select: { id: true, name: true } } },
    });

    const auditUser = getAuditUser(req);
    const details = describeWarehouseChanges(before, warehouse);
    await logAudit({
      ...auditUser,
      action: 'Cập nhật',
      object: 'Kho hàng',
      objectId: warehouse.id,
      result: 'SUCCESS',
      details,
      oldValues: {
        code: before.code,
        name: before.name,
        address: before.address,
        manager: before.manager,
        type: before.type,
        contactName: before.contactName,
        contactPhone: before.contactPhone,
        detailAddress: before.detailAddress,
        provinceId: before.provinceId,
        districtId: before.districtId,
        wardId: before.wardId,
      },
      newValues: {
        code: warehouse.code,
        name: warehouse.name,
        address: warehouse.address,
        manager: warehouse.manager,
        type: warehouse.type,
        contactName: warehouse.contactName,
        contactPhone: warehouse.contactPhone,
        detailAddress: warehouse.detailAddress,
        provinceId: warehouse.provinceId,
        districtId: warehouse.districtId,
        wardId: warehouse.wardId,
      },
      req,
    });
    return res.json(warehouse);
  } catch (error) {
    console.error('Update warehouse error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(400).json({ message: 'Mã kho đã tồn tại' });
    }
    return res.status(500).json({ message: 'Lỗi khi cập nhật kho' });
  }
};

export const deleteWarehouse = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const before = await prisma.warehouse.findUnique({ where: { id }, include: warehouseAuditInclude });
    if (!before) {
      return res.status(404).json({ message: 'Không tìm thấy kho' });
    }
    await prisma.warehouse.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    const auditUser = getAuditUser(req);
    await logAudit({
      ...auditUser,
      action: 'Xóa',
      object: 'Kho hàng',
      objectId: id,
      result: 'SUCCESS',
      details: `Ngừng sử dụng kho "${before.name}" (mã ${before.code}).`,
      oldValues: { code: before.code, name: before.name, status: before.status },
      newValues: { status: 'INACTIVE' },
      req,
    });
    res.json({ message: 'Đã xóa kho thành công' });
  } catch (error) {
    console.error('Delete warehouse error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa kho' });
  }
};

// --- Stock Management ---

export const getStocks = async (req: Request, res: Response) => {
  try {
    const { warehouseId, search, type } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {
      quantity: { gt: 0 } // Only show items in stock by default? Or show 0 for tracking? Let's show all but maybe filter by FE
    };

    if (warehouseId) {
      where.warehouseId = String(warehouseId);
    }

    if (search) {
      where.product = {
        OR: [
          { name: { contains: String(search), mode: 'insensitive' } },
          { code: { contains: String(search), mode: 'insensitive' } },
        ],
      };
    }

    if (type) {
      where.product = { ...where.product, category: { code: String(type) } };
    }

    const [total, stocks] = await Promise.all([
      prisma.stock.count({ where }),
      prisma.stock.findMany({
        where,
        include: {
          product: {
            include: { bioDetail: true, techDetail: true }
          },
          warehouse: true,
          batch: true,
        },
        orderBy: [
          { product: { name: 'asc' } },
          { batch: { expDate: 'asc' } } // FEFO order
        ],
        skip,
        take: limit,
      }),
    ]);

    res.json({
      data: stocks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get stocks error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy tồn kho' });
  }
};

// --- Import / Export / Transfer ---

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const { type, sourceWarehouseId, destWarehouseId, note, items } = req.body;
    // items: [{ productId, quantity, batch: { code, expDate, mfgDate }, serials: ["SN1", "SN2"] }]
    
    // Validate
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Danh sách hàng hóa không hợp lệ' });
    }

    // Determine warehouses based on type
    // IMPORT: destWarehouseId required
    // EXPORT: sourceWarehouseId required
    // TRANSFER: both required

    if (type === 'IMPORT' && !destWarehouseId) {
      return res.status(400).json({ message: 'Kho nhập là bắt buộc' });
    }
    if (type === 'EXPORT' && !sourceWarehouseId) {
      return res.status(400).json({ message: 'Kho xuất là bắt buộc' });
    }
    if (type === 'TRANSFER' && (!sourceWarehouseId || !destWarehouseId)) {
      return res.status(400).json({ message: 'Kho đi và kho đến là bắt buộc' });
    }

    const userId = (req as any).user?.id || (req as any).user?.userId || 'system'; // Get from auth middleware

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Transaction Record
      const code = `${type}-${Date.now()}`; // Simple code generation, can be improved
      const transaction = await tx.inventoryTransaction.create({
        data: {
          code,
          type: type as TransactionType,
          sourceWarehouseId,
          destWarehouseId,
          note,
          createdBy: userId,
          status: 'COMPLETED', // Auto complete for now, can add Draft later
        },
      });

      // 2. Process Items
      for (const item of items) {
        const { productId, quantity, batch, serials } = item;
        const product = await tx.product.findUnique({ where: { id: productId } });
        
        if (!product) throw new Error(`Sản phẩm ${productId} không tồn tại`);
        
        // Get category to determine product type
        const category = product.categoryId 
          ? await tx.productCategory.findUnique({ where: { id: product.categoryId } })
          : null;
        const productTypeCode = category?.code || 'BIO';

        let batchId = null;

        // Handle BIO (Batch) - batch info is optional
        if (productTypeCode === 'BIO' && batch && batch.code && batch.code.trim()) {
          const mfgDateParsed = batch.mfgDate && String(batch.mfgDate).trim() !== '' ? new Date(batch.mfgDate) : null;
          const expDateParsed = batch.expDate && String(batch.expDate).trim() !== '' ? new Date(batch.expDate) : null;

          // Upsert Batch only if batch code is provided
          const batchRecord = await tx.batch.upsert({
            where: { code: batch.code.trim() },
            update: {
              mfgDate: mfgDateParsed,
              expDate: expDateParsed,
            },
            create: {
              code: batch.code.trim(),
              productId,
              mfgDate: mfgDateParsed,
              expDate: expDateParsed,
            },
          });
          batchId = batchRecord.id;
        }

        // Create Transaction Item
        await tx.transactionItem.create({
          data: {
            transactionId: transaction.id,
            productId,
            batchId,
            quantity: Number(quantity),
            serials: serials ? JSON.stringify(serials) : null,
          },
        });

        // Update Stock & Serials
        if (type === 'IMPORT') {
          // Use findFirst instead of upsert to handle potential NULL in batchId unique constraint
          const existingStock = await tx.stock.findFirst({
            where: {
              warehouseId: destWarehouseId,
              productId,
              batchId: batchId || null
            }
          });

          if (existingStock) {
            await tx.stock.update({
              where: { id: existingStock.id },
              data: { quantity: { increment: Number(quantity) } }
            });
          } else {
            await tx.stock.create({
              data: {
                warehouseId: destWarehouseId,
                productId,
                batchId,
                quantity: Number(quantity),
              },
            });
          }

          // Handle TECH Serials (Create new serials)
          if (productTypeCode === 'TECH' && serials && Array.isArray(serials)) {
            for (const sn of serials) {
              await tx.serial.create({
                data: {
                  code: sn,
                  productId,
                  warehouseId: destWarehouseId,
                  status: 'IN_STOCK',
                },
              });
            }
          }
        } else if (type === 'EXPORT') {
          // Decrease Source Stock
          const stock = await tx.stock.findFirst({
            where: {
              warehouseId: sourceWarehouseId,
              productId,
              batchId: batchId || null
            }
          });

          if (!stock || stock.quantity < quantity) {
            throw new Error(`Kho không đủ hàng cho sản phẩm ${product.name}`);
          }

          await tx.stock.update({
            where: { id: stock.id },
            data: { quantity: { decrement: quantity } },
          });

          // Handle TECH Serials (Update status to SOLD/OUT)
          if (productTypeCode === 'TECH' && serials && Array.isArray(serials)) {
            for (const sn of serials) {
              await tx.serial.update({
                where: { code: sn },
                data: {
                  warehouseId: null,
                  status: 'SOLD', // Or just OUT if not sold yet
                },
              });
            }
          }
        }
        // TODO: Handle TRANSFER logic (Dec Source, Inc Dest)
      }

      return transaction;
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Create transaction error:', error);
    res.status(500).json({ message: error.message || 'Lỗi khi tạo phiếu kho' });
  }
};

// Get inventory transactions (import/export history)
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const { type, warehouseId, search } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};

    if (type) {
      where.type = String(type);
    }

    if (warehouseId) {
      where.OR = [
        { sourceWarehouseId: String(warehouseId) },
        { destWarehouseId: String(warehouseId) }
      ];
    }

    if (search) {
      where.code = { contains: String(search), mode: 'insensitive' };
    }

    const [total, transactions] = await Promise.all([
      prisma.inventoryTransaction.count({ where }),
      prisma.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          sourceWarehouse: { select: { id: true, name: true, code: true } },
          destWarehouse: { select: { id: true, name: true, code: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, code: true, unit: true } },
              batch: { select: { id: true, code: true, mfgDate: true, expDate: true } }
            }
          }
        }
      })
    ]);

    res.json({
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách phiếu kho' });
  }
};

// Get transaction detail by ID
export const getTransactionDetail = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const transaction = await prisma.inventoryTransaction.findUnique({
      where: { id },
      include: {
        sourceWarehouse: true,
        destWarehouse: true,
        items: {
          include: {
            product: {
              include: {
                category: true,
                bioDetail: true,
                techDetail: true
              }
            },
            batch: true
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu kho' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Get transaction detail error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết phiếu kho' });
  }
};

// ==================== INVENTORY LOGS ====================

/**
 * Lấy lịch sử thay đổi tồn kho
 */
export const getInventoryLogs = async (req: Request, res: Response) => {
  try {
    const { productId, type, startDate, endDate } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};
    if (productId) where.productId = String(productId);
    if (type) where.type = String(type);
    if (startDate) where.createdAt = { ...where.createdAt, gte: new Date(String(startDate)) };
    if (endDate) where.createdAt = { ...where.createdAt, lte: new Date(String(endDate)) };

    const [total, logs] = await Promise.all([
      prisma.inventoryLog.count({ where }),
      prisma.inventoryLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get inventory logs error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử tồn kho' });
  }
};

/**
 * Điều chỉnh tồn kho (bắt buộc note lý do)
 */
export const adjustStock = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { productId, batchId, warehouseId, quantity, reason, note } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng nhập lý do điều chỉnh' });
    }

    // Lấy số lượng hiện tại
    const currentStock = await prisma.stock.findFirst({
      where: {
        productId,
        warehouseId,
        batchId: batchId || null
      }
    });

    const previousQty = currentStock?.quantity || 0;
    const newQty = Number(quantity);
    const changeQty = newQty - previousQty;

    // Cập nhật stock
    if (currentStock) {
      await prisma.stock.update({
        where: { id: currentStock.id },
        data: { quantity: newQty }
      });
    } else {
      await prisma.stock.create({
        data: {
          warehouseId,
          productId,
          batchId: batchId || null,
          quantity: newQty
        }
      });
    }

    // Ghi log
    const log = await prisma.inventoryLog.create({
      data: {
        productId,
        batchId: batchId || null,
        type: 'ADJUST',
        quantity: changeQty,
        previousQty,
        newQty,
        reason,
        note,
        createdBy: user.id
      }
    });

    res.json({ message: 'Điều chỉnh tồn kho thành công', log });
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({ message: 'Lỗi khi điều chỉnh tồn kho' });
  }
};

/**
 * Nhập kho hàng hoàn
 */
export const importReturnedStock = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { orderId, orderCode, warehouseId, items, reason, note } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng nhập lý do nhập kho hàng hoàn' });
    }

    const results = [];

    for (const item of items) {
      const { productId, batchId, quantity, isDamaged } = item;

      // Lấy số lượng hiện tại
      const currentStock = await prisma.stock.findFirst({
        where: {
          productId,
          warehouseId,
          batchId: batchId || null
        }
      });

      const previousQty = currentStock?.quantity || 0;
      const newQty = isDamaged ? previousQty : previousQty + Number(quantity);

      // Cập nhật stock nếu không hỏng
      if (!isDamaged) {
        if (currentStock) {
          await prisma.stock.update({
            where: { id: currentStock.id },
            data: { quantity: newQty }
          });
        } else {
          await prisma.stock.create({
            data: {
              warehouseId,
              productId,
              batchId: batchId || null,
              quantity: Number(quantity)
            }
          });
        }
      }

      // Ghi log
      const log = await prisma.inventoryLog.create({
        data: {
          productId,
          batchId: batchId || null,
          type: isDamaged ? 'DAMAGED' : 'RETURN',
          quantity: isDamaged ? -Number(quantity) : Number(quantity),
          previousQty,
          newQty: isDamaged ? previousQty : newQty,
          orderId,
          reason: isDamaged 
            ? `Hàng hỏng từ đơn hoàn ${orderCode}: ${reason}`
            : `Nhập kho hàng hoàn từ đơn ${orderCode}: ${reason}`,
          note,
          createdBy: user.id
        }
      });

      results.push(log);
    }

    res.json({ message: 'Nhập kho hàng hoàn thành công', logs: results });
  } catch (error) {
    console.error('Import returned stock error:', error);
    res.status(500).json({ message: 'Lỗi khi nhập kho hàng hoàn' });
  }
};

/**
 * Ghi nhận hàng hỏng
 */
export const reportDamagedStock = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { productId, batchId, warehouseId, quantity, reason, note } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng nhập lý do hàng hỏng' });
    }

    // Lấy số lượng hiện tại
    const currentStock = await prisma.stock.findFirst({
      where: {
        productId,
        warehouseId,
        batchId: batchId || null
      }
    });

    if (!currentStock || currentStock.quantity < Number(quantity)) {
      return res.status(400).json({ message: 'Số lượng trong kho không đủ' });
    }

    const previousQty = currentStock.quantity;
    const newQty = previousQty - Number(quantity);

    // Giảm stock
    await prisma.stock.update({
      where: { id: currentStock.id },
      data: { quantity: newQty }
    });

    // Ghi log
    const log = await prisma.inventoryLog.create({
      data: {
        productId,
        batchId: batchId || null,
        type: 'DAMAGED',
        quantity: -Number(quantity),
        previousQty,
        newQty,
        reason,
        note,
        createdBy: user.id
      }
    });

    res.json({ message: 'Ghi nhận hàng hỏng thành công', log });
  } catch (error) {
    console.error('Report damaged stock error:', error);
    res.status(500).json({ message: 'Lỗi khi ghi nhận hàng hỏng' });
  }
};
