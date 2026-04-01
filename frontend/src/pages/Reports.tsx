import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import { hasExecutiveReportUiAccess } from '../constants/rbac';
import { 
  BarChart3, Users, TrendingUp, Award, Filter, 
  Calendar, Loader, AlertCircle, Crown, Target, 
  DollarSign, ShoppingCart, UserCheck, PieChart, 
  ArrowUp, ArrowDown, Package, Wallet, Leaf, MapPin,
  Building2, Download
} from 'lucide-react';
import clsx from 'clsx';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { formatDate, formatMonthYear } from '../utils/format';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';

const formatCurrency = (value: number) => {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(2)} tỷ`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)} tr`;
  }
  return value.toLocaleString('vi-VN') + ' đ';
};

const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) return <Crown className="text-yellow-500" size={20} />;
  if (rank === 2) return <Award className="text-gray-400" size={18} />;
  if (rank === 3) return <Award className="text-amber-600" size={18} />;
  return <span className="text-gray-500 font-mono text-sm">#{rank}</span>;
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: 'Khách lẻ',
  COOPERATIVE: 'Hợp tác xã',
  COMPANY: 'Doanh nghiệp',
  UNKNOWN: 'Chưa phân loại'
};

const REGION_COLORS: Record<string, string> = {
  'Miền Bắc': '#DC2626',
  'Miền Trung': '#2563EB',
  'Tây Nguyên': '#7C3AED',
  'Miền Nam': '#059669',
  'Khác': '#6B7280'
};

type ReportTab = 'revenue' | 'cost' | 'top-sales' | 'growth' | 'targets' | 'crops' | 'regions' | 'business-types';

const Reports = () => {
  const { user, hasPermission } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ReportTab>('revenue');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Data states
  const [revenueData, setRevenueData] = useState<any>(null);
  const [costData, setCostData] = useState<any>(null);
  const [topSalesData, setTopSalesData] = useState<any>(null);
  const [growthData, setGrowthData] = useState<any>(null);
  const [targetsData, setTargetsData] = useState<any>(null);
  const [cropsData, setCropsData] = useState<any>(null);
  const [regionsData, setRegionsData] = useState<any>(null);
  const [businessTypesData, setBusinessTypesData] = useState<any>(null);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  
  // Master data
  const [divisions, setDivisions] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  
  // Check permissions
  const canViewReports = hasExecutiveReportUiAccess(hasPermission, user?.roleGroup?.code);

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    if (selectedDivision && divisions.length > 0 && !divisions.some((d: any) => d.id === selectedDivision)) {
      setSelectedDivision('');
    }
  }, [divisions, selectedDivision]);

  useEffect(() => {
    if (canViewReports) {
      loadData();
    }
  }, [activeTab, startDate, endDate, period, selectedDivision, selectedEmployee, selectedTag]);

  const loadMasterData = async () => {
    try {
      const [divRes, empRes, tagRes] = await Promise.all([
        apiClient
          .get('/divisions?directUnderCompanyRoot=true')
          .catch(() => []),
        apiClient.get('/hr/employees?limit=1000').catch(() => ({ data: [] })),
        apiClient.get('/customer-tags').catch(() => [])
      ]);
      setDivisions(divRes || []);
      setEmployees(empRes?.data || []);
      setTags(tagRes || []);
    } catch (e) {
      console.error('Load master data error:', e);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (period) params.append('period', period);
      if (selectedDivision) params.append('divisionId', selectedDivision);
      if (selectedEmployee) params.append('employeeId', selectedEmployee);
      if (selectedTag) params.append('tagId', selectedTag);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      switch (activeTab) {
        case 'revenue':
          setRevenueData(await apiClient.get(`/reports/revenue${queryString}`));
          break;
        case 'cost':
          setCostData(await apiClient.get(`/reports/cost${queryString}`));
          break;
        case 'top-sales':
          setTopSalesData(await apiClient.get(`/reports/top-sales${queryString}`));
          break;
        case 'growth':
          setGrowthData(await apiClient.get(`/reports/growth${queryString}`));
          break;
        case 'targets':
          setTargetsData(await apiClient.get(`/reports/division-targets${queryString}`));
          break;
        case 'crops':
          setCropsData(await apiClient.get(`/reports/crops${queryString}`));
          break;
        case 'regions':
          setRegionsData(await apiClient.get(`/reports/regions${queryString}`));
          break;
        case 'business-types':
          setBusinessTypesData(await apiClient.get(`/reports/business-types${queryString}`));
          break;
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải dữ liệu báo cáo');
    } finally {
      setLoading(false);
    }
  };

  if (!canViewReports) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertCircle size={64} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Không có quyền truy cập</h2>
        <p className="text-gray-500">Chỉ BOD và Quản trị viên hệ thống mới có quyền xem báo cáo này.</p>
      </div>
    );
  }

  const tabs: { id: ReportTab; label: string; icon: any }[] = [
    { id: 'revenue', label: 'Doanh thu', icon: DollarSign },
    { id: 'cost', label: 'Chi phí', icon: Wallet },
    { id: 'top-sales', label: 'Top nhân viên', icon: Award },
    { id: 'growth', label: 'Tăng trưởng', icon: TrendingUp },
    { id: 'targets', label: 'Mục tiêu KHỐI', icon: Target },
    { id: 'crops', label: 'Cây trồng', icon: Leaf },
    { id: 'regions', label: 'Vùng miền', icon: MapPin },
    { id: 'business-types', label: 'Loại KH', icon: Building2 }
  ];

  const renderRevenueReport = () => {
    if (!revenueData) return null;
    
    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="text-green-600" size={24} />
              <span className="text-sm text-green-700">Tổng doanh thu</span>
            </div>
            <p className="text-3xl font-bold text-green-700">{formatCurrency(revenueData.summary.totalRevenue)}</p>
          </div>
          <div className="bg-blue-50 p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <ShoppingCart className="text-blue-600" size={24} />
              <span className="text-sm text-blue-700">Tổng đơn hàng</span>
            </div>
            <p className="text-3xl font-bold text-blue-700">{revenueData.summary.totalOrders}</p>
          </div>
          <div className="bg-purple-50 p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <PieChart className="text-purple-600" size={24} />
              <span className="text-sm text-purple-700">Giá trị TB/đơn</span>
            </div>
            <p className="text-3xl font-bold text-purple-700">{formatCurrency(revenueData.summary.avgOrderValue)}</p>
          </div>
        </div>

        {/* By Division */}
        {revenueData.byDivision && revenueData.byDivision.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Doanh thu theo KHỐI</h3>
            <div className="responsive-table-container">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">KHỐI</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số đơn</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh thu</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {revenueData.byDivision.map((item: any, index: number) => (
                    <tr key={index}>
                      <td className="px-4 py-3 font-medium">{item.division_name}</td>
                      <td className="px-4 py-3 text-right">{Number(item.order_count)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        {formatCurrency(Number(item.revenue))}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {revenueData.summary.totalRevenue > 0 
                          ? ((Number(item.revenue) / revenueData.summary.totalRevenue) * 100).toFixed(1) 
                          : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* By Period */}
        {revenueData.byPeriod && revenueData.byPeriod.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Doanh thu theo thời gian</h3>
            <div className="responsive-table-container">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thời gian</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số đơn</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {revenueData.byPeriod.map((item: any, index: number) => (
                    <tr key={index}>
                      <td className="px-4 py-3 font-medium">
                        {formatDate(item.period)}
                      </td>
                      <td className="px-4 py-3 text-right">{Number(item.order_count)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        {formatCurrency(Number(item.revenue))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCostReport = () => {
    if (!costData) return null;
    
    return (
      <div className="space-y-6">
        <div className="bg-red-50 p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="text-red-600" size={24} />
            <span className="text-sm text-red-700">Tổng chi phí Marketing</span>
          </div>
          <p className="text-3xl font-bold text-red-700">{formatCurrency(costData.summary.totalCost)}</p>
        </div>

        {costData.byType && costData.byType.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Chi phí theo loại</h3>
            <div className="space-y-3">
              {costData.byType.map((item: any, index: number) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">{item.costType}</span>
                  <span className="font-bold text-red-600">{formatCurrency(Number(item._sum.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTopSalesReport = () => {
    if (!topSalesData) return null;
    
    const renderEmployeeTable = (data: any[], title: string, revenueLabel: string) => (
      <div className="bg-white p-6 rounded-xl border">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {data.length === 0 ? (
          <p className="text-gray-500 text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hạng</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhân viên</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">KHỐI</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số đơn/Lead</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{revenueLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((item: any) => (
                  <tr key={item.id} className={item.rank <= 3 ? 'bg-yellow-50/50' : ''}>
                    <td className="px-4 py-3">
                      <RankBadge rank={item.rank} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium overflow-hidden">
                          {item.avatar_url ? (
                            <img src={resolveUploadUrl(item.avatar_url)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            item.full_name?.charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{item.full_name}</p>
                          <p className="text-xs text-gray-500">{item.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.division_name}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {Number(item.order_count || item.leads_count || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {formatCurrency(Number(item.revenue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
    
    return (
      <div className="space-y-6">
        {renderEmployeeTable(topSalesData.topSales || [], 'Top Sales (Đơn đầu tiên)', 'Doanh số')}
        {renderEmployeeTable(topSalesData.topResales || [], 'Top Resales (Đơn mua lại)', 'Doanh số')}
        {renderEmployeeTable(topSalesData.topMarketing || [], 'Top Marketing (Lead chuyển đổi)', 'Doanh số từ lead')}
      </div>
    );
  };

  const renderGrowthReport = () => {
    if (!growthData) return null;
    
    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-xl">
            <p className="text-sm text-blue-700 mb-1">Tổng khách hàng</p>
            <p className="text-2xl font-bold text-blue-700">{growthData.summary.totalCustomers}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-xl">
            <p className="text-sm text-green-700 mb-1">KH tháng này</p>
            <p className="text-2xl font-bold text-green-700">{growthData.summary.thisMonthCustomers}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-xl">
            <p className="text-sm text-purple-700 mb-1">KH tháng trước</p>
            <p className="text-2xl font-bold text-purple-700">{growthData.summary.lastMonthCustomers}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-xl">
            <p className="text-sm text-orange-700 mb-1">Tăng trưởng</p>
            <p className={clsx(
              'text-2xl font-bold flex items-center gap-1',
              Number(growthData.summary.customerGrowthRate) >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {Number(growthData.summary.customerGrowthRate) >= 0 ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
              {growthData.summary.customerGrowthRate}%
            </p>
          </div>
        </div>

        {/* Customer Growth */}
        {growthData.customerGrowth && growthData.customerGrowth.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Tăng trưởng khách hàng theo tháng</h3>
            <div className="responsive-table-container">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tháng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">KH mới</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đã mua hàng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tỷ lệ chuyển đổi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {growthData.customerGrowth.map((item: any, index: number) => (
                    <tr key={index}>
                      <td className="px-4 py-3 font-medium">
                        {formatMonthYear(item.period)}
                      </td>
                      <td className="px-4 py-3 text-right">{Number(item.new_customers)}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                        {Number(item.converted_customers)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Number(item.new_customers) > 0 
                          ? ((Number(item.converted_customers) / Number(item.new_customers)) * 100).toFixed(1)
                          : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* New Products */}
        {growthData.newProducts && growthData.newProducts.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Sản phẩm mới (90 ngày gần đây)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {growthData.newProducts.map((product: any) => (
                <div key={product.id} className="p-3 bg-gray-50 rounded-lg">
                  {product.thumbnail && (
                    <img src={resolveUploadUrl(product.thumbnail)} alt="" className="w-full h-20 object-cover rounded mb-2" />
                  )}
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-xs text-gray-500">{product.code}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTargetsReport = () => {
    if (!targetsData) return null;
    
    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-xl">
            <p className="text-sm text-blue-700 mb-1">Tổng mục tiêu</p>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(targetsData.summary.totalTarget)}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-xl">
            <p className="text-sm text-green-700 mb-1">Đã đạt</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(targetsData.summary.totalActual)}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-xl">
            <p className="text-sm text-orange-700 mb-1">Còn lại</p>
            <p className="text-2xl font-bold text-orange-700">{formatCurrency(targetsData.summary.totalRemaining)}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-xl">
            <p className="text-sm text-purple-700 mb-1">Tiến độ</p>
            <p className="text-2xl font-bold text-purple-700">{targetsData.summary.totalProgress.toFixed(1)}%</p>
          </div>
        </div>

        {/* By Division */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="text-lg font-semibold mb-4">Chi tiết theo KHỐI</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">KHỐI</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Chức năng</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Mục tiêu</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đã đạt</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tiến độ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {targetsData.divisions.map((item: any) => (
                  <tr key={item.division.id} className={item.division.status === 'DEVELOPING' ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.division.name}</div>
                      {item.division.status === 'DEVELOPING' && (
                        <span className="text-xs text-yellow-600">Đang phát triển</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        {item.division.hasMarketing && <span className="text-xs px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded">M</span>}
                        {item.division.hasSales && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">S</span>}
                        {item.division.hasResales && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">R</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(item.target.annual)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(item.actual)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={clsx(
                        'font-bold',
                        item.progress >= 80 ? 'text-green-600' :
                        item.progress >= 50 ? 'text-blue-600' :
                        item.progress >= 30 ? 'text-orange-600' : 'text-red-600'
                      )}>
                        {item.progress.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderCropsReport = () => {
    if (!cropsData) return null;
    
    return (
      <div className="space-y-6">
        {/* Khách hàng theo cây trồng */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="text-lg font-semibold mb-4">Khách hàng theo cây trồng</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cây trồng</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số KH</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đã mua</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tỷ lệ CV</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cropsData.customersByCrop?.slice(0, 20).map((item: any, index: number) => (
                  <tr key={index} className={index < 3 ? 'bg-green-50/50' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {index < 3 && <Leaf size={16} className="text-green-600" />}
                        <span className="font-medium">{item.crop}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{Number(item.customer_count)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{Number(item.converted_count)}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(item.customer_count) > 0 
                        ? ((Number(item.converted_count) / Number(item.customer_count)) * 100).toFixed(1)
                        : 0}%
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {formatCurrency(Number(item.total_revenue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Doanh thu theo cây trồng */}
        {cropsData.revenueByCrop && cropsData.revenueByCrop.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Doanh thu theo cây trồng (đơn đã giao)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {cropsData.revenueByCrop.slice(0, 12).map((item: any, index: number) => (
                <div key={index} className={clsx(
                  'p-4 rounded-lg',
                  index < 3 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                )}>
                  <p className="font-medium text-sm mb-1">{item.crop}</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(Number(item.revenue))}</p>
                  <p className="text-xs text-gray-500">{Number(item.order_count)} đơn</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRegionsReport = () => {
    if (!regionsData) return null;
    
    return (
      <div className="space-y-6">
        {/* Theo vùng miền */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="text-lg font-semibold mb-4">Khách hàng theo vùng miền</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {regionsData.byRegion?.map((item: any, index: number) => (
              <div 
                key={index} 
                className="p-4 rounded-lg border-l-4"
                style={{ borderLeftColor: REGION_COLORS[item.region] || '#6B7280' }}
              >
                <p className="font-semibold mb-2" style={{ color: REGION_COLORS[item.region] || '#6B7280' }}>
                  {item.region}
                </p>
                <p className="text-2xl font-bold text-gray-900">{Number(item.customer_count)}</p>
                <p className="text-sm text-gray-500">Đã mua: {Number(item.converted_count)}</p>
                <p className="text-sm font-medium text-green-600 mt-1">
                  {formatCurrency(Number(item.total_revenue))}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Theo tỉnh thành */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="text-lg font-semibold mb-4">Top tỉnh thành theo doanh thu</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tỉnh/TP</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số KH</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Số đơn</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {regionsData.byProvince?.map((item: any, index: number) => (
                  <tr key={index} className={index < 3 ? 'bg-yellow-50/50' : ''}>
                    <td className="px-4 py-3">
                      <RankBadge rank={index + 1} />
                    </td>
                    <td className="px-4 py-3 font-medium">{administrativeTitleCase(item.province)}</td>
                    <td className="px-4 py-3 text-right">{Number(item.customer_count)}</td>
                    <td className="px-4 py-3 text-right">{Number(item.order_count)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {formatCurrency(Number(item.revenue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderBusinessTypesReport = () => {
    if (!businessTypesData) return null;
    
    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {businessTypesData.summary?.map((item: any, index: number) => (
            <div key={index} className={clsx(
              'p-6 rounded-xl',
              item.business_type === 'COMPANY' ? 'bg-purple-50' :
              item.business_type === 'COOPERATIVE' ? 'bg-blue-50' : 'bg-green-50'
            )}>
              <div className="flex items-center gap-3 mb-3">
                <Building2 className={clsx(
                  item.business_type === 'COMPANY' ? 'text-purple-600' :
                  item.business_type === 'COOPERATIVE' ? 'text-blue-600' : 'text-green-600'
                )} size={24} />
                <span className="font-semibold">
                  {BUSINESS_TYPE_LABELS[item.business_type] || item.business_type}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Số KH:</span>
                  <span className="font-bold">{Number(item.customer_count)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Đã mua:</span>
                  <span className="font-bold text-green-600">{Number(item.converted_count)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Doanh thu:</span>
                  <span className="font-bold">{formatCurrency(Number(item.total_revenue))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">TB/KH:</span>
                  <span className="font-bold">{formatCurrency(Number(item.avg_revenue))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">DT TB (ha):</span>
                  <span className="font-bold">{Number(item.avg_farm_area).toFixed(1)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Top Doanh nghiệp */}
        {businessTypesData.topCompanies && businessTypesData.topCompanies.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Top Doanh nghiệp</h3>
            <div className="responsive-table-container">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trang trại</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cây trồng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đơn hàng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {businessTypesData.topCompanies.map((item: any, index: number) => (
                    <tr key={item.id} className={index < 3 ? 'bg-purple-50/50' : ''}>
                      <td className="px-4 py-3"><RankBadge rank={index + 1} /></td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">{item.farmName || '-'}</td>
                      <td className="px-4 py-3 text-sm">{item.mainCrops?.slice(0, 2).join(', ') || '-'}</td>
                      <td className="px-4 py-3 text-right">{item.totalOrders}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        {formatCurrency(item.totalOrdersValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top HTX */}
        {businessTypesData.topCooperatives && businessTypesData.topCooperatives.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="text-lg font-semibold mb-4">Top Hợp tác xã</h3>
            <div className="responsive-table-container">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trang trại</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cây trồng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đơn hàng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {businessTypesData.topCooperatives.map((item: any, index: number) => (
                    <tr key={item.id} className={index < 3 ? 'bg-blue-50/50' : ''}>
                      <td className="px-4 py-3"><RankBadge rank={index + 1} /></td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">{item.farmName || '-'}</td>
                      <td className="px-4 py-3 text-sm">{item.mainCrops?.slice(0, 2).join(', ') || '-'}</td>
                      <td className="px-4 py-3 text-right">{item.totalOrders}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        {formatCurrency(item.totalOrdersValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo cáo</h1>
          <p className="text-slate-500 mt-1">Phân tích doanh thu, chi phí và hiệu suất kinh doanh</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto pb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-3 py-2 font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5 text-sm',
                activeTab === tab.id 
                  ? 'border-green-600 text-green-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Bộ lọc:</span>
          </div>
          
          {/* Date filters */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm w-36"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm w-36"
            />
          </div>

          {/* Period filter (for revenue) */}
          {activeTab === 'revenue' && (
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="day">Theo ngày</option>
              <option value="week">Theo tuần</option>
              <option value="month">Theo tháng</option>
              <option value="year">Theo năm</option>
            </select>
          )}

          {/* Division filter */}
          {divisions.length > 0 && (
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Tất cả KHỐI</option>
              {divisions.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          {/* Employee filter */}
          {(activeTab === 'revenue' || activeTab === 'top-sales') && employees.length > 0 && (
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Tất cả NV</option>
              {employees.slice(0, 50).map((e: any) => (
                <option key={e.id} value={e.id}>{e.fullName}</option>
              ))}
            </select>
          )}

          {/* Tag filter */}
          {activeTab === 'revenue' && tags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Tất cả thẻ</option>
              {tags.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={loadData}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
          >
            Áp dụng
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader className="animate-spin text-green-600" size={32} />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            <AlertCircle size={32} className="mx-auto mb-2" />
            {error}
          </div>
        ) : (
          <>
            {activeTab === 'revenue' && renderRevenueReport()}
            {activeTab === 'cost' && renderCostReport()}
            {activeTab === 'top-sales' && renderTopSalesReport()}
            {activeTab === 'growth' && renderGrowthReport()}
            {activeTab === 'targets' && renderTargetsReport()}
            {activeTab === 'crops' && renderCropsReport()}
            {activeTab === 'regions' && renderRegionsReport()}
            {activeTab === 'business-types' && renderBusinessTypesReport()}
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;
