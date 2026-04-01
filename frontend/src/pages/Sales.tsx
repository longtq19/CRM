import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import {
  Phone, Search, RefreshCcw, Loader,
  TrendingUp, Target, Users, MessageSquare, Eye,
  Handshake, Layers, UserPlus, Plus, Settings, Edit, Send,
  BarChart3, Trash2, Clock, Package,
} from 'lucide-react';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';
import { ToolbarButton } from '../components/ui/ToolbarButton';
import CustomerTagsManager, { CustomerTagsQuickCell, type TagBadgeModel } from '../components/CustomerTags';
import { CustomerImpactHistoryModal } from '../components/CustomerImpactHistoryModal';
import { MainCropQuickSelect } from '../components/MainCropQuickSelect';
import { CallbackScheduleCell } from '../components/CallbackScheduleCell';
import CustomerForm from '../components/CustomerForm';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import { formatDate, formatCurrency } from '../utils/format';
import { CROP_DEFS } from '../constants/cropConfigs';
import { isTechnicalAdminRole, hasModuleEffectivenessAccess } from '../constants/rbac';
import ModuleEffectivenessReport from '../components/ModuleEffectivenessReport';
import { useLeadProcessingStatuses } from '../hooks/useLeadProcessingStatuses';
import CreateOrderModal from '../components/CreateOrderModal';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';

const PRIORITY_OPTIONS = [
  { value: '1', label: 'Rất thấp' },
  { value: '2', label: 'Thấp' },
  { value: '3', label: 'Trung bình' },
  { value: '4', label: 'Cao' },
  { value: '5', label: 'Rất cao' },
];

interface SpendingRank {
  id: string;
  code: string;
  name: string;
  minAmount: number;
  maxAmount: number;
}

interface Lead {
  id: string;
  customerId: string;
  source: string;
  status: string;
  priority: number;
  assignedAt: string;
  note: string | null;
  processingStatus: string | null;
  callbackAt?: string | null;
  callbackNotifyEnabled?: boolean;
  callbackNotifyMinutesBefore?: number | null;
  callbackReminderSentAt?: string | null;
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    leadSource: { id: string; name: string } | null;
    campaign: { id: string; name: string } | null;
    province: { id: string; name: string } | null;
    tags?: Array<{ tag: { id: string; name: string; color: string; bgColor?: string | null } }>;
    phoneSecondary?: string | null;
    marketingContributors?: Array<{ employee: { id: string; fullName: string; code?: string } }>;
    mainCrops?: string[];
    mainCropsRootCounts?: unknown;
    farmArea?: number | string | null;
    farmAreaUnit?: string | null;
    soilType?: string | null;
    spendingRank?: SpendingRank | null;
    totalOrdersValue?: number;
    interactions: Array<{ id: string; type: string; content: string; createdAt: string }>;
  };
  assignedTo?: { id: string; code: string; fullName: string; avatarUrl: string | null } | null;
}

interface SalesStats {
  leads: { total: number; processing: number; converted: number };
  interactions: { today: number };
}

interface SalesOpenPoolItem {
  id: string;
  customerId: string;
  source: string;
  enteredAt: string;
  processingStatus: string | null;
  roundCount: number;
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string;
    leadSource: { id: string; name: string } | null;
    campaign: { id: string; name: string } | null;
    tags?: Array<{ tag: { id: string; name: string; color: string; bgColor?: string | null } }>;
  };
}

const Sales = () => {
  const { hasPermission, user: currentUser } = useAuthStore();
  const canManage = hasPermission('MANAGE_SALES');
  const isTechAdmin = isTechnicalAdminRole(currentUser?.roleGroup?.code);
  const canDistributeSalesOpen =
    isTechAdmin ||
    hasPermission('ASSIGN_LEAD') ||
    hasPermission('MANAGE_DATA_POOL') ||
    hasPermission('DISTRIBUTE_SALES_CROSS_ORG');
  const canDistributeToUnit = isTechAdmin || hasPermission('DISTRIBUTE_TO_UNIT') || hasPermission('MANAGE_DATA_POOL');
  const canDistributeToStaff = isTechAdmin || hasPermission('DISTRIBUTE_TO_STAFF') || hasPermission('MANAGE_DATA_POOL');
  const canClaimSalesOpen = isTechAdmin || hasPermission('CLAIM_LEAD');
  const canCreateCustomer =
    hasPermission('MANAGE_CUSTOMERS') || hasPermission('MANAGE_SALES');
  const canCreateOrder = hasPermission('CREATE_ORDER') || hasPermission('MANAGE_ORDERS');
  const canManageCustomerTags =
    hasPermission('MANAGE_CUSTOMERS') ||
    hasPermission('MANAGE_SALES') ||
    hasPermission('MANAGE_RESALES') ||
    hasPermission('MANAGE_MARKETING_GROUPS');

  const [moduleView, setModuleView] = useState<'work' | 'effectiveness'>('work');
  const canViewEffectiveness = hasModuleEffectivenessAccess(hasPermission, 'sales', currentUser?.roleGroup?.code);

  const { options: processingStatusOptions, loading: processingStatusCatalogLoading, statusLabel } =
    useLeadProcessingStatuses();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SalesStats | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [processingStatusFilter, setProcessingStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('all');
  const [mainCropFilter, setMainCropFilter] = useState('all');
  const [spendingRankFilter, setSpendingRankFilter] = useState('all');

  // Options
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string }>>([]);
  const [tagOptions, setTagOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [tagCatalog, setTagCatalog] = useState<TagBadgeModel[]>([]);
  const [provinceOptions, setProvinceOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [spendingRankOptions, setSpendingRankOptions] = useState<Array<{ code: string; name: string }>>([]);

  /** Kho Sales (chưa phân) — SALES_OPEN */
  const [salesOpenItems, setSalesOpenItems] = useState<SalesOpenPoolItem[]>([]);
  const [salesOpenLoading, setSalesOpenLoading] = useState(false);
  const [totalAvailableSalesOpen, setTotalAvailableSalesOpen] = useState(0);
  const [salesOpenPage, setSalesOpenPage] = useState(1);
  const [salesOpenTotalPages, setSalesOpenTotalPages] = useState(1);
  const [salesOpenTotal, setSalesOpenTotal] = useState(0);
  const [claimingSalesOpen, setClaimingSalesOpen] = useState(false);

  const [impactOpen, setImpactOpen] = useState(false);
  const [impactCustomerId, setImpactCustomerId] = useState('');
  const [nameModal, setNameModal] = useState<{ id: string; name: string } | null>(null);
  const [phone2Modal, setPhone2Modal] = useState<{ id: string } | null>(null);
  const [phone2Input, setPhone2Input] = useState('');
  const [savingPhone2, setSavingPhone2] = useState(false);

  const [showCustomerForm, setShowCustomerForm] = useState(false);
  /** Khi có giá trị, CustomerForm mở ở chế độ sửa khách (gồm thẻ). */
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [tagRefreshSignal, setTagRefreshSignal] = useState(0);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [createOrderCustomerId, setCreateOrderCustomerId] = useState<string | null>(null);

  /** Phân thủ công từ kho Sales (chưa phân) */
  const [salesOpenSelectedIds, setSalesOpenSelectedIds] = useState<string[]>([]);
  const [salesDistributeOpen, setSalesDistributeOpen] = useState(false);
  const [salesDistributeTargetType, setSalesDistributeTargetType] = useState<'EMPLOYEE' | 'UNIT'>('EMPLOYEE');
  const [salesDistributeTargetId, setSalesDistributeTargetId] = useState('');
  const [salesDistributing, setSalesDistributing] = useState(false);
  const [salesDistEmpOptions, setSalesDistEmpOptions] = useState<Array<{ id: string; code: string; fullName: string }>>([]);
  const [salesDistUnitOptions, setSalesDistUnitOptions] = useState<Array<{ id: string; name: string; function: string | null }>>([]);
  const [salesDistEmpSearch, setSalesDistEmpSearch] = useState('');

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (employeeFilter !== 'all') params.set('employeeId', employeeFilter);
      if (tagFilter) params.set('tagIds', tagFilter);
      if (processingStatusFilter !== 'all') params.set('processingStatus', processingStatusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (provinceFilter !== 'all') params.set('provinceId', provinceFilter);
      if (mainCropFilter !== 'all') params.set('mainCrop', mainCropFilter);
      if (spendingRankFilter !== 'all') params.set('spendingRankCode', spendingRankFilter);

      const res = await apiClient.get(`/sales/my-leads?${params}`);
      setLeads(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, pageSize, search, employeeFilter, tagFilter, processingStatusFilter, priorityFilter, sourceFilter, dateFrom, dateTo, provinceFilter, mainCropFilter, spendingRankFilter]);

  const loadStats = useCallback(async () => {
    try {
      const res = await apiClient.get('/sales/stats');
      setStats(res);
    } catch { /* ignore */ }
  }, []);

  const loadSalesOpenPool = useCallback(async () => {
    setSalesOpenLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(salesOpenPage),
        limit: '10',
        status: 'AVAILABLE',
        poolType: 'SALES',
        poolQueue: 'SALES_OPEN',
      });
      const [listRes, statRes] = await Promise.all([
        apiClient.get(`/data-pool?${params}`),
        apiClient.get('/data-pool/stats'),
      ]);
      setSalesOpenItems(listRes.data || []);
      setSalesOpenTotal(listRes.pagination?.total || 0);
      setSalesOpenTotalPages(listRes.pagination?.totalPages || 1);
      setTotalAvailableSalesOpen(statRes.totalAvailableSalesOpen ?? statRes.totalAvailable ?? 0);
    } catch { /* ignore */ }
    setSalesOpenLoading(false);
  }, [salesOpenPage]);

  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => {
    loadStats();
    apiClient.get('/hr/employees?limit=500&status=WORKING').then((res: any) => {
      setEmployees(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
    }).catch(() => {});
    apiClient.get('/customer-tags?isActive=true').then((data: any) => {
      if (Array.isArray(data)) {
        setTagOptions(data.map((t: any) => ({ id: t.id, name: t.name || t.code })));
        setTagCatalog(
          data.map((t: any) => ({
            id: t.id,
            name: t.name || t.code,
            color: t.color || '#3B82F6',
            bgColor: t.bgColor ?? null,
          })),
        );
      }
    }).catch(() => {});
    apiClient.get('/address/provinces').then((data: any) => {
      const arr = Array.isArray(data) ? data : data?.data;
      if (Array.isArray(arr)) setProvinceOptions(arr);
    }).catch(() => {});
    apiClient.get('/customer-ranks/spending-ranks').then((data: any) => {
      if (Array.isArray(data)) {
        setSpendingRankOptions(data.map((r: any) => ({ code: r.code, name: r.name })));
      }
    }).catch(() => {});
  }, [loadStats]);

  useEffect(() => { loadSalesOpenPool(); }, [loadSalesOpenPool]);

  // Real-time refresh
  useRealtimeRefresh(['DataPool', 'Customer', 'CustomerInteraction', 'CustomerTagAssignment', 'CustomerStatus'], () => {
    loadLeads();
    loadStats();
    loadSalesOpenPool();
  });

  const handleClaimSalesOpen = async () => {
    if (!canClaimSalesOpen) {
      alert('Bạn không có quyền nhận khách từ kho Sales (CLAIM_LEAD).');
      return;
    }
    const countStr = prompt('Số lượng khách muốn nhận từ kho Sales (chưa phân):', '1');
    if (!countStr) return;
    const count = parseInt(countStr, 10);
    if (!count || count <= 0) return;
    setClaimingSalesOpen(true);
    try {
      const res = await apiClient.post('/data-pool/claim', { count });
      alert(res.message || `Đã nhận ${count} khách`);
      loadSalesOpenPool();
      loadLeads();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi nhận khách');
    }
    setClaimingSalesOpen(false);
  };

  /** Phân thủ công kho Sales: load options, distribute, toggle */
  const loadSalesDistributeOptions = useCallback(async () => {
    try {
      const [empRes, unitRes] = await Promise.all([
        apiClient.get('/hr/employees?limit=1000&status=WORKING'),
        apiClient.get('/hr/departments?function=SALES&leafOnly=true'),
      ]);
      const allEmps: any[] = empRes.data || empRes || [];
      // Chỉ hiện nhân viên thuộc loại sales
      const salesEmps = allEmps.filter(e => 
        e.employeeType?.code === 'sales' || 
        ['SALES', 'MARKETING'].includes(e.salesType || '')
      );
      setSalesDistEmpOptions(salesEmps);
      setSalesDistUnitOptions(unitRes.data || unitRes || []);
    } catch { /* ignore */ }
  }, []);

  const handleDistributeSales = async () => {
    if (!salesDistributeTargetId || salesOpenSelectedIds.length === 0) return;
    setSalesDistributing(true);
    try {
      const res = await apiClient.post('/data-pool/distribute-sales', {
        leadIds: salesOpenSelectedIds,
        targetEmployeeId: salesDistributeTargetType === 'EMPLOYEE' ? salesDistributeTargetId : undefined,
        targetDepartmentId: salesDistributeTargetType === 'UNIT' ? salesDistributeTargetId : undefined,
      });
      alert(res.message || 'Đã phân chia');
      setSalesOpenSelectedIds([]);
      setSalesDistributeOpen(false);
      loadSalesOpenPool();
      loadLeads();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi phân chia');
    }
    setSalesDistributing(false);
  };

  const openSalesDistributeModal = () => {
    loadSalesDistributeOptions();
    setSalesDistributeTargetType('EMPLOYEE');
    setSalesDistributeTargetId('');
    setSalesDistEmpSearch('');
    setSalesDistributeOpen(true);
  };

  const toggleSalesOpenSelect = (id: string) => {
    setSalesOpenSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSalesOpenSelectAll = () => {
    if (salesOpenSelectedIds.length === salesOpenItems.length) setSalesOpenSelectedIds([]);
    else setSalesOpenSelectedIds(salesOpenItems.map(i => i.id));
  };

  const filteredDistEmployees = salesDistEmpSearch
    ? salesDistEmpOptions.filter(e =>
        e.fullName.toLowerCase().includes(salesDistEmpSearch.toLowerCase()) ||
        e.code.toLowerCase().includes(salesDistEmpSearch.toLowerCase())
      )
    : salesDistEmpOptions;

  const getRankStyle = (code: string) => {
    const colorMap: Record<string, { color: string; icon: string }> = {
      BRONZE: { color: 'bg-amber-100 text-amber-800', icon: '🥉' },
      SILVER: { color: 'bg-gray-200 text-gray-700', icon: '🥈' },
      GOLD: { color: 'bg-yellow-100 text-yellow-800', icon: '🥇' },
      PLATINUM: { color: 'bg-purple-100 text-purple-800', icon: '💎' },
      DIAMOND: { color: 'bg-cyan-100 text-cyan-800', icon: '💠' },
    };
    return colorMap[code] || { color: 'bg-blue-100 text-blue-800', icon: '⭐' };
  };

  const getRankBadge = (rank: SpendingRank | null | undefined) => {
    if (!rank) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
          Chưa xếp hạng
        </span>
      );
    }
    const style = getRankStyle(rank.code);
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.color}`}>
        <span>{style.icon}</span>
        {rank.name}
      </span>
    );
  };

  const handleProcessingStatusUpdate = async (dataPoolId: string, status: string) => {
    try {
      await apiClient.put('/data-pool/processing-status', { dataPoolId, processingStatus: status });
      loadLeads();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi');
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (
      !confirm(
        `Xóa vĩnh viễn khách hàng "${
          name || 'không tên'
        }" khỏi hệ thống? Phân tích và lịch sử cũng sẽ bị xóa. Bạn có chắc không?`
      )
    )
      return;
    try {
      await apiClient.delete(`/customers/${id}`);
      loadLeads();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Không thể xóa khách hàng');
    }
  };

  const saveLeadPriority = async (dataPoolId: string, value: string) => {
    const priority = parseInt(value, 10);
    if (!Number.isFinite(priority)) return;
    try {
      await apiClient.patch(`/sales/lead/${dataPoolId}/priority`, { priority });
      loadLeads();
      loadStats();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Không lưu được ưu tiên');
    }
  };

  const saveQuickName = async () => {
    if (!nameModal?.name.trim()) return;
    try {
      await apiClient.patch(`/customers/${nameModal.id}/quick-name`, { name: nameModal.name.trim() });
      setNameModal(null);
      loadLeads();
      loadStats();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Không lưu được tên');
    }
  };

  const savePhoneSecondary = async () => {
    if (!phone2Modal || !phone2Input.trim()) return;
    setSavingPhone2(true);
    try {
      await apiClient.patch(`/customers/${phone2Modal.id}/phone-secondary`, {
        phoneSecondary: phone2Input.trim(),
      });
      setPhone2Modal(null);
      setPhone2Input('');
      loadLeads();
      loadSalesOpenPool();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Không lưu được số phụ');
    }
    setSavingPhone2(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg"><TrendingUp className="w-6 h-6 text-blue-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sales</h1>
            <p className="text-sm text-gray-500">Quản lý khách hàng Sales — báo cáo hiệu quả & xếp hạng: tab «Hiệu quả & xếp hạng»</p>
          </div>
        </div>
        {canViewEffectiveness && (
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              className={`px-3 py-1.5 text-sm rounded-md ${moduleView === 'work' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              onClick={() => setModuleView('work')}
            >
              Công việc
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-sm rounded-md inline-flex items-center gap-1 ${moduleView === 'effectiveness' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              onClick={() => setModuleView('effectiveness')}
            >
              <BarChart3 className="w-4 h-4" />
              Hiệu quả & xếp hạng
            </button>
          </div>
        )}
      </div>

      {moduleView === 'effectiveness' ? (
        <ModuleEffectivenessReport variant="sales" />
      ) : (
        <>
      {/* Stats */}
      {/* Kho Sales (chưa phân) — SALES_OPEN */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50/80 rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Kho Sales (chưa phân)</h2>
              <p className="text-xs text-gray-500">Lead mới từ Marketing / import — nhận bằng quyền CLAIM_LEAD</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-500">Đang chờ nhận</p>
              <p className="text-xl font-bold text-blue-600">{totalAvailableSalesOpen}</p>
            </div>
            {canClaimSalesOpen && (
              <button
                type="button"
                onClick={handleClaimSalesOpen}
                disabled={claimingSalesOpen}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                {claimingSalesOpen ? 'Đang nhận...' : 'Nhận khách'}
              </button>
            )}
            {canDistributeSalesOpen && salesOpenSelectedIds.length > 0 && (
              <button
                type="button"
                onClick={openSalesDistributeModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                <Send className="w-4 h-4" />
                Phân chia ({salesOpenSelectedIds.length})
              </button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg border overflow-x-auto">
          {salesOpenLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <Loader className="w-5 h-5 animate-spin mr-2" /> Đang tải kho mở...
            </div>
          ) : salesOpenItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Không có lead nào trong kho Sales (chưa phân)</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {canDistributeSalesOpen && (
                    <th className="px-3 py-2 text-left w-10">
                      <input type="checkbox" checked={salesOpenSelectedIds.length === salesOpenItems.length && salesOpenItems.length > 0} onChange={toggleSalesOpenSelectAll} />
                    </th>
                  )}
                  <th className="px-3 py-2 text-left">Khách</th>
                  <th className="px-3 py-2 text-left min-w-[140px]">Thẻ KH</th>
                  <th className="px-3 py-2 text-left">SĐT</th>
                  <th className="px-3 py-2 text-left">Nền tảng</th>
                  <th className="px-3 py-2 text-left">Vào kho</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {salesOpenItems.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {canDistributeSalesOpen && (
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={salesOpenSelectedIds.includes(row.id)} onChange={() => toggleSalesOpenSelect(row.id)} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{row.customer.name}</div>
                      <div className="text-xs text-gray-400">{row.customer.code}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <CustomerTagsQuickCell
                        customerId={row.customer.id}
                        assignments={(row.customer.tags || []).map((t) => ({
                          tag: {
                            id: t.tag.id,
                            name: t.tag.name,
                            color: t.tag.color,
                            bgColor: t.tag.bgColor ?? null,
                          },
                        }))}
                        allTags={tagCatalog}
                        canEdit={canManageCustomerTags}
                        onUpdated={() => { loadSalesOpenPool(); loadStats(); }}
                        tagRefreshSignal={tagRefreshSignal}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.customer.phone}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {row.customer.campaign?.name || row.customer.leadSource?.name || row.source}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(row.enteredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {salesOpenTotalPages > 1 && (
            <div className="flex justify-end gap-2 px-3 py-2 border-t text-xs text-gray-600">
              <button
                type="button"
                disabled={salesOpenPage <= 1}
                className="px-2 py-1 border rounded disabled:opacity-40"
                onClick={() => setSalesOpenPage(p => Math.max(1, p - 1))}
              >
                Trước
              </button>
              <span>Trang {salesOpenPage}/{salesOpenTotalPages}</span>
              <button
                type="button"
                disabled={salesOpenPage >= salesOpenTotalPages}
                className="px-2 py-1 border rounded disabled:opacity-40"
                onClick={() => setSalesOpenPage(p => p + 1)}
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm"><Users className="w-4 h-4" /> Tổng khách</div>
            <p className="text-2xl font-bold mt-1">{stats.leads.total}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm"><Target className="w-4 h-4" /> Đang xử lý</div>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.leads.processing}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm"><Handshake className="w-4 h-4" /> Đã chốt</div>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats.leads.converted}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm"><MessageSquare className="w-4 h-4" /> Tương tác hôm nay</div>
            <p className="text-2xl font-bold mt-1 text-purple-600">{stats.interactions.today}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, mã..."
              className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <ToolbarButton variant="secondary" onClick={() => { loadLeads(); loadStats(); }}>
            <RefreshCcw className="w-4 h-4" /> Làm mới
          </ToolbarButton>
          {canManageCustomerTags && (
            <ToolbarButton variant="secondary" onClick={() => setTagManagerOpen(true)}>
              <Settings className="w-4 h-4" /> Quản lý thẻ
            </ToolbarButton>
          )}
          {canCreateCustomer && (
            <ToolbarButton
              variant="primary"
              onClick={() => {
                setEditingCustomerId(null);
                setShowCustomerForm(true);
              }}
            >
              <Plus className="w-4 h-4" /> Thêm khách hàng
            </ToolbarButton>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <select className="border rounded-lg px-3 py-2 text-sm" value={provinceFilter}
            onChange={e => { setProvinceFilter(e.target.value); setPage(1); }}>
            <option value="all">Tất cả tỉnh/TP</option>
            {provinceOptions.map(p => <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={mainCropFilter}
            onChange={e => { setMainCropFilter(e.target.value); setPage(1); }}>
            <option value="all">Tất cả nhóm cây</option>
            {CROP_DEFS.map(c => <option key={c.value} value={c.value}>{c.value}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={spendingRankFilter}
            onChange={e => { setSpendingRankFilter(e.target.value); setPage(1); }}>
            <option value="all">Tất cả hạng chi tiêu</option>
            <option value="__UNRANKED__">Chưa xếp hạng</option>
            {spendingRankOptions.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={employeeFilter}
            onChange={e => { setEmployeeFilter(e.target.value); setPage(1); }}>
            <option value="all">Tất cả NV</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={tagFilter}
            onChange={e => { setTagFilter(e.target.value); setPage(1); }}>
            <option value="">Tất cả thẻ</option>
            {tagOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={processingStatusFilter}
            disabled={processingStatusCatalogLoading}
            onChange={e => { setProcessingStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="all">Tất cả trạng thái</option>
            {processingStatusOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={priorityFilter}
            onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}>
            <option value="all">Tất cả ưu tiên</option>
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(1); }}>
            <option value="all">Tất cả nền tảng</option>
            <option value="MARKETING">Marketing</option>
            <option value="RECALL">Thu hồi</option>
            <option value="IMPORT">Nhập</option>
            <option value="MANUAL">Thủ công</option>
          </select>
          <div className="flex gap-1">
            <input type="date" className="border rounded-lg px-2 py-2 text-sm w-full" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
            <input type="date" className="border rounded-lg px-2 py-2 text-sm w-full" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Đang tải...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Không có dữ liệu</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-3 text-left min-w-[200px]">Khách hàng</th>
                <th className="px-3 py-3 text-left min-w-[9rem]">Nhóm cây</th>
                <th className="px-3 py-3 text-left">Liên hệ</th>
                <th className="px-3 py-3 text-left w-28">Ưu tiên</th>
                <th className="px-3 py-3 text-left">Trạng thái</th>
                <th className="px-3 py-3 text-left min-w-[11rem]">Hẹn gọi lại</th>
                <th className="px-3 py-3 text-left">NV phụ trách</th>
                <th className="px-3 py-3 text-left min-w-[120px]">NV marketing</th>
                <th className="px-3 py-3 text-left">Nền tảng</th>
                <th className="px-3 py-3 text-left min-w-[140px]">Tác động</th>
                <th className="px-3 py-3 text-center">Cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 align-top">
                    <button
                      type="button"
                      className="font-medium text-left text-blue-700 hover:underline"
                      onClick={() => setNameModal({ id: lead.customer.id, name: lead.customer.name || '' })}
                    >
                      {lead.customer.name || '—'}
                    </button>
                    <div className="text-xs text-gray-400">{lead.customer.code}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {getRankBadge(lead.customer.spendingRank)}
                      <span className="text-gray-600" title="Tổng giá trị đơn đã giao thành công (DELIVERED)">
                        Đã mua: {formatCurrency(lead.customer.totalOrdersValue ?? 0)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <CustomerTagsQuickCell
                        customerId={lead.customer.id}
                        assignments={(lead.customer.tags || []).map((t) => ({
                          tag: {
                            id: t.tag.id,
                            name: t.tag.name,
                            color: t.tag.color,
                            bgColor: t.tag.bgColor ?? null,
                          },
                        }))}
                        allTags={tagCatalog}
                        canEdit={canManageCustomerTags}
                        onUpdated={() => { loadLeads(); loadStats(); }}
                        tagRefreshSignal={tagRefreshSignal}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <MainCropQuickSelect
                      customerId={lead.customer.id}
                      mainCrops={lead.customer.mainCrops}
                      mainCropsRootCounts={lead.customer.mainCropsRootCounts}
                      farmArea={lead.customer.farmArea}
                      farmAreaUnit={lead.customer.farmAreaUnit}
                      soilType={lead.customer.soilType}
                      canEdit={canManage}
                      onSaved={() => {
                        loadLeads();
                        loadStats();
                      }}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-1 text-gray-900">
                      <Phone className="w-3 h-3 shrink-0" /> {lead.customer.phone}
                    </div>
                    {lead.customer.phoneSecondary ? (
                      <div className="text-xs text-gray-600 mt-0.5">{lead.customer.phoneSecondary}</div>
                    ) : canManage ? (
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline mt-0.5"
                        onClick={() => {
                          setPhone2Modal({ id: lead.customer.id });
                          setPhone2Input('');
                        }}
                      >
                        + Thêm SĐT phụ
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {canManage ? (
                      <select
                        className="text-xs border rounded px-1 py-0.5 w-full max-w-[9rem]"
                        value={String(lead.priority)}
                        onChange={(e) => saveLeadPriority(lead.id, e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-700">
                        {PRIORITY_OPTIONS.find((o) => o.value === String(lead.priority))?.label || lead.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {canManage ? (
                      <select
                        className="text-xs border rounded px-1 py-0.5 w-full max-w-[13rem]"
                        value={lead.processingStatus ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) handleProcessingStatusUpdate(lead.id, v);
                        }}
                      >
                        {!lead.processingStatus && (
                          <option value="">— Chọn trạng thái —</option>
                        )}
                        {processingStatusOptions.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100">
                        {statusLabel(lead.processingStatus)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <CallbackScheduleCell
                      dataPoolId={lead.id}
                      callbackAt={lead.callbackAt}
                      callbackNotifyEnabled={lead.callbackNotifyEnabled}
                      callbackNotifyMinutesBefore={lead.callbackNotifyMinutesBefore}
                      callbackReminderSentAt={lead.callbackReminderSentAt}
                      canEdit={canManage}
                      onSaved={() => {
                        loadLeads();
                        loadStats();
                      }}
                    />
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs align-top">{lead.assignedTo?.fullName || '—'}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs align-top">
                    {lead.customer.marketingContributors?.length
                      ? lead.customer.marketingContributors.map((m) => m.employee.fullName).filter(Boolean).join(', ')
                      : '—'}
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs align-top">
                    {lead.customer.campaign?.name || lead.customer.leadSource?.name || lead.source}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline text-left"
                      onClick={() => {
                        setImpactCustomerId(lead.customer.id);
                        setImpactOpen(true);
                      }}
                    >
                      {canManage ? 'Xem / thêm lịch sử tác động' : 'Xem lịch sử tác động'}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center align-top">
                    {canCreateCustomer && (
                      <button
                        type="button"
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded inline-flex"
                        title="Chi tiết khách hàng"
                        onClick={() => {
                          setEditingCustomerId(lead.customer.id);
                          setShowCustomerForm(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {canCreateOrder && (
                      <button
                        type="button"
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded inline-flex"
                        title="Tạo đơn hàng"
                        onClick={() => {
                          setCreateOrderCustomerId(lead.customer.id);
                          setCreateOrderOpen(true);
                        }}
                      >
                        <Package className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission('PERMANENT_DELETE_CUSTOMER') && (
                      <button
                        type="button"
                        className="p-1 text-red-600 hover:bg-red-50 rounded inline-flex ml-1"
                        title="Xóa vĩnh viễn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomer(lead.customer.id, lead.customer.name);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4">
        <PaginationBar
          page={page} totalPages={totalPages} total={total} limit={pageSize}
          onPageChange={setPage} onLimitChange={v => { setPageSize(normalizePageSize(v)); setPage(1); }}
        />
      </div>

      <CustomerImpactHistoryModal
        open={impactOpen}
        onClose={() => {
          setImpactOpen(false);
          setImpactCustomerId('');
        }}
        customerId={impactCustomerId}
        apiPrefix="sales"
        processingStatusOptions={processingStatusOptions}
        canAdd={canManage}
        onSaved={() => {
          loadLeads();
          loadStats();
        }}
      />

      {nameModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-xl md:rounded-xl shadow-xl w-full max-w-md p-6 h-[90vh] md:h-auto overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Đổi tên khách hàng</h3>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={nameModal.name}
              onChange={(e) => setNameModal({ ...nameModal, name: e.target.value })}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-4 py-2 text-sm border rounded-lg" onClick={() => setNameModal(null)}>
                Hủy
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
                onClick={saveQuickName}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {phone2Modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Thêm số điện thoại phụ (một lần)</h3>
            <p className="text-xs text-gray-500 mb-2">Số chính không đổi được tại đây. Số phụ chỉ nhập được một lần.</p>
            <input
              type="tel"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={phone2Input}
              onChange={(e) => setPhone2Input(e.target.value)}
              placeholder="Số điện thoại phụ"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 text-sm border rounded-lg"
                onClick={() => {
                  setPhone2Modal(null);
                  setPhone2Input('');
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
                onClick={savePhoneSecondary}
                disabled={savingPhone2 || !phone2Input.trim()}
              >
                {savingPhone2 ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomerForm && (
        <CustomerForm
          customerId={editingCustomerId ?? undefined}
          onClose={() => {
            setShowCustomerForm(false);
            setEditingCustomerId(null);
          }}
          onSaved={() => {
            setShowCustomerForm(false);
            setEditingCustomerId(null);
            loadLeads();
            loadStats();
          }}
          tagRefreshSignal={tagRefreshSignal}
        />
      )}

      {createOrderOpen && (
        <CreateOrderModal
          initialCustomerId={createOrderCustomerId}
          onClose={() => {
            setCreateOrderOpen(false);
            setCreateOrderCustomerId(null);
          }}
          onSuccess={() => {
            setCreateOrderOpen(false);
            setCreateOrderCustomerId(null);
            loadLeads();
            loadStats();
          }}
        />
      )}

      {tagManagerOpen && (
            <CustomerTagsManager
          onClose={() => {
            setTagManagerOpen(false);
            setTagRefreshSignal((n) => n + 1);
            apiClient.get('/customer-tags?isActive=true').then((data: any) => {
              if (Array.isArray(data)) {
                setTagOptions(data.map((t: any) => ({ id: t.id, name: t.name || t.code })));
                setTagCatalog(
                  data.map((t: any) => ({
                    id: t.id,
                    name: t.name || t.code,
                    color: t.color || '#3B82F6',
                    bgColor: t.bgColor ?? null,
                  })),
                );
              }
            }).catch(() => {});
          }}
        />
      )}

      {/* Modal phân chia kho Sales (chưa phân) */}
      {salesDistributeOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Phân chia {salesOpenSelectedIds.length} khách (kho Sales)</h3>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phân cho</label>
              <div className="flex gap-2 mb-3">
                {canDistributeToStaff && (
                  <button
                    type="button"
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${salesDistributeTargetType === 'EMPLOYEE' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700'}`}
                    onClick={() => { setSalesDistributeTargetType('EMPLOYEE'); setSalesDistributeTargetId(''); }}
                  >
                    Nhân viên cụ thể
                  </button>
                )}
                {canDistributeToUnit && (
                  <button
                    type="button"
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${salesDistributeTargetType === 'UNIT' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700'}`}
                    onClick={() => { setSalesDistributeTargetType('UNIT'); setSalesDistributeTargetId(''); }}
                  >
                    Đơn vị chức năng
                  </button>
                )}
              </div>

              {((salesDistributeTargetType === 'EMPLOYEE' && canDistributeToStaff) || (salesDistributeTargetType === 'UNIT' && canDistributeToUnit)) ? (
                <>
                  {salesDistributeTargetType === 'EMPLOYEE' ? (
                    <div>
                      <input
                        type="text"
                        placeholder="Tìm nhân viên..."
                        className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                        value={salesDistEmpSearch}
                        onChange={e => setSalesDistEmpSearch(e.target.value)}
                      />
                      <div className="max-h-48 overflow-y-auto border rounded-lg">
                        {filteredDistEmployees.slice(0, 50).map(emp => (
                          <div
                            key={emp.id}
                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${salesDistributeTargetId === emp.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                            onClick={() => setSalesDistributeTargetId(emp.id)}
                          >
                            {emp.fullName} <span className="text-gray-400">({emp.code})</span>
                          </div>
                        ))}
                        {filteredDistEmployees.length === 0 && <div className="px-3 py-4 text-gray-400 text-center text-sm">Không tìm thấy</div>}
                      </div>
                    </div>
                  ) : (
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={salesDistributeTargetId}
                      onChange={e => setSalesDistributeTargetId(e.target.value)}
                    >
                      <option value="">-- Chọn đơn vị --</option>
                      {salesDistUnitOptions.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.function || ''})</option>
                      ))}
                    </select>
                  )}
                </>
              ) : (
                <div className="p-4 bg-orange-50 text-orange-700 text-sm rounded-lg border border-orange-100 italic">
                  Bạn không có quyền chia khách cho mục tiêu này.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm border rounded-lg" onClick={() => setSalesDistributeOpen(false)}>Hủy</button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg disabled:opacity-50"
                onClick={handleDistributeSales}
                disabled={!salesDistributeTargetId || salesDistributing}
              >
                {salesDistributing ? 'Đang phân...' : 'Xác nhận phân chia'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default Sales;
