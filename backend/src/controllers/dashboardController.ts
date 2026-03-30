import { Request, Response } from 'express';
import { prisma } from '../config/database';
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

/**
 * Dashboard API - Cung cấp tất cả dữ liệu cho Dashboard
 */
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const thisWeekStart = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

    // ==================== TỔNG QUAN ====================
    const [
      totalCustomers,
      totalLeads,
      totalOrders,
      totalProducts,
      totalEmployees,
      totalDepartments
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { leadStatus: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING'] } } }),
      prisma.order.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.employee.count({ where: { status: { name: 'ACTIVE' } } }),
      prisma.department.count()
    ]);

    // ==================== KHÁCH HÀNG MỚI ====================
    const [
      customersToday,
      customersYesterday,
      customersThisWeek,
      customersLastWeek,
      customersThisMonth,
      customersLastMonth,
      customersThisYear,
      customersLastYear
    ] = await Promise.all([
      prisma.customer.count({ where: { joinedDate: { gte: today } } }),
      prisma.customer.count({ where: { joinedDate: { gte: yesterday, lt: today } } }),
      prisma.customer.count({ where: { joinedDate: { gte: thisWeekStart } } }),
      prisma.customer.count({ where: { joinedDate: { gte: lastWeekStart, lt: thisWeekStart } } }),
      prisma.customer.count({ where: { joinedDate: { gte: thisMonthStart } } }),
      prisma.customer.count({ where: { joinedDate: { gte: lastMonthStart, lt: thisMonthStart } } }),
      prisma.customer.count({ where: { joinedDate: { gte: thisYearStart } } }),
      prisma.customer.count({ where: { joinedDate: { gte: lastYearStart, lte: lastYearEnd } } })
    ]);

    // ==================== LEAD MỚI ====================
    const leadStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING'];
    const [
      leadsToday,
      leadsYesterday,
      leadsThisWeek,
      leadsLastWeek,
      leadsThisMonth,
      leadsLastMonth,
      leadsThisYear,
      leadsLastYear
    ] = await Promise.all([
      prisma.customer.count({ where: { joinedDate: { gte: today }, leadStatus: { in: leadStatuses } } }),
      prisma.customer.count({ where: { joinedDate: { gte: yesterday, lt: today }, leadStatus: { in: leadStatuses } } }),
      prisma.customer.count({ where: { joinedDate: { gte: thisWeekStart }, leadStatus: { in: leadStatuses } } }),
      prisma.customer.count({ where: { joinedDate: { gte: lastWeekStart, lt: thisWeekStart }, leadStatus: { in: leadStatuses } } }),
      prisma.customer.count({ where: { joinedDate: { gte: thisMonthStart }, leadStatus: { in: leadStatuses } } }),
      prisma.customer.count({ where: { joinedDate: { gte: lastMonthStart, lt: thisMonthStart }, leadStatus: { in: leadStatuses } } }),
      prisma.customer.count({ where: { joinedDate: { gte: thisYearStart }, leadStatus: { in: leadStatuses } } }),
      prisma.customer.count({ where: { joinedDate: { gte: lastYearStart, lte: lastYearEnd }, leadStatus: { in: leadStatuses } } })
    ]);

    // ==================== DOANH THU ====================
    const revenueThisMonth = await prisma.order.aggregate({
      where: { shippingStatus: 'DELIVERED', deliveredAt: { gte: thisMonthStart } },
      _sum: { finalAmount: true }
    });
    const revenueLastMonth = await prisma.order.aggregate({
      where: { shippingStatus: 'DELIVERED', deliveredAt: { gte: lastMonthStart, lt: thisMonthStart } },
      _sum: { finalAmount: true }
    });
    const revenueThisYear = await prisma.order.aggregate({
      where: { shippingStatus: 'DELIVERED', deliveredAt: { gte: thisYearStart } },
      _sum: { finalAmount: true }
    });
    const revenueLastYear = await prisma.order.aggregate({
      where: { shippingStatus: 'DELIVERED', deliveredAt: { gte: lastYearStart, lte: lastYearEnd } },
      _sum: { finalAmount: true }
    });

    // ==================== PHÂN BỐ KHÁCH HÀNG THEO VÙNG MIỀN ====================
    const customersByRegion = await prisma.$queryRaw<any[]>`
      SELECT 
        CASE 
          WHEN p.name IN ('Hà Nội', 'Hải Phòng', 'Bắc Giang', 'Bắc Ninh', 'Hà Nam', 'Hải Dương', 'Hưng Yên', 'Nam Định', 'Ninh Bình', 'Phú Thọ', 'Quảng Ninh', 'Thái Bình', 'Thái Nguyên', 'Vĩnh Phúc', 'Bắc Kạn', 'Cao Bằng', 'Điện Biên', 'Hà Giang', 'Hòa Bình', 'Lai Châu', 'Lạng Sơn', 'Lào Cai', 'Sơn La', 'Tuyên Quang', 'Yên Bái') THEN 'Miền Bắc'
          WHEN p.name IN ('Đà Nẵng', 'Bình Định', 'Bình Thuận', 'Khánh Hòa', 'Nghệ An', 'Ninh Thuận', 'Phú Yên', 'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Trị', 'Thanh Hóa', 'Thừa Thiên Huế', 'Hà Tĩnh') THEN 'Miền Trung'
          WHEN p.name IN ('Đắk Lắk', 'Đắk Nông', 'Gia Lai', 'Kon Tum', 'Lâm Đồng') THEN 'Tây Nguyên'
          WHEN p.name IN ('TP. Hồ Chí Minh', 'Cần Thơ', 'An Giang', 'Bà Rịa - Vũng Tàu', 'Bạc Liêu', 'Bến Tre', 'Bình Dương', 'Bình Phước', 'Cà Mau', 'Đồng Nai', 'Đồng Tháp', 'Hậu Giang', 'Kiên Giang', 'Long An', 'Sóc Trăng', 'Tây Ninh', 'Tiền Giang', 'Trà Vinh', 'Vĩnh Long') THEN 'Miền Nam'
          ELSE 'Khác'
        END as region,
        COUNT(*) as count
      FROM customers c
      LEFT JOIN provinces p ON c.province_id = p.id
      GROUP BY region
      ORDER BY count DESC
    `;

    // ==================== PHÂN BỐ THEO LOẠI KHÁCH HÀNG ====================
    const customersByBusinessType = await prisma.customer.groupBy({
      by: ['businessType'],
      _count: { id: true },
      _sum: { totalOrdersValue: true }
    });

    // ==================== PHÂN BỐ THEO CÂY TRỒNG ====================
    const cropStats = await prisma.$queryRaw<any[]>`
      SELECT 
        unnest(main_crops) as crop,
        COUNT(*) as count
      FROM customers
      WHERE main_crops IS NOT NULL AND array_length(main_crops, 1) > 0
      GROUP BY crop
      ORDER BY count DESC
      LIMIT 15
    `;

    // ==================== LEAD STATUS DISTRIBUTION ====================
    const leadStatusDistribution = await prisma.customer.groupBy({
      by: ['leadStatus'],
      _count: { id: true }
    });

    // ==================== TOP TỈNH THÀNH ====================
    const topProvinces = await prisma.$queryRaw<any[]>`
      SELECT 
        p.name as province,
        COUNT(c.id) as customer_count,
        COALESCE(SUM(c.total_orders_value), 0) as total_revenue
      FROM customers c
      LEFT JOIN provinces p ON c.province_id = p.id
      WHERE p.name IS NOT NULL
      GROUP BY p.id, p.name
      ORDER BY customer_count DESC
      LIMIT 10
    `;

    // ==================== MỤC TIÊU KINH DOANH THEO KHỐI ====================
    const currentYear = now.getFullYear();
    const dashOrgId = await getKagriOrganizationId();
    const divisions = dashOrgId
      ? await (async () => {
          const companyRoot = await getCompanyRootForOrg(dashOrgId);
          return prisma.department.findMany({
            where: {
              type: 'DIVISION',
              organizationId: dashOrgId,
              parentId: companyRoot.id,
            },
            orderBy: { displayOrder: 'asc' },
            include: { children: { select: { function: true } } },
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

    const divisionProgress = await Promise.all(divisions.map(async (div) => {
      const target = targets.find(t => t.departmentId === div.id);
      
      const revenue = await prisma.$queryRaw<{ revenue: number }[]>`
        SELECT COALESCE(SUM(o.final_amount), 0) as revenue
        FROM orders o
        JOIN employees e ON (o.sales_employee_id = e.id OR o.resales_employee_id = e.id OR o.employee_id = e.id)
        JOIN departments dept ON e.department_id = dept.id
        WHERE (dept.parent_id = ${div.id} OR dept.id = ${div.id})
          AND o.shipping_status = 'DELIVERED'
          AND EXTRACT(YEAR FROM o.delivered_at) = ${currentYear}
      `;

      const actualRevenue = Number(revenue[0]?.revenue || 0);
      const annualTarget = target ? Number(target.annualTarget) : 0;
      const progress = annualTarget > 0 ? (actualRevenue / annualTarget * 100) : 0;
      
      const hasMarketing = div.function === 'MARKETING' || div.children.some(c => c.function === 'MARKETING');
      const hasSales = div.function === 'SALES' || div.children.some(c => c.function === 'SALES');
      const hasResales = div.function === 'CSKH' || div.children.some(c => c.function === 'CSKH');

      return {
        id: div.id,
        code: div.code,
        name: div.name,
        divisionType: 'STANDARD',
        status: 'ACTIVE',
        hasMarketing,
        hasSales,
        hasResales,
        target: annualTarget,
        actual: actualRevenue,
        progress: Math.round(progress * 100) / 100,
        remaining: Math.max(0, annualTarget - actualRevenue)
      };
    }));

    // ==================== TÍNH % TĂNG TRƯỞNG ====================
    const calcGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100 * 10) / 10;
    };

    res.json(convertBigInt({
      overview: {
        totalCustomers,
        totalLeads,
        totalOrders,
        totalProducts,
        totalEmployees,
        totalDepartments
      },
      
      customers: {
        today: customersToday,
        yesterday: customersYesterday,
        thisWeek: customersThisWeek,
        lastWeek: customersLastWeek,
        thisMonth: customersThisMonth,
        lastMonth: customersLastMonth,
        thisYear: customersThisYear,
        lastYear: customersLastYear,
        growthDay: calcGrowth(customersToday, customersYesterday),
        growthWeek: calcGrowth(customersThisWeek, customersLastWeek),
        growthMonth: calcGrowth(customersThisMonth, customersLastMonth),
        growthYear: calcGrowth(customersThisYear, customersLastYear)
      },
      
      leads: {
        today: leadsToday,
        yesterday: leadsYesterday,
        thisWeek: leadsThisWeek,
        lastWeek: leadsLastWeek,
        thisMonth: leadsThisMonth,
        lastMonth: leadsLastMonth,
        thisYear: leadsThisYear,
        lastYear: leadsLastYear,
        growthDay: calcGrowth(leadsToday, leadsYesterday),
        growthWeek: calcGrowth(leadsThisWeek, leadsLastWeek),
        growthMonth: calcGrowth(leadsThisMonth, leadsLastMonth),
        growthYear: calcGrowth(leadsThisYear, leadsLastYear)
      },
      
      revenue: {
        thisMonth: Number(revenueThisMonth._sum.finalAmount || 0),
        lastMonth: Number(revenueLastMonth._sum.finalAmount || 0),
        thisYear: Number(revenueThisYear._sum.finalAmount || 0),
        lastYear: Number(revenueLastYear._sum.finalAmount || 0),
        growthMonth: calcGrowth(
          Number(revenueThisMonth._sum.finalAmount || 0),
          Number(revenueLastMonth._sum.finalAmount || 0)
        ),
        growthYear: calcGrowth(
          Number(revenueThisYear._sum.finalAmount || 0),
          Number(revenueLastYear._sum.finalAmount || 0)
        )
      },
      
      distribution: {
        byRegion: customersByRegion,
        byBusinessType: customersByBusinessType.map(b => ({
          type: b.businessType || 'UNKNOWN',
          count: b._count.id,
          revenue: Number(b._sum.totalOrdersValue || 0)
        })),
        byCrop: cropStats,
        byLeadStatus: leadStatusDistribution.map(l => ({
          status: l.leadStatus || 'UNKNOWN',
          count: l._count.id
        })),
        topProvinces
      },
      
      divisionTargets: {
        year: currentYear,
        divisions: divisionProgress,
        summary: {
          totalTarget: divisionProgress.reduce((sum, d) => sum + d.target, 0),
          totalActual: divisionProgress.reduce((sum, d) => sum + d.actual, 0),
          totalProgress: (() => {
            const tt = divisionProgress.reduce((sum, d) => sum + d.target, 0);
            const ta = divisionProgress.reduce((sum, d) => sum + d.actual, 0);
            return tt > 0 ? Math.round((ta / tt) * 100 * 100) / 100 : 0;
          })(),
        }
      }
    }));
  } catch (error) {
    console.error('Get dashboard data error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu dashboard' });
  }
};

/**
 * Lấy dữ liệu biểu đồ xu hướng
 */
export const getDashboardTrends = async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Xu hướng khách hàng mới theo ngày
    const customerTrend = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(joined_date) as date,
        COUNT(*) as count
      FROM customers
      WHERE joined_date >= ${startDate}
      GROUP BY DATE(joined_date)
      ORDER BY date ASC
    `;

    // Xu hướng doanh thu theo ngày
    const revenueTrend = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(delivered_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(final_amount), 0) as revenue
      FROM orders
      WHERE shipping_status = 'DELIVERED' AND delivered_at >= ${startDate}
      GROUP BY DATE(delivered_at)
      ORDER BY date ASC
    `;

    // Xu hướng lead theo ngày
    const leadTrend = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(joined_date) as date,
        COUNT(*) as count
      FROM customers
      WHERE joined_date >= ${startDate}
        AND lead_status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING')
      GROUP BY DATE(joined_date)
      ORDER BY date ASC
    `;

    res.json(convertBigInt({
      customers: customerTrend,
      revenue: revenueTrend,
      leads: leadTrend
    }));
  } catch (error) {
    console.error('Get dashboard trends error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy xu hướng' });
  }
};
