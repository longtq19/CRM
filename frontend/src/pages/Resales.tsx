import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import {
  UserCheck,
  Search,
  RefreshCcw,
  Loader,
  Phone,
  Mail,
  MapPin,
  Calendar,
  MessageSquare,
  AlertCircle,
  Users,
  Eye,
  Plus,
  Edit,
  Download,
  Upload,
  Settings,
  Send,
  Layers,
  UserPlus,
  BarChart3,
} from 'lucide-react';
import CustomerForm from '../components/CustomerForm';
import { CustomerImpactHistoryModal } from '../components/CustomerImpactHistoryModal';
import { MainCropQuickSelect } from '../components/MainCropQuickSelect';
import { CallbackScheduleCell } from '../components/CallbackScheduleCell';
import CustomerTagsManager, { CustomerTagsQuickCell, type TagBadgeModel } from '../components/CustomerTags';
import { ToolbarButton, ToolbarFileLabel } from '../components/ui/ToolbarButton';
import { formatDate, formatDateWeekday, formatCurrency } from '../utils/format';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';
import { CROP_DEFS } from '../constants/cropConfigs';
import { isTechnicalAdminRole, hasModuleEffectivenessAccess } from '../constants/rbac';
import ModuleEffectivenessReport from '../components/ModuleEffectivenessReport';

const PRIORITY_OPTIONS = [
  { value: '1', label: 'Rất thấp' },
  { value: '2', label: 'Thấp' },
  { value: '3', label: 'Trung bình' },
  { value: '4', label: 'Cao' },
  { value: '5', label: 'Rất cao' },
];

const PROCESSING_STATUS_OPTIONS = [
  { code: 'WRONG_NUMBER', label: 'Sai số' },
  { code: 'INVALID_NUMBER_TYPE', label: 'Số loại / không hợp lệ' },
  { code: 'NO_ANSWER', label: 'Không nghe máy' },
  { code: 'NO_NEED', label: 'Không có nhu cầu' },
  { code: 'BROWSING', label: 'Khách tham khảo' },
  { code: 'TRASH_LEAD', label: 'Sổ thả / lead rác' },
  { code: 'DEAL_CLOSED', label: 'Chốt đơn' },
  { code: 'RELEASED', label: 'Trả số / nhả lead' },
  { code: 'FOLLOW_UP_LATER', label: 'Hẹn gọi lại' },
  { code: 'COMPETITOR', label: 'Đang dùng đối thủ' },
  { code: 'PRICE_OBJECTION', label: 'Chê giá' },
];

const TYPE_TRANSLATIONS: Record<string, string> = {
  CALL: 'Gọi điện',
  SMS: 'SMS',
  EMAIL: 'Email',
  MEETING: 'Gặp mặt',
  NOTE: 'Ghi chú',
  VISIT: 'Thăm viếng',
  ZALO: 'Zalo',
  FACEBOOK: 'Facebook',
  OTHER: 'Khác',
  lead_created: 'Tạo khách hàng',
  new_lead: 'Khách hàng mới',
  NEW_LEAD: 'Khách hàng mới',
  FIELD_UPDATE: 'Cập nhật thông tin',
  SYSTEM_UPDATE: 'Hệ thống cập nhật',
  TAG_ASSIGN: 'Gắn thẻ',
  TAG_REMOVE: 'Bỏ thẻ',
  REMINDER: 'Nhắc nhở',
  CALLBACK_REMINDER: 'Nhắc gọi lại',
  marketing_duplicate_interaction: 'Trùng số (Marketing)',
};

interface SpendingRank {
  id: string;
  code: string;
  name: string;
  minAmount: number;
  maxAmount: number;
}

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  phoneSecondary?: string | null;
  email: string | null;
  address: string | null;
  membershipTier: string;
  totalOrdersValue: number;
  spendingRank: SpendingRank | null;
  leadSource?: { id: string; name: string } | null;
  campaign?: { id: string; name: string } | null;
  marketingContributors?: Array<{ employee: { id: string; fullName: string; code?: string } }>;
  mainCrops?: string[];
  mainCropsRootCounts?: unknown;
  farmArea?: number | string | null;
  farmAreaUnit?: string | null;
  soilType?: string | null;
  dataPool?: {
    id: string;
    priority: number;
    processingStatus: string | null;
    source: string;
    callbackAt?: string | null;
    callbackNotifyEnabled?: boolean;
    callbackNotifyMinutesBefore?: number | null;
    callbackReminderSentAt?: string | null;
  } | null;
  employee: {
    id: string;
    code: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
  province: { id: string; name: string } | null;
  aggregate: {
    totalOrders: number;
    totalSpent: string;
    lastOrderAt: string | null;
  } | null;
  interactions: Array<{
    id: string;
    type: string;
    content: string;
    createdAt: string;
    nextActionAt: string | null;
    employee?: { id: string; fullName: string };
  }>;
  tags?: Array<{ tag: { id: string; name: string; color: string; bgColor?: string | null } }>;
}

interface CareSchedule {
  id: string;
  type: string;
  content: string;
  nextActionAt: string;
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string;
  };
  employee: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

interface ResalesStats {
  totalCustomers: number;
  customersByTier: Record<string, number>;
  interactions: {
    today: number;
    thisMonth: number;
  };
  care: {
    upcoming: number;
    overdue: number;
  };
}

type TabType = 'customers' | 'schedule';

const Resales = () => {
  const { user, hasPermission } = useAuthStore();
  const canManage = hasPermission('MANAGE_RESALES');
  const isTechAdmin = isTechnicalAdminRole(user?.roleGroup?.code);
  const canDistributeCskh =
    isTechAdmin ||
    hasPermission('MANAGE_CSKH_POOL') ||
    hasPermission('MANAGE_DATA_POOL') ||
    hasPermission('DISTRIBUTE_SALES_CROSS_ORG');
  const canClaimCskh =
    isTechAdmin ||
    hasPermission('CLAIM_FLOATING_POOL') ||
    hasPermission('MANAGE_CSKH_POOL');
  const canManageCustomerTags =
    hasPermission('MANAGE_CUSTOMERS') ||
    hasPermission('MANAGE_SALES') ||
    hasPermission('MANAGE_RESALES') ||
    hasPermission('MANAGE_MARKETING_GROUPS');

  const [moduleView, setModuleView] = useState<'work' | 'effectiveness'>('work');
  const canViewEffectiveness = hasModuleEffectivenessAccess(hasPermission, 'cskh', user?.roleGroup?.code);

  const [activeTab, setActiveTab] = useState<TabType>('customers');
  const [stats, setStats] = useState<ResalesStats | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [tagRefreshSignal, setTagRefreshSignal] = useState(0);

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersLimit, setCustomersLimit] = useState(25);
  const [customersTotalPages, setCustomersTotalPages] = useState(1);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [customersSearch, setCustomersSearch] = useState('');
  const [membershipFilter, setMembershipFilter] = useState('all');
  const [spendingRankOptions, setSpendingRankOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [customerEmployeeFilter, setCustomerEmployeeFilter] = useState('all');
  const [customerTagFilter, setCustomerTagFilter] = useState('all');
  const [resalesTagOptions, setResalesTagOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [tagCatalog, setTagCatalog] = useState<TagBadgeModel[]>([]);
  const [cskhStageFilter, setCskhStageFilter] = useState('all');
  const [interactionDeadlineFilter, setInteractionDeadlineFilter] = useState('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('all');
  const [mainCropFilter, setMainCropFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [provinceOptions, setProvinceOptions] = useState<Array<{ id: string; name: string }>>([]);

  // Schedule state
  const [schedules, setSchedules] = useState<CareSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  // Detail modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);

  const [impactOpen, setImpactOpen] = useState(false);
  const [impactCustomerId, setImpactCustomerId] = useState('');
  const [nameModal, setNameModal] = useState<{ id: string; name: string } | null>(null);
  const [phone2Modal, setPhone2Modal] = useState<{ id: string } | null>(null);
  const [phone2Input, setPhone2Input] = useState('');
  const [savingPhone2, setSavingPhone2] = useState(false);

  /** Kho CSKH (chưa phân) */
  const [cskhPoolItems, setCskhPoolItems] = useState<Array<{ id: string; customerId: string; source: string; enteredAt: string; customer: { id: string; code: string; name: string; phone: string } }>>([]);
  const [cskhPoolLoading, setCskhPoolLoading] = useState(false);
  const [cskhPoolTotal, setCskhPoolTotal] = useState(0);
  const [cskhPoolPage, setCskhPoolPage] = useState(1);
  const [cskhPoolTotalPages, setCskhPoolTotalPages] = useState(1);
  const [cskhPoolSelectedIds, setCskhPoolSelectedIds] = useState<string[]>([]);
  const [cskhClaimLoading, setCskhClaimLoading] = useState(false);

  const [cskhDistributeOpen, setCskhDistributeOpen] = useState(false);
  const [cskhDistTargetType, setCskhDistTargetType] = useState<'EMPLOYEE' | 'UNIT'>('EMPLOYEE');
  const [cskhDistTargetId, setCskhDistTargetId] = useState('');
  const [cskhDistributing, setCskhDistributing] = useState(false);
  const [cskhDistEmpOptions, setCskhDistEmpOptions] = useState<Array<{ id: string; code: string; fullName: string }>>([]);
  const [cskhDistUnitOptions, setCskhDistUnitOptions] = useState<Array<{ id: string; name: string; function: string | null }>>([]);
  const [cskhDistEmpSearch, setCskhDistEmpSearch] = useState('');

  const loadStats = async () => {
    try {
      const params = new URLSearchParams();
      const data = await apiClient.get(`/resales/stats?${params}`);
      setStats(data);
    } catch (error) {
      console.error('Load stats error:', error);
    }
  };

  const loadCustomers = useCallback(async () => {
    try {
      setCustomersLoading(true);
      const params = new URLSearchParams({
        page: String(customersPage),
        limit: String(normalizePageSize(customersLimit)),
      });
      if (customersSearch) params.append('search', customersSearch);
      if (membershipFilter !== 'all') params.append('spendingRankCode', membershipFilter);
      if (customerEmployeeFilter && customerEmployeeFilter !== 'all') params.append('employeeId', customerEmployeeFilter);
      if (customerTagFilter && customerTagFilter !== 'all') params.append('tagIds', customerTagFilter);
      if (cskhStageFilter !== 'all') params.append('cskhStage', cskhStageFilter);
      if (interactionDeadlineFilter !== 'all') params.append('interactionDeadline', interactionDeadlineFilter);
      if (dateFromFilter) params.append('dateFrom', dateFromFilter);
      if (dateToFilter) params.append('dateTo', dateToFilter);
      if (provinceFilter !== 'all') params.append('provinceId', provinceFilter);
      if (mainCropFilter !== 'all') params.append('mainCrop', mainCropFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);

      const response = await apiClient.get(`/resales/my-customers?${params}`);
      setCustomers(response.data || []);
      setCustomersTotal(response.pagination?.total || 0);
      setCustomersTotalPages(response.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Load customers error:', error);
    } finally {
      setCustomersLoading(false);
    }
  }, [customersPage, customersLimit, customersSearch, membershipFilter, customerEmployeeFilter, customerTagFilter, cskhStageFilter, interactionDeadlineFilter, dateFromFilter, dateToFilter, provinceFilter, mainCropFilter, priorityFilter, sourceFilter]);

  const loadSchedules = async () => {
    try {
      setSchedulesLoading(true);
      const params = new URLSearchParams();
      
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
      params.append('startDate', today.toISOString().split('T')[0]);
      params.append('endDate', nextWeek.toISOString().split('T')[0]);

      const data = await apiClient.get(`/resales/care-schedule?${params}`);
      setSchedules(data || []);
    } catch (error) {
      console.error('Load schedules error:', error);
    } finally {
      setSchedulesLoading(false);
    }
  };

  const loadCustomerDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      const data = await apiClient.get(`/resales/customer/${id}`);
      setSelectedCustomer(data);
      setDetailModalOpen(true);
    } catch (error) {
      console.error('Load customer detail error:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    apiClient.get('/address/provinces').then((data: any) => {
      const arr = Array.isArray(data) ? data : data?.data;
      if (Array.isArray(arr)) setProvinceOptions(arr);
    }).catch(() => {});
    apiClient.get('/customer-ranks/spending-ranks').then((data: any) => {
      if (Array.isArray(data)) {
        setSpendingRankOptions(data.map((r: any) => ({ code: r.code, name: r.name })));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const data = await apiClient.get('/customer-tags?isActive=true');
        if (Array.isArray(data)) {
          setResalesTagOptions(data.map((t: any) => ({ id: t.id, name: t.name || t.code })));
          setTagCatalog(
            data.map((t: any) => ({
              id: t.id,
              name: t.name || t.code,
              color: t.color || '#3B82F6',
              bgColor: t.bgColor ?? null,
            })),
          );
        }
      } catch (e) {
        console.error('Load tags error', e);
      }
    };
    loadTags();
  }, []);

  useEffect(() => {
    if (activeTab === 'customers') {
      loadCustomers();
    } else {
      loadSchedules();
    }
  }, [activeTab, loadCustomers]);

  /** Kho CSKH chưa phân */
  const loadCskhPool = useCallback(async () => {
    setCskhPoolLoading(true);
    try {
      const params = new URLSearchParams({ page: String(cskhPoolPage), limit: '10', status: 'AVAILABLE', poolType: 'CSKH' });
      const res = await apiClient.get(`/data-pool?${params}`);
      setCskhPoolItems(res.data || []);
      setCskhPoolTotal(res.pagination?.total || 0);
      setCskhPoolTotalPages(res.pagination?.totalPages || 1);
    } catch { /* ignore */ }
    setCskhPoolLoading(false);
  }, [cskhPoolPage]);

  useEffect(() => { loadCskhPool(); }, [loadCskhPool]);

  const handleClaimCskh = async () => {
    const countStr = prompt('Số lượng khách muốn nhận từ kho CSKH:', '1');
    if (!countStr) return;
    const count = parseInt(countStr, 10);
    if (!count || count <= 0) return;
    setCskhClaimLoading(true);
    try {
      const res = await apiClient.post('/data-pool/claim-customer', { count });
      alert(res.message || `Đã nhận ${count} khách`);
      loadCskhPool();
      loadCustomers();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi nhận khách');
    }
    setCskhClaimLoading(false);
  };

  const loadCskhDistOptions = useCallback(async () => {
    try {
      const [empRes, unitRes] = await Promise.all([
        apiClient.get('/hr/employees?limit=500&status=WORKING'),
        apiClient.get('/hr/departments?function=SALES,CSKH&leafOnly=true'),
      ]);
      setCskhDistEmpOptions(empRes.data || empRes || []);
      setCskhDistUnitOptions(unitRes.data || unitRes || []);
    } catch { /* ignore */ }
  }, []);

  const handleDistributeCskh = async () => {
    if (!cskhDistTargetId || cskhPoolSelectedIds.length === 0) return;
    setCskhDistributing(true);
    try {
      const res = await apiClient.post('/data-pool/distribute-cskh', {
        leadIds: cskhPoolSelectedIds,
        targetEmployeeId: cskhDistTargetType === 'EMPLOYEE' ? cskhDistTargetId : undefined,
        targetDepartmentId: cskhDistTargetType === 'UNIT' ? cskhDistTargetId : undefined,
      });
      alert(res.message || 'Đã phân chia');
      setCskhPoolSelectedIds([]);
      setCskhDistributeOpen(false);
      loadCskhPool();
      loadCustomers();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi phân chia');
    }
    setCskhDistributing(false);
  };

  const openCskhDistModal = () => {
    loadCskhDistOptions();
    setCskhDistTargetType('EMPLOYEE');
    setCskhDistTargetId('');
    setCskhDistEmpSearch('');
    setCskhDistributeOpen(true);
  };

  const toggleCskhPoolSelect = (id: string) => {
    setCskhPoolSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleCskhPoolSelectAll = () => {
    if (cskhPoolSelectedIds.length === cskhPoolItems.length) setCskhPoolSelectedIds([]);
    else setCskhPoolSelectedIds(cskhPoolItems.map(i => i.id));
  };

  const filteredCskhDistEmps = cskhDistEmpSearch
    ? cskhDistEmpOptions.filter(e =>
        e.fullName.toLowerCase().includes(cskhDistEmpSearch.toLowerCase()) ||
        e.code.toLowerCase().includes(cskhDistEmpSearch.toLowerCase())
      )
    : cskhDistEmpOptions;

  const statusLabel = (code: string | null | undefined) =>
    PROCESSING_STATUS_OPTIONS.find((o) => o.code === code)?.label || code || '—';

  const saveCskhLeadPriority = async (dataPoolId: string, value: string) => {
    const priority = parseInt(value, 10);
    if (!Number.isFinite(priority)) return;
    try {
      await apiClient.patch(`/resales/lead/${dataPoolId}/priority`, { priority });
      loadCustomers();
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
      loadCustomers();
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
      loadCustomers();
      loadStats();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Không lưu được số phụ');
    }
    setSavingPhone2(false);
  };

  const handleProcessingStatusUpdate = async (dataPoolId: string, status: string) => {
    try {
      await apiClient.put('/data-pool/processing-status', { dataPoolId, processingStatus: status });
      loadCustomers();
      loadStats();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Lỗi cập nhật trạng thái');
    }
  };

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

  const getRankBadge = (rank: SpendingRank | null) => {
    if (!rank) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          Chưa xếp hạng
        </span>
      );
    }
    
    const style = getRankStyle(rank.code);
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.color}`}>
        <span>{style.icon}</span>
        {rank.name}
      </span>
    );
  };

  const getMembershipBadge = (tier: string) => {
    const style = getRankStyle(tier);
    const nameMap: Record<string, string> = {
      BRONZE: 'Đồng',
      SILVER: 'Bạc',
      GOLD: 'Vàng',
      PLATINUM: 'Bạch kim',
      DIAMOND: 'Kim cương',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.color}`}>
        <span>{style.icon}</span>
        {nameMap[tier] || tier}
      </span>
    );
  };

  const isOverdue = (dateStr: string) => {
    return new Date(dateStr) < new Date();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserCheck className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CSKH</h1>
              <p className="text-sm text-gray-500">Chăm sóc khách hàng đã mua — báo cáo hiệu quả & xếp hạng: tab «Hiệu quả & xếp hạng»</p>
            </div>
          </div>
          {moduleView === 'work' && (
            <div className="flex items-center gap-2 flex-wrap">
              <ToolbarButton
                variant="secondary"
                className="text-sm"
                onClick={async () => {
                  try {
                    const blob = await apiClient.getBlob('/customers/import/template');
                    if (blob) {
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'mau-import-khach-hang.xlsx';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    }
                  } catch (err: any) {
                    alert(err?.message || 'Không tải được file mẫu');
                  }
                }}
              >
                <Download className="w-4 h-4" />
                Tải mẫu
              </ToolbarButton>
              <ToolbarFileLabel className="text-sm">
                <Upload className="w-4 h-4" />
                {importingExcel ? 'Đang nhập...' : 'Nhập Excel'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={importingExcel}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setImportingExcel(true);
                      const form = new FormData();
                      form.append('file', file);
                      const res = await apiClient.postMultipart('/customers/import', form);
                      alert(res?.message || 'Import xong');
                      loadCustomers();
                      loadStats();
                    } catch (err: any) {
                      alert(err?.message || 'Lỗi khi import');
                    } finally {
                      setImportingExcel(false);
                      e.target.value = '';
                    }
                  }}
                />
              </ToolbarFileLabel>
              <ToolbarButton
                variant="secondary"
                className="text-sm disabled:opacity-50"
                disabled={exportingExcel}
                onClick={async () => {
                  try {
                    setExportingExcel(true);
                    const params = new URLSearchParams();
                    if (customerEmployeeFilter && customerEmployeeFilter !== 'all') params.append('employeeId', customerEmployeeFilter);
                    const blob = await apiClient.getBlob(`/customers/export/excel?${params}`);
                    if (blob) {
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `khach-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    }
                  } catch (err: any) {
                    alert(err?.message || 'Không xuất được Excel');
                  } finally {
                    setExportingExcel(false);
                  }
                }}
              >
                <Download className="w-4 h-4" />
                {exportingExcel ? 'Đang xuất...' : 'Xuất Excel'}
              </ToolbarButton>
            </div>
          )}
        </div>
        {canViewEffectiveness && (
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 w-fit">
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
        <ModuleEffectivenessReport variant="cskh" />
      ) : (
        <>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Users className="w-4 h-4" />
              Tổng khách hàng
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalCustomers}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <MessageSquare className="w-4 h-4" />
              Tương tác hôm nay
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.interactions.today}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Calendar className="w-4 h-4" />
              Lịch sắp tới
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.care.upcoming}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <AlertCircle className="w-4 h-4" />
              Quá hạn
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.care.overdue}</div>
          </div>
        </div>
      )}

      {/* Membership breakdown */}
      {stats && Object.keys(stats.customersByTier).length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Phân bố hạng thành viên</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(stats.customersByTier).map(([tier, count]) => (
              <div key={tier} className="flex items-center gap-2">
                {getMembershipBadge(tier)}
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kho CSKH (chưa phân) */}
      <div className="bg-gradient-to-r from-purple-50 to-slate-50/80 rounded-xl border border-purple-200 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Kho CSKH (chưa phân)</h2>
              <p className="text-xs text-gray-500">Lead CSKH chưa gán nhân viên — nhận hoặc phân thủ công</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-500">Đang chờ</p>
              <p className="text-xl font-bold text-purple-600">{cskhPoolTotal}</p>
            </div>
            {canClaimCskh && (
              <button
                type="button"
                onClick={handleClaimCskh}
                disabled={cskhClaimLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                {cskhClaimLoading ? 'Đang nhận...' : 'Nhận khách'}
              </button>
            )}
            {canDistributeCskh && cskhPoolSelectedIds.length > 0 && (
              <button
                type="button"
                onClick={openCskhDistModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                <Send className="w-4 h-4" />
                Phân chia ({cskhPoolSelectedIds.length})
              </button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg border overflow-x-auto">
          {cskhPoolLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <Loader className="w-5 h-5 animate-spin mr-2" /> Đang tải...
            </div>
          ) : cskhPoolItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Không có lead nào trong kho CSKH (chưa phân)</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {canDistributeCskh && (
                    <th className="px-3 py-2 text-left w-10">
                      <input type="checkbox" checked={cskhPoolSelectedIds.length === cskhPoolItems.length && cskhPoolItems.length > 0} onChange={toggleCskhPoolSelectAll} />
                    </th>
                  )}
                  <th className="px-3 py-2 text-left">Khách</th>
                  <th className="px-3 py-2 text-left">SĐT</th>
                  <th className="px-3 py-2 text-left">Nền tảng</th>
                  <th className="px-3 py-2 text-left">Vào kho</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cskhPoolItems.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {canDistributeCskh && (
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={cskhPoolSelectedIds.includes(row.id)} onChange={() => toggleCskhPoolSelect(row.id)} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{row.customer.name}</div>
                      <div className="text-xs text-gray-400">{row.customer.code}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.customer.phone}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{row.source}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(row.enteredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cskhPoolTotalPages > 1 && (
            <div className="flex justify-end gap-2 px-3 py-2 border-t text-xs text-gray-600">
              <button type="button" disabled={cskhPoolPage <= 1} className="px-2 py-1 border rounded disabled:opacity-40" onClick={() => setCskhPoolPage(p => Math.max(1, p - 1))}>Trước</button>
              <span>Trang {cskhPoolPage}/{cskhPoolTotalPages}</span>
              <button type="button" disabled={cskhPoolPage >= cskhPoolTotalPages} className="px-2 py-1 border rounded disabled:opacity-40" onClick={() => setCskhPoolPage(p => p + 1)}>Sau</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('customers')}
          className={`pb-3 px-1 font-medium ${
            activeTab === 'customers'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Khách hàng
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`pb-3 px-1 font-medium ${
            activeTab === 'schedule'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Lịch chăm sóc
        </button>
      </div>

      {/* Customers Tab */}
      {activeTab === 'customers' && (
        <>
          <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên, SĐT, mã..."
                    value={customersSearch}
                    onChange={(e) => setCustomersSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <select
                value={membershipFilter}
                onChange={(e) => setMembershipFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả hạng chi tiêu</option>
                <option value="__UNRANKED__">Chưa xếp hạng</option>
                {spendingRankOptions.map((r) => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
              <select
                value={customerTagFilter}
                onChange={(e) => setCustomerTagFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả thẻ</option>
                {resalesTagOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select
                value={customerEmployeeFilter}
                onChange={(e) => setCustomerEmployeeFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả nhân viên</option>
                <option value={user?.id}>{user?.name || 'Tôi'}</option>
              </select>
              <select
                value={cskhStageFilter}
                onChange={(e) => setCskhStageFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả giai đoạn</option>
                <option value="1">Giai đoạn 1</option>
                <option value="2">Giai đoạn 2</option>
                <option value="3">Giai đoạn 3</option>
              </select>
              <select
                value={interactionDeadlineFilter}
                onChange={(e) => setInteractionDeadlineFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Hạn tương tác</option>
                <option value="overdue">Quá hạn</option>
                <option value="soon">Sắp hết hạn</option>
                <option value="ok">Còn hạn</option>
              </select>
              <select
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả tỉnh/TP</option>
                {provinceOptions.map((p) => (
                  <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>
                ))}
              </select>
              <select
                value={mainCropFilter}
                onChange={(e) => setMainCropFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả nhóm cây</option>
                {CROP_DEFS.map((c) => (
                  <option key={c.value} value={c.value}>{c.value}</option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả ưu tiên</option>
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Tất cả nền tảng</option>
                <option value="MARKETING">Marketing</option>
                <option value="RECALL">Thu hồi</option>
                <option value="IMPORT">Nhập</option>
                <option value="MANUAL">Thủ công</option>
              </select>
              <input type="date" className="px-3 py-2 border rounded-lg text-sm" value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)} placeholder="Từ ngày" />
              <input type="date" className="px-3 py-2 border rounded-lg text-sm" value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)} placeholder="Đến ngày" />
              <button
                onClick={() => loadCustomers()}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCcw className="w-4 h-4" />
              </button>
              {canManageCustomerTags && (
                <ToolbarButton variant="secondary" onClick={() => setTagManagerOpen(true)}>
                  <Settings className="w-4 h-4" />
                  Quản lý thẻ
                </ToolbarButton>
              )}
              <ToolbarButton variant="primary" onClick={() => setShowCustomerForm(true)}>
                <Plus className="w-4 h-4" />
                Thêm khách hàng
              </ToolbarButton>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {customersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 animate-spin text-purple-600" />
              </div>
            ) : customers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Chưa có khách hàng nào</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b text-gray-600">
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
                    {customers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 align-top">
                          <button
                            type="button"
                            className="font-medium text-left text-purple-700 hover:underline"
                            onClick={() => setNameModal({ id: customer.id, name: customer.name || '' })}
                          >
                            {customer.name || '—'}
                          </button>
                          <div className="text-xs text-gray-400">{customer.code}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                            {getRankBadge(customer.spendingRank)}
                            <span className="text-gray-500">{formatCurrency(customer.aggregate?.totalSpent || 0)}</span>
                          </div>
                          <div className="mt-1">
                            <CustomerTagsQuickCell
                              customerId={customer.id}
                              assignments={(customer.tags || []).map((t) => ({
                                tag: {
                                  id: t.tag.id,
                                  name: t.tag.name,
                                  color: t.tag.color,
                                  bgColor: t.tag.bgColor ?? null,
                                },
                              }))}
                              allTags={tagCatalog}
                              canEdit={canManageCustomerTags}
                              onUpdated={() => {
                                loadCustomers();
                                loadStats();
                              }}
                              tagRefreshSignal={tagRefreshSignal}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <MainCropQuickSelect
                            customerId={customer.id}
                            mainCrops={customer.mainCrops}
                            mainCropsRootCounts={customer.mainCropsRootCounts}
                            farmArea={customer.farmArea}
                            farmAreaUnit={customer.farmAreaUnit}
                            soilType={customer.soilType}
                            canEdit={canManage}
                            onSaved={() => {
                              loadCustomers();
                              loadStats();
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-center gap-1 text-gray-900">
                            <Phone className="w-3 h-3 shrink-0" /> {customer.phone}
                          </div>
                          {customer.phoneSecondary ? (
                            <div className="text-xs text-gray-600 mt-0.5">{customer.phoneSecondary}</div>
                          ) : canManage ? (
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:underline mt-0.5"
                              onClick={() => {
                                setPhone2Modal({ id: customer.id });
                                setPhone2Input('');
                              }}
                            >
                              + Thêm SĐT phụ
                            </button>
                          ) : null}
                          {customer.email && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                              <Mail className="w-3 h-3 shrink-0" />
                              {customer.email}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {customer.dataPool?.id && canManage ? (
                            <select
                              className="text-xs border rounded px-1 py-0.5 w-full max-w-[9rem]"
                              value={String(customer.dataPool.priority || 3)}
                              onChange={(e) => saveCskhLeadPriority(customer.dataPool!.id, e.target.value)}
                            >
                              {PRIORITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-700">
                              {customer.dataPool
                                ? PRIORITY_OPTIONS.find((o) => o.value === String(customer.dataPool!.priority))?.label ||
                                  customer.dataPool.priority
                                : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {canManage && customer.dataPool?.id ? (
                            <select
                              className="text-xs border rounded px-1 py-0.5 w-full max-w-[13rem]"
                              value={customer.dataPool.processingStatus ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v) handleProcessingStatusUpdate(customer.dataPool!.id, v);
                              }}
                            >
                              {!customer.dataPool.processingStatus && (
                                <option value="">— Chọn trạng thái —</option>
                              )}
                              {PROCESSING_STATUS_OPTIONS.map((o) => (
                                <option key={o.code} value={o.code}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100">
                              {statusLabel(customer.dataPool?.processingStatus)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {customer.dataPool?.id ? (
                            <CallbackScheduleCell
                              dataPoolId={customer.dataPool.id}
                              callbackAt={customer.dataPool.callbackAt}
                              callbackNotifyEnabled={customer.dataPool.callbackNotifyEnabled}
                              callbackNotifyMinutesBefore={customer.dataPool.callbackNotifyMinutesBefore}
                              callbackReminderSentAt={customer.dataPool.callbackReminderSentAt}
                              canEdit={canManage}
                              onSaved={() => {
                                loadCustomers();
                                loadStats();
                              }}
                            />
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs align-top">{customer.employee?.fullName || '—'}</td>
                        <td className="px-3 py-3 text-gray-600 text-xs align-top">
                          {customer.marketingContributors?.length
                            ? customer.marketingContributors.map((m) => m.employee.fullName).filter(Boolean).join(', ')
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs align-top">
                          {customer.campaign?.name || customer.leadSource?.name || customer.dataPool?.source || '—'}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:underline text-left"
                            onClick={() => {
                              setImpactCustomerId(customer.id);
                              setImpactOpen(true);
                            }}
                          >
                            {canManage ? 'Xem / thêm lịch sử tác động' : 'Xem lịch sử tác động'}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-center align-top">
                          <button
                            type="button"
                            onClick={() => loadCustomerDetail(customer.id)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded inline-flex"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(customersTotalPages > 1 || customersTotal > 0) && (
              <div className="px-4 py-3 border-t bg-gray-50">
                <PaginationBar
                  page={customersPage}
                  limit={normalizePageSize(customersLimit)}
                  total={customersTotal}
                  totalPages={customersTotalPages}
                  onPageChange={setCustomersPage}
                  onLimitChange={(l) => { setCustomersLimit(normalizePageSize(l)); setCustomersPage(1); }}
                  itemLabel="khách hàng"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          {schedulesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Không có lịch chăm sóc nào trong 2 tuần tới</p>
            </div>
          ) : (
            <div className="divide-y">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className={`p-4 hover:bg-gray-50 ${
                    isOverdue(schedule.nextActionAt) ? 'bg-red-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            isOverdue(schedule.nextActionAt)
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {formatDateWeekday(schedule.nextActionAt)}
                        </span>
                        <span className="text-sm text-gray-500">{schedule.type}</span>
                      </div>
                      <div className="font-medium text-gray-900">{schedule.customer.name}</div>
                      <div className="text-sm text-gray-500">
                        <Phone className="w-3 h-3 inline mr-1" />
                        {schedule.customer.phone}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{schedule.content}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImpactCustomerId(schedule.customer.id);
                          setImpactOpen(true);
                        }}
                        className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                      >
                        Ghi nhận
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Customer Detail Modal */}
      {detailModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedCustomer.name}</h3>
                  <p className="text-sm text-gray-500">{selectedCustomer.code}</p>
                </div>
                {getRankBadge(selectedCustomer.spendingRank)}
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Contact Info */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Thông tin liên hệ</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    {selectedCustomer.phone}
                  </div>
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      {selectedCustomer.email}
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-center gap-2 col-span-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      {selectedCustomer.address}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Thẻ khách hàng</h4>
                <CustomerTagsQuickCell
                  customerId={selectedCustomer.id}
                  assignments={(selectedCustomer.tags || []).map((t) => ({
                    tag: {
                      id: t.tag.id,
                      name: t.tag.name,
                      color: t.tag.color,
                      bgColor: t.tag.bgColor ?? null,
                    },
                  }))}
                  allTags={tagCatalog}
                  canEdit={canManageCustomerTags}
                  onUpdated={() => {
                    loadCustomerDetail(selectedCustomer.id);
                    loadCustomers();
                    loadStats();
                  }}
                  tagRefreshSignal={tagRefreshSignal}
                />
              </div>

              {/* Stats */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Thống kê</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-sm text-gray-500">Đã mua (đơn giao thành công)</div>
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(selectedCustomer.totalOrdersValue ?? 0)}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-sm text-gray-500">Số đơn hàng</div>
                    <div className="text-lg font-bold">
                      {selectedCustomer.aggregate?.totalOrders || 0}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-sm text-gray-500">Đơn gần nhất</div>
                    <div className="text-lg font-bold">
                      {selectedCustomer.aggregate?.lastOrderAt
                        ? formatDate(selectedCustomer.aggregate.lastOrderAt)
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lịch sử tác động / Tương tác */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Lịch sử tác động</h4>
                {selectedCustomer.interactions && selectedCustomer.interactions.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedCustomer.interactions.map((interaction) => (
                      <div key={interaction.id} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-x-2">
                          <span className="text-sm font-medium">
                            {TYPE_TRANSLATIONS[interaction.type] || interaction.type}
                            {interaction.employee?.fullName && (
                              <span className="font-normal text-gray-500"> — bởi {interaction.employee.fullName}</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDate(interaction.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{interaction.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Chưa có lịch sử tác động</p>
                )}
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDetailModalOpen(false);
                  setEditingCustomerId(selectedCustomer.id);
                  setShowCustomerForm(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Edit className="w-4 h-4" />
                Chỉnh sửa
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailModalOpen(false);
                  setImpactCustomerId(selectedCustomer.id);
                  setImpactOpen(true);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Lịch sử / thêm ghi chú
              </button>
              <button
                onClick={() => {
                  setDetailModalOpen(false);
                  setSelectedCustomer(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomerImpactHistoryModal
        open={impactOpen}
        onClose={() => {
          setImpactOpen(false);
          setImpactCustomerId('');
        }}
        customerId={impactCustomerId}
        apiPrefix="resales"
        processingStatusOptions={PROCESSING_STATUS_OPTIONS}
        canAdd={canManage}
        onSaved={() => {
          loadCustomers();
          loadStats();
          if (activeTab === 'schedule') loadSchedules();
        }}
      />

      {nameModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
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
              <button type="button" className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg" onClick={saveQuickName}>
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
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg disabled:opacity-50"
                onClick={savePhoneSecondary}
                disabled={savingPhone2 || !phone2Input.trim()}
              >
                {savingPhone2 ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Form Modal (thêm / chỉnh sửa khách hàng) */}
      {showCustomerForm && (
        <CustomerForm
          customerId={editingCustomerId ?? undefined}
          onClose={() => { setShowCustomerForm(false); setEditingCustomerId(null); }}
          onSaved={() => {
            loadCustomers();
            loadStats();
          }}
          tagRefreshSignal={tagRefreshSignal}
        />
      )}
      {tagManagerOpen && (
        <CustomerTagsManager
          onClose={() => {
            setTagManagerOpen(false);
            setTagRefreshSignal((n) => n + 1);
            apiClient.get('/customer-tags?isActive=true').then((data: any) => {
              if (Array.isArray(data)) {
                setResalesTagOptions(data.map((t: any) => ({ id: t.id, name: t.name || t.code })));
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

      {/* Modal phân chia kho CSKH (chưa phân) */}
      {cskhDistributeOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Phân chia {cskhPoolSelectedIds.length} khách (kho CSKH)</h3>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phân cho</label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${cskhDistTargetType === 'EMPLOYEE' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700'}`}
                  onClick={() => { setCskhDistTargetType('EMPLOYEE'); setCskhDistTargetId(''); }}
                >
                  Nhân viên cụ thể
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${cskhDistTargetType === 'UNIT' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700'}`}
                  onClick={() => { setCskhDistTargetType('UNIT'); setCskhDistTargetId(''); }}
                >
                  Đơn vị chức năng
                </button>
              </div>

              {cskhDistTargetType === 'EMPLOYEE' ? (
                <div>
                  <input
                    type="text"
                    placeholder="Tìm nhân viên..."
                    className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                    value={cskhDistEmpSearch}
                    onChange={e => setCskhDistEmpSearch(e.target.value)}
                  />
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {filteredCskhDistEmps.slice(0, 50).map(emp => (
                      <div
                        key={emp.id}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${cskhDistTargetId === emp.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                        onClick={() => setCskhDistTargetId(emp.id)}
                      >
                        {emp.fullName} <span className="text-gray-400">({emp.code})</span>
                      </div>
                    ))}
                    {filteredCskhDistEmps.length === 0 && <div className="px-3 py-4 text-gray-400 text-center text-sm">Không tìm thấy</div>}
                  </div>
                </div>
              ) : (
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={cskhDistTargetId}
                  onChange={e => setCskhDistTargetId(e.target.value)}
                >
                  <option value="">-- Chọn đơn vị --</option>
                  {cskhDistUnitOptions.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.function || ''})</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm border rounded-lg" onClick={() => setCskhDistributeOpen(false)}>Hủy</button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg disabled:opacity-50"
                onClick={handleDistributeCskh}
                disabled={!cskhDistTargetId || cskhDistributing}
              >
                {cskhDistributing ? 'Đang phân...' : 'Xác nhận phân chia'}
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

export default Resales;
