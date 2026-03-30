import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Decimal } from '@prisma/client/runtime/library';
import { getPaginationParams } from '../utils/pagination';
import {
  MARKETING_ROLE_CODES,
  SALES_ROLE_CODES,
  RESALES_ROLE_CODES
} from '../constants/roleIdentification';

// ==========================================
// SALARY COMPONENTS - Đầu mục lương
// ==========================================

export const getSalaryComponents = async (req: Request, res: Response) => {
  try {
    const components = await prisma.salaryComponent.findMany({
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]
    });
    res.json(components);
  } catch (error) {
    console.error('Get salary components error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách đầu mục lương' });
  }
};

export const createSalaryComponent = async (req: Request, res: Response) => {
  try {
    const { code, name, type, isTaxable, description, sortOrder } = req.body;

    const existing = await prisma.salaryComponent.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Mã đầu mục đã tồn tại' });
    }

    const component = await prisma.salaryComponent.create({
      data: { code, name, type, isTaxable, description, sortOrder: sortOrder || 0 }
    });

    res.status(201).json(component);
  } catch (error) {
    console.error('Create salary component error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo đầu mục lương' });
  }
};

export const updateSalaryComponent = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, type, isTaxable, isActive, description, sortOrder } = req.body;

    const component = await prisma.salaryComponent.update({
      where: { id },
      data: { name, type, isTaxable, isActive, description, sortOrder }
    });

    res.json(component);
  } catch (error) {
    console.error('Update salary component error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật đầu mục lương' });
  }
};

export const deleteSalaryComponent = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Check if used in any payroll
    const usedCount = await prisma.payrollItem.count({ where: { componentId: id } });
    if (usedCount > 0) {
      return res.status(400).json({ message: 'Không thể xóa đầu mục đã được sử dụng trong bảng lương' });
    }

    await prisma.salaryComponent.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete salary component error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa đầu mục lương' });
  }
};

// ==========================================
// PAYROLL - Bảng lương
// ==========================================

export const getPayrolls = async (req: Request, res: Response) => {
  try {
    const { month, year, status, employeeId, employeeTypeId } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};
    if (month) where.month = parseInt(month as string);
    if (year) where.year = parseInt(year as string);
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (employeeTypeId && String(employeeTypeId) !== '') where.employee = { employeeTypeId: String(employeeTypeId) };

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        include: {
          employee: { select: { id: true, code: true, fullName: true, department: { select: { name: true } }, employeeType: { select: { code: true, name: true } } } },
          items: { include: { component: true } },
          approver: { select: { fullName: true } },
          creator: { select: { fullName: true } }
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { employee: { fullName: 'asc' } }],
        skip,
        take: limit
      }),
      prisma.payroll.count({ where })
    ]);

    res.json({
      data: payrolls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get payrolls error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách bảng lương' });
  }
};

export const getPayrollById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { 
          select: { 
            id: true, code: true, fullName: true, 
            department: { select: { name: true } },
            position: { select: { name: true } },
            employeeType: { select: { code: true, name: true } }
          } 
        },
        items: { 
          include: { component: true },
          orderBy: { component: { sortOrder: 'asc' } }
        },
        approver: { select: { fullName: true } },
        creator: { select: { fullName: true } }
      }
    });

    if (!payroll) {
      return res.status(404).json({ message: 'Không tìm thấy bảng lương' });
    }

    res.json(payroll);
  } catch (error) {
    console.error('Get payroll by id error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết bảng lương' });
  }
};

export const createPayroll = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { month, year, employeeId, workDays, leaveDays, overtimeHours, items, note } = req.body;

    // Check if payroll exists
    const existing = await prisma.payroll.findUnique({
      where: { month_year_employeeId: { month, year, employeeId } }
    });
    if (existing) {
      return res.status(400).json({ message: `Bảng lương tháng ${month}/${year} cho nhân viên này đã tồn tại` });
    }

    // Calculate totals
    let grossSalary = new Decimal(0);
    let totalDeduction = new Decimal(0);

    const components = await prisma.salaryComponent.findMany({
      where: { id: { in: items.map((i: any) => i.componentId) } }
    });

    for (const item of items) {
      const comp = components.find(c => c.id === item.componentId);
      if (comp) {
        const amount = new Decimal(item.amount);
        if (comp.type === 'EARNING' || comp.type === 'BENEFIT') {
          grossSalary = grossSalary.plus(amount);
        } else if (comp.type === 'DEDUCTION') {
          totalDeduction = totalDeduction.plus(amount);
        }
      }
    }

    const netSalary = grossSalary.minus(totalDeduction);

    const payroll = await prisma.payroll.create({
      data: {
        month,
        year,
        employeeId,
        workDays: workDays || 0,
        leaveDays: leaveDays || 0,
        overtimeHours: overtimeHours || 0,
        grossSalary,
        totalDeduction,
        netSalary,
        note,
        createdBy: userId,
        items: {
          create: items.map((item: any) => ({
            componentId: item.componentId,
            amount: item.amount,
            note: item.note
          }))
        }
      },
      include: {
        employee: { select: { fullName: true } },
        items: { include: { component: true } }
      }
    });

    res.status(201).json(payroll);
  } catch (error) {
    console.error('Create payroll error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo bảng lương' });
  }
};

export const updatePayroll = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { workDays, leaveDays, overtimeHours, items, note, status } = req.body;

    const existing = await prisma.payroll.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy bảng lương' });
    }

    if (existing.status === 'PAID') {
      return res.status(400).json({ message: 'Không thể sửa bảng lương đã thanh toán' });
    }

    // Recalculate if items changed
    let grossSalary = existing.grossSalary;
    let totalDeduction = existing.totalDeduction;
    let netSalary = existing.netSalary;

    if (items && items.length > 0) {
      grossSalary = new Decimal(0);
      totalDeduction = new Decimal(0);

      const components = await prisma.salaryComponent.findMany({
        where: { id: { in: items.map((i: any) => i.componentId) } }
      });

      for (const item of items) {
        const comp = components.find(c => c.id === item.componentId);
        if (comp) {
          const amount = new Decimal(item.amount);
          if (comp.type === 'EARNING' || comp.type === 'BENEFIT') {
            grossSalary = grossSalary.plus(amount);
          } else if (comp.type === 'DEDUCTION') {
            totalDeduction = totalDeduction.plus(amount);
          }
        }
      }

      netSalary = grossSalary.minus(totalDeduction);

      // Delete old items and create new
      await prisma.payrollItem.deleteMany({ where: { payrollId: id } });
      await prisma.payrollItem.createMany({
        data: items.map((item: any) => ({
          payrollId: id,
          componentId: item.componentId,
          amount: item.amount,
          note: item.note
        }))
      });
    }

    const payroll = await prisma.payroll.update({
      where: { id },
      data: {
        workDays,
        leaveDays,
        overtimeHours,
        grossSalary,
        totalDeduction,
        netSalary,
        note,
        status
      },
      include: {
        employee: { select: { fullName: true } },
        items: { include: { component: true } }
      }
    });

    res.json(payroll);
  } catch (error) {
    console.error('Update payroll error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật bảng lương' });
  }
};

export const approvePayroll = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const id = req.params.id as string;

    const payroll = await prisma.payroll.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date()
      }
    });

    res.json(payroll);
  } catch (error) {
    console.error('Approve payroll error:', error);
    res.status(500).json({ message: 'Lỗi khi duyệt bảng lương' });
  }
};

export const generateMonthlyPayroll = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { month, year } = req.body;

    // Get all active employees
    const employees = await prisma.employee.findMany({
      where: { status: { code: 'ACTIVE' } },
      select: { id: true }
    });

    // Get default salary components
    const defaultComponents = await prisma.salaryComponent.findMany({
      where: { isActive: true }
    });

    let created = 0;
    let skipped = 0;

    for (const emp of employees) {
      // Check if payroll exists
      const existing = await prisma.payroll.findUnique({
        where: { month_year_employeeId: { month, year, employeeId: emp.id } }
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create empty payroll
      await prisma.payroll.create({
        data: {
          month,
          year,
          employeeId: emp.id,
          workDays: 22, // Default
          grossSalary: 0,
          totalDeduction: 0,
          netSalary: 0,
          createdBy: userId
        }
      });

      created++;
    }

    res.json({ 
      success: true, 
      message: `Đã tạo ${created} bảng lương, bỏ qua ${skipped} (đã tồn tại)` 
    });
  } catch (error) {
    console.error('Generate monthly payroll error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo bảng lương hàng loạt' });
  }
};

// ==========================================
// DRAFT INVOICE - Hóa đơn nháp
// ==========================================

export const getDraftInvoices = async (req: Request, res: Response) => {
  try {
    const { status, customerId, fromDate, toDate } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (fromDate || toDate) {
      where.invoiceDate = {};
      if (fromDate) where.invoiceDate.gte = new Date(fromDate as string);
      if (toDate) where.invoiceDate.lte = new Date(toDate as string);
    }

    const [invoices, total] = await Promise.all([
      prisma.draftInvoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          creator: { select: { fullName: true } },
          items: { include: { product: { select: { code: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.draftInvoice.count({ where })
    ]);

    res.json({
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get draft invoices error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách hóa đơn nháp' });
  }
};

export const getDraftInvoiceById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const invoice = await prisma.draftInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        creator: { select: { fullName: true } },
        items: { include: { product: { select: { code: true, name: true, unit: true } } } }
      }
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Get draft invoice by id error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết hóa đơn' });
  }
};

export const createDraftInvoice = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      customerId,
      customerName,
      customerAddress,
      customerTaxCode,
      customerEmail,
      customerPhone,
      invoiceDate,
      dueDate,
      taxRate,
      discount,
      orderCode,
      note,
      items
    } = req.body;

    // Calculate totals
    let subtotal = new Decimal(0);
    for (const item of items) {
      const amount = new Decimal(item.quantity).times(new Decimal(item.unitPrice)).minus(new Decimal(item.discount || 0));
      subtotal = subtotal.plus(amount);
    }

    const taxAmount = subtotal.times(new Decimal(taxRate || 10)).dividedBy(100);
    const total = subtotal.plus(taxAmount).minus(new Decimal(discount || 0));

    const invoice = await prisma.draftInvoice.create({
      data: {
        customerId,
        customerName,
        customerAddress,
        customerTaxCode,
        customerEmail,
        customerPhone,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        subtotal,
        taxRate: taxRate || 10,
        taxAmount,
        discount: discount || 0,
        total,
        orderCode,
        note,
        createdBy: userId,
        items: {
          create: items.map((item: any) => ({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            amount: new Decimal(item.quantity).times(new Decimal(item.unitPrice)).minus(new Decimal(item.discount || 0)),
            note: item.note
          }))
        }
      },
      include: {
        items: true
      }
    });

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Create draft invoice error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo hóa đơn nháp' });
  }
};

export const updateDraftInvoice = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const {
      customerName,
      customerAddress,
      customerTaxCode,
      customerEmail,
      customerPhone,
      invoiceDate,
      dueDate,
      taxRate,
      discount,
      note,
      items,
      status
    } = req.body;

    const existing = await prisma.draftInvoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    if (existing.status === 'EXPORTED') {
      return res.status(400).json({ message: 'Không thể sửa hóa đơn đã xuất' });
    }

    // Recalculate if items changed
    let subtotal = existing.subtotal;
    let taxAmount = existing.taxAmount;
    let total = existing.total;

    if (items && items.length > 0) {
      subtotal = new Decimal(0);
      for (const item of items) {
        const amount = new Decimal(item.quantity).times(new Decimal(item.unitPrice)).minus(new Decimal(item.discount || 0));
        subtotal = subtotal.plus(amount);
      }

      const rate = taxRate !== undefined ? taxRate : Number(existing.taxRate);
      taxAmount = subtotal.times(new Decimal(rate)).dividedBy(100);
      const disc = discount !== undefined ? discount : Number(existing.discount);
      total = subtotal.plus(taxAmount).minus(new Decimal(disc));

      // Delete old items and create new
      await prisma.draftInvoiceItem.deleteMany({ where: { invoiceId: id } });
      await prisma.draftInvoiceItem.createMany({
        data: items.map((item: any) => ({
          invoiceId: id,
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          amount: new Decimal(item.quantity).times(new Decimal(item.unitPrice)).minus(new Decimal(item.discount || 0)),
          note: item.note
        }))
      });
    }

    const invoice = await prisma.draftInvoice.update({
      where: { id },
      data: {
        customerName,
        customerAddress,
        customerTaxCode,
        customerEmail,
        customerPhone,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        taxRate,
        discount,
        subtotal,
        taxAmount,
        total,
        note,
        status
      },
      include: {
        items: true
      }
    });

    res.json(invoice);
  } catch (error) {
    console.error('Update draft invoice error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật hóa đơn' });
  }
};

export const deleteDraftInvoice = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.draftInvoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    if (existing.status === 'EXPORTED') {
      return res.status(400).json({ message: 'Không thể xóa hóa đơn đã xuất' });
    }

    await prisma.draftInvoice.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete draft invoice error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa hóa đơn' });
  }
};

// Chuẩn bị dữ liệu xuất hóa đơn
export const prepareInvoiceExport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    const invoice = await prisma.draftInvoice.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } }
      }
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    // Format data for invoice provider API
    const exportData = {
      // Thông tin người bán (lấy từ config)
      seller: {
        taxCode: process.env.COMPANY_TAX_CODE || '',
        name: process.env.COMPANY_NAME || 'Công ty TNHH Kagri Tech',
        address: process.env.COMPANY_ADDRESS || '',
        phone: process.env.COMPANY_PHONE || '',
        email: process.env.COMPANY_EMAIL || ''
      },
      // Thông tin người mua
      buyer: {
        taxCode: invoice.customerTaxCode || '',
        name: invoice.customerName,
        address: invoice.customerAddress || '',
        phone: invoice.customerPhone || '',
        email: invoice.customerEmail || ''
      },
      // Thông tin hóa đơn
      invoice: {
        date: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        currency: 'VND',
        exchangeRate: 1
      },
      // Chi tiết hàng hóa
      items: invoice.items.map((item: any, index: number) => ({
        lineNumber: index + 1,
        itemCode: item.productCode || '',
        itemName: item.productName,
        unit: item.unit || 'Cái',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        amount: Number(item.amount),
        vatRate: Number(invoice.taxRate),
        vatAmount: Number(item.amount) * Number(invoice.taxRate) / 100
      })),
      // Tổng hợp
      summary: {
        subtotal: Number(invoice.subtotal),
        discount: Number(invoice.discount),
        vatRate: Number(invoice.taxRate),
        vatAmount: Number(invoice.taxAmount),
        total: Number(invoice.total)
      }
    };

    // Update status to PENDING
    await prisma.draftInvoice.update({
      where: { id: id as string },
      data: { status: 'PENDING' }
    });

    res.json({
      success: true,
      invoiceId: invoice.id,
      exportData
    });
  } catch (error) {
    console.error('Prepare invoice export error:', error);
    res.status(500).json({ message: 'Lỗi khi chuẩn bị dữ liệu xuất hóa đơn' });
  }
};

// Tạo hóa đơn từ đơn hàng
export const createInvoiceFromOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { orderCode, orderDate } = req.body;

    // Find order
    const order = await prisma.order.findFirst({
      where: { code: orderCode },
      include: {
        customer: true,
        items: { include: { product: true } }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    // Create draft invoice
    const invoice = await prisma.draftInvoice.create({
      data: {
        customerId: order.customerId,
        customerName: order.customer.name || 'Khách hàng',
        customerAddress: order.customer.address || '',
        customerEmail: order.customer.email || '',
        customerPhone: order.customer.phone,
        orderCode: order.code,
        subtotal: order.totalAmount,
        taxRate: 10,
        taxAmount: new Decimal(order.totalAmount).times(10).dividedBy(100),
        discount: order.discount,
        total: order.finalAmount,
        createdBy: userId,
        items: {
          create: order.items.map((item: any) => ({
            productId: item.productId,
            productCode: item.product?.code,
            productName: item.product?.name || 'Sản phẩm',
            unit: item.product?.unit || 'Cái',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: 0,
            amount: new Decimal(item.quantity).times(item.unitPrice)
          }))
        }
      },
      include: { items: true }
    });

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Create invoice from order error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo hóa đơn từ đơn hàng' });
  }
};

// ==========================================
// FINANCIAL REPORTS - Báo cáo tài chính
// ==========================================

export const getFinancialReports = async (req: Request, res: Response) => {
  try {
    const { type, year } = req.query;

    const where: any = {};
    if (type) where.type = type;
    if (year) where.year = parseInt(year as string);

    const reports = await prisma.financialReport.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });

    res.json(reports);
  } catch (error) {
    console.error('Get financial reports error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo tài chính' });
  }
};

export const generateFinancialReport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { type, month, year } = req.body;

    // Calculate date range
    let startDate: Date, endDate: Date;
    
    if (type === 'MONTHLY' && month) {
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0, 23, 59, 59);
    } else if (type === 'QUARTERLY' && month) {
      const quarter = Math.ceil(month / 3);
      startDate = new Date(year, (quarter - 1) * 3, 1);
      endDate = new Date(year, quarter * 3, 0, 23, 59, 59);
    } else {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59);
    }

    // Get revenue from orders
    const orders = await prisma.order.aggregate({
      where: {
        orderDate: { gte: startDate, lte: endDate },
        orderStatus: { in: ['COMPLETED', 'DELIVERED'] }
      },
      _sum: { finalAmount: true },
      _count: true
    });

    // Get salary expenses
    const payrolls = await prisma.payroll.aggregate({
      where: {
        year,
        ...(type === 'MONTHLY' && month ? { month } : {}),
        status: { in: ['APPROVED', 'PAID'] }
      },
      _sum: { netSalary: true }
    });

    const totalRevenue = orders._sum.finalAmount || new Decimal(0);
    const totalOrders = orders._count || 0;
    const totalSalary = payrolls._sum.netSalary || new Decimal(0);
    const totalExpense = totalSalary; // Can add more expense types
    const grossProfit = new Decimal(totalRevenue).minus(totalExpense);
    const netProfit = grossProfit; // Can subtract taxes, etc.

    // Upsert report
    const report = await prisma.financialReport.upsert({
      where: {
        type_month_year: {
          type,
          month: type === 'YEARLY' ? null : month,
          year
        }
      },
      update: {
        totalRevenue,
        totalOrders,
        totalExpense,
        totalSalary,
        grossProfit,
        netProfit,
        generatedAt: new Date(),
        generatedBy: userId
      },
      create: {
        type,
        month: type === 'YEARLY' ? null : month,
        year,
        totalRevenue,
        totalOrders,
        totalExpense,
        totalSalary,
        grossProfit,
        netProfit,
        generatedBy: userId
      }
    });

    res.json(report);
  } catch (error) {
    console.error('Generate financial report error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo báo cáo tài chính' });
  }
};

// Dashboard summary
export const getAccountingSummary = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;

    // Payroll stats
    const payrollStats = await prisma.payroll.groupBy({
      by: ['status'],
      where: { year: currentYear, month: currentMonth },
      _count: true,
      _sum: { netSalary: true }
    });

    // Invoice stats
    const invoiceStats = await prisma.draftInvoice.groupBy({
      by: ['status'],
      where: {
        invoiceDate: {
          gte: new Date(currentYear, currentMonth - 1, 1),
          lt: new Date(currentYear, currentMonth, 1)
        }
      },
      _count: true,
      _sum: { total: true }
    });

    // Total salary this month
    const totalSalary = await prisma.payroll.aggregate({
      where: { year: currentYear, month: currentMonth },
      _sum: { netSalary: true }
    });

    // Total invoices this month
    const totalInvoice = await prisma.draftInvoice.aggregate({
      where: {
        invoiceDate: {
          gte: new Date(currentYear, currentMonth - 1, 1),
          lt: new Date(currentYear, currentMonth, 1)
        }
      },
      _sum: { total: true }
    });

    res.json({
      year: currentYear,
      month: currentMonth,
      payroll: {
        byStatus: payrollStats,
        totalAmount: totalSalary._sum.netSalary || 0
      },
      invoice: {
        byStatus: invoiceStats,
        totalAmount: totalInvoice._sum.total || 0
      }
    });
  } catch (error) {
    console.error('Get accounting summary error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy tổng quan kế toán' });
  }
};

// ==========================================
// INVOICE PROVIDER - Nhà cung cấp hóa đơn
// ==========================================

export const getInvoiceProviders = async (req: Request, res: Response) => {
  try {
    const providers = await prisma.invoiceProvider.findMany({
      orderBy: { name: 'asc' }
    });
    
    // Hide sensitive data
    const safeProviders = providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? '***' : null,
      apiSecret: p.apiSecret ? '***' : null,
      password: p.password ? '***' : null
    }));

    res.json(safeProviders);
  } catch (error) {
    console.error('Get invoice providers error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nhà cung cấp' });
  }
};

export const createInvoiceProvider = async (req: Request, res: Response) => {
  try {
    const { name, code, apiUrl, apiKey, apiSecret, username, password, taxCode, config } = req.body;

    const provider = await prisma.invoiceProvider.create({
      data: { name, code, apiUrl, apiKey, apiSecret, username, password, taxCode, config }
    });

    res.status(201).json(provider);
  } catch (error) {
    console.error('Create invoice provider error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo nhà cung cấp' });
  }
};

export const updateInvoiceProvider = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name, apiUrl, apiKey, apiSecret, username, password, taxCode, isActive, config } = req.body;

    const provider = await prisma.invoiceProvider.update({
      where: { id: id as string },
      data: { name, apiUrl, apiKey, apiSecret, username, password, taxCode, isActive, config }
    });

    res.json(provider);
  } catch (error) {
    console.error('Update invoice provider error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật nhà cung cấp' });
  }
};

// ==========================================
// ROLE DASHBOARD - Bảng chỉ số theo vai trò (MKT, CSKH, Sale, Vận đơn, Ecom)
// ==========================================

const ROLE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  department: { select: { name: true, division: { select: { name: true, code: true } } } },
  employeeType: { select: { code: true, name: true } }
};

async function getEmployeesByRole(role: 'MKT' | 'CSKH' | 'SALE' | 'VAN_DON' | 'ECOM') {
  const where: any = {};
  if (role === 'MKT') {
    where.OR = [
      { roleGroup: { code: { in: MARKETING_ROLE_CODES } } },
      { salesType: 'MARKETING' }
    ];
  } else if (role === 'CSKH') {
    where.OR = [
      { roleGroup: { code: { in: RESALES_ROLE_CODES } } },
      { salesType: 'RESALES' }
    ];
  } else if (role === 'SALE') {
    where.OR = [
      { roleGroup: { code: { in: SALES_ROLE_CODES } } },
      { salesType: 'SALES' }
    ];
  } else if (role === 'VAN_DON') {
    where.OR = [
      { roleGroup: { code: { in: ['LOG_MGR', 'LOG_STAFF', 'SHIPPING_MGR', 'SHIPPING'] } } }
    ];
  } else {
    where.OR = [
      { roleGroup: { code: { in: ['ECO_MGR', 'ECO_STAFF'] } } },
      { department: { division: { code: 'TMDT' } } }
    ];
  }
  return prisma.employee.findMany({
    where,
    select: ROLE_SELECT,
    orderBy: { fullName: 'asc' }
  });
}

export const getRoleDashboard = async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const orderDateFilter = { gte: startDate, lte: endDate };
    const deliveredFilter = { orderDate: orderDateFilter, shippingStatus: 'DELIVERED' as const };
    const returnedFilter = { orderDate: orderDateFilter, shippingStatus: 'RETURNED' as const };

    const [mktEmps, cskhEmps, saleEmps, vanDonEmps, ecomEmps, manualMetrics] = await Promise.all([
      getEmployeesByRole('MKT'),
      getEmployeesByRole('CSKH'),
      getEmployeesByRole('SALE'),
      getEmployeesByRole('VAN_DON'),
      getEmployeesByRole('ECOM'),
      prisma.accountingRoleMetric.findMany({
        where: { periodYear: year, periodMonth: month }
      })
    ]);

    const manualMap: Record<string, number> = {};
    manualMetrics.forEach(m => {
      manualMap[`${m.roleCode}:${m.metricKey}`] = Number(m.value);
    });

    const mktIds = mktEmps.map(e => e.id);
    const cskhIds = cskhEmps.map(e => e.id);
    const saleIds = saleEmps.map(e => e.id);

    const [
      mktAdCost,
      mktRevenueNew,
      mktRevenueOld,
      cskhRevenueNew,
      cskhRevenueOld,
      cskhRevenueFromMkt,
      saleRevenueNew,
      saleRevenueOld,
      saleTotalOrders,
      saleReturnedCount,
      saleTotalCount,
      vanDonRevenueXuat,
      vanDonRevenueHoan,
      vanDonTotal,
      vanDonReturned
    ] = await Promise.all([
      mktIds.length ? prisma.marketingCampaignCost.aggregate({
        where: {
          campaign: { createdByEmployeeId: { in: mktIds } },
          costDate: { gte: startDate, lte: endDate }
        },
        _sum: { amount: true }
      }) : Promise.resolve({ _sum: { amount: null } }),
      mktIds.length ? prisma.order.aggregate({
        where: {
          customer: { marketingOwnerId: { in: mktIds } },
          isFirstOrder: true,
          ...deliveredFilter
        },
        _sum: { finalAmount: true }
      }) : Promise.resolve({ _sum: { finalAmount: null } }),
      mktIds.length ? prisma.order.aggregate({
        where: {
          customer: { marketingOwnerId: { in: mktIds } },
          isFirstOrder: false,
          ...deliveredFilter
        },
        _sum: { finalAmount: true }
      }) : Promise.resolve({ _sum: { finalAmount: null } }),
      cskhIds.length ? prisma.order.aggregate({
        where: { resalesEmployeeId: { in: cskhIds }, isFirstOrder: true, ...deliveredFilter },
        _sum: { finalAmount: true }
      }) : Promise.resolve({ _sum: { finalAmount: null } }),
      cskhIds.length ? prisma.order.aggregate({
        where: { resalesEmployeeId: { in: cskhIds }, isFirstOrder: false, ...deliveredFilter },
        _sum: { finalAmount: true }
      }) : Promise.resolve({ _sum: { finalAmount: null } }),
      cskhIds.length ? prisma.order.aggregate({
        where: {
          customer: { marketingOwnerId: { not: null } },
          OR: [{ resalesEmployeeId: { in: cskhIds } }, { salesEmployeeId: { in: cskhIds } }],
          ...deliveredFilter
        },
        _sum: { finalAmount: true }
      }) : Promise.resolve({ _sum: { finalAmount: null } }),
      saleIds.length ? prisma.order.aggregate({
        where: { salesEmployeeId: { in: saleIds }, isFirstOrder: true, ...deliveredFilter },
        _sum: { finalAmount: true }
      }) : Promise.resolve({ _sum: { finalAmount: null } }),
      saleIds.length ? prisma.order.aggregate({
        where: { salesEmployeeId: { in: saleIds }, isFirstOrder: false, ...deliveredFilter },
        _sum: { finalAmount: true }
      }) : Promise.resolve({ _sum: { finalAmount: null } }),
      saleIds.length ? prisma.order.count({
        where: { salesEmployeeId: { in: saleIds }, orderDate: orderDateFilter }
      }) : 0,
      saleIds.length ? prisma.order.count({
        where: { salesEmployeeId: { in: saleIds }, ...returnedFilter }
      }) : 0,
      saleIds.length ? prisma.order.count({
        where: { salesEmployeeId: { in: saleIds }, orderDate: orderDateFilter }
      }) : 0,
      prisma.order.aggregate({
        where: deliveredFilter,
        _sum: { finalAmount: true }
      }),
      prisma.order.aggregate({
        where: returnedFilter,
        _sum: { finalAmount: true }
      }),
      prisma.order.count({ where: { orderDate: orderDateFilter } }),
      prisma.order.count({ where: returnedFilter })
    ]);

    const rep = () => ({ id: '', code: '', fullName: '—', department: '—' });
    const toRep = (e: any) => ({
      id: e.id,
      code: e.code,
      fullName: e.fullName,
      department: e.department ? `${e.department.name}${e.department.division ? ` · ${e.department.division.name}` : ''}` : '—'
    });

    const saleReturnRate = saleTotalCount > 0 ? Math.round((saleReturnedCount / saleTotalCount) * 10000) / 100 : 0;
    const vanDonReturnRate = vanDonTotal > 0 ? Math.round((vanDonReturned / vanDonTotal) * 10000) / 100 : 0;

    res.json({
      period: { year, month },
      columns: [
        {
          role: 'MKT',
          roleLabel: 'MKT',
          employee: mktEmps[0] ? toRep(mktEmps[0]) : rep(),
          metrics: {
            adCost: Number(mktAdCost._sum?.amount ?? 0),
            materialCost: manualMap['MKT:material_cost'] ?? 0,
            revenueNew: Number(mktRevenueNew._sum?.finalAmount ?? 0),
            revenueOld: Number(mktRevenueOld._sum?.finalAmount ?? 0)
          }
        },
        {
          role: 'CSKH',
          roleLabel: 'CSKH',
          employee: cskhEmps[0] ? toRep(cskhEmps[0]) : rep(),
          metrics: {
            revenueNew: Number(cskhRevenueNew._sum?.finalAmount ?? 0),
            revenueOld: Number(cskhRevenueOld._sum?.finalAmount ?? 0),
            revenueFromMkt: Number(cskhRevenueFromMkt._sum?.finalAmount ?? 0)
          }
        },
        {
          role: 'SALE',
          roleLabel: 'Sale',
          employee: saleEmps[0] ? toRep(saleEmps[0]) : rep(),
          metrics: {
            revenueNew: Number(saleRevenueNew._sum?.finalAmount ?? 0),
            revenueOld: Number(saleRevenueOld._sum?.finalAmount ?? 0),
            totalData: saleTotalOrders,
            returnRate: saleReturnRate
          }
        },
        {
          role: 'VAN_DON',
          roleLabel: 'Vận đơn',
          employee: vanDonEmps[0] ? toRep(vanDonEmps[0]) : rep(),
          metrics: {
            revenueXuat: Number(vanDonRevenueXuat._sum?.finalAmount ?? 0),
            revenueHoan: Number(vanDonRevenueHoan._sum?.finalAmount ?? 0),
            returnRate: vanDonReturnRate
          }
        },
        {
          role: 'ECOM',
          roleLabel: 'Ecom',
          employee: ecomEmps[0] ? toRep(ecomEmps[0]) : rep(),
          metrics: {
            adCost: manualMap['ECOM:ad_cost'] ?? 0,
            voucher: manualMap['ECOM:voucher'] ?? 0,
            revenueNew: manualMap['ECOM:revenue_new'] ?? 0,
            revenueOld: manualMap['ECOM:revenue_old'] ?? 0
          }
        }
      ]
    });
  } catch (error) {
    console.error('Get role dashboard error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy bảng chỉ số theo vai trò' });
  }
};

export const upsertRoleMetric = async (req: Request, res: Response) => {
  try {
    const { roleCode, metricKey, value, periodYear, periodMonth, note } = req.body;
    if (!roleCode || !metricKey || periodYear == null || periodMonth == null) {
      return res.status(400).json({ message: 'Thiếu roleCode, metricKey, periodYear, periodMonth' });
    }
    const metric = await prisma.accountingRoleMetric.upsert({
      where: {
        roleCode_metricKey_periodYear_periodMonth: {
          roleCode,
          metricKey,
          periodYear: parseInt(periodYear),
          periodMonth: parseInt(periodMonth)
        }
      },
      update: { value: value ?? 0, note },
      create: {
        roleCode,
        metricKey,
        value: value ?? 0,
        periodYear: parseInt(periodYear),
        periodMonth: parseInt(periodMonth),
        note
      }
    });
    res.json(metric);
  } catch (error) {
    console.error('Upsert role metric error:', error);
    res.status(500).json({ message: 'Lỗi khi lưu chỉ số' });
  }
};
