import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, TrendingUp, Target, DollarSign, ShoppingCart, 
  ArrowUp, ArrowDown, BarChart3, ExternalLink, Loader, 
  Package, UserCheck, MapPin, Leaf, Building2, UserPlus,
  Phone, Calendar, PieChart, Activity, Map
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import { hasExecutiveReportUiAccess } from '../constants/rbac';
import GoogleMapsVietnam from '../components/GoogleMapsVietnam';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';
import clsx from 'clsx';

interface DashboardData {
  overview: {
    totalCustomers: number;
    totalLeads: number;
    totalOrders: number;
    totalProducts: number;
    totalEmployees: number;
    totalDepartments: number;
  };
  customers: {
    today: number;
    yesterday: number;
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    lastMonth: number;
    thisYear: number;
    lastYear: number;
    growthDay: number;
    growthWeek: number;
    growthMonth: number;
    growthYear: number;
  };
  leads: {
    today: number;
    yesterday: number;
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    lastMonth: number;
    thisYear: number;
    lastYear: number;
    growthDay: number;
    growthWeek: number;
    growthMonth: number;
    growthYear: number;
  };
  revenue: {
    thisMonth: number;
    lastMonth: number;
    thisYear: number;
    lastYear: number;
    growthMonth: number;
    growthYear: number;
  };
  distribution: {
    byRegion: { region: string; count: number }[];
    byBusinessType: { type: string; count: number; revenue: number }[];
    byCrop: { crop: string; count: number }[];
    byLeadStatus: { status: string; count: number }[];
    topProvinces: { province: string; customer_count: number; total_revenue: number }[];
  };
  divisionTargets: {
    year: number;
    divisions: {
      id: string;
      code: string;
      name: string;
      divisionType: string;
      status: string;
      hasMarketing: boolean;
      hasSales: boolean;
      hasResales: boolean;
      target: number;
      actual: number;
      progress: number;
      remaining: number;
    }[];
    summary: {
      totalTarget: number;
      totalActual: number;
      totalProgress: number;
    };
  };
}

const formatCurrency = (value: number | undefined | null) => {
  const v = value ?? 0;
  if (v >= 1000000000) {
    return `${(v / 1000000000).toFixed(2)} tỷ`;
  }
  if (v >= 1000000) {
    return `${(v / 1000000).toFixed(1)} tr`;
  }
  return v.toLocaleString('vi-VN');
};

const formatNumber = (value: number | undefined | null) => {
  const v = value ?? 0;
  if (v >= 1000) {
    return `${(v / 1000).toFixed(1)}k`;
  }
  return String(v);
};

const GrowthBadge = ({ value }: { value: number | undefined | null }) => {
  const v = value ?? 0;
  const isPositive = v >= 0;
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded',
      isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    )}>
      {isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(v)}%
    </span>
  );
};

const ProgressBar = ({ progress, color = 'green' }: { progress: number; color?: string }) => {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500'
  };
  
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div 
        className={clsx('h-2 rounded-full transition-all duration-500', colorClasses[color] || colorClasses.green)}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  NEGOTIATING: 'Đang đàm phán',
  WON: 'Đã chốt',
  LOST: 'Mất',
  INVALID: 'Không hợp lệ'
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

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  type TimeFilterValue = 'day' | 'week' | 'month' | 'thisYear';
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>('month');

  const canViewReports = hasExecutiveReportUiAccess(hasPermission, user?.roleGroup?.code);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/dashboard');
        setData(res);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader className="animate-spin text-green-600" size={40} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        Không thể tải dữ liệu dashboard
      </div>
    );
  }

  const getGrowthValue = (type: 'customers' | 'leads') => {
    const d = data[type];
    if (timeFilter === 'day') return { current: d.today ?? 0, previous: d.yesterday ?? 0, growth: d.growthDay ?? 0 };
    if (timeFilter === 'week') return { current: d.thisWeek ?? 0, previous: d.lastWeek ?? 0, growth: d.growthWeek ?? 0 };
    if (timeFilter === 'month') return { current: d.thisMonth ?? 0, previous: d.lastMonth ?? 0, growth: d.growthMonth ?? 0 };
    if (timeFilter === 'thisYear') return { current: d.thisYear ?? 0, previous: d.lastYear ?? 0, growth: d.growthYear ?? 0 };
    return { current: d.thisMonth ?? 0, previous: d.lastMonth ?? 0, growth: d.growthMonth ?? 0 };
  };

  const customerStats = getGrowthValue('customers');
  const leadStats = getGrowthValue('leads');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Tổng quan hoạt động kinh doanh</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Filter: Hôm nay, tuần này, tháng này, năm nay */}
          <div className="flex flex-wrap bg-gray-100 rounded-lg p-1 gap-0.5">
            {[
              { value: 'day' as TimeFilterValue, label: 'Hôm nay' },
              { value: 'week' as TimeFilterValue, label: 'Tuần này' },
              { value: 'month' as TimeFilterValue, label: 'Tháng này' },
              { value: 'thisYear' as TimeFilterValue, label: 'Năm nay' }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setTimeFilter(value)}
                className={clsx(
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  timeFilter === value ? 'bg-white shadow text-green-600 font-medium' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {canViewReports && (
            <button
              onClick={() => navigate('/reports')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <BarChart3 size={18} />
              Báo cáo chi tiết
              <ExternalLink size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Khách hàng mới */}
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <UserPlus size={20} />
            </div>
            <GrowthBadge value={customerStats.growth} />
          </div>
          <p className="text-sm text-gray-500 mb-1">Khách hàng mới</p>
          <p className="text-2xl font-bold text-gray-900">{customerStats.current}</p>
          <p className="text-xs text-gray-400 mt-1">
            {timeFilter === 'day' ? 'Hôm qua' : timeFilter === 'week' ? 'Tuần trước' : timeFilter === 'month' ? 'Tháng trước' : 'Năm trước'}: {customerStats.previous}
          </p>
        </div>

        {/* Lead mới */}
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Phone size={20} />
            </div>
            <GrowthBadge value={leadStats.growth} />
          </div>
          <p className="text-sm text-gray-500 mb-1">Lead mới</p>
          <p className="text-2xl font-bold text-gray-900">{leadStats.current}</p>
          <p className="text-xs text-gray-400 mt-1">
            {timeFilter === 'day' ? 'Hôm qua' : timeFilter === 'week' ? 'Tuần trước' : timeFilter === 'month' ? 'Tháng trước' : 'Năm trước'}: {leadStats.previous}
          </p>
        </div>

        {/* Doanh thu tháng */}
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <DollarSign size={20} />
            </div>
            {(timeFilter === 'day' || timeFilter === 'week' || timeFilter === 'month') && <GrowthBadge value={data.revenue.growthMonth} />}
          </div>
          <p className="text-sm text-gray-500 mb-1">Doanh thu tháng</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.revenue.thisMonth)}</p>
          <p className="text-xs text-gray-400 mt-1">Tháng trước: {formatCurrency(data.revenue.lastMonth)}</p>
        </div>

        {/* Doanh thu năm */}
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            {timeFilter === 'thisYear' && <GrowthBadge value={data.revenue.growthYear ?? 0} />}
          </div>
          <p className="text-sm text-gray-500 mb-1">Doanh thu năm</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.revenue.thisYear)}</p>
          <p className="text-xs text-gray-400 mt-1">Năm {new Date().getFullYear()}</p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <Users size={18} className="mx-auto text-gray-400 mb-1" />
          <p className="text-lg font-bold">{formatNumber(data.overview.totalCustomers)}</p>
          <p className="text-xs text-gray-500">Tổng KH</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <Phone size={18} className="mx-auto text-gray-400 mb-1" />
          <p className="text-lg font-bold">{formatNumber(data.overview.totalLeads)}</p>
          <p className="text-xs text-gray-500">Tổng Lead</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <ShoppingCart size={18} className="mx-auto text-gray-400 mb-1" />
          <p className="text-lg font-bold">{formatNumber(data.overview.totalOrders)}</p>
          <p className="text-xs text-gray-500">Đơn hàng</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <Package size={18} className="mx-auto text-gray-400 mb-1" />
          <p className="text-lg font-bold">{formatNumber(data.overview.totalProducts)}</p>
          <p className="text-xs text-gray-500">Sản phẩm</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <UserCheck size={18} className="mx-auto text-gray-400 mb-1" />
          <p className="text-lg font-bold">{formatNumber(data.overview.totalEmployees)}</p>
          <p className="text-xs text-gray-500">Nhân sự</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <Building2 size={18} className="mx-auto text-gray-400 mb-1" />
          <p className="text-lg font-bold">{formatNumber(data.overview.totalDepartments)}</p>
          <p className="text-xs text-gray-500">Phòng ban</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phân bố theo vùng miền */}
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-blue-600" />
            <h3 className="font-semibold">Phân bố theo vùng miền</h3>
          </div>
          <div className="space-y-3">
            {data.distribution.byRegion.map((item) => {
              const total = data.distribution.byRegion.reduce((s, r) => s + Number(r.count), 0);
              const percent = total > 0 ? (Number(item.count) / total * 100) : 0;
              return (
                <div key={item.region}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium" style={{ color: REGION_COLORS[item.region] || '#6B7280' }}>
                      {item.region}
                    </span>
                    <span className="text-gray-600">{Number(item.count)} ({percent.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div 
                      className="h-2 rounded-full" 
                      style={{ 
                        width: `${percent}%`,
                        backgroundColor: REGION_COLORS[item.region] || '#6B7280'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Phân bố theo loại khách hàng */}
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-purple-600" />
            <h3 className="font-semibold">Loại khách hàng</h3>
          </div>
          <div className="space-y-4">
            {data.distribution.byBusinessType.map((item) => {
              const total = data.distribution.byBusinessType.reduce((s, b) => s + b.count, 0);
              const percent = total > 0 ? (item.count / total * 100) : 0;
              return (
                <div key={item.type} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{BUSINESS_TYPE_LABELS[item.type] || item.type}</span>
                    <span className="text-sm text-gray-500">{item.count} KH</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Doanh thu: {formatCurrency(item.revenue)}</span>
                    <span>{percent.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trạng thái Lead */}
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-orange-600" />
            <h3 className="font-semibold">Trạng thái Lead</h3>
          </div>
          <div className="space-y-2">
            {data.distribution.byLeadStatus.map((item) => {
              const total = data.distribution.byLeadStatus.reduce((s, l) => s + l.count, 0);
              const percent = total > 0 ? (item.count / total * 100) : 0;
              const isWon = item.status === 'WON';
              const isLost = item.status === 'LOST' || item.status === 'INVALID';
              return (
                <div key={item.status} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <div className={clsx(
                      'w-2 h-2 rounded-full',
                      isWon ? 'bg-green-500' : isLost ? 'bg-red-500' : 'bg-blue-500'
                    )} />
                    <span className="text-sm">{LEAD_STATUS_LABELS[item.status] || item.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.count}</span>
                    <span className="text-xs text-gray-400">({percent.toFixed(1)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bản đồ & Cây trồng */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bản đồ phân bố khách hàng */}
        <div className="bg-white p-5 rounded-xl border shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Map size={18} className="text-green-600" />
            <h3 className="font-semibold">Bản đồ phân bố khách hàng</h3>
          </div>
          <div className="h-[350px] md:h-[550px] relative z-0">
            <GoogleMapsVietnam data={data.distribution.topProvinces} maxMarkers={63} />
          </div>
        </div>

        {/* Top cây trồng & Top tỉnh thành */}
        <div className="space-y-6">
          {/* Top cây trồng */}
          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Leaf size={18} className="text-green-600" />
              <h3 className="font-semibold">Top cây trồng</h3>
            </div>
            <div className="space-y-2">
              {data.distribution.byCrop.slice(0, 8).map((item, index) => (
                <div 
                  key={item.crop} 
                  className={clsx(
                    'flex items-center justify-between p-2 rounded-lg',
                    index < 3 ? 'bg-green-50' : 'bg-gray-50'
                  )}
                >
                  <span className="text-sm truncate">{item.crop}</span>
                  <span className={clsx(
                    'text-sm font-medium ml-2',
                    index < 3 ? 'text-green-700' : 'text-gray-600'
                  )}>
                    {Number(item.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top tỉnh thành */}
          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-red-600" />
              <h3 className="font-semibold">Top tỉnh thành</h3>
            </div>
            <div className="space-y-2">
              {data.distribution.topProvinces.slice(0, 6).map((item, index) => (
                <div key={item.province} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                      index === 0 ? 'bg-yellow-400 text-yellow-900' :
                      index === 1 ? 'bg-gray-300 text-gray-700' :
                      index === 2 ? 'bg-orange-300 text-orange-800' : 'bg-gray-100 text-gray-600'
                    )}>
                      {index + 1}
                    </span>
                    <span className="text-sm">{administrativeTitleCase(item.province)}</span>
                  </div>
                  <span className="text-sm font-medium">{Number(item.customer_count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mục tiêu kinh doanh theo KHỐI */}
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <Target size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Mục tiêu kinh doanh năm {data.divisionTargets.year}
              </h2>
              <p className="text-sm text-gray-500">Tiến trình theo từng KHỐI</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Tổng tiến độ</p>
            <p className={clsx(
              'text-2xl font-bold',
              data.divisionTargets.summary.totalProgress >= 50 ? 'text-green-600' : 'text-orange-600'
            )}>
              {data.divisionTargets.summary.totalProgress.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Tổng quan */}
        <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Tổng mục tiêu</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(data.divisionTargets.summary.totalTarget)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Đã đạt</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(data.divisionTargets.summary.totalActual)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Số KHỐI</p>
            <p className="text-lg font-bold text-blue-600">{data.divisionTargets.divisions.length}</p>
          </div>
        </div>
        
        {/* Danh sách KHỐI */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.divisionTargets.divisions.map((div) => (
            <div 
              key={div.id} 
              className={clsx(
                'p-4 rounded-lg border',
                div.status === 'DEVELOPING' ? 'bg-gray-50 opacity-60' : 'bg-white'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-gray-900">{div.name}</h4>
                  <div className="flex gap-1">
                    {div.hasMarketing && <span className="text-xs px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded">M</span>}
                    {div.hasSales && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">S</span>}
                    {div.hasResales && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">R</span>}
                  </div>
                </div>
                <span className={clsx(
                  'text-lg font-bold',
                  div.progress >= 80 ? 'text-green-600' :
                  div.progress >= 50 ? 'text-blue-600' :
                  div.progress >= 30 ? 'text-orange-600' : 'text-red-600'
                )}>
                  {div.progress.toFixed(1)}%
                </span>
              </div>
              
              <ProgressBar 
                progress={div.progress} 
                color={div.progress >= 80 ? 'green' : div.progress >= 50 ? 'blue' : 'orange'}
              />
              
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>Đạt: {formatCurrency(div.actual)}</span>
                <span>Mục tiêu: {formatCurrency(div.target)}</span>
              </div>
              
              {div.status === 'DEVELOPING' && (
                <span className="text-xs text-yellow-600 mt-1 block">Đang phát triển</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Link for BOD/ADM */}
      {canViewReports && (
        <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 rounded-xl text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold mb-1">Báo cáo chi tiết</h3>
              <p className="text-green-100 text-sm">
                Xem báo cáo doanh thu, chi phí, top nhân viên, phân tích theo cây trồng, vùng miền và nhiều hơn nữa
              </p>
            </div>
            <button
              onClick={() => navigate('/reports')}
              className="px-6 py-3 bg-white text-green-700 rounded-lg font-semibold hover:bg-green-50 flex items-center gap-2"
            >
              <BarChart3 size={20} />
              Mở báo cáo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
