import { useState, useEffect, useCallback } from 'react';
import { 
  Package, Search, Filter, Plus, Eye, CheckCircle, Truck, 
  RefreshCw, User, MapPin, 
  X, Clock, AlertCircle, Check, Send, FileText, TrendingUp, ShoppingCart, Ban, ClipboardList, Loader,
  BarChart3, Settings2, ListChecks, Printer, Trash2, Building2
} from 'lucide-react';
import { orderApi } from '../api/orderApi';
import type { OrderFilters } from '../api/orderApi';
import CreateOrderModal from '../components/CreateOrderModal';
import PaginationBar from '../components/PaginationBar';
import { useAuthStore } from '../context/useAuthStore';
import type { Order, OrderStats } from '../types';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { formatDateTime } from '../utils/format';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';

// Status badges config - bao gồm tất cả trạng thái Viettel Post
const SHIPPING_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Chờ xác nhận', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  CONFIRMED: { label: 'Đã tiếp nhận', color: 'text-blue-700', bg: 'bg-blue-100' },
  PICKING: { label: 'Đang lấy hàng', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  PICKED: { label: 'Đã lấy hàng', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  IN_WAREHOUSE: { label: 'Đã nhập kho', color: 'text-cyan-700', bg: 'bg-cyan-100' },
  IN_TRANSIT: { label: 'Đang vận chuyển', color: 'text-purple-700', bg: 'bg-purple-100' },
  AT_DESTINATION: { label: 'Đã đến kho đích', color: 'text-purple-600', bg: 'bg-purple-50' },
  DELIVERING: { label: 'Đang phát hàng', color: 'text-violet-700', bg: 'bg-violet-100' },
  DELIVERED: { label: 'Đã giao', color: 'text-green-700', bg: 'bg-green-100' },
  DELIVERY_FAILED: { label: 'Phát hàng thất bại', color: 'text-red-600', bg: 'bg-red-100' },
  RETURNING: { label: 'Đang chuyển hoàn', color: 'text-amber-700', bg: 'bg-amber-100' },
  RETURNED: { label: 'Hoàn trả', color: 'text-orange-700', bg: 'bg-orange-100' },
  LOST: { label: 'Hàng thất lạc', color: 'text-red-700', bg: 'bg-red-100' },
  DAMAGED: { label: 'Hàng hư hỏng', color: 'text-red-600', bg: 'bg-red-50' },
  COD_COLLECTED: { label: 'COD đã thu', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  COD_TRANSFERRED: { label: 'COD đã chuyển', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  CANCELLED: { label: 'Đã hủy', color: 'text-gray-700', bg: 'bg-gray-200' },
  SHIPPING: { label: 'Đang giao', color: 'text-purple-700', bg: 'bg-purple-100' }, // legacy
  UNKNOWN: { label: 'Khác', color: 'text-gray-600', bg: 'bg-gray-100' }
};

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: 'Nháp', color: 'text-gray-700', bg: 'bg-gray-100' },
  CONFIRMED: { label: 'Đã xác nhận', color: 'text-blue-700', bg: 'bg-blue-100' },
  PROCESSING: { label: 'Đang xử lý', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  COMPLETED: { label: 'Hoàn thành', color: 'text-green-700', bg: 'bg-green-100' },
  CANCELLED: { label: 'Đã hủy', color: 'text-red-700', bg: 'bg-red-100' },
  RETURNED: { label: 'Hoàn trả', color: 'text-orange-700', bg: 'bg-orange-100' }
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Chưa thanh toán', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  PARTIAL: { label: 'Thanh toán một phần', color: 'text-blue-700', bg: 'bg-blue-100' },
  PAID: { label: 'Đã thanh toán', color: 'text-green-700', bg: 'bg-green-100' },
  REFUNDED: { label: 'Đã hoàn tiền', color: 'text-red-700', bg: 'bg-red-100' }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const todayVnYmd = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const Orders = () => {
  const { hasPermission } = useAuthStore();
  const canCreateOrder = hasPermission('CREATE_ORDER') || hasPermission('MANAGE_ORDERS');
  const canManageShipping = hasPermission('MANAGE_SHIPPING');
  const canAssignShippingQuota = hasPermission('ASSIGN_SHIPPING_DAILY_QUOTA');
  const canDeleteOrder = hasPermission('DELETE_ORDER');

  // State
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  
  // Filters
  const [filters, setFilters] = useState<OrderFilters>({
    page: 1,
    limit: 25,
    search: '',
    shippingStatus: 'all',
    orderStatus: 'all'
  });
  const handleLimitChange = (limit: number) => {
    setFilters((prev: OrderFilters) => ({ ...prev, limit, page: 1 }));
  };
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Print Config
  const [showPrintConfig, setShowPrintConfig] = useState(false);
  const [printTarget, setPrintTarget] = useState<{ singular?: Order; plural?: string[] } | null>(null);

  const [shippingQuotaDate, setShippingQuotaDate] = useState(todayVnYmd);
  const [myShippingQuota, setMyShippingQuota] = useState<{
    workDate: string;
    targetCount: number;
    confirmedCount: number;
    declinedCount: number;
    doneTotal: number;
    hasQuotaRow: boolean;
  } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [managerQuotaDraft, setManagerQuotaDraft] = useState<Record<string, number>>({});
  const [managerQuotaList, setManagerQuotaList] = useState<
    Array<{
      employeeId: string;
      fullName: string;
      code: string;
      targetCount: number;
      doneTotal: number;
      confirmedCount: number;
      declinedCount: number;
    }>
  >([]);
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [distributeLoading, setDistributeLoading] = useState(false);
  const showShippingQuotaTab = canManageShipping || canAssignShippingQuota;
  const [ordersMainTab, setOrdersMainTab] = useState<'list' | 'quota' | 'split'>('list');

  // Bulk selection
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await orderApi.getOrders(filters);
      setOrders(response.data || []);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await orderApi.getStats();
      setStats(response);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchStats();
  }, [fetchOrders, fetchStats]);

  const loadMyShippingQuota = useCallback(async () => {
    if (!canManageShipping) return;
    setQuotaLoading(true);
    try {
      const d = await orderApi.getMyShippingDailyQuota(shippingQuotaDate);
      setMyShippingQuota(d);
    } catch {
      setMyShippingQuota(null);
    } finally {
      setQuotaLoading(false);
    }
  }, [canManageShipping, shippingQuotaDate]);

  const loadManagerShippingQuotas = useCallback(async () => {
    if (!canAssignShippingQuota) return;
    try {
      const [emps, listData] = await Promise.all([
        orderApi.getShippingAssignableEmployees(),
        orderApi.listShippingDailyQuotas(shippingQuotaDate),
      ]);
      const byEmp = new Map(listData.items.map((r) => [r.employeeId, r]));
      const merged = emps.map((e) => {
        const row = byEmp.get(e.id);
        return {
          employeeId: e.id,
          fullName: e.fullName,
          code: e.code,
          targetCount: row?.targetCount ?? 0,
          doneTotal: row?.doneTotal ?? 0,
          confirmedCount: row?.confirmedCount ?? 0,
          declinedCount: row?.declinedCount ?? 0,
        };
      });
      setManagerQuotaList(merged);
      const draft: Record<string, number> = {};
      merged.forEach((m) => {
        draft[m.employeeId] = m.targetCount;
      });
      setManagerQuotaDraft(draft);
    } catch {
      setManagerQuotaList([]);
    }
  }, [canAssignShippingQuota, shippingQuotaDate]);

  useEffect(() => {
    loadMyShippingQuota();
  }, [loadMyShippingQuota]);

  useEffect(() => {
    loadManagerShippingQuotas();
  }, [loadManagerShippingQuotas]);

  // Handlers
  const handleSearch = (value: string) => {
    setFilters((prev: OrderFilters) => ({ ...prev, search: value, page: 1 }));
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev: OrderFilters) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev: OrderFilters) => ({ ...prev, page }));
  };

  const handleOrderDelete = async (id: string, orderDate: string, code: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN đơn hàng ${code}? Thao tác này không thể hoàn tác.`)) {
      return;
    }

    try {
      setActionLoading(id);
      await orderApi.deleteOrder(id, orderDate);
      
      // Refresh list
      fetchOrders();
      fetchStats();
      
      if (showDetailModal && selectedOrder?.id === id) {
        setShowDetailModal(false);
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi xóa đơn hàng');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDistributePendingConfirm = async () => {
    const msg =
      'Xác nhận chia đều (round-robin) toàn bộ đơn «Chờ xác nhận» trong phạm vi của bạn cho các NV loại Vận đơn đang hoạt động?';
    if (!window.confirm(msg)) return;
    setDistributeLoading(true);
    try {
      const res = await orderApi.distributePendingConfirm({ mode: 'even' });
      const lines = res.byEmployee.map((x) => `${x.code}: ${x.count}`).join(', ');
      alert(
        res.updated === 0
          ? 'Không có đơn «Chờ xác nhận» nào trong phạm vi (hoặc không còn đơn phù hợp).'
          : `Đã xác nhận ${res.updated} đơn. Phân bổ: ${lines || '—'}`
      );
      await fetchOrders();
      await fetchStats();
    } catch (error: unknown) {
      const m = error instanceof Error ? error.message : 'Không thực hiện được chia xác nhận.';
      alert(m);
    } finally {
      setDistributeLoading(false);
    }
  };

  const handleSaveShippingQuotas = async () => {
    if (!canAssignShippingQuota) return;
    setQuotaSaving(true);
    try {
      const items = managerQuotaList.map((m) => ({
        employeeId: m.employeeId,
        targetCount: Math.max(0, Math.floor(Number(managerQuotaDraft[m.employeeId]) || 0)),
      }));
      await orderApi.upsertShippingDailyQuotas({ workDate: shippingQuotaDate, items });
      await loadManagerShippingQuotas();
      await loadMyShippingQuota();
    } catch (error: any) {
      alert(error.message || 'Không lưu được chỉ tiêu vận đơn theo ngày');
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleViewDetail = async (order: Order) => {
    try {
      const detail = await orderApi.getOrderById(order.id, order.orderDate);
      setSelectedOrder(detail);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Error fetching order detail:', error);
    }
  };

  const handleConfirmOrder = async (order: Order) => {
    if (!window.confirm('Xác nhận đơn hàng này?')) return;
    try {
      setActionLoading(order.id);
      await orderApi.confirmOrder(order.id, order.orderDate);
      fetchOrders();
      fetchStats();
      loadMyShippingQuota();
      loadManagerShippingQuotas();
      if (selectedOrder?.id === order.id) {
        const detail = await orderApi.getOrderById(order.id, order.orderDate);
        setSelectedOrder(detail);
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi xác nhận đơn hàng');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePushToVTP = async (order: Order) => {
    if (!window.confirm('Đẩy đơn hàng sang Viettel Post?')) return;
    try {
      setActionLoading(order.id);
      const result = await orderApi.pushToViettelPost(
        order.id,
        order.orderDate,
        order.warehouseId ? { warehouseId: order.warehouseId } : undefined
      );
      if (window.confirm(`${result.message}\nMã vận đơn: ${result.trackingNumber}\n\nBạn có muốn IN VẬN ĐƠN ngay không?`)) {
        const printRes = await orderApi.printViettelPost(result.trackingNumber);
        if (printRes.data?.PRINT_URL) {
          window.open(printRes.data.PRINT_URL, '_blank');
        }
      }
      fetchOrders();
      fetchStats();
      if (selectedOrder?.id === order.id) {
        const detail = await orderApi.getOrderById(order.id, order.orderDate);
        setSelectedOrder(detail);
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi đẩy đơn hàng');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintVTP = (order: Order) => {
    if (!order.trackingNumber) {
      alert('Đơn hàng chưa có mã vận đơn');
      return;
    }
    setPrintTarget({ singular: order });
    setShowPrintConfig(true);
  };

  const handleBulkPrintVTP = () => {
    const selectedList = orders.filter(o => selectedOrders.has(`${o.id}-${o.orderDate}`));
    const trackingNumbers = selectedList
      .filter(o => o.trackingNumber && o.shippingProvider === 'VIETTEL_POST')
      .map(o => o.trackingNumber!);

    if (trackingNumbers.length === 0) {
      alert('Vui lòng chọn các đơn có vận đơn Viettel Post để in.');
      return;
    }

    if (trackingNumbers.length > 100) {
      alert('Viettel Post chỉ hỗ trợ in tối đa 100 vận đơn một lúc.');
      return;
    }

    setPrintTarget({ plural: trackingNumbers });
    setShowPrintConfig(true);
  };

  const executePrint = async (options: { printType: string; showPostage: boolean; copies: number }) => {
    if (!printTarget) return;

    try {
      setActionLoading('print_process');
      const res = await orderApi.printViettelPost(
        printTarget.singular?.trackingNumber,
        printTarget.plural,
        { printType: options.printType, showPostage: options.showPostage }
      );

      if (res.data?.PRINT_URL) {
        // Mở link in - lặp theo số liên
        for (let i = 0; i < options.copies; i++) {
          window.open(res.data.PRINT_URL, '_blank');
        }
        
        fetchOrders();
        if (printTarget.plural) {
          setSelectedOrders(new Set());
        }
        setShowPrintConfig(false);
        setPrintTarget(null);
      } else {
        alert('Không lấy được link in từ Viettel Post');
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi lấy link in vận đơn');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelViettelPost = async (order: Order) => {
    if (!window.confirm('Hủy vận đơn trên Viettel Post? (Chỉ thành công khi VTP còn cho phép hủy theo trạng thái vận đơn.)')) return;
    const noteRaw = window.prompt('Ghi chú hủy gửi lên Viettel Post (tùy chọn):');
    try {
      setActionLoading(order.id);
      const result = await orderApi.cancelViettelPost(
        order.id,
        order.orderDate,
        noteRaw && noteRaw.trim() ? { note: noteRaw.trim() } : undefined
      );
      alert(result.message || 'Đã hủy trên Viettel Post');
      fetchOrders();
      fetchStats();
      if (selectedOrder?.id === order.id) {
        const detail = await orderApi.getOrderById(order.id, order.orderDate);
        setSelectedOrder(detail);
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi hủy vận đơn Viettel Post');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateShippingStatus = async (order: Order, status: string) => {
    const note = prompt('Ghi chú (tùy chọn):');
    try {
      setActionLoading(order.id);
      await orderApi.updateShippingStatus(order.id, order.orderDate, status, note || undefined);
      fetchOrders();
      fetchStats();
      loadMyShippingQuota();
      loadManagerShippingQuotas();
      if (selectedOrder?.id === order.id) {
        const detail = await orderApi.getOrderById(order.id, order.orderDate);
        setSelectedOrder(detail);
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi cập nhật trạng thái');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Quản lý Đơn hàng</h1>
            <p className="text-sm text-gray-500">Theo dõi và xử lý đơn hàng</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedOrders.size > 0 && ordersMainTab === 'list' && (
            <button
              onClick={handleBulkPrintVTP}
              disabled={actionLoading === 'bulk_print'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {actionLoading === 'bulk_print' ? <Loader size={20} className="animate-spin" /> : <Printer size={20} />}
              In ({selectedOrders.size}) đơn đã chọn
            </button>
          )}
          {canCreateOrder && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              <Plus size={20} />
              Tạo đơn hàng
            </button>
          )}
        </div>
      </div>

      {/* Tab: danh sách vs chỉ tiêu vận đơn */}
      {showShippingQuotaTab && (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-0">
          <button
            type="button"
            onClick={() => setOrdersMainTab('list')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              ordersMainTab === 'list'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Danh sách đơn hàng
          </button>
          <button
            type="button"
            onClick={() => setOrdersMainTab('quota')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              ordersMainTab === 'quota'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Chỉ tiêu vận đơn
          </button>
          <button
            type="button"
            onClick={() => setOrdersMainTab('split')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors inline-flex items-center gap-2 ${
              ordersMainTab === 'split'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Settings2 size={16} />
            Cấu hình chia đơn
          </button>
        </div>
      )}

      {/* Stats Cards — tab danh sách */}
      {(!showShippingQuotaTab || ordersMainTab === 'list') && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <ShoppingCart size={16} />
              Tổng đơn
            </div>
            <div className="text-2xl font-bold text-gray-800">{stats.totalOrders}</div>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
            <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
              <Clock size={16} />
              Chờ xác nhận
            </div>
            <div className="text-2xl font-bold text-yellow-700">{stats.byStatus.pending}</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
              <CheckCircle size={16} />
              Đã xác nhận
            </div>
            <div className="text-2xl font-bold text-blue-700">{stats.byStatus.confirmed}</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
            <div className="flex items-center gap-2 text-purple-600 text-sm mb-1">
              <Truck size={16} />
              Đang giao
            </div>
            <div className="text-2xl font-bold text-purple-700">{stats.byStatus.shipping}</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
              <Check size={16} />
              Đã giao
            </div>
            <div className="text-2xl font-bold text-green-700">{stats.byStatus.delivered}</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
              <AlertCircle size={16} />
              Hoàn trả
            </div>
            <div className="text-2xl font-bold text-orange-700">{stats.byStatus.returned}</div>
          </div>
          <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
            <div className="flex items-center gap-2 text-primary text-sm mb-1">
              <TrendingUp size={16} />
              Doanh thu
            </div>
            <div className="text-lg font-bold text-primary">{formatCurrency(stats.totalRevenue)}</div>
          </div>
        </div>
      )}

      {/* Cấu hình chia đơn (vận đơn) — tab riêng */}
      {showShippingQuotaTab && ordersMainTab === 'split' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-gray-800">Chia thủ công</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Mở tab <strong>Danh sách đơn hàng</strong>, lọc đơn trạng thái <strong>Chờ xác nhận</strong>, rồi dùng nút xác nhận
              từng đơn trên bảng — mỗi đơn được gán người xác nhận (NV vận đơn) theo lựa chọn tại thời điểm xử lý.
            </p>
            <button
              type="button"
              onClick={() => setOrdersMainTab('list')}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              Đi tới danh sách đơn
            </button>
          </div>

          {canAssignShippingQuota && (
            <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-amber-800" />
                <h2 className="text-lg font-semibold text-gray-800">Chia đều (hàng loạt)</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Áp dụng mọi đơn <strong>Chờ xác nhận</strong> trong phạm vi danh sách đơn của bạn; xoay vòng (
                round-robin) giữa các NV loại Vận đơn đang hoạt động. Mỗi đơn cập nhật{' '}
                <code className="rounded bg-gray-100 px-1 text-gray-800">confirmedById</code> theo NV được phân. Cần quyền{' '}
                <span className="font-medium">ASSIGN_SHIPPING_DAILY_QUOTA</span>.
              </p>
              <button
                type="button"
                disabled={distributeLoading}
                onClick={() => void handleDistributePendingConfirm()}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
              >
                {distributeLoading ? <Loader className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                Chia đều toàn bộ đơn chờ xác nhận
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chỉ tiêu — tab riêng */}
      {showShippingQuotaTab && ordersMainTab === 'quota' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ngày làm việc (giờ VN)</label>
              <input
                type="date"
                value={shippingQuotaDate}
                onChange={(e) => setShippingQuotaDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                loadMyShippingQuota();
                loadManagerShippingQuotas();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={16} />
              Làm mới chỉ tiêu
            </button>
          </div>

          {canManageShipping && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-800">Chỉ tiêu xử lý của tôi</h2>
                {quotaLoading && <Loader className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
              {myShippingQuota ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                    <div className="text-gray-500">Chỉ tiêu (đơn)</div>
                    <div className="text-xl font-bold text-gray-900">
                      {myShippingQuota.hasQuotaRow ? myShippingQuota.targetCount : '—'}
                    </div>
                    {!myShippingQuota.hasQuotaRow && (
                      <p className="text-xs text-amber-700 mt-1">Chưa có chỉ tiêu cho ngày này</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3 border border-blue-100">
                    <div className="text-blue-700">Đã xác nhận</div>
                    <div className="text-xl font-bold text-blue-900">{myShippingQuota.confirmedCount}</div>
                  </div>
                  <div className="rounded-lg bg-orange-50 p-3 border border-orange-100">
                    <div className="text-orange-700">Đã từ chối (hủy khi chờ)</div>
                    <div className="text-xl font-bold text-orange-900">{myShippingQuota.declinedCount}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
                    <div className="text-emerald-700">Tổng đã xử lý</div>
                    <div className="text-xl font-bold text-emerald-900">{myShippingQuota.doneTotal}</div>
                  </div>
                  <div className="rounded-lg bg-primary/5 p-3 border border-primary/20 md:col-span-1 col-span-2">
                    <div className="text-primary">Tiến độ</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {myShippingQuota.hasQuotaRow && myShippingQuota.targetCount > 0
                        ? `${Math.min(100, Math.round((myShippingQuota.doneTotal / myShippingQuota.targetCount) * 100))}%`
                        : '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Không tải được dữ liệu chỉ tiêu.</p>
              )}
              <p className="text-xs text-gray-500 mt-3">
                Xác nhận đơn và từ chối (hủy vận đơn khi trạng thái &quot;Chờ xác nhận&quot;) trong ngày được tính vào tiến độ.
              </p>
            </div>
          )}

          {canAssignShippingQuota && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold text-gray-800">Gán chỉ tiêu cho nhân viên vận đơn</h2>
                </div>
                <button
                  type="button"
                  onClick={handleSaveShippingQuotas}
                  disabled={quotaSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60"
                >
                  {quotaSaving ? <Loader className="w-4 h-4 animate-spin" /> : <Check size={18} />}
                  Lưu chỉ tiêu
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Chỉ áp dụng cho nhân viên loại «Vận đơn» (danh mục loại nhân viên). Đặt 0 để xóa chỉ tiêu ngày đó. Có thể gán cho chính mình nếu hồ sơ nhân viên của tài khoản cũng là Vận đơn. Chỉ nhóm quyền được gán quyền{' '}
                <code className="text-xs bg-gray-100 px-1 rounded">ASSIGN_SHIPPING_DAILY_QUOTA</code> trong catalog mới thấy bảng và lưu được.
              </p>
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nhân viên</th>
                      <th className="px-3 py-2 font-medium w-28">Mã NV</th>
                      <th className="px-3 py-2 font-medium w-32">Chỉ tiêu (đơn)</th>
                      <th className="px-3 py-2 font-medium">Đã xác nhận / Từ chối / Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerQuotaList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                          Không có nhân viên loại Vận đơn trong hệ thống hoặc chưa tải xong.
                        </td>
                      </tr>
                    ) : (
                      managerQuotaList.map((row) => (
                        <tr key={row.employeeId} className="border-t border-gray-100 hover:bg-gray-50/80">
                          <td className="px-3 py-2 font-medium text-gray-900">{row.fullName}</td>
                          <td className="px-3 py-2 text-gray-600">{row.code}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={managerQuotaDraft[row.employeeId] ?? 0}
                              onChange={(e) =>
                                setManagerQuotaDraft((prev) => ({
                                  ...prev,
                                  [row.employeeId]: e.target.value === '' ? 0 : Number(e.target.value),
                                }))
                              }
                              className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.confirmedCount} / {row.declinedCount} / <span className="font-semibold">{row.doneTotal}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters + bảng đơn — tab danh sách */}
      {(!showShippingQuotaTab || ordersMainTab === 'list') && (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Tìm theo mã đơn, mã vận đơn, tên/SĐT khách hàng..."
              value={filters.search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Quick filters */}
          <div className="flex gap-2">
            <select
              value={filters.shippingStatus}
              onChange={(e) => handleFilterChange('shippingStatus', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(SHIPPING_STATUS_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${
                showFilters ? 'border-primary text-primary bg-primary/5' : 'border-gray-300 text-gray-600'
              }`}
            >
              <Filter size={18} />
              Bộ lọc
            </button>

            <button
              onClick={() => { fetchOrders(); fetchStats(); }}
              className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Extended filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái đơn</label>
              <select
                value={filters.orderStatus}
                onChange={(e) => handleFilterChange('orderStatus', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Tất cả</option>
                {Object.entries(ORDER_STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ page: 1, limit: 25, search: '', shippingStatus: 'all', orderStatus: 'all' })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {(!showShippingQuotaTab || ordersMainTab === 'list') && (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Package size={48} className="mb-4 text-gray-300" />
            <p>Không có đơn hàng nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                      checked={orders.length > 0 && orders.every(o => selectedOrders.has(`${o.id}-${o.orderDate}`))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrders(new Set(orders.map(o => `${o.id}-${o.orderDate}`)));
                        } else {
                          setSelectedOrders(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã đơn</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Khách hàng</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhân viên</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tổng tiền</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Vận chuyển</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map((order) => {
                  const shippingConfig = SHIPPING_STATUS_CONFIG[order.shippingStatus] || SHIPPING_STATUS_CONFIG.PENDING;
                  const orderConfig = ORDER_STATUS_CONFIG[order.orderStatus] || ORDER_STATUS_CONFIG.DRAFT;
                  
                  return (
                    <tr key={`${order.id}-${order.orderDate}`} className={`hover:bg-gray-50 ${selectedOrders.has(`${order.id}-${order.orderDate}`) ? 'bg-primary/5' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                          checked={selectedOrders.has(`${order.id}-${order.orderDate}`)}
                          onChange={() => {
                            const key = `${order.id}-${order.orderDate}`;
                            const next = new Set(selectedOrders);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            setSelectedOrders(next);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="font-medium text-gray-900">{order.code}</div>
                          {order.trackingNumber && !order.isPrinted && (
                            <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded border border-amber-200">CHƯA IN</span>
                          )}
                        </div>
                        {order.trackingNumber && (
                          <div className="text-xs text-gray-500">VĐ: {order.trackingNumber}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{order.customer?.name}</div>
                        <div className="text-sm text-gray-500">{order.customer?.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {order.employee?.avatarUrl ? (
                            <img src={resolveUploadUrl(order.employee.avatarUrl)} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                              <User size={16} className="text-gray-500" />
                            </div>
                          )}
                          <span className="text-sm text-gray-700">{order.employee?.fullName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-gray-900">{formatCurrency(order.finalAmount)}</div>
                        {order.discount > 0 && (
                          <div className="text-xs text-red-500">-{formatCurrency(order.discount)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${orderConfig.bg} ${orderConfig.color}`}>
                          {orderConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${shippingConfig.bg} ${shippingConfig.color}`}>
                          {shippingConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDateTime(order.orderDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleViewDetail(order)}
                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded"
                            title="Xem chi tiết"
                          >
                            <Eye size={18} />
                          </button>
                          
                          {canManageShipping && order.shippingStatus === 'PENDING' && (
                            <button
                              onClick={() => handleConfirmOrder(order)}
                              disabled={actionLoading === order.id}
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded disabled:opacity-50"
                              title="Xác nhận đơn"
                            >
                              <CheckCircle size={18} />
                            </button>
                          )}
                          
                          {canManageShipping && order.shippingStatus === 'CONFIRMED' && (
                            <button
                              onClick={() => handlePushToVTP(order)}
                              disabled={actionLoading === order.id}
                              className="p-1.5 text-purple-500 hover:bg-purple-50 rounded disabled:opacity-50"
                              title="Đẩy Viettel Post"
                            >
                              <Send size={18} />
                            </button>
                          )}
                          
                          {canManageShipping && order.shippingStatus === 'SHIPPING' && (
                            <button
                              onClick={() => handleUpdateShippingStatus(order, 'DELIVERED')}
                              disabled={actionLoading === order.id}
                              className="p-1.5 text-green-500 hover:bg-green-50 rounded disabled:opacity-50"
                              title="Xác nhận đã giao"
                            >
                              <Check size={18} />
                            </button>
                          )}

                          {canManageShipping &&
                            order.trackingNumber &&
                            order.shippingProvider === 'VIETTEL_POST' &&
                            !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.shippingStatus) && (
                              <button
                                onClick={() => handleCancelViettelPost(order)}
                                disabled={actionLoading === order.id}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-50"
                                title="Hủy trên Viettel Post"
                              >
                                <Ban size={18} />
                              </button>
                            )}

                          {canDeleteOrder && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOrderDelete(order.id, order.orderDate, order.code);
                              }}
                              disabled={actionLoading === order.id}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                              title="Xóa vĩnh viễn"
                            >
                              {actionLoading === order.id ? <Loader className="animate-spin" size={18} /> : <Trash2 size={18} />}
                            </button>
                          )}

                          {order.trackingNumber && order.shippingProvider === 'VIETTEL_POST' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintVTP(order);
                              }}
                              disabled={actionLoading === order.id}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                              title="In vận đơn"
                            >
                              <Printer size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(pagination.totalPages > 1 || pagination.total > 0) && (
          <PaginationBar
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
            itemLabel="đơn hàng"
          />
        )}
      </div>
      )}

      {/* Order Detail Modal */}
      {showDetailModal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => { setShowDetailModal(false); setSelectedOrder(null); }}
          onConfirm={handleConfirmOrder}
          onPushVTP={handlePushToVTP}
          onCancelVTP={handleCancelViettelPost}
          onPrintVTP={handlePrintVTP}
          onUpdateStatus={handleUpdateShippingStatus}
          onDelete={handleOrderDelete}
          canManageShipping={canManageShipping}
          canDeleteOrder={canDeleteOrder}
          actionLoading={actionLoading}
        />
      )}

      {/* Create Order Modal */}
      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); fetchOrders(); fetchStats(); }}
        />
      )}

      {/* Print Config Modal */}
      {showPrintConfig && (
        <PrintVTPConfigModal
          onClose={() => { setShowPrintConfig(false); setPrintTarget(null); }}
          onConfirm={executePrint}
          loading={actionLoading === 'print_process'}
          count={printTarget?.plural?.length || 1}
        />
      )}
    </div>
  );
};

// Print Config Modal Component
const PrintVTPConfigModal = ({ 
  onClose, onConfirm, loading, count 
}: { 
  onClose: () => void; 
  onConfirm: (options: { printType: string; showPostage: boolean; copies: number }) => void;
  loading: boolean;
  count: number;
}) => {
  const [printType, setPrintType] = useState('1');
  const [showPostage, setShowPostage] = useState(true);
  const [copies, setCopies] = useState(1);

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Printer className="text-primary w-5 h-5" />
            <h2 className="text-lg font-bold text-gray-800">Cấu hình in ({count} đơn)</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Khổ giấy in</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '1', label: 'A5', desc: 'Laser' },
                { id: '2', label: 'A6', desc: 'Nhiệt' },
                { id: '100', label: 'A7', desc: 'Nhiệt' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPrintType(t.id)}
                  className={`px-3 py-3 border rounded-xl text-center transition-all ${
                    printType === t.id 
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`font-bold ${printType === t.id ? 'text-primary' : 'text-gray-700'}`}>Khổ {t.label}</div>
                  <div className="text-[10px] text-gray-500 uppercase">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Số liên cần in</label>
                <p className="text-[11px] text-gray-500">Số bản in cho mỗi vận đơn</p>
              </div>
              <div className="flex items-center border rounded-lg bg-white overflow-hidden">
                <button 
                  onClick={() => setCopies(Math.max(1, copies - 1))}
                  className="px-3 py-1 hover:bg-gray-100 text-gray-600 font-bold border-r"
                >-</button>
                <input 
                  type="number" 
                  min={1} 
                  max={5}
                  value={copies} 
                  onChange={(e) => setCopies(Math.max(1, Math.min(5, Number(e.target.value))))}
                  className="w-12 text-center text-sm font-bold focus:outline-none"
                />
                <button 
                  onClick={() => setCopies(Math.min(5, copies + 1))}
                  className="px-3 py-1 hover:bg-gray-100 text-gray-600 font-bold border-l"
                >+</button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              <div>
                <label className="block text-sm font-semibold text-gray-700 leading-none">Hiển thị phí</label>
                <p className="text-[11px] text-gray-500 mt-1">Hiện phí vận chuyển trên nhãn</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPostage(!showPostage)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-offset-2 focus:ring-2 focus:ring-primary ${
                  showPostage ? 'bg-primary' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showPostage ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button 
            disabled={loading}
            onClick={() => onConfirm({ printType, showPostage, copies })}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-50 transition-all transform active:scale-95"
          >
            {loading ? <Loader size={18} className="animate-spin" /> : <Printer size={18} />}
            Bắt đầu in {count > 1 ? count : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// Order Detail Modal Component
interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onConfirm: (order: Order) => void;
  onPushVTP: (order: Order) => void;
  onCancelVTP: (order: Order) => void;
  onPrintVTP: (order: Order) => void;
  onUpdateStatus: (order: Order, status: string) => void;
  onDelete: (id: string, orderDate: string, code: string) => void;
  canManageShipping: boolean;
  canDeleteOrder: boolean;
  actionLoading: string | null;
}

const OrderDetailModal = ({ 
  order, onClose, onConfirm, onPushVTP, onCancelVTP, onPrintVTP, onUpdateStatus, onDelete,
  canManageShipping, canDeleteOrder, actionLoading 
}: OrderDetailModalProps) => {
  const shippingConfig = SHIPPING_STATUS_CONFIG[order.shippingStatus] || SHIPPING_STATUS_CONFIG.PENDING;
  const orderConfig = ORDER_STATUS_CONFIG[order.orderStatus] || ORDER_STATUS_CONFIG.DRAFT;
  const paymentConfig = PAYMENT_STATUS_CONFIG[order.paymentStatus] || PAYMENT_STATUS_CONFIG.PENDING;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Chi tiết đơn hàng</h2>
            <p className="text-sm text-gray-500">{order.code}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status badges */}
          <div className="flex flex-wrap gap-3">
            <span className={`inline-flex px-3 py-1.5 text-sm font-medium rounded-full ${orderConfig.bg} ${orderConfig.color}`}>
              Đơn hàng: {orderConfig.label}
            </span>
            <span className={`inline-flex px-3 py-1.5 text-sm font-medium rounded-full ${shippingConfig.bg} ${shippingConfig.color}`}>
              Vận chuyển: {shippingConfig.label}
            </span>
            <span className={`inline-flex px-3 py-1.5 text-sm font-medium rounded-full ${paymentConfig.bg} ${paymentConfig.color}`}>
              Thanh toán: {paymentConfig.label}
            </span>
            {order.trackingNumber && (
              <span className="inline-flex px-3 py-1.5 text-sm font-medium rounded-full bg-purple-100 text-purple-700">
                Mã vận đơn: {order.trackingNumber}
              </span>
            )}
          </div>

          {/* Customer & Receiver Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <User size={18} />
                Thông tin khách hàng
              </h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Tên:</span> {order.customer?.name}</p>
                <p><span className="text-gray-500">SĐT:</span> {order.customer?.phone}</p>
                <p><span className="text-gray-500">Địa chỉ:</span> {order.customer?.address}</p>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <MapPin size={18} />
                Thông tin người nhận
              </h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Tên:</span> {order.receiverName || '-'}</p>
                <p><span className="text-gray-500">SĐT:</span> {order.receiverPhone || '-'}</p>
                <p><span className="text-gray-500">Địa chỉ:</span> {order.receiverAddress || '-'}</p>
                {order.receiverWard && (
                  <p><span className="text-gray-500">Phường/Xã:</span> {administrativeTitleCase(order.receiverWard)}</p>
                )}
                {order.receiverDistrict && (
                  <p><span className="text-gray-500">Quận/Huyện:</span> {administrativeTitleCase(order.receiverDistrict)}</p>
                )}
                {order.receiverProvince && (
                  <p><span className="text-gray-500">Tỉnh/TP:</span> {administrativeTitleCase(order.receiverProvince)}</p>
                )}
              </div>
            </div>

            <div className="bg-orange-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Building2 size={18} />
                Thông tin kho gửi
              </h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Kho:</span> {order.warehouse?.name || 'Chưa chọn kho'}</p>
                <p><span className="text-gray-500">Mã kho:</span> {order.warehouse?.code || '-'}</p>
                <p><span className="text-gray-500">Địa chỉ:</span> {order.warehouse?.address || order.warehouse?.detailAddress || '-'}</p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Package size={18} />
              Sản phẩm ({order.items?.length || 0})
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Sản phẩm</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">SL</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Đơn giá</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.product?.thumbnail ? (
                            <img src={resolveUploadUrl(item.product.thumbnail)} alt="" className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                              <Package size={16} className="text-gray-400" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{item.product?.name}</div>
                            <div className="text-xs text-gray-500">{item.product?.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">{item.quantity}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Tổng tiền hàng:</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(order.totalAmount)}</td>
                  </tr>
                  {order.discount > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Giảm giá:</td>
                      <td className="px-4 py-2 text-right font-medium text-red-600">-{formatCurrency(order.discount)}</td>
                    </tr>
                  )}
                  {order.shippingFee > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Phí vận chuyển:</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(order.shippingFee)}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Tổng thanh toán:</td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-primary">{formatCurrency(order.finalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Trạng thái chi tiết / Lịch sử vận chuyển từ webhook VTP */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Truck size={18} />
              Trạng thái chi tiết
              {order.trackingNumber && (
                <span className="text-sm font-normal text-gray-500">(Mã VĐ: {order.trackingNumber})</span>
              )}
            </h3>
            {order.shippingLogs && order.shippingLogs.length > 0 ? (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                <div className="space-y-4">
                  {order.shippingLogs.map((log, index) => {
                    let location = '';
                    try {
                      const raw = log.rawData ? JSON.parse(log.rawData) : {};
                      location = raw.LOCALION_CURRENTLY ?? raw.LOCATION_CURRENTLY ?? raw.location ?? '';
                    } catch (_) {}
                    return (
                      <div key={log.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${index === 0 ? 'bg-primary ring-2 ring-primary/30' : 'bg-gray-300'}`} />
                          {index < order.shippingLogs!.length - 1 && (
                            <div className="w-0.5 flex-1 min-h-[24px] bg-gray-200 mt-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <span className="font-medium text-gray-800">{log.description}</span>
                            <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(log.timestamp)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">Mã: {log.statusCode}</span>
                            {log.note && log.note.trim() && (
                              <span className="text-xs text-gray-500">• {log.note}</span>
                            )}
                          </div>
                          {location && (
                            <p className="text-xs text-gray-600 mt-2 pl-1 border-l-2 border-primary/30">{location}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-6 text-center text-gray-500 bg-gray-50/50">
                <Truck size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Chưa có cập nhật trạng thái từ Viettel Post.</p>
                <p className="text-xs mt-1">Trạng thái hiện tại: {shippingConfig.label}</p>
                {order.trackingNumber && (
                  <p className="text-xs mt-1">Mã vận đơn: {order.trackingNumber}</p>
                )}
              </div>
            )}
          </div>

          {/* Note */}
          {order.note && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <FileText size={18} />
                Ghi chú
              </h3>
              <p className="text-sm text-gray-700">{order.note}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {canManageShipping && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            {order.shippingStatus === 'PENDING' && (
              <button
                onClick={() => onConfirm(order)}
                disabled={actionLoading === order.id}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle size={18} />
                Xác nhận đơn
              </button>
            )}
            
            {order.shippingStatus === 'CONFIRMED' && (
              <button
                onClick={() => onPushVTP(order)}
                disabled={actionLoading === order.id}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                <Send size={18} />
                Đẩy Viettel Post
              </button>
            )}

            {canDeleteOrder && (
              <button
                onClick={() => onDelete(order.id, order.orderDate, order.code)}
                disabled={actionLoading === order.id}
                className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 ml-auto"
              >
                {actionLoading === order.id ? <Loader className="animate-spin" size={18} /> : <Trash2 size={18} />}
                Xóa vĩnh viễn
              </button>
            )}
            
            {order.shippingStatus === 'SHIPPING' && (
              <>
                <button
                  onClick={() => onUpdateStatus(order, 'DELIVERED')}
                  disabled={actionLoading === order.id}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Check size={18} />
                  Xác nhận đã giao
                </button>
                <button
                  onClick={() => onUpdateStatus(order, 'RETURNED')}
                  disabled={actionLoading === order.id}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  <AlertCircle size={18} />
                  Hoàn trả
                </button>
              </>
            )}

            {order.trackingNumber &&
              order.shippingProvider === 'VIETTEL_POST' &&
              !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.shippingStatus) && (
                <button
                  onClick={() => onCancelVTP(order)}
                  disabled={actionLoading === order.id}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-rose-600 text-rose-700 rounded-lg hover:bg-rose-50 disabled:opacity-50"
                >
                  <Ban size={18} />
                  Hủy trên Viettel Post
                </button>
              )}

            {order.trackingNumber && order.shippingProvider === 'VIETTEL_POST' && (
              <button
                onClick={() => onPrintVTP(order)}
                disabled={actionLoading === order.id}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              >
                <Printer size={18} />
                In vận đơn
              </button>
            )}
            
            {['PENDING', 'CONFIRMED'].includes(order.shippingStatus) && (
              <button
                onClick={() => onUpdateStatus(order, 'CANCELLED')}
                disabled={actionLoading === order.id}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <X size={18} />
                Hủy đơn
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Orders;
