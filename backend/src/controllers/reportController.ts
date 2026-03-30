import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { userHasCatalogPermission } from '../constants/rbac';
import { getCompanyRootForOrg, getKagriOrganizationId } from '../utils/organizationHelper';

// Helper to convert BigInt to Number in raw query results
const convertBigInt = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = convertBigInt(obj[key]);
    }
    return result;
  }
  return obj;
};

/** Báo cáo doanh thu tổng hợp: VIEW_REPORTS / VIEW_PERFORMANCE hoặc quản trị hệ thống. */
const canViewExecutiveReports = (user: {
  roleGroupCode?: string | null;
  permissions?: string[];
}): boolean => {
  return userHasCatalogPermission(user, ['VIEW_REPORTS', 'VIEW_PERFORMANCE']);
};

// ==================== BÁO CÁO DOANH THU ====================

/**
 * Báo cáo doanh thu tổng hợp
 */
export const getRevenueReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { 
      startDate, 
      endDate, 
      period = 'month',
      employeeId,
      tagId 
    } = req.query;

    if (!canViewExecutiveReports(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_REPORTS hoặc VIEW_PERFORMANCE).' });
    }

    // Build where clause for Prisma
    const where: any = {
      shippingStatus: 'DELIVERED'
    };

    if (startDate) {
      where.deliveredAt = { ...where.deliveredAt, gte: new Date(startDate as string) };
    }
    if (endDate) {
      where.deliveredAt = { ...where.deliveredAt, lte: new Date(endDate as string) };
    }
    if (employeeId) {
      where.OR = [
        { salesEmployeeId: employeeId },
        { resalesEmployeeId: employeeId },
        { employeeId: employeeId }
      ];
    }
    if (tagId) {
      where.customer = {
        tags: {
          some: { tagId: tagId }
        }
      };
    }

    // Tổng doanh thu
    const totalRevenue = await prisma.order.aggregate({
      where,
      _sum: { finalAmount: true },
      _count: { id: true }
    });

    // Doanh thu theo KHỐI - simple query without date filter
    const revenueByDivision = await prisma.$queryRaw`
      SELECT 
        d.id as division_id,
        d.name as division_name,
        d.function as division_type,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue
      FROM orders o
      JOIN employees e ON (o.sales_employee_id = e.id OR o.resales_employee_id = e.id OR o.employee_id = e.id)
      JOIN departments dept ON e.department_id = dept.id
      LEFT JOIN departments d ON (dept.parent_id = d.id OR dept.id = d.id) AND d.type = 'DIVISION'
      WHERE o.shipping_status = 'DELIVERED'
      GROUP BY d.id, d.name, d.function
      ORDER BY revenue DESC
    `;

    // Doanh thu theo thời gian
    let revenueByPeriod: any[] = [];
    
    if (period === 'day') {
      revenueByPeriod = await prisma.$queryRaw`
        SELECT 
          DATE(delivered_at) as period,
          COUNT(*) as order_count,
          COALESCE(SUM(final_amount), 0) as revenue
        FROM orders
        WHERE shipping_status = 'DELIVERED'
          AND delivered_at IS NOT NULL
        GROUP BY DATE(delivered_at)
        ORDER BY period DESC
        LIMIT 30
      `;
    } else if (period === 'week') {
      revenueByPeriod = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('week', delivered_at) as period,
          COUNT(*) as order_count,
          COALESCE(SUM(final_amount), 0) as revenue
        FROM orders
        WHERE shipping_status = 'DELIVERED'
          AND delivered_at IS NOT NULL
        GROUP BY DATE_TRUNC('week', delivered_at)
        ORDER BY period DESC
        LIMIT 12
      `;
    } else {
      revenueByPeriod = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', delivered_at) as period,
          COUNT(*) as order_count,
          COALESCE(SUM(final_amount), 0) as revenue
        FROM orders
        WHERE shipping_status = 'DELIVERED'
          AND delivered_at IS NOT NULL
        GROUP BY DATE_TRUNC('month', delivered_at)
        ORDER BY period DESC
        LIMIT 12
      `;
    }

    res.json(convertBigInt({
      summary: {
        totalRevenue: Number(totalRevenue._sum.finalAmount || 0),
        totalOrders: totalRevenue._count.id || 0,
        avgOrderValue: totalRevenue._count.id > 0 
          ? Math.round(Number(totalRevenue._sum.finalAmount || 0) / totalRevenue._count.id)
          : 0
      },
      byDivision: revenueByDivision,
      byPeriod: revenueByPeriod
    }));
  } catch (error) {
    console.error('Get revenue report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo doanh thu' });
  }
};

// ==================== BÁO CÁO CHI PHÍ ====================

/**
 * Báo cáo chi phí Marketing
 */
export const getCostReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate, campaignId } = req.query;

    if (!canViewExecutiveReports(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_REPORTS hoặc VIEW_PERFORMANCE).' });
    }

    const where: any = {};
    if (startDate) {
      where.costDate = { ...where.costDate, gte: new Date(startDate as string) };
    }
    if (endDate) {
      where.costDate = { ...where.costDate, lte: new Date(endDate as string) };
    }
    if (campaignId) {
      where.campaignId = campaignId;
    }

    // Tổng chi phí Marketing
    const totalCost = await prisma.marketingCampaignCost.aggregate({
      where,
      _sum: { amount: true }
    });

    // Chi phí theo loại
    const costByType = await prisma.marketingCampaignCost.groupBy({
      by: ['costType'],
      where,
      _sum: { amount: true }
    });

    res.json(convertBigInt({
      summary: {
        totalCost: Number(totalCost._sum.amount || 0)
      },
      byType: costByType
    }));
  } catch (error) {
    console.error('Get cost report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo chi phí' });
  }
};

// ==================== TOP NHÂN VIÊN KINH DOANH ====================

/**
 * Báo cáo top nhân viên kinh doanh
 */
export const getTopSalesReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { limit = 20 } = req.query;

    if (!canViewExecutiveReports(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_REPORTS hoặc VIEW_PERFORMANCE).' });
    }

    const limitNum = Number(limit);

    // Top Sales (đơn đầu tiên)
    const topSales = await prisma.$queryRaw`
      SELECT 
        e.id,
        e.code,
        e.full_name,
        e.avatar_url,
        d.name as division_name,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue
      FROM orders o
      JOIN employees e ON o.sales_employee_id = e.id
      JOIN departments dept ON e.department_id = dept.id
      LEFT JOIN departments d ON (dept.parent_id = d.id OR dept.id = d.id) AND d.type = 'DIVISION'
      WHERE o.shipping_status = 'DELIVERED'
        AND o.is_first_order = true
      GROUP BY e.id, e.code, e.full_name, e.avatar_url, d.name
      ORDER BY revenue DESC
      LIMIT ${limitNum}
    `;

    // Top Resales (đơn mua lại)
    const topResales = await prisma.$queryRaw`
      SELECT 
        e.id,
        e.code,
        e.full_name,
        e.avatar_url,
        d.name as division_name,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue
      FROM orders o
      JOIN employees e ON o.resales_employee_id = e.id
      JOIN departments dept ON e.department_id = dept.id
      LEFT JOIN departments d ON (dept.parent_id = d.id OR dept.id = d.id) AND d.type = 'DIVISION'
      WHERE o.shipping_status = 'DELIVERED'
        AND o.is_first_order = false
      GROUP BY e.id, e.code, e.full_name, e.avatar_url, d.name
      ORDER BY revenue DESC
      LIMIT ${limitNum}
    `;

    // Top Marketing (theo số lead chuyển đổi)
    const topMarketing = await prisma.$queryRaw`
      SELECT 
        e.id,
        e.code,
        e.full_name,
        e.avatar_url,
        d.name as division_name,
        COUNT(DISTINCT c.id) as leads_count,
        COUNT(DISTINCT CASE WHEN c.total_orders > 0 THEN c.id END) as converted_count,
        COALESCE(SUM(c.total_orders_value), 0) as revenue
      FROM customers c
      JOIN employees e ON c.marketing_owner_id = e.id
      JOIN departments dept ON e.department_id = dept.id
      LEFT JOIN departments d ON (dept.parent_id = d.id OR dept.id = d.id) AND d.type = 'DIVISION'
      WHERE c.marketing_owner_id IS NOT NULL
      GROUP BY e.id, e.code, e.full_name, e.avatar_url, d.name
      ORDER BY revenue DESC
      LIMIT ${limitNum}
    `;

    res.json(convertBigInt({
      topSales: (topSales as any[]).map((e, i) => ({ ...e, rank: i + 1 })),
      topResales: (topResales as any[]).map((e, i) => ({ ...e, rank: i + 1 })),
      topMarketing: (topMarketing as any[]).map((e, i) => ({ ...e, rank: i + 1 }))
    }));
  } catch (error) {
    console.error('Get top sales report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo top nhân viên' });
  }
};

// ==================== BÁO CÁO TĂNG TRƯỞNG ====================

/**
 * Báo cáo tăng trưởng khách hàng
 */
export const getGrowthReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!canViewExecutiveReports(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_REPORTS hoặc VIEW_PERFORMANCE).' });
    }

    // Tăng trưởng khách hàng theo tháng
    const customerGrowth = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', joined_date) as period,
        COUNT(*) as new_customers,
        COUNT(CASE WHEN total_orders > 0 THEN 1 END) as converted_customers
      FROM customers
      WHERE joined_date >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', joined_date)
      ORDER BY period DESC
    `;

    // Sản phẩm mới
    const newProducts = await prisma.product.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
      },
      select: {
        id: true,
        code: true,
        name: true,
        thumbnail: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Tổng quan
    const totalCustomers = await prisma.customer.count();
    const totalProducts = await prisma.product.count();
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    
    const thisMonthCustomers = await prisma.customer.count({
      where: { joinedDate: { gte: thisMonthStart } }
    });
    const lastMonthCustomers = await prisma.customer.count({
      where: {
        joinedDate: {
          gte: lastMonthStart,
          lt: thisMonthStart
        }
      }
    });

    const customerGrowthRate = lastMonthCustomers > 0 
      ? ((thisMonthCustomers - lastMonthCustomers) / lastMonthCustomers * 100).toFixed(1)
      : 0;

    res.json(convertBigInt({
      summary: {
        totalCustomers,
        totalProducts,
        thisMonthCustomers,
        lastMonthCustomers,
        customerGrowthRate
      },
      customerGrowth,
      newProducts
    }));
  } catch (error) {
    console.error('Get growth report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo tăng trưởng' });
  }
};

// ==================== BÁO CÁO THEO CÂY TRỒNG ====================

/**
 * Báo cáo theo cây trồng
 */
export const getCropReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!canViewExecutiveReports(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_REPORTS hoặc VIEW_PERFORMANCE).' });
    }

    // Số khách hàng theo cây trồng
    const customersByCrop = await prisma.$queryRaw`
      SELECT 
        unnest(main_crops) as crop,
        COUNT(DISTINCT c.id) as customer_count,
        COALESCE(SUM(c.total_orders_value), 0) as total_revenue,
        COUNT(DISTINCT CASE WHEN c.total_orders > 0 THEN c.id END) as converted_count
      FROM customers c
      WHERE main_crops IS NOT NULL AND array_length(main_crops, 1) > 0
      GROUP BY crop
      ORDER BY total_revenue DESC
    `;

    // Doanh thu theo cây trồng
    const revenueByCrop = await prisma.$queryRaw`
      SELECT 
        unnest(c.main_crops) as crop,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.shipping_status = 'DELIVERED'
        AND c.main_crops IS NOT NULL
      GROUP BY crop
      ORDER BY revenue DESC
      LIMIT 20
    `;

    res.json(convertBigInt({
      customersByCrop,
      revenueByCrop
    }));
  } catch (error) {
    console.error('Get crop report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo theo cây trồng' });
  }
};

// ==================== BÁO CÁO THEO VÙNG MIỀN ====================

/**
 * Báo cáo theo vùng miền
 */
export const getRegionReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!canViewExecutiveReports(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_REPORTS hoặc VIEW_PERFORMANCE).' });
    }

    // Khách hàng theo vùng miền
    const customersByRegion = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN p.name IN ('Hà Nội', 'Hải Phòng', 'Bắc Giang', 'Bắc Ninh', 'Hà Nam', 'Hải Dương', 'Hưng Yên', 'Nam Định', 'Ninh Bình', 'Phú Thọ', 'Quảng Ninh', 'Thái Bình', 'Thái Nguyên', 'Vĩnh Phúc', 'Bắc Kạn', 'Cao Bằng', 'Điện Biên', 'Hà Giang', 'Hòa Bình', 'Lai Châu', 'Lạng Sơn', 'Lào Cai', 'Sơn La', 'Tuyên Quang', 'Yên Bái') THEN 'Miền Bắc'
          WHEN p.name IN ('Đà Nẵng', 'Bình Định', 'Bình Thuận', 'Khánh Hòa', 'Nghệ An', 'Ninh Thuận', 'Phú Yên', 'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Trị', 'Thanh Hóa', 'Thừa Thiên Huế', 'Hà Tĩnh') THEN 'Miền Trung'
          WHEN p.name IN ('Đắk Lắk', 'Đắk Nông', 'Gia Lai', 'Kon Tum', 'Lâm Đồng') THEN 'Tây Nguyên'
          WHEN p.name IN ('TP. Hồ Chí Minh', 'Cần Thơ', 'An Giang', 'Bà Rịa - Vũng Tàu', 'Bạc Liêu', 'Bến Tre', 'Bình Dương', 'Bình Phước', 'Cà Mau', 'Đồng Nai', 'Đồng Tháp', 'Hậu Giang', 'Kiên Giang', 'Long An', 'Sóc Trăng', 'Tây Ninh', 'Tiền Giang', 'Trà Vinh', 'Vĩnh Long') THEN 'Miền Nam'
          ELSE 'Khác'
        END as region,
        COUNT(DISTINCT c.id) as customer_count,
        COALESCE(SUM(c.total_orders_value), 0) as total_revenue,
        COUNT(DISTINCT CASE WHEN c.total_orders > 0 THEN c.id END) as converted_count
      FROM customers c
      LEFT JOIN provinces p ON c.province_id = p.id
      GROUP BY region
      ORDER BY total_revenue DESC
    `;

    // Doanh thu theo tỉnh thành
    const revenueByProvince = await prisma.$queryRaw`
      SELECT 
        p.name as province,
        COUNT(DISTINCT c.id) as customer_count,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.final_amount), 0) as revenue
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN provinces p ON c.province_id = p.id
      WHERE o.shipping_status = 'DELIVERED' AND p.name IS NOT NULL
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 20
    `;

    res.json(convertBigInt({
      byRegion: customersByRegion,
      byProvince: revenueByProvince
    }));
  } catch (error) {
    console.error('Get region report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo theo vùng miền' });
  }
};

// ==================== BÁO CÁO THEO LOẠI KHÁCH HÀNG ====================

/**
 * Báo cáo theo loại khách hàng (Cá nhân, HTX, Doanh nghiệp)
 */
export const getBusinessTypeReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!canViewExecutiveReports(user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo này (cần VIEW_REPORTS hoặc VIEW_PERFORMANCE).' });
    }

    // Thống kê theo loại khách hàng
    const byBusinessType = await prisma.$queryRaw`
      SELECT 
        COALESCE(business_type, 'INDIVIDUAL') as business_type,
        COUNT(*) as customer_count,
        COALESCE(SUM(total_orders_value), 0) as total_revenue,
        COALESCE(AVG(total_orders_value), 0) as avg_revenue,
        COUNT(CASE WHEN total_orders > 0 THEN 1 END) as converted_count,
        COALESCE(AVG(farm_area), 0) as avg_farm_area
      FROM customers
      GROUP BY business_type
      ORDER BY total_revenue DESC
    `;

    // Top khách hàng doanh nghiệp
    const topCompanies = await prisma.customer.findMany({
      where: { businessType: 'COMPANY' },
      orderBy: { totalOrdersValue: 'desc' },
      take: 10,
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        farmName: true,
        farmArea: true,
        mainCrops: true,
        totalOrders: true,
        totalOrdersValue: true
      }
    });

    // Top HTX
    const topCooperatives = await prisma.customer.findMany({
      where: { businessType: 'COOPERATIVE' },
      orderBy: { totalOrdersValue: 'desc' },
      take: 10,
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        farmName: true,
        farmArea: true,
        mainCrops: true,
        totalOrders: true,
        totalOrdersValue: true
      }
    });

    res.json(convertBigInt({
      summary: byBusinessType,
      topCompanies,
      topCooperatives
    }));
  } catch (error) {
    console.error('Get business type report error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo theo loại khách hàng' });
  }
};

// ==================== MỤC TIÊU KINH DOANH THEO KHỐI ====================

/**
 * Lấy mục tiêu và tiến trình tất cả các KHỐI
 */
export const getDivisionTargetsProgress = async (req: Request, res: Response) => {
  try {
    const { year, divisionId: divisionIdQuery } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();

    const repOrgId = await getKagriOrganizationId();
    const divisions = repOrgId
      ? await (async () => {
          const companyRoot = await getCompanyRootForOrg(repOrgId);
          return prisma.department.findMany({
            where: {
              type: 'DIVISION',
              organizationId: repOrgId,
              parentId: companyRoot.id,
            },
            orderBy: { displayOrder: 'asc' },
          });
        })()
      : [];

    const divisionIds = divisions.map((d) => d.id);
    const targets =
      divisionIds.length > 0
        ? await prisma.salesTarget.findMany({
            where: { year: currentYear, departmentId: { in: divisionIds } },
          })
        : [];

    // Tính doanh số thực tế cho từng KHỐI
    const results = await Promise.all(divisions.map(async (div) => {
      const target = targets.find(t => t.departmentId === div.id);
      
      // Tính doanh số thực tế cho từng KHỐI — chia 3 trường Sales / Resales / Tổng
      const [salesRevResult, resalesRevResult] = await Promise.all([
        // Doanh thu Sales: đơn đầu tiên (isFirstOrder=true) do NV thuộc KHỐI này chốt
        prisma.$queryRaw<{ revenue: number }[]>`
          SELECT COALESCE(SUM(o.final_amount), 0) as revenue
          FROM orders o
          WHERE o.sales_employee_id IN (
            SELECT e.id FROM employees e
            JOIN departments dept ON e.department_id = dept.id
            WHERE (dept.id = ${div.id} OR dept.parent_id = ${div.id})
          )
          AND o.is_first_order = true
          AND o.shipping_status = 'DELIVERED'
          AND EXTRACT(YEAR FROM o.delivered_at) = ${currentYear}
        `,
        // Doanh thu Resales: đơn 2+ (isFirstOrder=false) do NV thuộc KHỐI này chốt
        prisma.$queryRaw<{ revenue: number }[]>`
          SELECT COALESCE(SUM(o.final_amount), 0) as revenue
          FROM orders o
          WHERE o.resales_employee_id IN (
            SELECT e.id FROM employees e
            JOIN departments dept ON e.department_id = dept.id
            WHERE (dept.id = ${div.id} OR dept.parent_id = ${div.id})
          )
          AND o.is_first_order = false
          AND o.shipping_status = 'DELIVERED'
          AND EXTRACT(YEAR FROM o.delivered_at) = ${currentYear}
        `
      ]);

      const salesRevenue = Number(salesRevResult[0]?.revenue || 0);
      const resalesRevenue = Number(resalesRevResult[0]?.revenue || 0);
      const actualRevenue = salesRevenue + resalesRevenue;
      const annualTarget = target ? Number(target.annualTarget) : 0;
      const progress = annualTarget > 0 ? (actualRevenue / annualTarget * 100) : 0;

      return {
        division: {
          id: div.id,
          code: div.code,
          name: div.name,
          divisionType: div.function,
          status: 'ACTIVE',
          hasMarketing: true,
          hasSales: true,
          hasResales: true
        },
        target: {
          annual: annualTarget,
          q1: target ? Number(target.q1Target || 0) : 0,
          q2: target ? Number(target.q2Target || 0) : 0,
          q3: target ? Number(target.q3Target || 0) : 0,
          q4: target ? Number(target.q4Target || 0) : 0,
          note: target?.revenueCalculationNote || target?.note
        },
        salesRevenue,
        resalesRevenue,
        actual: actualRevenue,
        progress: Math.round(progress * 100) / 100,
        remaining: Math.max(0, annualTarget - actualRevenue)
      };
    }));

    const divisionIdFilter =
      typeof divisionIdQuery === 'string' && divisionIdQuery.trim() ? divisionIdQuery.trim() : '';
    const filteredResults = divisionIdFilter
      ? results.filter((r) => r.division.id === divisionIdFilter)
      : results;

    // Tổng hợp
    const totalTarget = filteredResults.reduce((sum, r) => sum + r.target.annual, 0);
    const totalSalesRevenue = filteredResults.reduce((sum, r) => sum + r.salesRevenue, 0);
    const totalResalesRevenue = filteredResults.reduce((sum, r) => sum + r.resalesRevenue, 0);
    const totalActual = filteredResults.reduce((sum, r) => sum + r.actual, 0);
    const totalProgress = totalTarget > 0 ? (totalActual / totalTarget * 100) : 0;

    res.json(convertBigInt({
      year: currentYear,
      divisions: filteredResults,
      summary: {
        totalTarget,
        totalSalesRevenue,
        totalResalesRevenue,
        totalActual,
        totalProgress: Math.round(totalProgress * 100) / 100,
        totalRemaining: Math.max(0, totalTarget - totalActual)
      }
    }));
  } catch (error) {
    console.error('Get division targets progress error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy tiến trình mục tiêu KHỐI' });
  }
};
