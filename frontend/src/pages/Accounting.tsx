import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  FileText, 
  BarChart3, 
  Users, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  ChevronRight,
  Building2,
  Receipt,
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Target
} from 'lucide-react';
import { apiClient } from '../api/client';
import { toast } from 'react-hot-toast';
import { formatCurrency, formatDate } from '../utils/format';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../context/useAuthStore';

/** Khoảng thời gian theo tháng (đầu tháng -> cuối tháng) */
function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

interface PerfEmployee {
  id: string;
  code: string;
  fullName: string;
  avatarUrl?: string;
  department?: { name: string };
}
interface MarketingPerfItem {
  employee: PerfEmployee;
  rank: number;
  leadsCreated: number;
  leadsConverted: number;
  conversionRate: number;
  revenue: number;
  revenuePerLead: number;
}
interface SalesPerfItem {
  employee: PerfEmployee;
  rank: number;
  customersCount: number;
  ordersCreated: number;
  revenue: number;
  avgOrderValue: number;
}
interface ResalesPerfItem {
  employee: PerfEmployee;
  rank: number;
  customersCount: number;
  repeatOrders: number;
  revenue: number;
  avgOrderValue: number;
}

interface AccountingSummary {
  year: number;
  month: number;
  payroll: {
    byStatus: Array<{ status: string; _count: number; _sum: { netSalary: number } }>;
    totalAmount: number;
  };
  invoice: {
    byStatus: Array<{ status: string; _count: number; _sum: { total: number } }>;
    totalAmount: number;
  };
}

interface FinancialReport {
  id: string;
  type: string;
  month: number | null;
  year: number;
  totalRevenue: number;
  totalOrders: number;
  totalExpense: number;
  totalSalary: number;
  grossProfit: number;
  netProfit: number;
  generatedAt: string;
}

interface RoleDashboardColumn {
  role: string;
  roleLabel: string;
  employee: { id: string; code: string; fullName: string; department: string };
  metrics: Record<string, number>;
}

const Accounting = () => {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [marketingPerf, setMarketingPerf] = useState<MarketingPerfItem[]>([]);
  const [salesPerf, setSalesPerf] = useState<SalesPerfItem[]>([]);
  const [resalesPerf, setResalesPerf] = useState<ResalesPerfItem[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfTab, setPerfTab] = useState<'marketing' | 'sales' | 'resales'>('marketing');
  const [roleDashboard, setRoleDashboard] = useState<RoleDashboardColumn[]>([]);
  const [roleDashboardLoading, setRoleDashboardLoading] = useState(false);

  const canManageAccounting = useAuthStore((s) => s.hasPermission('MANAGE_ACCOUNTING'));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    fetchData();
  }, [selectedYear, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, reportsRes] = await Promise.all([
        apiClient.get(`/accounting/summary?year=${selectedYear}&month=${selectedMonth}`),
        apiClient.get(`/accounting/reports?year=${selectedYear}`)
      ]);
      setSummary(summaryRes?.data ?? summaryRes ?? null);
      setReports(Array.isArray(reportsRes?.data) ? reportsRes.data : (Array.isArray(reportsRes) ? reportsRes : []));
    } catch (error) {
      console.error('Error fetching accounting data:', error);
      toast.error('Không thể tải dữ liệu kế toán');
      setSummary(null);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPerformance = async () => {
    setPerfLoading(true);
    const { startDate, endDate } = getMonthRange(selectedYear, selectedMonth);
    try {
      const [mRes, sRes, rRes] = await Promise.all([
        apiClient.get(`/performance/marketing?startDate=${startDate}&endDate=${endDate}`),
        apiClient.get(`/performance/sales?startDate=${startDate}&endDate=${endDate}`),
        apiClient.get(`/performance/resales?startDate=${startDate}&endDate=${endDate}`)
      ]);
      setMarketingPerf(mRes?.performances ?? []);
      setSalesPerf(sRes?.performances ?? []);
      setResalesPerf(rRes?.performances ?? []);
    } catch (error) {
      console.error('Error fetching performance:', error);
      toast.error('Không thể tải báo cáo hiệu suất');
      setMarketingPerf([]);
      setSalesPerf([]);
      setResalesPerf([]);
    } finally {
      setPerfLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformance();
  }, [selectedYear, selectedMonth]);

  const fetchRoleDashboard = async () => {
    setRoleDashboardLoading(true);
    try {
      const res = await apiClient.get(`/accounting/role-dashboard?year=${selectedYear}&month=${selectedMonth}`);
      setRoleDashboard(res?.columns ?? []);
    } catch (error) {
      console.error('Error fetching role dashboard:', error);
      toast.error('Không thể tải bảng chỉ số theo vai trò');
      setRoleDashboard([]);
    } finally {
      setRoleDashboardLoading(false);
    }
  };

  useEffect(() => {
    fetchRoleDashboard();
  }, [selectedYear, selectedMonth]);

  const generateReport = async (type: 'MONTHLY' | 'QUARTERLY' | 'YEARLY') => {
    setGeneratingReport(true);
    try {
      await apiClient.post('/accounting/reports/generate', {
        type,
        month: type !== 'YEARLY' ? selectedMonth : null,
        year: selectedYear
      });
      toast.success('Đã tạo báo cáo thành công');
      fetchData();
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Không thể tạo báo cáo');
    } finally {
      setGeneratingReport(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Nháp',
      PENDING: 'Chờ duyệt',
      APPROVED: 'Đã duyệt',
      PAID: 'Đã thanh toán',
      CANCELLED: 'Đã hủy',
      EXPORTED: 'Đã xuất',
      ERROR: 'Lỗi'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-700',
      PENDING: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-green-100 text-green-700',
      PAID: 'bg-blue-100 text-blue-700',
      CANCELLED: 'bg-red-100 text-red-700',
      EXPORTED: 'bg-purple-100 text-purple-700',
      ERROR: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getReportTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      MONTHLY: 'Tháng',
      QUARTERLY: 'Quý',
      YEARLY: 'Năm'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kế toán</h1>
            <p className="text-sm text-gray-500">Quản lý tài chính, lương và hóa đơn</p>
          </div>
        </div>

        {/* Period Filter */}
        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
          >
            {months.map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs text-gray-400">Tháng {selectedMonth}/{selectedYear}</span>
          </div>
          <div className="mt-3">
            <p className="text-sm text-gray-500">Tổng chi lương</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(summary?.payroll?.totalAmount || 0)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-50 rounded-lg">
              <Receipt className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-xs text-gray-400">Tháng {selectedMonth}/{selectedYear}</span>
          </div>
          <div className="mt-3">
            <p className="text-sm text-gray-500">Tổng hóa đơn</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(summary?.invoice?.totalAmount || 0)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-sm text-gray-500">Bảng lương</p>
            <div className="flex items-center gap-2 mt-1">
              {summary?.payroll?.byStatus?.map(s => (
                <span key={s.status} className={`px-2 py-0.5 rounded text-xs ${getStatusColor(s.status)}`}>
                  {getStatusLabel(s.status)}: {s._count}
                </span>
              ))}
              {(!summary?.payroll?.byStatus || summary.payroll.byStatus.length === 0) && (
                <span className="text-gray-400 text-sm">Chưa có dữ liệu</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-orange-50 rounded-lg">
              <FileText className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-sm text-gray-500">Hóa đơn nháp</p>
            <div className="flex items-center gap-2 mt-1">
              {summary?.invoice?.byStatus?.map(s => (
                <span key={s.status} className={`px-2 py-0.5 rounded text-xs ${getStatusColor(s.status)}`}>
                  {getStatusLabel(s.status)}: {s._count}
                </span>
              ))}
              {(!summary?.invoice?.byStatus || summary.invoice.byStatus.length === 0) && (
                <span className="text-gray-400 text-sm">Chưa có dữ liệu</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link 
          to="/accounting/payroll"
          className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Quản lý lương</h3>
                <p className="text-sm text-gray-500">Bảng lương, đầu mục lương</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
          </div>
        </Link>

        <Link 
          to="/accounting/invoices"
          className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 rounded-xl group-hover:bg-green-100 transition-colors">
                <Receipt className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Hóa đơn nháp</h3>
                <p className="text-sm text-gray-500">Chuẩn bị xuất hóa đơn</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
          </div>
        </Link>

        <Link 
          to="/accounting/reports"
          className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Báo cáo tài chính</h3>
                <p className="text-sm text-gray-500">Doanh thu, chi phí, lợi nhuận</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
          </div>
        </Link>
      </div>

      {/* Báo cáo hiệu suất nhân viên kinh doanh */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Target className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Báo cáo hiệu suất nhân viên kinh doanh</h2>
                <p className="text-sm text-gray-500">Kỳ: Tháng {selectedMonth}/{selectedYear} — Đầy đủ chỉ số Marketing, Sales, Resales</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchPerformance}
                disabled={perfLoading}
                className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Tải lại"
              >
                <RefreshCw className={`w-5 h-5 ${perfLoading ? 'animate-spin' : ''}`} />
              </button>
              <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                {(['marketing', 'sales', 'resales'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setPerfTab(tab)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      perfTab === tab ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab === 'marketing' && 'Marketing'}
                    {tab === 'sales' && 'Sales'}
                    {tab === 'resales' && 'Resales'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          {perfLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : perfTab === 'marketing' ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">STT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã NV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Họ tên</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số lead tạo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lead chuyển đổi</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tỷ lệ chuyển đổi (%)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh số</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh số / lead</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Xếp hạng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {marketingPerf.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Chưa có dữ liệu Marketing trong kỳ này</td>
                  </tr>
                ) : (
                  marketingPerf.map((p, idx) => (
                    <tr key={p.employee.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.employee.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{p.employee.fullName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.employee.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{p.leadsCreated}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{p.leadsConverted}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{p.conversionRate}%</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-600">{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(p.revenuePerLead)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold">{p.rank}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : perfTab === 'sales' ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">STT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã NV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Họ tên</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số KH phụ trách</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đơn đầu</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh số</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đơn giá TB</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Xếp hạng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salesPerf.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Chưa có dữ liệu Sales trong kỳ này</td>
                  </tr>
                ) : (
                  salesPerf.map((p, idx) => (
                    <tr key={p.employee.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.employee.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{p.employee.fullName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.employee.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{p.customersCount}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{p.ordersCreated}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-600">{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(p.avgOrderValue)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">{p.rank}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">STT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã NV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Họ tên</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số KH phụ trách</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đơn mua lại</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh số</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đơn giá TB</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Xếp hạng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resalesPerf.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Chưa có dữ liệu Resales trong kỳ này</td>
                  </tr>
                ) : (
                  resalesPerf.map((p, idx) => (
                    <tr key={p.employee.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.employee.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{p.employee.fullName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.employee.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{p.customersCount}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{p.repeatOrders}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-600">{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(p.avgOrderValue)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold">{p.rank}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bảng chỉ số theo vai trò: MKT, CSKH, Sale, Vận đơn, Ecom */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 rounded-lg">
                <Users className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Chỉ số theo vai trò</h2>
                <p className="text-sm text-gray-500">MKT · CSKH · Sale · Vận đơn · Ecom (TMĐT) — Kỳ: Tháng {selectedMonth}/{selectedYear}</p>
              </div>
            </div>
            <button
              onClick={fetchRoleDashboard}
              disabled={roleDashboardLoading}
              className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Tải lại"
            >
              <RefreshCw className={`w-5 h-5 ${roleDashboardLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {roleDashboardLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : roleDashboard.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500">Chưa có dữ liệu. Kiểm tra kỳ và quyền xem.</div>
          ) : (
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-[1%] whitespace-nowrap">Chỉ số</th>
                  {roleDashboard.map((col) => (
                    <th key={col.role} className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase min-w-[140px]">
                      {col.roleLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-gray-50/50">
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Tên nhân viên</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-gray-900 text-center">{col.employee.fullName}</td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">ID nhân viên</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-xs text-gray-600 text-center font-mono">{col.employee.id || '—'}</td>
                  ))}
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Phòng ban, đội nhóm</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-gray-700 text-center">
                      {typeof (col.employee as any).department === 'string' ? (col.employee as any).department : (col.employee as any).department?.name ?? '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Loại nhân viên</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-gray-700 text-center">{(col.employee as any).employeeType?.name ?? '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Chi phí quảng cáo (chiến dịch)</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-right">
                      {col.role === 'MKT' ? formatCurrency(col.metrics.adCost ?? 0) : col.role === 'ECOM' ? (col.metrics.adCost ? formatCurrency(col.metrics.adCost) : 'Kế toán nhập') : '—'}
                    </td>
                  ))}
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Chi phí tiền nguyên liệu (Kế toán nhập)</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-right">
                      {col.role === 'MKT' ? (col.metrics.materialCost ? formatCurrency(col.metrics.materialCost) : '—') : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Doanh số đơn mới</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-right font-medium text-green-600">
                      {col.role === 'MKT' && (col.metrics.revenueNew != null ? formatCurrency(col.metrics.revenueNew) : '—')}
                      {col.role === 'CSKH' && (col.metrics.revenueNew != null ? formatCurrency(col.metrics.revenueNew) : '—')}
                      {col.role === 'SALE' && (col.metrics.revenueNew != null ? formatCurrency(col.metrics.revenueNew) : '—')}
                      {col.role === 'VAN_DON' && '—'}
                      {col.role === 'ECOM' && (col.metrics.revenueNew ? formatCurrency(col.metrics.revenueNew) : 'Kế toán nhập')}
                    </td>
                  ))}
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Doanh số đơn cũ (đơn trùng)</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-right">
                      {col.role === 'MKT' && (col.metrics.revenueOld != null ? formatCurrency(col.metrics.revenueOld) : '—')}
                      {col.role === 'CSKH' && (col.metrics.revenueOld != null ? formatCurrency(col.metrics.revenueOld) : '—')}
                      {col.role === 'SALE' && (col.metrics.revenueOld != null ? formatCurrency(col.metrics.revenueOld) : '—')}
                      {col.role === 'VAN_DON' && '—'}
                      {col.role === 'ECOM' && (col.metrics.revenueOld ? formatCurrency(col.metrics.revenueOld) : 'Kế toán nhập')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Doanh số từ nguồn MKT / Tổng data / Doanh số xuất / Voucher (Ecom)</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-right">
                      {col.role === 'MKT' && '—'}
                      {col.role === 'CSKH' && (col.metrics.revenueFromMkt != null ? formatCurrency(col.metrics.revenueFromMkt) : '—')}
                      {col.role === 'SALE' && (col.metrics.totalData != null ? String(col.metrics.totalData) : '—')}
                      {col.role === 'VAN_DON' && (col.metrics.revenueXuat != null ? formatCurrency(col.metrics.revenueXuat) : '—')}
                      {col.role === 'ECOM' && (col.metrics.voucher ? formatCurrency(col.metrics.voucher) : 'Kế toán nhập')}
                    </td>
                  ))}
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Doanh số hoàn / Tỷ lệ hoàn</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-right">
                      {col.role === 'MKT' && '—'}
                      {col.role === 'CSKH' && '—'}
                      {col.role === 'SALE' && (col.metrics.returnRate != null ? `${col.metrics.returnRate}%` : '—')}
                      {col.role === 'VAN_DON' && (col.metrics.revenueHoan != null ? formatCurrency(col.metrics.revenueHoan) : '—')}
                      {col.role === 'ECOM' && '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-xs font-medium text-gray-500">Tỷ lệ hoàn (Vận đơn)</td>
                  {roleDashboard.map((col) => (
                    <td key={col.role} className="px-4 py-2 text-sm text-right">
                      {col.role === 'VAN_DON' && (col.metrics.returnRate != null ? `${col.metrics.returnRate}%` : '—')}
                      {col.role !== 'VAN_DON' && '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Financial Reports */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-gray-600" />
              <h2 className="font-semibold text-gray-900">Báo cáo tài chính năm {selectedYear}</h2>
            </div>
            {canManageAccounting && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generateReport('MONTHLY')}
                  disabled={generatingReport}
                  className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  Tạo BC tháng
                </button>
                <button
                  onClick={() => generateReport('QUARTERLY')}
                  disabled={generatingReport}
                  className="px-3 py-1.5 text-sm bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  Tạo BC quý
                </button>
                <button
                  onClick={() => generateReport('YEARLY')}
                  disabled={generatingReport}
                  className="px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  Tạo BC năm
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kỳ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh thu</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Chi phí</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lợi nhuận gộp</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lợi nhuận ròng</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Đơn hàng</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!reports || reports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Chưa có báo cáo. Nhấn nút "Tạo BC" để tạo báo cáo mới.
                  </td>
                </tr>
              ) : (
                reports.map(report => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        report.type === 'MONTHLY' ? 'bg-blue-100 text-blue-700' :
                        report.type === 'QUARTERLY' ? 'bg-purple-100 text-purple-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {getReportTypeLabel(report.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {report.month ? `Tháng ${report.month}/${report.year}` : `Năm ${report.year}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                      {formatCurrency(report.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                      {formatCurrency(report.totalExpense)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`font-medium ${Number(report.grossProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(report.grossProfit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`font-medium ${Number(report.netProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(report.netProfit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {report.totalOrders}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(report.generatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Accounting;
