import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Decimal } from '@prisma/client/runtime/library';
import {
  marketingEmployeeWhere,
  salesEmployeeWhere,
  resalesEmployeeWhere,
  MARKETING_ROLE_CODES,
  SALES_ROLE_CODES,
  RESALES_ROLE_CODES
} from '../constants/roleIdentification';
import { getSubordinateIds, resolveEffectivenessReportScope } from '../utils/viewScopeHelper';
import { userHasCatalogPermission } from '../constants/rbac';
import { getDefaultOrganizationId } from '../utils/organizationHelper';

/** Cập nhật mục tiêu kinh doanh: quyền cấu hình / cài đặt (gán qua Nhóm quyền). */
const canEditSalesTargets = (user: { roleGroupCode?: string | null; permissions?: string[] }): boolean => {
  return userHasCatalogPermission(user, ['CONFIG_OPERATIONS', 'EDIT_SETTINGS']);
};

/** Xem toàn bộ dòng báo cáo hiệu suất (không giới hạn cấp dưới). */
const canViewAllPerformanceRows = (user: { roleGroupCode?: string | null; permissions?: string[] }): boolean => {
  return userHasCatalogPermission(user, ['VIEW_PERFORMANCE', 'VIEW_REPORTS']);
};

/**
 * Lấy cấu hình thời hạn marketing được hưởng doanh số
 */
const getMarketingRevenueDays = async (): Promise<number> => {
  const config = await prisma.systemConfig.findFirst({
    where: { key: 'marketing_revenue_attribution_days' }
  });
  return config ? parseInt(config.value) : 45;
};

// ==================== MARKETING PERFORMANCE ====================

/**
 * Xếp hạng Marketing theo hiệu suất
 */
export const getMarketingPerformance = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate, employeeId } = req.query;
    
    const isExec = canViewAllPerformanceRows(user);
    const subordinates = await getSubordinateIds(user.id);
    
    // Lấy danh sách nhân viên Marketing (dùng nguồn chân lý chung)
    let marketingEmployees = await prisma.employee.findMany({
      where: marketingEmployeeWhere(),
      select: {
        id: true,
        code: true,
        fullName: true,
        avatarUrl: true,
        department: { select: { name: true } }
      }
    });
    
    // Phân quyền
    if (!isExec) {
      if (employeeId) {
        // Kiểm tra quyền xem nhân viên cụ thể
        if (employeeId !== user.id && !subordinates.includes(employeeId as string)) {
          return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này' });
        }
        marketingEmployees = marketingEmployees.filter(e => e.id === employeeId);
      } else {
        // Chỉ xem của mình và cấp dưới
        marketingEmployees = marketingEmployees.filter(
          e => e.id === user.id || subordinates.includes(e.id)
        );
      }
    }
    
    const marketingRevenueDays = await getMarketingRevenueDays();
    const revenueDeadline = new Date();
    revenueDeadline.setDate(revenueDeadline.getDate() - marketingRevenueDays);
    
    // Tính hiệu suất cho từng nhân viên
    const performances = await Promise.all(marketingEmployees.map(async (emp) => {
      // Số lead tạo
      const leadsCreated = await prisma.customer.count({
        where: {
          marketingOwnerId: emp.id,
          createdAt: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        }
      });
      
      // Số lead chuyển đổi (có đơn hàng)
      const leadsConverted = await prisma.customer.count({
        where: {
          marketingOwnerId: emp.id,
          totalOrders: { gt: 0 },
          createdAt: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        }
      });
      
      // Doanh số từ đơn ĐẦU TIÊN của lead (trong thời hạn marketing được hưởng)
      const salesRevenueResult = await prisma.order.aggregate({
        where: {
          customer: {
            marketingOwnerId: emp.id,
            attributionExpiredAt: { gt: new Date() }
          },
          isFirstOrder: true,
          shippingStatus: 'DELIVERED',
          orderDate: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        },
        _sum: { finalAmount: true }
      });

      // Doanh số từ đơn MUA LẠI (2+ trở đi) trong thời hạn marketing được hưởng
      const resalesRevenueResult = await prisma.order.aggregate({
        where: {
          customer: {
            marketingOwnerId: emp.id,
            attributionExpiredAt: { gt: new Date() }
          },
          isFirstOrder: false,
          shippingStatus: 'DELIVERED',
          orderDate: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        },
        _sum: { finalAmount: true }
      });

      const salesRevenue = Number(salesRevenueResult._sum.finalAmount || 0);
      const resalesRevenue = Number(resalesRevenueResult._sum.finalAmount || 0);
      const totalRevenue = salesRevenue + resalesRevenue;

      const conversionRate = leadsCreated > 0 ? (leadsConverted / leadsCreated * 100) : 0;
      
      return {
        employee: emp,
        leadsCreated,
        leadsConverted,
        conversionRate: Math.round(conversionRate * 100) / 100,
        salesRevenue,
        resalesRevenue,
        revenue: totalRevenue,
        revenuePerLead: leadsCreated > 0 ? Math.round(totalRevenue / leadsCreated) : 0
      };
    }));
    
    // Sắp xếp theo doanh số
    performances.sort((a, b) => b.revenue - a.revenue);
    
    // Thêm ranking
    const rankedPerformances = performances.map((p, index) => ({
      ...p,
      rank: index + 1
    }));
    
    res.json({
      performances: rankedPerformances,
      summary: {
        totalLeads: performances.reduce((sum, p) => sum + p.leadsCreated, 0),
        totalConverted: performances.reduce((sum, p) => sum + p.leadsConverted, 0),
        totalSalesRevenue: performances.reduce((sum, p) => sum + p.salesRevenue, 0),
        totalResalesRevenue: performances.reduce((sum, p) => sum + p.resalesRevenue, 0),
        totalRevenue: performances.reduce((sum, p) => sum + p.revenue, 0),
        avgConversionRate: performances.length > 0
          ? Math.round(performances.reduce((sum, p) => sum + p.conversionRate, 0) / performances.length * 100) / 100
          : 0
      }
    });
  } catch (error) {
    console.error('Get marketing performance error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo hiệu suất Marketing' });
  }
};

// ==================== SALES PERFORMANCE ====================

/**
 * Xếp hạng Sales theo doanh số
 */
export const getSalesPerformance = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate, employeeId } = req.query;

    const scope = await resolveEffectivenessReportScope(user.id, user.roleGroupCode, user.permissions);

    // Lấy danh sách nhân viên Sales (dùng nguồn chân lý chung)
    let salesEmployees = await prisma.employee.findMany({
      where: salesEmployeeWhere(),
      select: {
        id: true,
        code: true,
        fullName: true,
        avatarUrl: true,
        department: { select: { name: true } }
      }
    });

    if (scope.allowedEmployeeIds !== null) {
      salesEmployees = salesEmployees.filter((e) => scope.allowedEmployeeIds!.includes(e.id));
    }

    if (employeeId) {
      if (scope.allowedEmployeeIds !== null && !scope.allowedEmployeeIds.includes(employeeId as string)) {
        return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo cho nhân viên này' });
      }
      salesEmployees = salesEmployees.filter((e) => e.id === employeeId);
    }
    
    // Tính hiệu suất cho từng nhân viên
    const performances = await Promise.all(salesEmployees.map(async (emp) => {
      // Số khách hàng phụ trách
      const customersCount = await prisma.customer.count({
        where: { employeeId: emp.id }
      });
      
      // Số đơn hàng tạo
      const ordersCreated = await prisma.order.count({
        where: {
          salesEmployeeId: emp.id,
          isFirstOrder: true,
          orderDate: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        }
      });
      
      // Doanh số (chỉ tính khi khách đã nhận hàng)
      const revenueResult = await prisma.order.aggregate({
        where: {
          salesEmployeeId: emp.id,
          isFirstOrder: true,
          shippingStatus: 'DELIVERED',
          orderDate: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        },
        _sum: { finalAmount: true }
      });
      
      const revenue = revenueResult._sum.finalAmount || new Decimal(0);
      
      return {
        employee: emp,
        customersCount,
        ordersCreated,
        revenue: Number(revenue),
        avgOrderValue: ordersCreated > 0 ? Math.round(Number(revenue) / ordersCreated) : 0
      };
    }));
    
    // Sắp xếp theo doanh số
    performances.sort((a, b) => b.revenue - a.revenue);
    
    const rankedPerformances = performances.map((p, index) => ({
      ...p,
      rank: index + 1
    }));
    
    res.json({
      scopeMode: scope.scopeMode,
      scopeDescription: scope.scopeDescriptionVi,
      performances: rankedPerformances,
      summary: {
        totalCustomers: performances.reduce((sum, p) => sum + p.customersCount, 0),
        totalOrders: performances.reduce((sum, p) => sum + p.ordersCreated, 0),
        totalRevenue: performances.reduce((sum, p) => sum + p.revenue, 0)
      }
    });
  } catch (error) {
    console.error('Get sales performance error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo hiệu suất Sales' });
  }
};

// ==================== RESALES PERFORMANCE ====================

/**
 * Xếp hạng Resales (CSKH) theo doanh số
 */
export const getResalesPerformance = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate, employeeId } = req.query;

    const scope = await resolveEffectivenessReportScope(user.id, user.roleGroupCode, user.permissions);

    // Lấy danh sách nhân viên Resales (dùng nguồn chân lý chung)
    let resalesEmployees = await prisma.employee.findMany({
      where: resalesEmployeeWhere(),
      select: {
        id: true,
        code: true,
        fullName: true,
        avatarUrl: true,
        department: { select: { name: true } }
      }
    });

    if (scope.allowedEmployeeIds !== null) {
      resalesEmployees = resalesEmployees.filter((e) => scope.allowedEmployeeIds!.includes(e.id));
    }

    if (employeeId) {
      if (scope.allowedEmployeeIds !== null && !scope.allowedEmployeeIds.includes(employeeId as string)) {
        return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo cho nhân viên này' });
      }
      resalesEmployees = resalesEmployees.filter((e) => e.id === employeeId);
    }
    
    // Tính hiệu suất cho từng nhân viên
    const performances = await Promise.all(resalesEmployees.map(async (emp) => {
      // Số khách hàng đang chăm sóc
      const customersCount = await prisma.customer.count({
        where: { employeeId: emp.id }
      });
      
      // Số đơn mua lại
      const repeatOrders = await prisma.order.count({
        where: {
          resalesEmployeeId: emp.id,
          isFirstOrder: false,
          orderDate: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        }
      });
      
      // Doanh số từ đơn mua lại
      const revenueResult = await prisma.order.aggregate({
        where: {
          resalesEmployeeId: emp.id,
          isFirstOrder: false,
          shippingStatus: 'DELIVERED',
          orderDate: {
            gte: startDate ? new Date(startDate as string) : undefined,
            lte: endDate ? new Date(endDate as string) : undefined
          }
        },
        _sum: { finalAmount: true }
      });
      
      const revenue = revenueResult._sum.finalAmount || new Decimal(0);
      
      return {
        employee: emp,
        customersCount,
        repeatOrders,
        revenue: Number(revenue),
        avgOrderValue: repeatOrders > 0 ? Math.round(Number(revenue) / repeatOrders) : 0
      };
    }));
    
    // Sắp xếp theo doanh số
    performances.sort((a, b) => b.revenue - a.revenue);
    
    const rankedPerformances = performances.map((p, index) => ({
      ...p,
      rank: index + 1
    }));
    
    res.json({
      scopeMode: scope.scopeMode,
      scopeDescription: scope.scopeDescriptionVi,
      performances: rankedPerformances,
      summary: {
        totalCustomers: performances.reduce((sum, p) => sum + p.customersCount, 0),
        totalRepeatOrders: performances.reduce((sum, p) => sum + p.repeatOrders, 0),
        totalRevenue: performances.reduce((sum, p) => sum + p.revenue, 0)
      }
    });
  } catch (error) {
    console.error('Get resales performance error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo hiệu suất Resales' });
  }
};

// ==================== DASHBOARD & TARGETS ====================

/**
 * Lấy mục tiêu kinh doanh
 */
export const getSalesTargets = async (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();
    
    const targets = await prisma.salesTarget.findMany({
      where: { year: currentYear }
    });
    
    // Lấy danh sách khối có nhân viên kinh doanh (Marketing/Sales/Resales - cùng chuẩn nhận diện)
    const perfOrgId = await getDefaultOrganizationId();
    const divisionsWithSales = perfOrgId
      ? await prisma.department.findMany({
          where: { type: 'DIVISION', organizationId: perfOrgId },
          select: { id: true, name: true },
        })
      : [];
    
    res.json({
      year: currentYear,
      targets,
      divisionsWithSales
    });
  } catch (error) {
    console.error('Get sales targets error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy mục tiêu kinh doanh' });
  }
};

/**
 * Cập nhật mục tiêu kinh doanh (ADM only)
 */
export const updateSalesTarget = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!canEditSalesTargets(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật mục tiêu (cần CONFIG_OPERATIONS hoặc EDIT_SETTINGS).' });
    }
    
    const { year, divisionId, annualTarget, q1Target, q2Target, q3Target, q4Target, note } = req.body;
    
    const target = await prisma.salesTarget.upsert({
      where: {
        year_departmentId: {
          year: year || new Date().getFullYear(),
          departmentId: divisionId || null
        }
      },
      update: {
        annualTarget,
        q1Target,
        q2Target,
        q3Target,
        q4Target,
        note
      },
      create: {
        year: year || new Date().getFullYear(),
        departmentId: divisionId || null,
        annualTarget: annualTarget || 1000000000, // Mặc định 1 tỷ
        q1Target,
        q2Target,
        q3Target,
        q4Target,
        note,
        createdBy: user.id
      }
    });
    
    res.json(target);
  } catch (error) {
    console.error('Update sales target error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật mục tiêu kinh doanh' });
  }
};

/**
 * Lấy tiến trình doanh số cho Dashboard
 */
export const getDashboardProgress = async (req: Request, res: Response) => {
  try {
    const { year, divisionId } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();
    const today = new Date();
    
    // Lấy mục tiêu
    const target = await prisma.salesTarget.findFirst({
      where: {
        year: currentYear,
        departmentId: divisionId as string || null
      }
    });
    
    const annualTarget = target?.annualTarget ? Number(target.annualTarget) : 0;
    
    // Tính mục tiêu theo ngày/tuần/tháng
    const daysInYear = 365;
    const weeksInYear = 52;
    const monthsInYear = 12;
    
    const dailyTarget = annualTarget > 0 ? annualTarget / daysInYear : 0;
    const weeklyTarget = annualTarget > 0 ? annualTarget / weeksInYear : 0;
    const monthlyTarget = annualTarget > 0 ? annualTarget / monthsInYear : 0;
    
    // Tính doanh số thực tế
    const startOfYear = new Date(currentYear, 0, 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    
    // Doanh số năm
    const yearRevenue = await prisma.order.aggregate({
      where: {
        shippingStatus: 'DELIVERED',
        orderDate: { gte: startOfYear }
      },
      _sum: { finalAmount: true }
    });
    
    // Doanh số tháng
    const monthRevenue = await prisma.order.aggregate({
      where: {
        shippingStatus: 'DELIVERED',
        orderDate: { gte: startOfMonth }
      },
      _sum: { finalAmount: true }
    });
    
    // Doanh số tuần
    const weekRevenue = await prisma.order.aggregate({
      where: {
        shippingStatus: 'DELIVERED',
        orderDate: { gte: startOfWeek }
      },
      _sum: { finalAmount: true }
    });
    
    // Doanh số ngày
    const dayRevenue = await prisma.order.aggregate({
      where: {
        shippingStatus: 'DELIVERED',
        orderDate: { gte: startOfDay }
      },
      _sum: { finalAmount: true }
    });
    
    const yearActual = Number(yearRevenue._sum.finalAmount || 0);
    const monthActual = Number(monthRevenue._sum.finalAmount || 0);
    const weekActual = Number(weekRevenue._sum.finalAmount || 0);
    const dayActual = Number(dayRevenue._sum.finalAmount || 0);
    
    // Tính số ngày/tuần/tháng đã qua
    const dayOfYear = Math.ceil((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const weekOfYear = Math.ceil(dayOfYear / 7);
    const monthOfYear = today.getMonth() + 1;
    
    res.json({
      year: currentYear,
      targets: {
        annual: annualTarget,
        monthly: monthlyTarget,
        weekly: weeklyTarget,
        daily: dailyTarget
      },
      actual: {
        year: yearActual,
        month: monthActual,
        week: weekActual,
        day: dayActual
      },
      progress: {
        year: annualTarget > 0 ? Math.round((yearActual / annualTarget) * 100 * 100) / 100 : 0,
        month: monthlyTarget > 0 ? Math.round((monthActual / monthlyTarget) * 100 * 100) / 100 : 0,
        week: weeklyTarget > 0 ? Math.round((weekActual / weeklyTarget) * 100 * 100) / 100 : 0,
        day: dailyTarget > 0 ? Math.round((dayActual / dailyTarget) * 100 * 100) / 100 : 0,
      },
      expectedProgress: {
        year: Math.round(dayOfYear / daysInYear * 100 * 100) / 100,
        month: Math.round(today.getDate() / 30 * 100 * 100) / 100,
        week: Math.round((today.getDay() + 1) / 7 * 100 * 100) / 100
      }
    });
  } catch (error) {
    console.error('Get dashboard progress error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy tiến trình doanh số' });
  }
};

// ==================== COMPREHENSIVE REPORT ====================

/**
 * Báo cáo tổng hợp hiệu suất (VIEW_PERFORMANCE / VIEW_REPORTS hoặc quản trị hệ thống)
 */
export const getComprehensiveReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!canViewAllPerformanceRows(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_PERFORMANCE hoặc VIEW_REPORTS).' });
    }
    
    const { startDate, endDate } = req.query;
    
    // Tổng quan
    const totalCustomers = await prisma.customer.count();
    const totalOrders = await prisma.order.count({
      where: {
        orderDate: {
          gte: startDate ? new Date(startDate as string) : undefined,
          lte: endDate ? new Date(endDate as string) : undefined
        }
      }
    });
    
    const totalRevenue = await prisma.order.aggregate({
      where: {
        shippingStatus: 'DELIVERED',
        orderDate: {
          gte: startDate ? new Date(startDate as string) : undefined,
          lte: endDate ? new Date(endDate as string) : undefined
        }
      },
      _sum: { finalAmount: true }
    });
    
    // Top Marketing
    const topMarketing = await prisma.customer.groupBy({
      by: ['marketingOwnerId'],
      where: {
        marketingOwnerId: { not: null },
        totalOrders: { gt: 0 }
      },
      _count: { id: true }
    });
    
    // Top Sales
    const topSales = await prisma.order.groupBy({
      by: ['salesEmployeeId'],
      where: {
        salesEmployeeId: { not: null },
        shippingStatus: 'DELIVERED',
        isFirstOrder: true
      },
      _sum: { finalAmount: true },
      _count: { id: true }
    });
    
    // Top Resales
    const topResales = await prisma.order.groupBy({
      by: ['resalesEmployeeId'],
      where: {
        resalesEmployeeId: { not: null },
        shippingStatus: 'DELIVERED',
        isFirstOrder: false
      },
      _sum: { finalAmount: true },
      _count: { id: true }
    });
    
    res.json({
      overview: {
        totalCustomers,
        totalOrders,
        totalRevenue: Number(totalRevenue._sum.finalAmount || 0)
      },
      topMarketing: topMarketing.slice(0, 10),
      topSales: topSales.slice(0, 10),
      topResales: topResales.slice(0, 10)
    });
  } catch (error) {
    console.error('Get comprehensive report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo tổng hợp' });
  }
};
