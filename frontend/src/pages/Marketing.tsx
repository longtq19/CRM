import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { apiClient } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import {
  Users,
  Target,
  Megaphone,
  List,
  Search,
  Plus,
  Edit,
  RefreshCcw,
  Loader,
  Key,
  Copy,
  Code,
  CheckCircle,
  XCircle,
  TrendingUp,
  Award,
  Calendar,
  ArrowUpDown,
  HelpCircle,
  Check,
  Trash2,
  Eye,
  Clock,
  Package,
  Phone,
  Mail,
  MapPin,
  User,
  X as XIcon,
  Download,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Send,
  Database,
  Settings,
  MessageSquare,
} from 'lucide-react';
import type { MarketingSource, MarketingCampaign, MarketingLead } from '../types';
import MarketingCostEffectiveness from '../components/MarketingCostEffectiveness';
import MarketingCustomerForm from '../components/MarketingCustomerForm';
import CustomerTagsManager, { CustomerTagsQuickCell, type TagBadgeModel } from '../components/CustomerTags';
import { ToolbarButton } from '../components/ui/ToolbarButton';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { formatAdminGeoLine } from '../utils/addressDisplayFormat';
import {
  getEffectiveCampaignStatus,
  isCampaignEndedForDisplay,
  isPastCampaignEndDateInclusiveVietnam,
  isStrictCampaignStartBeforeEnd,
} from '../utils/campaignSchedule';
import { formatDate, formatDateTime } from '../utils/format';

type MarketingTab = 'leads' | 'sources' | 'campaigns' | 'cost-effectiveness' | 'employee-ranking';

interface EmployeeRanking {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  avatarUrl?: string;
  department: string;
  totalLeads: number;
  qualifiedLeads: number;
  convertedCustomers: number;
  conversionRate: number;
  campaignsContributed: number;
  totalRevenue: number;
  rank: number;
}

interface EmployeePerformance {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  avatarUrl?: string;
  department: string;
  totalLeads: number;
  qualifiedLeads: number;
  convertedCustomers: number;
  totalCost: number;
  totalRevenue: number;
  cvr: number;
  cpl: number;
  cpa: number;
  roas: number;
  compositeScore: number;
  scores: {
    roas: number;
    cvr: number;
    revenue: number;
    cpl: number;
    qualified: number;
    converted: number;
  };
}

const LEAD_STATUS_MAP: Record<string, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  NEGOTIATING: 'Đang đàm phán',
  WON: 'Thành công',
  LOST: 'Thất bại',
  INVALID: 'Không hợp lệ',
  IN_PROGRESS: 'Đang xử lý',
  UNQUALIFIED: 'Loại',
  CONVERTED: 'Đã chuyển đổi',
};

const CAMPAIGN_STATUS_MAP: Record<string, string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang chạy',
  PAUSED: 'Tạm dừng',
  ENDED: 'Kết thúc',
  COMPLETED: 'Hoàn thành',
};

const ORDER_STATUS_MAP: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  CONFIRMED: 'Đã xác nhận',
  PROCESSING: 'Đang xử lý',
  SHIPPING: 'Đang giao',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  RETURNED: 'Đã trả hàng',
};

const INTERACTION_TYPE_MAP: Record<string, string> = {
  CALL: 'Gọi điện',
  EMAIL: 'Email',
  MEETING: 'Gặp mặt',
  NOTE: 'Ghi chú',
  SMS: 'SMS',
  ZALO: 'Zalo',
  VISIT: 'Thăm viếng',
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
  sales_duplicate_phone_attempt: 'Trùng số (Sales/CSKH)',
};

const SHIPPING_STATUS_MAP: Record<string, string> = {
  PENDING: 'Chờ lấy hàng',
  PICKED_UP: 'Đã lấy hàng',
  IN_TRANSIT: 'Đang vận chuyển',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  RETURNED: 'Đã trả lại',
  FAILED: 'Giao thất bại',
};

const translateStatus = (value: string | null | undefined, map: Record<string, string>): string => {
  if (!value) return 'Chưa phân loại';
  return map[value] || value;
};

const formatVndAmount = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const Marketing = () => {
  const { user, isAdmin, hasPermission } = useAuthStore();

  const [activeTab, setActiveTab] = useState<MarketingTab>('leads');

  const [sources, setSources] = useState<MarketingSource[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);

  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignCreatorFilter, setCampaignCreatorFilter] = useState('');

  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadSourceFilter, setLeadSourceFilter] = useState('');
  const [leadCampaignFilter, setLeadCampaignFilter] = useState('');
  const [leadDuplicateFilter, setLeadDuplicateFilter] = useState('');
  const [leadEmployeeFilter, setLeadEmployeeFilter] = useState('');
  const [leadTagFilter, setLeadTagFilter] = useState('');
  const [tagOptions, setTagOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [tagCatalog, setTagCatalog] = useState<TagBadgeModel[]>([]);
  const [leadPage, setLeadPage] = useState(1);
  const leadPageSize = 25;

  const [marketingEmployees, setMarketingEmployees] = useState<{ id: string; fullName: string }[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSourceId, setImportSourceId] = useState('');
  const [importCampaignId, setImportCampaignId] = useState('');
  const [importEmployeeId, setImportEmployeeId] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [leadDetailData, setLeadDetailData] = useState<any>(null);
  const [leadDetailLoading, setLeadDetailLoading] = useState(false);

  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [pushingToPool, setPushingToPool] = useState(false);

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [leadImpactModalOpen, setLeadImpactModalOpen] = useState(false);
  const [leadImpactRecord, setLeadImpactRecord] = useState<MarketingLead | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [tagRefreshSignal, setTagRefreshSignal] = useState(0);
  const canManageCustomerTags =
    hasPermission('MANAGE_CUSTOMERS') ||
    hasPermission('MANAGE_MARKETING_GROUPS') ||
    hasPermission('MANAGE_SALES') ||
    hasPermission('MANAGE_RESALES');
  /** Tab & UI danh mục Nền tảng — xem hoặc bất kỳ quyền CRUD nền tảng. */
  const canViewMarketingPlatforms =
    hasPermission('VIEW_MARKETING_PLATFORMS') ||
    hasPermission('CREATE_MARKETING_PLATFORM') ||
    hasPermission('UPDATE_MARKETING_PLATFORM') ||
    hasPermission('DELETE_MARKETING_PLATFORM');
  const canCreateMarketingPlatform = hasPermission('CREATE_MARKETING_PLATFORM');
  const canUpdateMarketingPlatform = hasPermission('UPDATE_MARKETING_PLATFORM');
  const canDeleteMarketingPlatform = hasPermission('DELETE_MARKETING_PLATFORM');
  /** Danh mục nền tảng chung công ty — luôn tải khi vào module (API GET cho mọi NV đã đăng nhập). */
  const shouldLoadMarketingSources = true;
  /** Chiến dịch: R/C/U/D tách quyền catalog; xem danh sách có thể qua VIEW hoặc MANAGE_CUSTOMERS (tương thích). */
  const canViewCampaigns =
    hasPermission('VIEW_MARKETING_CAMPAIGNS') || hasPermission('MANAGE_CUSTOMERS');
  const canCreateCampaign = hasPermission('CREATE_MARKETING_CAMPAIGN');
  const canUpdateCampaign = hasPermission('UPDATE_MARKETING_CAMPAIGN');
  const canDeleteCampaign = hasPermission('DELETE_MARKETING_CAMPAIGN');
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    leadSourceId: '',
    campaignId: '',
  });

  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceSubmitting, setSourceSubmitting] = useState(false);
  const [editingSource, setEditingSource] = useState<MarketingSource | null>(null);
  const [sourceForm, setSourceForm] = useState({
    code: '',
    name: '',
    description: '',
    isActive: true,
  });

  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    code: '',
    name: '',
    description: '',
    status: 'DRAFT',
    startDate: '',
    endDate: '',
    totalBudget: '',
    sourceId: '',
    memberIds: [] as string[],
  });

  const [marketingEmployeesForCampaign, setMarketingEmployeesForCampaign] = useState<{ id: string; code: string; fullName: string; avatarUrl?: string }[]>([]);
  const [campaignMemberSearch, setCampaignMemberSearch] = useState('');

  const campaignCreatorOptions = useMemo(() => {
    const m = new Map<string, string>();
    marketingEmployeesForCampaign.forEach((e) =>
      m.set(e.id, `${e.fullName}${e.code ? ` (${e.code})` : ''}`)
    );
    campaigns.forEach((c) => {
      const ce = c.createdByEmployee;
      if (ce?.id && ce.fullName && !m.has(ce.id)) {
        m.set(ce.id, `${ce.fullName}${ce.code ? ` (${ce.code})` : ''}`);
      }
    });
    return Array.from(m, ([id, label]) => ({ id, label }));
  }, [marketingEmployeesForCampaign, campaigns]);

  // API Integration states
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [apiInfo, setApiInfo] = useState<any>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [apiFieldSelection, setApiFieldSelection] = useState<string[]>(['phone']);
  const [apiStep, setApiStep] = useState<'fields' | 'info'>('fields');
  const [updatingApiIntegration, setUpdatingApiIntegration] = useState(false);

  const PUBLIC_LEAD_API_FIELDS = ['phone', 'name', 'address', 'note'] as const;

  /** Chỉ bốn trường này — khớp backend public lead API. */
  const API_FIELD_OPTIONS = [
    { code: 'phone', label: 'Số điện thoại', required: true, group: 'Thông tin' },
    { code: 'note', label: 'Ghi chú', required: false, group: 'Thông tin' },
    { code: 'name', label: 'Họ tên', required: false, group: 'Thông tin' },
    { code: 'address', label: 'Địa chỉ (dòng chữ)', required: false, group: 'Thông tin' },
  ];

  useEffect(() => {
    if (shouldLoadMarketingSources) loadSources();
    if (canViewCampaigns) void loadCampaigns();
    void loadLeads();
    loadMarketingEmployeesForCampaign();
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
  }, []);

  useEffect(() => {
    if (activeTab === 'sources' && !canViewMarketingPlatforms) {
      setActiveTab('leads');
    }
  }, [activeTab, canViewMarketingPlatforms]);

  useEffect(() => {
    if (activeTab === 'campaigns' && !canViewCampaigns) {
      setActiveTab('leads');
    }
  }, [activeTab, canViewCampaigns]);

  const loadMarketingEmployeesForCampaign = async () => {
    try {
      const res = await apiClient.get('/hr/employees?limit=500');
      let employees: { id: string; code: string; fullName: string; avatarUrl?: string }[] = [];
      if (Array.isArray(res)) employees = res;
      else if (res?.data) employees = res.data;
      const filtered = employees.filter((emp: any) => {
        if (emp.salesType === 'MARKETING') return true;
        if (emp.roleGroup?.code?.includes('MKT')) return true;
        const dept = emp.department?.name?.toLowerCase() || '';
        const div = emp.department?.division?.name?.toLowerCase() || '';
        if (dept.includes('marketing') || div.includes('marketing')) return true;
        return false;
      });
      setMarketingEmployeesForCampaign(filtered);
    } catch {
      setMarketingEmployeesForCampaign([]);
    }
  };

  const loadSources = async () => {
    try {
      setSourcesLoading(true);
      const data = await apiClient.get('/marketing/sources?isActive=');
      if (Array.isArray(data)) {
        setSources(data);
      }
    } catch {
    } finally {
      setSourcesLoading(false);
    }
  };

  const sanitizePublicLeadFields = (fields: string[]) => {
    const allowed = PUBLIC_LEAD_API_FIELDS as readonly string[];
    const next = fields.filter((f) => allowed.includes(f));
    if (!next.includes('phone')) return ['phone', ...next.filter((f) => f !== 'phone')];
    return next;
  };

  const loadCampaigns = async () => {
    try {
      setCampaignsLoading(true);
      const qs = new URLSearchParams();
      if (campaignSearch.trim()) qs.set('search', campaignSearch.trim());
      if (campaignCreatorFilter) qs.set('createdByEmployeeId', campaignCreatorFilter);
      const q = qs.toString();
      const data = await apiClient.get(`/marketing/campaigns${q ? `?${q}` : ''}`);
      if (Array.isArray(data)) {
        setCampaigns(data);
      }
    } catch {
    } finally {
      setCampaignsLoading(false);
    }
  };

  const loadLeads = async () => {
    try {
      setLeadsLoading(true);
      const data = await apiClient.get('/marketing/leads');
      if (Array.isArray(data)) {
        setLeads(data);
        const empMap = new Map<string, string>();
        data.forEach((l: any) => {
          if (l.marketingOwner?.id && l.marketingOwner?.fullName) {
            empMap.set(l.marketingOwner.id, l.marketingOwner.fullName);
          }
        });
        setMarketingEmployees(Array.from(empMap, ([id, fullName]) => ({ id, fullName })).sort((a, b) => a.fullName.localeCompare(b.fullName)));
      }
    } catch {
    } finally {
      setLeadsLoading(false);
    }
  };

  const handleImportLeads = async () => {
    if (!importFile) return;
    try {
      setImportLoading(true);
      const formData = new FormData();
      formData.append('file', importFile);
      if (importSourceId) formData.append('sourceId', importSourceId);
      if (importCampaignId) formData.append('campaignId', importCampaignId);
      if (importEmployeeId) formData.append('employeeId', importEmployeeId);
      const result = await apiClient.postMultipart('/marketing/leads/import', formData);
      setImportResult(result);
      if (result?.success > 0) loadLeads();
    } catch (err: any) {
      setImportResult({ message: 'Lỗi khi import: ' + (err.message || 'Không xác định') });
    } finally {
      setImportLoading(false);
    }
  };

  const handlePushToPool = async () => {
    if (selectedLeadIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 khách hàng');
      return;
    }
    if (!confirm(`Chuyển ${selectedLeadIds.length} khách hàng vào Kho số chung?`)) return;
    try {
      setPushingToPool(true);
      const res = await apiClient.post('/marketing/leads/push-to-pool', { customerIds: selectedLeadIds });
      alert(`${res.message || 'Thành công'} (Thêm: ${res.added}, Bỏ qua: ${res.skipped})`);
      setSelectedLeadIds([]);
      fetchLeads();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi chuyển vào kho số chung');
    } finally {
      setPushingToPool(false);
    }
  };

  const handleUpdateLeadFields = async (customerId: string, fields: any) => {
    try {
      await apiClient.put(`/marketing/leads/${customerId}/status`, fields);
      if (leadDetailData && leadDetailData.id === customerId) {
        setLeadDetailData({ ...leadDetailData, ...fields });
      }
      void loadLeads();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật khách hàng');
    }
  };

  const handleUpdateLeadStatus = (customerId: string, newStatus: string) => {
    handleUpdateLeadFields(customerId, { leadStatus: newStatus });
  };

  const handleExportLeads = async () => {
    try {
      setExportLoading(true);
      const params = new URLSearchParams();
      if (leadSourceFilter) params.append('sourceId', leadSourceFilter);
      if (leadCampaignFilter) params.append('campaignId', leadCampaignFilter);
      if (leadDuplicateFilter) params.append('isDuplicate', leadDuplicateFilter);
      if (leadSearch.trim()) params.append('search', leadSearch.trim());
      if (leadEmployeeFilter) params.append('marketingOwnerId', leadEmployeeFilter);
      if (leadTagFilter) params.append('tagId', leadTagFilter);
      const qs = params.toString();
      const blob = await apiClient.getBlob(`/marketing/leads/export${qs ? `?${qs}` : ''}`);
      if (blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `khach-hang-marketing-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert('Lỗi khi xuất file Excel. Vui lòng thử lại.');
      console.error(err);
    } finally {
      setExportLoading(false);
    }
  };

  const filteredLeads = useMemo(() => {
    const term = leadSearch.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch =
        term === '' ||
        lead.name.toLowerCase().includes(term) ||
        lead.phone.includes(term) ||
        (lead.email && lead.email.toLowerCase().includes(term));

      const matchesSource =
        !leadSourceFilter || lead.leadSourceId === leadSourceFilter;

      const matchesCampaign =
        !leadCampaignFilter || lead.campaignId === leadCampaignFilter;

      const matchesDuplicate =
        !leadDuplicateFilter || ((lead as any).marketingContributorsCount || 0) >= 2;

      const matchesEmployee =
        !leadEmployeeFilter || (lead as any).marketingOwnerId === leadEmployeeFilter;

      const matchesTag =
        !leadTagFilter || (lead as any).tags?.some((t: any) => (t.tagId || t.tag?.id) === leadTagFilter);

      return matchesSearch && matchesSource && matchesCampaign && matchesDuplicate && matchesEmployee && matchesTag;
    });
  }, [leads, leadSearch, leadSourceFilter, leadCampaignFilter, leadDuplicateFilter, leadEmployeeFilter, leadTagFilter]);

  const totalLeadPages = Math.ceil(filteredLeads.length / leadPageSize) || 1;
  const paginatedLeads = filteredLeads.slice(
    (leadPage - 1) * leadPageSize,
    leadPage * leadPageSize,
  );

  const handleOpenLeadModal = () => {
    setLeadError(null);
    setLeadForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      leadSourceId: '',
      campaignId: '',
    });
    setLeadModalOpen(true);
  };

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.name || !leadForm.phone) {
      setLeadError('Vui lòng nhập tên và số điện thoại');
      return;
    }
    try {
      setLeadSubmitting(true);
      setLeadError(null);
      const data = await apiClient.post('/marketing/leads', {
        name: leadForm.name,
        phone: leadForm.phone,
        email: leadForm.email || undefined,
        address: leadForm.address || undefined,
        leadSourceId: leadForm.leadSourceId || undefined,
        campaignId: leadForm.campaignId || undefined,
        note: leadForm.note || undefined,
      });
      if (data?.duplicate) {
        setLeadError(null);
        alert(data.message || 'Số điện thoại đã tồn tại. Hệ thống đã ghi nhận và gửi thông báo.');
        setLeadModalOpen(false);
        await loadLeads();
        return;
      }
      setLeadModalOpen(false);
      await loadLeads();
    } catch (error: any) {
      setLeadError(error?.message || 'Không thể tạo khách hàng Marketing');
    } finally {
      setLeadSubmitting(false);
    }
  };

  const handleOpenLeadDetail = async (leadId: string) => {
    setLeadDetailOpen(true);
    setLeadDetailLoading(true);
    setLeadDetailData(null);
    try {
      const data = await apiClient.get(`/marketing/leads/${leadId}`);
      setLeadDetailData(data);
    } catch (err: any) {
      alert(err?.message || 'Không thể tải chi tiết khách hàng');
      setLeadDetailOpen(false);
    } finally {
      setLeadDetailLoading(false);
    }
  };

  const openLeadImpactHistory = (e: React.MouseEvent, lead: MarketingLead) => {
    e.stopPropagation();
    setLeadImpactRecord(lead);
    setLeadImpactModalOpen(true);
  };

  const handleDeleteCampaign = async (campaign: MarketingCampaign) => {
    if (!canDeleteCampaign) return;
    if (
      !confirm(
        `Xóa chiến dịch "${campaign.name}" (${campaign.code})?\nKhách hàng gắn chiến dịch sẽ được gỡ gán; cơ hội/lead và chi phí thuộc chiến dịch sẽ bị xóa. Không thể hoàn tác.`
      )
    ) {
      return;
    }
    try {
      await apiClient.delete(`/marketing/campaigns/${campaign.id}`);
      await loadCampaigns();
      await loadLeads();
    } catch (err: any) {
      alert(err?.message || 'Không thể xóa chiến dịch');
    }
  };

  const handleDeleteSource = async (source: MarketingSource) => {
    if (!canDeleteMarketingPlatform) return;
    const campaignCount = (source as any)._count?.campaigns ?? 0;
    if (campaignCount > 0) {
      alert('Không thể xóa nền tảng đang được sử dụng bởi chiến dịch');
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa nền tảng "${source.name}"?`)) return;
    try {
      await apiClient.delete(`/marketing/sources/${source.id}`);
      await loadSources();
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Not Found') || msg.includes('404')) {
        await loadSources();
      } else {
        alert(msg || 'Lỗi khi xóa nền tảng');
      }
    }
  };

  const handleDeleteLead = async (id: string, name: string) => {
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
      await loadLeads();
    } catch (err: any) {
      alert(err.message || 'Không thể xóa khách hàng');
    }
  };
  const handleOpenSourceModal = (source?: MarketingSource) => {
    if (source) {
      if (!canUpdateMarketingPlatform) {
        alert('Bạn không có quyền sửa nền tảng.');
        return;
      }
    } else if (!canCreateMarketingPlatform) {
      alert('Bạn không có quyền tạo nền tảng.');
      return;
    }
    if (source) {
      setEditingSource(source);
      setSourceForm({
        code: source.code,
        name: source.name,
        description: source.description || '',
        isActive: source.isActive,
      });
    } else {
      setEditingSource(null);
      setSourceForm({
        code: '',
        name: '',
        description: '',
        isActive: true,
      });
    }
    setSourceModalOpen(true);
  };

  const handleSubmitSource = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = sourceForm.name.trim();
    const trimmedDesc = (sourceForm.description || '').trim();
    if (!trimmedName) {
      alert('Tên nền tảng là bắt buộc');
      return;
    }
    if (!trimmedDesc) {
      alert('Mô tả nền tảng là bắt buộc');
      return;
    }
    try {
      setSourceSubmitting(true);
      const payload = {
        name: trimmedName,
        description: trimmedDesc,
        isActive: sourceForm.isActive,
      } as any;
      if (sourceForm.code.trim()) payload.code = sourceForm.code.trim();
      if (editingSource) {
        if (!canUpdateMarketingPlatform) return;
        await apiClient.put(`/marketing/sources/${editingSource.id}`, { ...payload, code: sourceForm.code.trim() || undefined });
      } else {
        if (!canCreateMarketingPlatform) return;
        await apiClient.post('/marketing/sources', payload);
      }
      setSourceModalOpen(false);
      await loadSources();
    } catch (err: any) {
      alert(err?.message || 'Có lỗi xảy ra');
    } finally {
      setSourceSubmitting(false);
    }
  };

  const handleOpenCampaignModal = (campaign?: MarketingCampaign) => {
    if (campaign) {
      if (!canUpdateCampaign) {
        alert('Bạn không có quyền chỉnh sửa chiến dịch.');
        return;
      }
      setEditingCampaign(campaign);
      const fromMembers = (campaign as any).members?.map((m: any) => m.employee?.id ?? m.employeeId).filter(Boolean) ?? [];
      const memberIds = fromMembers.length > 0 ? fromMembers : ((campaign as any).createdByEmployeeId ? [(campaign as any).createdByEmployeeId] : []);
      setCampaignForm({
        code: campaign.code,
        name: campaign.name,
        description: campaign.description || '',
        status: campaign.status,
        startDate: campaign.startDate ? campaign.startDate.substring(0, 10) : '',
        endDate: campaign.endDate ? campaign.endDate.substring(0, 10) : '',
        totalBudget:
          campaign.totalBudget !== undefined && campaign.totalBudget !== null
            ? String(campaign.totalBudget)
            : '',
        sourceId: campaign.sourceId || '',
        memberIds,
      });
    } else {
      if (!canCreateCampaign) {
        alert('Bạn không có quyền tạo chiến dịch.');
        return;
      }
      setEditingCampaign(null);
      setCampaignForm({
        code: '',
        name: '',
        description: '',
        status: 'DRAFT',
        startDate: '',
        endDate: '',
        totalBudget: '',
        sourceId: '',
        memberIds: [],
      });
    }
    setCampaignMemberSearch('');
    setCampaignModalOpen(true);
  };

  const handleSubmitCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = campaignForm.name.trim();
    const trimmedDesc = (campaignForm.description || '').trim();
    if (!trimmedName) { alert('Tên chiến dịch là bắt buộc'); return; }
    if (!trimmedDesc) { alert('Mô tả chiến dịch là bắt buộc'); return; }
    if (!campaignForm.startDate) { alert('Ngày bắt đầu là bắt buộc'); return; }
    if (!campaignForm.endDate) { alert('Ngày kết thúc là bắt buộc'); return; }
    if (campaignForm.totalBudget === '' || campaignForm.totalBudget == null) {
      alert('Ngân sách dự kiến là bắt buộc');
      return;
    }
    if (!campaignForm.sourceId) { alert('Nền tảng chiến dịch là bắt buộc'); return; }
    const sd = new Date(campaignForm.startDate);
    const ed = new Date(campaignForm.endDate);
    if (!isStrictCampaignStartBeforeEnd(sd, ed)) {
      alert('Ngày bắt đầu phải nhỏ hơn ngày kết thúc (không trùng ngày).');
      return;
    }
    const stForm = campaignForm.status;
    if (
      (stForm === 'ACTIVE' || stForm === 'PAUSED') &&
      isPastCampaignEndDateInclusiveVietnam(new Date(), ed)
    ) {
      alert(
        'Ngày kết thúc đã qua theo lịch; không thể đặt trạng thái «Đang chạy» hoặc «Tạm dừng».',
      );
      return;
    }
    if (editingCampaign && isAdmin() && (!campaignForm.memberIds?.length)) {
      alert('Khi chỉnh sửa, phải chọn ít nhất 1 nhân viên marketing phụ trách.');
      return;
    }
    const payload: any = {
      code: campaignForm.code.trim() || undefined,
      name: trimmedName,
      description: trimmedDesc,
      status: campaignForm.status,
      startDate: campaignForm.startDate,
      endDate: campaignForm.endDate,
      sourceId: campaignForm.sourceId,
      totalBudget: parseFloat(String(campaignForm.totalBudget)),
    };
    if (editingCampaign && isAdmin() && campaignForm.memberIds?.length) {
      payload.createdByEmployeeId = campaignForm.memberIds[0];
      payload.employeeIds = campaignForm.memberIds;
    }
    try {
      setCampaignSubmitting(true);
      if (editingCampaign) {
        await apiClient.put(`/marketing/campaigns/${editingCampaign.id}`, payload);
      } else {
        await apiClient.post('/marketing/campaigns', payload);
      }
      setCampaignModalOpen(false);
      await loadCampaigns();
    } catch (err: any) {
      alert(err?.message || 'Có lỗi xảy ra');
    } finally {
      setCampaignSubmitting(false);
    }
  };

  const campaignFilteredEmployees = useMemo(() => {
    const q = campaignMemberSearch.trim().toLowerCase();
    if (!q) return marketingEmployeesForCampaign;
    return marketingEmployeesForCampaign.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q)
    );
  }, [marketingEmployeesForCampaign, campaignMemberSearch]);

  const toggleCampaignMember = (empId: string) => {
    setCampaignForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(empId)
        ? f.memberIds.filter((id) => id !== empId)
        : [...f.memberIds, empId],
    }));
  };

  // API Integration handlers
  const handleOpenApiModal = async (campaign: MarketingCampaign) => {
    if (!canViewCampaigns && !canUpdateCampaign) {
      alert('Bạn không có quyền xem hoặc cấu hình tích hợp API chiến dịch.');
      return;
    }
    setApiModalOpen(true);
    setApiLoading(true);
    try {
      const data = await apiClient.get(`/marketing/campaigns/${campaign.id}/api-info`);
      setApiInfo(data);
      if (data.apiKey) {
        setApiStep('info');
        if (Array.isArray(data.acceptedFields) && data.acceptedFields.length > 0) {
          setApiFieldSelection(sanitizePublicLeadFields(data.acceptedFields as string[]));
        }
      } else {
        setApiStep('fields');
        setApiFieldSelection(['phone']);
      }
    } catch (error) {
      console.error('Load API info error:', error);
    } finally {
      setApiLoading(false);
    }
  };

  const handleGenerateApiKey = async () => {
    if (!apiInfo?.id) return;
    if (!canUpdateCampaign) {
      alert('Bạn không có quyền cấu hình API chiến dịch.');
      return;
    }
    try {
      setGeneratingKey(true);
      const fields = sanitizePublicLeadFields(apiFieldSelection);
      const data = await apiClient.post(`/marketing/campaigns/${apiInfo.id}/api-key`, {
        acceptedFields: fields,
      });
      setApiInfo((prev: any) => ({
        ...prev,
        apiKey: data.apiKey,
        webhookSecret: data.webhookSecret,
        acceptedFields: data.acceptedFields || fields,
        publicLeadAddressHierarchy: 'NONE',
        sampleCode: data.sampleCode ?? prev?.sampleCode,
      }));
      if (Array.isArray(data.acceptedFields)) {
        setApiFieldSelection(sanitizePublicLeadFields(data.acceptedFields));
      }
      setApiStep('info');
      await loadCampaigns();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi tạo API key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleUpdateApiIntegration = async () => {
    if (!apiInfo?.id || !apiInfo.apiKey) return;
    if (!canUpdateCampaign) {
      alert('Bạn không có quyền cấu hình API chiến dịch.');
      return;
    }
    try {
      setUpdatingApiIntegration(true);
      const fields = sanitizePublicLeadFields(apiFieldSelection);
      const data = await apiClient.put(`/marketing/campaigns/${apiInfo.id}/api-integration`, {
        acceptedFields: fields,
      });
      setApiInfo((prev: any) => ({
        ...prev,
        acceptedFields: data.acceptedFields,
        publicLeadAddressHierarchy: 'NONE',
        sampleCode: data.sampleCode ?? prev?.sampleCode,
      }));
      if (Array.isArray(data.acceptedFields)) {
        setApiFieldSelection(sanitizePublicLeadFields(data.acceptedFields));
      }
      await loadCampaigns();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi cập nhật cấu hình API');
    } finally {
      setUpdatingApiIntegration(false);
    }
  };

  const handleRevokeApiKey = async () => {
    if (!apiInfo?.id) return;
    if (!canUpdateCampaign) {
      alert('Bạn không có quyền cấu hình API chiến dịch.');
      return;
    }
    if (!confirm('Bạn có chắc muốn thu hồi API key? Website đang sử dụng key này sẽ không thể gửi lead được nữa.')) return;
    try {
      await apiClient.delete(`/marketing/campaigns/${apiInfo.id}/api-key`);
      setApiInfo((prev: any) => ({
        ...prev,
        apiKey: null,
        webhookSecret: null,
      }));
      await loadCampaigns();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi thu hồi API key');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const renderLeadsTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Tổng khách hàng Marketing</p>
            <p className="text-2xl font-bold">{leads.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <Target size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Nền tảng đang theo dõi</p>
            <p className="text-2xl font-bold">
              {sources.filter((s) => s.isActive).length}
            </p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
            <Megaphone size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Chiến dịch</p>
            <p className="text-2xl font-bold">{campaigns.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Khách hàng Marketing</h2>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={leadSearch}
              onChange={(e) => {
                setLeadSearch(e.target.value);
                setLeadPage(1);
              }}
              placeholder="Tìm theo tên, SĐT, email"
              className="w-full md:w-64 pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <ToolbarButton variant="secondary" className="text-sm" onClick={loadLeads}>
            {leadsLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <RefreshCcw size={16} />
            )}
            Làm mới
          </ToolbarButton>
          <ToolbarButton
            variant="secondary"
            className="text-sm disabled:opacity-50"
            onClick={handleExportLeads}
            disabled={exportLoading}
          >
            {exportLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Xuất Excel
          </ToolbarButton>
          <ToolbarButton
            variant="secondary"
            className="text-sm"
            onClick={() => { setImportFile(null); setImportResult(null); setImportSourceId(''); setImportCampaignId(''); setImportEmployeeId(''); setImportModalOpen(true); }}
          >
            <Upload size={16} />
            Nhập Excel
          </ToolbarButton>
          {canManageCustomerTags && (
            <ToolbarButton
              variant="secondary"
              className="text-sm"
              onClick={() => setTagManagerOpen(true)}
            >
              <Settings size={16} />
              Quản lý thẻ
            </ToolbarButton>
          )}
          <ToolbarButton variant="primary" className="text-sm" onClick={handleOpenLeadModal}>
            <Plus size={16} />
            Thêm khách hàng
          </ToolbarButton>
          {selectedLeadIds.length > 0 && (
            <button
              onClick={handlePushToPool}
              disabled={pushingToPool}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              {pushingToPool ? <Loader size={16} className="animate-spin" /> : <Database size={16} />}
              Chuyển {selectedLeadIds.length} vào Kho số ({selectedLeadIds.length})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <select
          value={leadSourceFilter}
          onChange={(e) => {
            setLeadSourceFilter(e.target.value);
            setLeadPage(1);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Tất cả nền tảng</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={leadCampaignFilter}
          onChange={(e) => {
            setLeadCampaignFilter(e.target.value);
            setLeadPage(1);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Tất cả chiến dịch</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={leadDuplicateFilter}
          onChange={(e) => {
            setLeadDuplicateFilter(e.target.value);
            setLeadPage(1);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Lọc trùng (Tất cả)</option>
          <option value="true">Số trùng (≥ 2 NV Marketing)</option>
        </select>
        <select
          value={leadEmployeeFilter}
          onChange={(e) => {
            setLeadEmployeeFilter(e.target.value);
            setLeadPage(1);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Tất cả NV Marketing</option>
          {marketingEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </select>
        <select
          value={leadTagFilter}
          onChange={(e) => {
            setLeadTagFilter(e.target.value);
            setLeadPage(1);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Tất cả thẻ</option>
          {tagOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-600 text-sm uppercase font-semibold">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap w-10">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selectedLeadIds.length === leads.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedLeadIds(leads.map((l: any) => l.id));
                    } else {
                      setSelectedLeadIds([]);
                    }
                  }}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 whitespace-nowrap">Khách hàng</th>
              <th className="px-4 py-3 whitespace-nowrap min-w-[160px]">Thẻ khách hàng</th>
              <th className="px-4 py-3 whitespace-nowrap">Liên hệ</th>
              <th className="px-4 py-3 whitespace-nowrap">Nền tảng</th>
              <th className="px-4 py-3 whitespace-nowrap">Chiến dịch</th>
              <th className="px-4 py-3 whitespace-nowrap">NV Marketing</th>
              <th className="px-4 py-3 whitespace-nowrap max-w-[160px]">Mô tả trùng số</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">Giá trị đơn chốt</th>
              <th className="px-4 py-3 whitespace-nowrap">NV phụ trách (Sales)</th>
              <th className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">
                Ngày tạo
              </th>
              <th className="px-4 py-3 whitespace-nowrap text-center">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleOpenLeadDetail(lead.id)}>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.includes(lead.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLeadIds((prev) => [...prev, lead.id]);
                      } else {
                        setSelectedLeadIds((prev) => prev.filter((id) => id !== lead.id));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{lead.name || 'Chưa có tên'}</div>
                  <div className="text-xs text-gray-500">
                    {lead.code || ''}
                  </div>
                </td>
                <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                  <CustomerTagsQuickCell
                    customerId={lead.id}
                    assignments={(lead.tags || []).map((t) => ({
                      tag: {
                        id: t.tag.id,
                        name: t.tag.name,
                        color: t.tag.color,
                        bgColor: t.tag.bgColor ?? null,
                      },
                    }))}
                    allTags={tagCatalog}
                    canEdit={false}
                    onUpdated={() => loadLeads()}
                    tagRefreshSignal={tagRefreshSignal}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">{lead.phone}</div>
                  {lead.email && (
                    <div className="text-xs text-gray-500">{lead.email}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">
                    {lead.leadSource?.name || 'Chưa gán'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {lead.leadSource?.code || ''}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">
                    {lead.campaign?.name || 'Chưa gán'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {lead.campaign?.code || ''}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">
                    {lead.marketingOwner?.fullName || '—'}
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <div
                    className="text-xs text-amber-800 line-clamp-3"
                    title={lead.duplicatePhoneNote || undefined}
                  >
                    {lead.duplicatePhoneNote || '—'}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {formatVndAmount(lead.firstDeliveredOrderAmount ?? null)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">{lead.employee?.fullName || '—'}</div>
                  {lead.employee?.phone && (
                    <a
                      href={`tel:${lead.employee.phone}`}
                      className="text-xs text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {lead.employee.phone}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      lead.leadStatus === 'NEW' && 'bg-blue-100 text-blue-700',
                      lead.leadStatus === 'CONTACTED' && 'bg-cyan-100 text-cyan-700',
                      lead.leadStatus === 'QUALIFIED' && 'bg-green-100 text-green-700',
                      lead.leadStatus === 'NEGOTIATING' && 'bg-yellow-100 text-yellow-700',
                      lead.leadStatus === 'WON' && 'bg-emerald-100 text-emerald-700',
                      lead.leadStatus === 'LOST' && 'bg-red-100 text-red-700',
                      lead.leadStatus === 'INVALID' && 'bg-gray-200 text-gray-600',
                      lead.leadStatus === 'IN_PROGRESS' && 'bg-orange-100 text-orange-700',
                      lead.leadStatus === 'UNQUALIFIED' && 'bg-red-100 text-red-700',
                      lead.leadStatus === 'CONVERTED' && 'bg-purple-100 text-purple-700',
                      !lead.leadStatus && 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {translateStatus(lead.leadStatus, LEAD_STATUS_MAP)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-500">
                  {lead.joinedDate
                    ? formatDate(lead.joinedDate)
                    : ''}
                </td>
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col sm:flex-row gap-1 justify-center items-center">
                    <button
                      type="button"
                      onClick={() => handleOpenLeadDetail(lead.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <Eye size={14} />
                      Chi tiết
                    </button>
                    {hasPermission('PERMANENT_DELETE_CUSTOMER') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLead(lead.id, lead.name);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        Xóa
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paginatedLeads.length === 0 && (
              <tr>
                <td
                  colSpan={13}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  Không có khách hàng nào phù hợp
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {paginatedLeads.map((lead) => (
          <div
            key={lead.id}
            className="border border-gray-200 rounded-lg p-4 space-y-1"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold text-gray-900">{lead.name}</div>
                <div className="text-xs text-gray-500">{lead.phone}</div>
              </div>
              <span
                className={clsx(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  lead.leadStatus === 'NEW' && 'bg-blue-100 text-blue-700',
                  lead.leadStatus === 'CONTACTED' && 'bg-cyan-100 text-cyan-700',
                  lead.leadStatus === 'QUALIFIED' && 'bg-green-100 text-green-700',
                  lead.leadStatus === 'NEGOTIATING' && 'bg-yellow-100 text-yellow-700',
                  lead.leadStatus === 'WON' && 'bg-emerald-100 text-emerald-700',
                  lead.leadStatus === 'LOST' && 'bg-red-100 text-red-700',
                  lead.leadStatus === 'INVALID' && 'bg-gray-200 text-gray-600',
                  lead.leadStatus === 'IN_PROGRESS' && 'bg-orange-100 text-orange-700',
                  lead.leadStatus === 'UNQUALIFIED' && 'bg-red-100 text-red-700',
                  lead.leadStatus === 'CONVERTED' && 'bg-purple-100 text-purple-700',
                  !lead.leadStatus && 'bg-gray-100 text-gray-700',
                )}
              >
                {translateStatus(lead.leadStatus, LEAD_STATUS_MAP)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Nền tảng: {lead.leadSource?.name || 'Chưa gán'}
            </div>
            <div className="text-xs text-gray-500">
              Chiến dịch: {lead.campaign?.name || 'Chưa gán'}
            </div>
            <div className="text-xs text-gray-500">
              NV Marketing: {lead.marketingOwner?.fullName || '—'}
            </div>
            {lead.duplicatePhoneNote && (
              <div className="text-xs text-amber-800 bg-amber-50 rounded p-2 mt-1">
                Trùng số: {lead.duplicatePhoneNote}
              </div>
            )}
            <div className="text-xs text-gray-600">
              Đơn chốt đầu: {formatVndAmount(lead.firstDeliveredOrderAmount ?? null)}
            </div>
            <div className="text-xs text-gray-600">
              NV phụ trách: {lead.employee?.fullName || '—'}
              {lead.employee?.phone ? ` · ${lead.employee.phone}` : ''}
            </div>
            <div className="pt-1" onClick={(e) => e.stopPropagation()}>
              <div className="text-xs text-gray-500 mb-1">Thẻ khách hàng</div>
              <CustomerTagsQuickCell
                customerId={lead.id}
                assignments={(lead.tags || []).map((t) => ({
                  tag: {
                    id: t.tag.id,
                    name: t.tag.name,
                    color: t.tag.color,
                    bgColor: t.tag.bgColor ?? null,
                  },
                }))}
                allTags={tagCatalog}
                canEdit={false}
                onUpdated={() => loadLeads()}
                tagRefreshSignal={tagRefreshSignal}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleOpenLeadDetail(lead.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                <Eye size={14} />
                Chi tiết
              </button>
            </div>
          </div>
        ))}
        {paginatedLeads.length === 0 && (
          <div className="text-center text-sm text-gray-500">
            Không có khách hàng nào phù hợp
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-gray-500">
          Hiển thị {paginatedLeads.length} trên {filteredLeads.length} khách hàng
        </p>
        <div className="flex items-center gap-2">
          <button
            disabled={leadPage === 1}
            onClick={() => setLeadPage((p) => Math.max(1, p - 1))}
            className={clsx(
              'px-3 py-1 rounded border text-sm',
              leadPage === 1
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            Trước
          </button>
          <span className="text-sm text-gray-500">
            Trang {leadPage}/{totalLeadPages}
          </span>
          <button
            disabled={leadPage === totalLeadPages}
            onClick={() =>
              setLeadPage((p) => Math.min(totalLeadPages, p + 1))
            }
            className={clsx(
              'px-3 py-1 rounded border text-sm',
              leadPage === totalLeadPages
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            Sau
          </button>
        </div>
      </div>

      {leadModalOpen && (
        <MarketingCustomerForm
          onClose={() => setLeadModalOpen(false)}
          onSaved={() => loadLeads()}
          sources={sources}
          campaigns={campaigns}
          tagRefreshSignal={tagRefreshSignal}
        />
      )}
      {leadImpactModalOpen && leadImpactRecord && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          onClick={() => {
            setLeadImpactModalOpen(false);
            setLeadImpactRecord(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">Lịch sử tác động</h3>
                  <p className="text-xs text-gray-500 truncate">
                    {leadImpactRecord.name || 'Khách'} · {leadImpactRecord.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-100 shrink-0"
                onClick={() => {
                  setLeadImpactModalOpen(false);
                  setLeadImpactRecord(null);
                }}
                aria-label="Đóng"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 text-sm">
              {(leadImpactRecord.impactHistory || []).length === 0 ? (
                <p className="text-center text-gray-400 py-6">Chưa có tương tác ghi nhận</p>
              ) : (
                <ul className="space-y-2">
                  {(leadImpactRecord.impactHistory || []).map((row) => (
                    <li key={row.id} className="border rounded-lg p-2 bg-slate-50">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{formatDateTime(row.createdAt)}</span>
                        <span>{row.employee?.fullName || '—'}</span>
                      </div>
                      <div className="mt-1 text-xs">
                        <span className="font-medium text-gray-700">
                          {INTERACTION_TYPE_MAP[row.type] || row.type}
                        </span>
                      </div>
                      {row.content && (
                        <p className="mt-1 text-gray-800 whitespace-pre-wrap text-sm">{row.content}</p>
                      )}
                      {row.detail && (
                        <p className="mt-1 text-gray-600 text-xs whitespace-pre-wrap border-t pt-1">{row.detail}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
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
    </div>
  );

  const renderSourcesTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Nền tảng</h2>
          <p className="text-sm text-gray-500 mt-1">
            Danh mục dùng chung cho toàn công ty (một danh sách); chỉnh sửa theo quyền được gán.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={loadSources}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {sourcesLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <RefreshCcw size={16} />
            )}
            Làm mới
          </button>
          {canCreateMarketingPlatform && (
          <button
            onClick={() => handleOpenSourceModal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={16} />
            Thêm nền tảng
          </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-600 text-sm uppercase font-semibold">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Mã nền tảng</th>
              <th className="px-4 py-3 whitespace-nowrap">Tên nền tảng</th>
              <th className="px-4 py-3 whitespace-nowrap">Mô tả</th>
              <th className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">
                  {source.code}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {source.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-md truncate">
                  {source.description}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      source.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {source.isActive ? 'Đang theo dõi' : 'Ngừng theo dõi'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1">
                    {canUpdateMarketingPlatform ? (
                    <button
                      onClick={() => handleOpenSourceModal(source)}
                      disabled={((source as any)._count?.campaigns ?? 0) > 0}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={((source as any)._count?.campaigns ?? 0) > 0 ? 'Nền tảng đang được sử dụng bởi chiến dịch' : ''}
                    >
                      <Edit size={14} />
                      Sửa
                    </button>
                    ) : null}
                    {canDeleteMarketingPlatform ? (
                    <button
                      onClick={() => handleDeleteSource(source)}
                      disabled={((source as any)._count?.campaigns ?? 0) > 0}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={((source as any)._count?.campaigns ?? 0) > 0 ? 'Không thể xóa nền tảng đang có chiến dịch' : 'Xóa nền tảng'}
                    >
                      <Trash2 size={14} />
                      Xóa
                    </button>
                    ) : null}
                    {!canUpdateMarketingPlatform && !canDeleteMarketingPlatform ? (
                      <span className="text-xs text-gray-400">Chỉ xem</span>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  Chưa có nền tảng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sourceModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">
              {editingSource ? 'Chỉnh sửa nền tảng' : 'Thêm nền tảng'}
            </h3>
            <form className="space-y-4" onSubmit={handleSubmitSource}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mã nền tảng
                  </label>
                  <input
                    type="text"
                    value={sourceForm.code}
                    onChange={(e) =>
                      setSourceForm((f) => ({ ...f, code: e.target.value }))
                    }
                    placeholder="Để trống sẽ tự sinh"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên nền tảng <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={sourceForm.name}
                    onChange={(e) =>
                      setSourceForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mô tả <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={sourceForm.description}
                  onChange={(e) =>
                    setSourceForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="source-active"
                  type="checkbox"
                  checked={sourceForm.isActive}
                  onChange={(e) =>
                    setSourceForm((f) => ({
                      ...f,
                      isActive: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 text-primary border-gray-300 rounded"
                />
                <label
                  htmlFor="source-active"
                  className="text-sm text-gray-700 cursor-pointer"
                >
                  Đang theo dõi
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setSourceModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={sourceSubmitting}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2',
                    sourceSubmitting
                      ? 'bg-primary/70 cursor-wait'
                      : 'bg-primary hover:bg-primary/90',
                  )}
                >
                  {sourceSubmitting && (
                    <Loader size={16} className="animate-spin" />
                  )}
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  const renderCampaignsTab = () => {
    if (!canViewCampaigns) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          Bạn không có quyền xem danh sách chiến dịch. Cần quyền <strong>Xem chiến dịch marketing</strong> hoặc{' '}
          <strong>Quản lý khách hàng &amp; Marketing</strong> (tương thích).
        </div>
      );
    }
    return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Chiến dịch quảng cáo</h2>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => void loadCampaigns()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {campaignsLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <RefreshCcw size={16} />
            )}
            Làm mới
          </button>
          {canCreateCampaign && (
          <button
            onClick={() => handleOpenCampaignModal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={16} />
            Thêm chiến dịch
          </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tìm mã / tên</label>
          <input
            type="search"
            value={campaignSearch}
            onChange={(e) => setCampaignSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadCampaigns()}
            placeholder="Mã hoặc tên chiến dịch…"
            className="w-full min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Người tạo</label>
          <select
            value={campaignCreatorFilter}
            onChange={(e) => setCampaignCreatorFilter(e.target.value)}
            className="w-full min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">Tất cả</option>
            {campaignCreatorOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void loadCampaigns()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {campaignsLoading ? <Loader size={16} className="animate-spin" /> : null}
          Áp dụng lọc
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-600 text-sm uppercase font-semibold">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Mã chiến dịch</th>
              <th className="px-4 py-3 whitespace-nowrap">Tên chiến dịch</th>
              <th className="px-4 py-3 whitespace-nowrap">Người tạo</th>
              <th className="px-4 py-3 whitespace-nowrap">Nền tảng</th>
              <th className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
              <th className="px-4 py-3 whitespace-nowrap">Lead</th>
              <th className="px-4 py-3 whitespace-nowrap">API</th>
              <th className="px-4 py-3 whitespace-nowrap">Thời gian</th>
              <th
                className="px-4 py-3 whitespace-nowrap text-right"
                title="Số tiền kế hoạch nhập khi tạo/sửa chiến dịch (cột total_budget)"
              >
                Ngân sách dự kiến
              </th>
              <th
                className="px-4 py-3 whitespace-nowrap text-right"
                title="Tổng các khoản chi phí đã ghi cho chiến dịch (marketing_campaign_costs)"
              >
                Chi phí thực tế
              </th>
              <th className="px-4 py-3 whitespace-nowrap text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map((campaign) => {
              const effCampaignStatus = getEffectiveCampaignStatus(
                campaign.status,
                campaign.endDate,
              );
              const hasApiKeyRow = Boolean((campaign as any).apiKey);
              const canOpenApiModal =
                hasApiKeyRow ||
                (campaign.status === 'ACTIVE' && effCampaignStatus === 'ACTIVE');
              return (
              <tr key={campaign.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">
                  {campaign.code}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {campaign.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {(campaign as MarketingCampaign).createdByEmployee?.fullName || '—'}
                  {(campaign as MarketingCampaign).createdByEmployee?.code ? (
                    <span className="text-gray-400 font-mono text-xs ml-1">
                      ({(campaign as MarketingCampaign).createdByEmployee?.code})
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {campaign.source?.name || ''}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      effCampaignStatus === 'ACTIVE' &&
                        'bg-green-100 text-green-700',
                      effCampaignStatus === 'PAUSED' &&
                        'bg-yellow-100 text-yellow-700',
                      effCampaignStatus === 'ENDED' &&
                        'bg-gray-100 text-gray-700',
                      effCampaignStatus === 'DRAFT' &&
                        'bg-blue-100 text-blue-700',
                      effCampaignStatus === 'COMPLETED' &&
                        'bg-teal-100 text-teal-700',
                    )}
                  >
                    {translateStatus(effCampaignStatus, CAMPAIGN_STATUS_MAP)}
                    {effCampaignStatus === 'ENDED' &&
                      campaign.status !== 'ENDED' &&
                      campaign.status !== 'COMPLETED' && (
                      <span
                        className="ml-1 text-[10px] font-normal text-gray-500"
                        title="Theo ngày kết thúc trên lịch, chiến dịch đã hết hạn (trạng thái lưu trong DB có thể khác)"
                      >
                        (theo lịch)
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-indigo-600">
                  {(campaign as any).leadCount || 0}
                </td>
                <td className="px-4 py-3">
                  {(campaign as any).apiKey ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle size={12} />
                      Đã kích hoạt
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      <XCircle size={12} />
                      Chưa có
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {campaign.startDate
                    ? formatDate(campaign.startDate)
                    : ''}
                  {campaign.endDate && (
                    <>
                      {' '}
                      -{' '}
                      {formatDate(campaign.endDate)}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">
                  {campaign.totalBudget !== undefined &&
                  campaign.totalBudget !== null
                    ? new Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                        maximumFractionDigits: 0,
                      }).format(Number(campaign.totalBudget))
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">
                  {new Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                    maximumFractionDigits: 0,
                  }).format(Number((campaign as MarketingCampaign).totalSpentActual ?? 0))}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {(canViewCampaigns || canUpdateCampaign) && (
                    <button
                      onClick={() => handleOpenApiModal(campaign)}
                      disabled={!canOpenApiModal}
                      className={clsx(
                        'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium',
                        canOpenApiModal
                          ? 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                          : 'border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                      )}
                      title={
                        !canOpenApiModal
                          ? 'Chỉ mở khi chiến dịch «Đang chạy» và chưa hết hạn theo ngày kết thúc, hoặc khi đã có API key để xem/thu hồi.'
                          : 'Tích hợp API'}
                    >
                      <Code size={14} />
                      API
                    </button>
                    )}
                    {canUpdateCampaign && (
                    <button
                      onClick={() => handleOpenCampaignModal(campaign)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Edit size={14} />
                      Sửa
                    </button>
                    )}
                    {canDeleteCampaign && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCampaign(campaign)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                        title="Xóa chiến dịch"
                      >
                        <Trash2 size={14} />
                        Xóa
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
            })}
            {campaigns.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  Chưa có chiến dịch nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {campaignModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-6">
            <h3 className="text-lg font-semibold mb-4">
              {editingCampaign
                ? 'Chỉnh sửa chiến dịch'
                : 'Thêm chiến dịch quảng cáo'}
            </h3>
            <form className="space-y-4" onSubmit={handleSubmitCampaign}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mã chiến dịch
                  </label>
                  <input
                    type="text"
                    value={campaignForm.code}
                    onChange={(e) =>
                      setCampaignForm((f) => ({
                        ...f,
                        code: e.target.value,
                      }))
                    }
                    placeholder="Để trống sẽ tự sinh"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên chiến dịch <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={campaignForm.name}
                    onChange={(e) =>
                      setCampaignForm((f) => ({
                        ...f,
                        name: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nền tảng <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={campaignForm.sourceId}
                    onChange={(e) =>
                      setCampaignForm((f) => ({
                        ...f,
                        sourceId: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Chọn nền tảng</option>
                    {sources
                      .filter((s) => s.isActive || (editingCampaign && s.id === editingCampaign.sourceId))
                      .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{!s.isActive ? ' (Ngừng theo dõi)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trạng thái
                  </label>
                  <select
                    value={campaignForm.status}
                    onChange={(e) =>
                      setCampaignForm((f) => ({
                        ...f,
                        status: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="DRAFT">Nháp</option>
                    <option value="ACTIVE">Đang chạy</option>
                    <option value="PAUSED">Tạm dừng</option>
                    <option value="ENDED">Kết thúc</option>
                    <option value="COMPLETED">Hoàn thành</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ngày bắt đầu <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={campaignForm.startDate}
                    onChange={(e) =>
                      setCampaignForm((f) => ({
                        ...f,
                        startDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ngày kết thúc <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={campaignForm.endDate}
                    onChange={(e) =>
                      setCampaignForm((f) => ({
                        ...f,
                        endDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ngân sách dự kiến (VND) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={campaignForm.totalBudget}
                    onChange={(e) =>
                      setCampaignForm((f) => ({
                        ...f,
                        totalBudget: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              {editingCampaign && isAdmin() && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nhân viên marketing phụ trách <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Chỉ Admin có thể đổi nhân viên phụ trách chiến dịch.</p>
                  <div className="relative mb-2">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={campaignMemberSearch}
                      onChange={(e) => setCampaignMemberSearch(e.target.value)}
                      placeholder="Tìm nhân viên..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-lg max-h-44 overflow-y-auto">
                    {campaignFilteredEmployees.length === 0 ? (
                      <div className="text-center py-3 text-gray-500 text-sm">
                        Không tìm thấy nhân viên marketing
                      </div>
                    ) : (
                      campaignFilteredEmployees.map((emp) => (
                        <div
                          key={emp.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleCampaignMember(emp.id)}
                          onKeyDown={(e) => e.key === 'Enter' && toggleCampaignMember(emp.id)}
                          className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 border-b last:border-b-0 ${
                            campaignForm.memberIds.includes(emp.id) ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600 overflow-hidden">
                              {emp.avatarUrl ? (
                                <img src={resolveUploadUrl(emp.avatarUrl)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                emp.fullName.charAt(0)
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{emp.fullName}</div>
                              <div className="text-xs text-gray-500">{emp.code}</div>
                            </div>
                          </div>
                          {campaignForm.memberIds.includes(emp.id) && (
                            <Check className="w-5 h-5 text-primary" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  {campaignForm.memberIds.length > 0 && (
                    <p className="mt-1.5 text-sm text-gray-600">
                      Đã chọn <strong>{campaignForm.memberIds.length}</strong> nhân viên
                    </p>
                  )}
                </div>
              )}
              {!editingCampaign && (
                <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded">
                  Người tạo chiến dịch sẽ mặc định là nhân viên marketing phụ trách. Admin có thể đổi khi chỉnh sửa.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mô tả <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={campaignForm.description}
                  onChange={(e) =>
                    setCampaignForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setCampaignModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={campaignSubmitting || (editingCampaign && isAdmin() && !campaignForm.memberIds?.length)}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2',
                    campaignSubmitting
                      ? 'bg-primary/70 cursor-wait'
                      : 'bg-primary hover:bg-primary/90',
                  )}
                >
                  {campaignSubmitting && (
                    <Loader size={16} className="animate-spin" />
                  )}
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API Integration Modal */}
      {apiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 overflow-y-auto py-8">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Tích hợp API - Nhận Lead từ Website</h3>
                {apiInfo && (
                  <p className="text-sm text-gray-500 mt-1">Chiến dịch: {apiInfo.name}</p>
                )}
              </div>
              <button
                onClick={() => setApiModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle size={24} />
              </button>
            </div>

            {apiLoading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader size={32} className="animate-spin text-primary" />
              </div>
            ) : apiInfo ? (
              <div className="p-6 space-y-6">
                {isCampaignEndedForDisplay(apiInfo.status, apiInfo.endDate) && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        Chiến dịch đã kết thúc (theo trạng thái hoặc đã qua ngày kết thúc).
                      </p>
                      <p className="text-xs text-red-700 mt-0.5">
                        Không tạo API key mới và không cập nhật cấu hình API; endpoint public không nhận lead. Có thể thu hồi key nếu cần.
                      </p>
                    </div>
                  </div>
                )}
                {apiInfo.status &&
                  apiInfo.status !== 'ACTIVE' &&
                  !isCampaignEndedForDisplay(apiInfo.status, apiInfo.endDate) && (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Chiến dịch đang ở trạng thái "{translateStatus(apiInfo.status, CAMPAIGN_STATUS_MAP)}"
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        API chỉ nhận lead khi chiến dịch ở trạng thái "Đang chạy".
                      </p>
                    </div>
                  </div>
                )}

                {/* STEP 1: Chọn trường */}
                {apiStep === 'fields' && !apiInfo.apiKey && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Bước 1: Chọn trường API chấp nhận</h4>
                    <p className="text-sm text-gray-500">
                      Chỉ <span className="font-medium text-gray-800">số điện thoại</span> là bắt buộc. Có thể bật thêm ghi chú, họ tên, địa chỉ (một dòng chữ) tùy form website.
                    </p>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {API_FIELD_OPTIONS.map((f) => {
                          const checked = apiFieldSelection.includes(f.code);
                          return (
                            <label
                              key={f.code}
                              className={clsx(
                                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                                f.required ? 'cursor-not-allowed opacity-95' : 'cursor-pointer',
                                checked ? 'bg-primary/5 border-primary' : 'bg-white border-gray-200 hover:border-gray-300'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={f.required}
                                onChange={() => {
                                  if (f.required) return;
                                  setApiFieldSelection((prev) =>
                                    prev.includes(f.code) ? prev.filter((x) => x !== f.code) : [...prev, f.code]
                                  );
                                }}
                                className="rounded"
                              />
                              <span>
                                {f.label} {f.required && <span className="text-red-500">*</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      onClick={handleGenerateApiKey}
                      disabled={
                        generatingKey ||
                        apiInfo.status !== 'ACTIVE' ||
                        !canUpdateCampaign ||
                        isCampaignEndedForDisplay(apiInfo.status, apiInfo.endDate)
                      }
                      className={clsx(
                        'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-white',
                        generatingKey ||
                          apiInfo.status !== 'ACTIVE' ||
                          !canUpdateCampaign ||
                          isCampaignEndedForDisplay(apiInfo.status, apiInfo.endDate)
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-primary hover:bg-primary/90'
                      )}
                    >
                      {generatingKey ? <Loader size={16} className="animate-spin" /> : <Key size={16} />}
                      Tạo API Key
                    </button>
                  </div>
                )}

                {/* STEP 2: Thông tin API */}
                {(apiStep === 'info' || apiInfo.apiKey) && apiInfo.apiKey && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900 flex items-center gap-2"><Key size={18} /> Thông tin API</h4>
                      {canUpdateCampaign && (
                      <button onClick={handleRevokeApiKey} className="text-sm text-red-600 hover:text-red-700">Thu hồi key</button>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Trường API chấp nhận</p>
                        <p className="text-xs text-gray-500 mt-0.5">Chỉnh và bấm cập nhật — không đổi X-API-Key.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {API_FIELD_OPTIONS.map((f) => {
                          const checked = apiFieldSelection.includes(f.code);
                          return (
                            <label
                              key={`info-${f.code}`}
                              className={clsx(
                                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                                f.required ? 'cursor-not-allowed opacity-95' : 'cursor-pointer',
                                checked ? 'bg-primary/5 border-primary' : 'bg-white border-gray-200 hover:border-gray-300'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={f.required}
                                onChange={() => {
                                  if (f.required) return;
                                  setApiFieldSelection((prev) =>
                                    prev.includes(f.code) ? prev.filter((x) => x !== f.code) : [...prev, f.code]
                                  );
                                }}
                                className="rounded"
                              />
                              <span>
                                {f.label} {f.required && <span className="text-red-500">*</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleUpdateApiIntegration()}
                        disabled={
                          updatingApiIntegration ||
                          !canUpdateCampaign ||
                          isCampaignEndedForDisplay(apiInfo.status, apiInfo.endDate)
                        }
                        className={clsx(
                          'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border',
                          updatingApiIntegration ||
                            !canUpdateCampaign ||
                            isCampaignEndedForDisplay(apiInfo.status, apiInfo.endDate)
                            ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                            : 'border-primary text-primary hover:bg-primary/5'
                        )}
                      >
                        {updatingApiIntegration ? <Loader size={14} className="animate-spin" /> : null}
                        Cập nhật cấu hình API
                      </button>
                    </div>

                    {/* API URL */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">API URL</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-gray-50 px-3 py-2 rounded border text-sm font-mono">{apiInfo.endpoint}</code>
                        <button onClick={() => copyToClipboard(apiInfo.endpoint, 'endpoint')} className={clsx('p-2 rounded border', copiedField === 'endpoint' ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 hover:bg-gray-50')}>
                          {copiedField === 'endpoint' ? <CheckCircle size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Request Header JSON */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">API Request Header (JSON)</label>
                      {(() => {
                        const headerJson = JSON.stringify({ 'Content-Type': 'application/json', 'X-API-Key': apiInfo.apiKey }, null, 2);
                        return (
                          <div className="flex items-start gap-2">
                            <pre className="flex-1 bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto">{headerJson}</pre>
                            <button onClick={() => copyToClipboard(headerJson, 'header')} className={clsx('p-2 rounded border mt-1', copiedField === 'header' ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 hover:bg-gray-50')}>
                              {copiedField === 'header' ? <CheckCircle size={16} /> : <Copy size={16} />}
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Accepted Fields Table */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Trường được chấp nhận</label>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Trường</th><th className="px-3 py-2 text-left">Bắt buộc</th></tr></thead>
                          <tbody className="divide-y">
                            {(Array.isArray(apiInfo.acceptedFields) ? apiInfo.acceptedFields : apiFieldSelection).map((f: string) => {
                              const opt = API_FIELD_OPTIONS.find(o => o.code === f);
                              return (
                                <tr key={f}><td className="px-3 py-2 font-mono text-xs">{f}</td><td className="px-3 py-2">{opt?.required ? <span className="text-red-500 font-medium">Có</span> : 'Không'}</td></tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample Request Body */}
                    {(() => {
                      const fields = sanitizePublicLeadFields(
                        Array.isArray(apiInfo.acceptedFields) ? apiInfo.acceptedFields : apiFieldSelection
                      );
                      const sampleBody: Record<string, string> = {};
                      const sampleMap: Record<string, string> = {
                        phone: '0901234567',
                        note: 'Lead từ form đăng ký website',
                        name: 'Nguyễn Văn A',
                        address: '123 Đường ABC, Quận 1, TP.HCM',
                      };
                      fields.forEach((f) => {
                        sampleBody[f] = sampleMap[f] ?? '';
                      });
                      const bodyJson = JSON.stringify(sampleBody, null, 2);
                      return (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Mẫu Request Body (JSON)</label>
                          <div className="flex items-start gap-2">
                            <pre className="flex-1 bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto">{bodyJson}</pre>
                            <button onClick={() => copyToClipboard(bodyJson, 'body')} className={clsx('p-2 rounded border mt-1', copiedField === 'body' ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 hover:bg-gray-50')}>
                              {copiedField === 'body' ? <CheckCircle size={16} /> : <Copy size={16} />}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sample cURL */}
                    {apiInfo.sampleCode?.curl && (
                      <div>
                        <div className="flex items-center justify-between mb-1"><label className="text-xs text-gray-500">cURL</label>
                          <button onClick={() => copyToClipboard(apiInfo.sampleCode.curl, 'curl')} className={clsx('text-xs flex items-center gap-1', copiedField === 'curl' ? 'text-green-600' : 'text-gray-500')}>
                            {copiedField === 'curl' ? <CheckCircle size={12} /> : <Copy size={12} />} {copiedField === 'curl' ? 'Đã copy' : 'Copy'}
                          </button>
                        </div>
                        <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto">{apiInfo.sampleCode.curl}</pre>
                      </div>
                    )}

                    {/* Sample JS Fetch */}
                    {apiInfo.sampleCode?.javascript && (
                      <div>
                        <div className="flex items-center justify-between mb-1"><label className="text-xs text-gray-500">JavaScript (Fetch)</label>
                          <button onClick={() => copyToClipboard(apiInfo.sampleCode.javascript, 'js')} className={clsx('text-xs flex items-center gap-1', copiedField === 'js' ? 'text-green-600' : 'text-gray-500')}>
                            {copiedField === 'js' ? <CheckCircle size={12} /> : <Copy size={12} />} {copiedField === 'js' ? 'Đã copy' : 'Copy'}
                          </button>
                        </div>
                        <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto">{apiInfo.sampleCode.javascript}</pre>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm pt-2 border-t">
                      <span className="text-gray-500">Lead đã nhận:</span>
                      <span className="font-semibold text-indigo-600">{apiInfo.leadCount || 0}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                Không thể tải thông tin API
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    );
  };

  // Employee Ranking states
  const [employeeRankings, setEmployeeRankings] = useState<EmployeeRanking[]>([]);
  const [employeePerformance, setEmployeePerformance] = useState<EmployeePerformance[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingPeriod, setRankingPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'last_year'>('month');
  const [rankingMetric, setRankingMetric] = useState<'totalLeads' | 'qualifiedLeads' | 'convertedCustomers' | 'cvr' | 'roas' | 'cpl' | 'cpa' | 'totalRevenue' | 'totalCost'>('totalLeads');

  const loadEmployeeRankings = async () => {
    try {
      setRankingLoading(true);
      const perfRes = await apiClient.get(`/marketing-groups/performance?period=${rankingPeriod}`);
      if (perfRes.success && perfRes.data) {
        setEmployeePerformance(perfRes.data);
      }
      
      const data = await apiClient.get(`/marketing/employee-rankings?period=${rankingPeriod}`);
      if (Array.isArray(data)) {
        setEmployeeRankings(data);
      } else if (data.rankings) {
        setEmployeeRankings(data.rankings);
      }
    } catch (error) {
      console.error('Load employee rankings error:', error);
    } finally {
      setRankingLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'employee-ranking') {
      loadEmployeeRankings();
    }
  }, [activeTab, rankingPeriod]);

  const RANKING_METRICS = [
    { value: 'totalLeads', label: 'Tổng Lead', desc: 'Tổng số khách hàng tiềm năng (lead) mà nhân viên mang về', lowerBetter: false },
    { value: 'qualifiedLeads', label: 'Lead đủ điều kiện', desc: 'Số lead đã được đánh giá đủ điều kiện chuyển đổi', lowerBetter: false },
    { value: 'convertedCustomers', label: 'Khách hàng chuyển đổi', desc: 'Số lead đã chuyển thành khách hàng thực sự (có mua hàng)', lowerBetter: false },
    { value: 'cvr', label: 'CVR – Tỷ lệ chuyển đổi', desc: 'Conversion Rate: Phần trăm lead chuyển thành khách mua hàng. CVR = (Khách chuyển đổi ÷ Tổng Lead) × 100%', lowerBetter: false },
    { value: 'roas', label: 'ROAS – Lợi nhuận trên chi phí QC', desc: 'Return On Ad Spend: Doanh thu thu về trên mỗi đồng chi phí quảng cáo. ROAS = Doanh thu ÷ Chi phí. ROAS ≥ 3 là xuất sắc', lowerBetter: false },
    { value: 'cpl', label: 'CPL – Chi phí mỗi lead', desc: 'Cost Per Lead: Chi phí quảng cáo để có được 1 lead. CPL = Chi phí ÷ Tổng Lead. CPL càng thấp càng tốt', lowerBetter: true },
    { value: 'cpa', label: 'CPA – Chi phí mỗi khách hàng', desc: 'Cost Per Acquisition: Chi phí để chuyển đổi 1 khách hàng thực. CPA = Chi phí ÷ Khách chuyển đổi. CPA càng thấp càng tốt', lowerBetter: true },
    { value: 'totalRevenue', label: 'Tổng doanh thu', desc: 'Tổng giá trị đơn hàng từ các khách hàng do nhân viên mang về', lowerBetter: false },
    { value: 'totalCost', label: 'Tổng chi phí', desc: 'Tổng chi phí quảng cáo được phân bổ cho nhân viên', lowerBetter: true },
  ] as const;

  const currentMetricInfo = RANKING_METRICS.find(m => m.value === rankingMetric)!;

  const sortedPerformance = useMemo(() => {
    return [...employeePerformance].sort((a, b) => {
      const aVal = (a as any)[rankingMetric] || 0;
      const bVal = (b as any)[rankingMetric] || 0;
      
      if (currentMetricInfo.lowerBetter) {
        const aEff = aVal === 0 ? Infinity : aVal;
        const bEff = bVal === 0 ? Infinity : bVal;
        return aEff - bEff;
      }
      return bVal - aVal;
    });
  }, [employeePerformance, rankingMetric, currentMetricInfo]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800">🥇 #{rank}</span>;
    if (rank === 2) return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold bg-gray-100 text-gray-800">🥈 #{rank}</span>;
    if (rank === 3) return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold bg-orange-100 text-orange-800">🥉 #{rank}</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600">#{rank}</span>;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'day': return 'Hôm nay';
      case 'week': return 'Tuần này';
      case 'month': return 'Tháng này';
      case 'year': return 'Năm nay';
      case 'last_year': return 'Năm trước';
      default: return period;
    }
  };

  const renderEmployeeRankingTab = () => {
    const formatMetricValue = (emp: EmployeePerformance, metric: string): string => {
      switch (metric) {
        case 'totalLeads': return emp.totalLeads.toLocaleString();
        case 'qualifiedLeads': return emp.qualifiedLeads.toLocaleString();
        case 'convertedCustomers': return emp.convertedCustomers.toLocaleString();
        case 'cvr': return emp.cvr.toFixed(1) + '%';
        case 'roas': return emp.roas.toFixed(2) + 'x';
        case 'cpl': return emp.cpl > 0 ? formatCurrency(emp.cpl) : '-';
        case 'cpa': return emp.cpa > 0 ? formatCurrency(emp.cpa) : '-';
        case 'totalRevenue': return formatCurrency(emp.totalRevenue);
        case 'totalCost': return formatCurrency(emp.totalCost);
        default: return '-';
      }
    };

    const getMetricColor = (emp: EmployeePerformance, metric: string): string => {
      switch (metric) {
        case 'cvr': return emp.cvr >= 20 ? 'text-green-600' : emp.cvr >= 10 ? 'text-yellow-600' : 'text-red-600';
        case 'roas': return emp.roas >= 3 ? 'text-green-600' : emp.roas >= 1 ? 'text-yellow-600' : 'text-red-600';
        case 'cpl': return emp.cpl === 0 ? 'text-gray-400' : emp.cpl < 100000 ? 'text-green-600' : emp.cpl < 300000 ? 'text-yellow-600' : 'text-red-600';
        case 'cpa': return emp.cpa === 0 ? 'text-gray-400' : emp.cpa < 300000 ? 'text-green-600' : emp.cpa < 800000 ? 'text-yellow-600' : 'text-red-600';
        case 'totalRevenue': return 'text-orange-600';
        case 'totalCost': return 'text-red-600';
        default: return 'text-blue-600';
      }
    };

    return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="text-yellow-500" size={28} />
            Xếp hạng hiệu suất Marketing
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Chọn chỉ số để xếp hạng nhân viên theo tiêu chí cụ thể
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <select
              value={rankingPeriod}
              onChange={(e) => setRankingPeriod(e.target.value as any)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="day">Hôm nay</option>
              <option value="week">Tuần này</option>
              <option value="month">Tháng này</option>
              <option value="year">Năm nay</option>
              <option value="last_year">Năm trước</option>
            </select>
          </div>
          <button
            onClick={loadEmployeeRankings}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {rankingLoading ? <Loader size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            Làm mới
          </button>
        </div>
      </div>

      {/* Metric Selector */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <ArrowUpDown size={18} className="text-primary" />
          Chọn chỉ số xếp hạng
        </h4>
        <div className="flex flex-wrap gap-2">
          {RANKING_METRICS.map(m => (
            <button
              key={m.value}
              onClick={() => setRankingMetric(m.value as any)}
              className={clsx(
                'relative px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                rankingMetric === m.value
                  ? 'bg-primary text-white border-primary shadow-md'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
              )}
            >
              <div className="relative group/mt">
                {m.label}
                {m.lowerBetter && <span className="ml-1 text-xs opacity-70">↓</span>}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/mt:opacity-100 group-hover/mt:visible transition-all duration-200 z-[9999] shadow-xl min-w-[260px] font-normal pointer-events-none">
                  <div className="font-semibold mb-1 text-sm">{m.label}</div>
                  <div className="text-gray-300 normal-case leading-relaxed">{m.desc}</div>
                  {m.lowerBetter && <div className="mt-1.5 pt-1.5 border-t border-gray-700 text-yellow-300 text-xs">⚡ Giá trị thấp hơn = tốt hơn</div>}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-start gap-2">
            <HelpCircle size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700">
              <span className="font-medium">{currentMetricInfo.label}:</span>{' '}
              {currentMetricInfo.desc}
              {currentMetricInfo.lowerBetter && <span className="ml-1 font-medium text-blue-800">(giá trị thấp hơn = xếp hạng cao hơn)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
          <div className="text-sm text-blue-600 font-medium">Tổng nhân viên</div>
          <div className="text-2xl font-bold text-blue-800">{employeePerformance.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
          <div className="text-sm text-green-600 font-medium">Tổng Lead</div>
          <div className="text-2xl font-bold text-green-800">
            {employeePerformance.reduce((sum, e) => sum + e.totalLeads, 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
          <div className="text-sm text-purple-600 font-medium">Đã chuyển đổi</div>
          <div className="text-2xl font-bold text-purple-800">
            {employeePerformance.reduce((sum, e) => sum + e.convertedCustomers, 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
          <div className="text-sm text-orange-600 font-medium">Tổng doanh thu</div>
          <div className="text-2xl font-bold text-orange-800">
            {formatCurrency(employeePerformance.reduce((sum, e) => sum + e.totalRevenue, 0))}
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl border border-red-200">
          <div className="text-sm text-red-600 font-medium">Tổng chi phí</div>
          <div className="text-2xl font-bold text-red-800">
            {formatCurrency(employeePerformance.reduce((sum, e) => sum + e.totalCost, 0))}
          </div>
        </div>
      </div>

      {/* Ranking Table */}
      {rankingLoading ? (
        <div className="flex justify-center py-12">
          <Loader size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-16">Hạng</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Nhân viên</th>
                  <th className="px-4 py-3 text-xs font-semibold text-primary uppercase bg-primary/5 border-l-2 border-primary">
                    <div className="flex items-center gap-1">
                      📊 {currentMetricInfo.label}
                      {currentMetricInfo.lowerBetter && <span className="text-xs opacity-70">↓</span>}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Lead</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    <div className="relative group/cvr inline-flex items-center gap-1 cursor-help">
                      CVR
                      <HelpCircle size={12} className="text-gray-400" />
                      <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/cvr:opacity-100 group-hover/cvr:visible transition-all z-[9999] min-w-[220px] font-normal pointer-events-none">
                        <strong>CVR – Conversion Rate</strong><br/>Tỷ lệ chuyển đổi từ Lead thành khách mua hàng.<br/>CVR = Khách chuyển đổi ÷ Tổng Lead × 100%
                        <div className="absolute top-full left-4 border-8 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    <div className="relative group/roas inline-flex items-center gap-1 cursor-help">
                      ROAS
                      <HelpCircle size={12} className="text-gray-400" />
                      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/roas:opacity-100 group-hover/roas:visible transition-all z-[9999] min-w-[220px] font-normal pointer-events-none">
                        <strong>ROAS – Return On Ad Spend</strong><br/>Doanh thu trên chi phí quảng cáo.<br/>ROAS = Doanh thu ÷ Chi phí. ROAS ≥ 3 là xuất sắc.
                        <div className="absolute top-full right-4 border-8 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    <div className="relative group/cpl inline-flex items-center gap-1 cursor-help">
                      CPL
                      <HelpCircle size={12} className="text-gray-400" />
                      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/cpl:opacity-100 group-hover/cpl:visible transition-all z-[9999] min-w-[220px] font-normal pointer-events-none">
                        <strong>CPL – Cost Per Lead</strong><br/>Chi phí để có 1 lead.<br/>CPL = Chi phí ÷ Tổng Lead. Thấp hơn = tốt hơn.
                        <div className="absolute top-full right-4 border-8 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    <div className="relative group/cpa inline-flex items-center gap-1 cursor-help">
                      CPA
                      <HelpCircle size={12} className="text-gray-400" />
                      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/cpa:opacity-100 group-hover/cpa:visible transition-all z-[9999] min-w-[240px] font-normal pointer-events-none">
                        <strong>CPA – Cost Per Acquisition</strong><br/>Chi phí để chuyển đổi 1 khách hàng thực.<br/>CPA = Chi phí ÷ Khách chuyển đổi. Thấp hơn = tốt hơn.
                        <div className="absolute top-full right-4 border-8 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">Chi phí</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedPerformance.map((emp, index) => (
                  <tr key={emp.employeeId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      {getRankBadge(index + 1)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-bold overflow-hidden">
                          {emp.avatarUrl ? (
                            <img src={resolveUploadUrl(emp.avatarUrl)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            emp.employeeName.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{emp.employeeName}</div>
                          <div className="text-xs text-gray-500">{emp.employeeCode} • {emp.department}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 bg-primary/5 border-l-2 border-primary">
                      <span className={clsx('text-lg font-bold', getMetricColor(emp, rankingMetric))}>
                        {formatMetricValue(emp, rankingMetric)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <span className="font-bold text-blue-600">{emp.totalLeads}</span>
                        <div className="text-xs text-gray-500">
                          {emp.qualifiedLeads} đủ ĐK / {emp.convertedCustomers} CĐ
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={clsx('font-bold', emp.cvr >= 20 ? 'text-green-600' : emp.cvr >= 10 ? 'text-yellow-600' : 'text-red-600')}>
                        {emp.cvr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={clsx('font-bold', emp.roas >= 3 ? 'text-green-600' : emp.roas >= 1 ? 'text-yellow-600' : 'text-red-600')}>
                        {emp.roas.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={clsx('font-bold', emp.cpl === 0 ? 'text-gray-400' : emp.cpl < 100000 ? 'text-green-600' : emp.cpl < 300000 ? 'text-yellow-600' : 'text-red-600')}>
                        {emp.cpl > 0 ? formatCurrency(emp.cpl) : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={clsx('font-bold', emp.cpa === 0 ? 'text-gray-400' : emp.cpa < 300000 ? 'text-green-600' : emp.cpa < 800000 ? 'text-yellow-600' : 'text-red-600')}>
                        {emp.cpa > 0 ? formatCurrency(emp.cpa) : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-medium text-red-600">{formatCurrency(emp.totalCost)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-bold text-orange-600">{formatCurrency(emp.totalRevenue)}</span>
                    </td>
                  </tr>
                ))}
                {sortedPerformance.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={48} className="text-gray-300" />
                        <p>Chưa có dữ liệu xếp hạng cho {getPeriodLabel(rankingPeriod).toLowerCase()}</p>
                        <p className="text-sm">Hãy thêm chi phí và phân bổ cho nhân viên trong tab "Chi phí & Hiệu quả"</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-5">
        <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <HelpCircle size={16} />
          Giải thích các chỉ số viết tắt
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="bg-white p-3 rounded-lg border">
            <div className="font-semibold text-gray-800 mb-1">CVR <span className="font-normal text-gray-500">– Conversion Rate</span></div>
            <p className="text-gray-600">Tỷ lệ chuyển đổi từ Lead → Khách mua hàng. <span className="text-green-600 font-medium">CVR cao = hiệu quả</span></p>
            <div className="mt-1 text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">CVR = Khách CĐ ÷ Tổng Lead × 100%</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="font-semibold text-gray-800 mb-1">ROAS <span className="font-normal text-gray-500">– Return On Ad Spend</span></div>
            <p className="text-gray-600">Doanh thu trên chi phí quảng cáo. ROAS = 3 nghĩa là <span className="text-green-600 font-medium">chi 1đ, thu 3đ</span></p>
            <div className="mt-1 text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">ROAS = Doanh thu ÷ Chi phí</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="font-semibold text-gray-800 mb-1">CPL <span className="font-normal text-gray-500">– Cost Per Lead</span></div>
            <p className="text-gray-600">Chi phí để có 1 lead. <span className="text-green-600 font-medium">CPL thấp = hiệu quả cao</span></p>
            <div className="mt-1 text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">CPL = Chi phí ÷ Tổng Lead</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="font-semibold text-gray-800 mb-1">CPA <span className="font-normal text-gray-500">– Cost Per Acquisition</span></div>
            <p className="text-gray-600">Chi phí để có 1 khách hàng thực. <span className="text-green-600 font-medium">CPA thấp = hiệu quả cao</span></p>
            <div className="mt-1 text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">CPA = Chi phí ÷ Khách chuyển đổi</div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
        <p className="text-gray-500 text-sm mt-1">
          Quản lý khách hàng Marketing, nền tảng và chiến dịch quảng cáo.
        </p>
      </div>

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full overflow-x-auto">
        <button
          onClick={() => setActiveTab('leads')}
          className={clsx(
            'flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            activeTab === 'leads'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200',
          )}
        >
          <List size={18} />
          Khách hàng Marketing
        </button>
        {canViewMarketingPlatforms && (
        <button
          onClick={() => setActiveTab('sources')}
          className={clsx(
            'flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            activeTab === 'sources'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200',
          )}
        >
          <Target size={18} />
          Nền tảng
        </button>
        )}
        {canViewCampaigns && (
        <button
          onClick={() => setActiveTab('campaigns')}
          className={clsx(
            'flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            activeTab === 'campaigns'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200',
          )}
        >
          <Megaphone size={18} />
          Chiến dịch quảng cáo
        </button>
        )}
        <button
          onClick={() => setActiveTab('cost-effectiveness')}
          className={clsx(
            'flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            activeTab === 'cost-effectiveness'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200',
          )}
        >
          <TrendingUp size={18} />
          Chi phí & Hiệu quả
        </button>
        <button
          onClick={() => setActiveTab('employee-ranking')}
          className={clsx(
            'flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            activeTab === 'employee-ranking'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200',
          )}
        >
          <Award size={18} />
          Xếp hạng hiệu suất
        </button>
      </div>

      {activeTab === 'leads' && renderLeadsTab()}
      {activeTab === 'sources' && renderSourcesTab()}
      {activeTab === 'campaigns' && renderCampaignsTab()}
      {activeTab === 'cost-effectiveness' && (
        <MarketingCostEffectiveness campaigns={campaigns} />
      )}
      {activeTab === 'employee-ranking' && renderEmployeeRankingTab()}

      {/* Import Excel Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setImportModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet size={20} className="text-blue-500" />
                Import khách hàng từ Excel
              </h3>
              <button onClick={() => setImportModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <XIcon size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nền tảng (tùy chọn)</label>
                <select
                  value={importSourceId}
                  onChange={(e) => { setImportSourceId(e.target.value); setImportCampaignId(''); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">— Không chọn —</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chiến dịch (tùy chọn)</label>
                <select
                  value={importCampaignId}
                  onChange={(e) => setImportCampaignId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  disabled={!importSourceId}
                >
                  <option value="">— Không chọn —</option>
                  {campaigns.filter(c => !importSourceId || c.sourceId === importSourceId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!importSourceId && <p className="text-xs text-gray-400 mt-1">Chọn nền tảng trước để lọc chiến dịch</p>}
              </div>
              {isAdmin() && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gán cho NV Marketing <span className="text-red-500">*</span></label>
                  <select
                    value={importEmployeeId}
                    onChange={(e) => setImportEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">— Chọn nhân viên —</option>
                    {marketingEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">ADM có thể chọn NV marketing để gán khách hàng import</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File Excel <span className="text-red-500">*</span></label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
                  className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-400">
                    Cột bắt buộc: <strong>Số điện thoại</strong>. Xem sheet "Hướng dẫn" trong file mẫu.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const blob = await apiClient.getBlob('/marketing/leads/import-template');
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
                      } catch { alert('Lỗi tải file mẫu'); }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 whitespace-nowrap"
                  >
                    <Download size={14} />
                    Tải file mẫu
                  </button>
                </div>
              </div>
              {importResult && (
                <div className={clsx('p-3 rounded-lg text-sm', importResult.success > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
                  <p className="font-medium">{importResult.message}</p>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium">Chi tiết lỗi ({importResult.errors.length})</summary>
                      <ul className="mt-1 text-xs space-y-0.5 max-h-32 overflow-y-auto">
                        {importResult.errors.map((err: string, i: number) => <li key={i}>• {err}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t bg-gray-50">
              <ToolbarButton variant="secondary" className="text-sm" onClick={() => setImportModalOpen(false)}>
                Đóng
              </ToolbarButton>
              <ToolbarButton
                variant="primary"
                className="text-sm disabled:opacity-50"
                onClick={handleImportLeads}
                disabled={!importFile || importLoading || (isAdmin() && !importEmployeeId)}
              >
                {importLoading ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
                Nhập Excel
              </ToolbarButton>
            </div>
          </div>
        </div>
      )}

      {/* Lead Detail Modal */}
      {leadDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLeadDetailOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Chi tiết khách hàng Marketing</h3>
              <button onClick={() => setLeadDetailOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <XIcon size={20} className="text-gray-500" />
              </button>
            </div>

            {leadDetailLoading ? (
              <div className="flex justify-center items-center py-20">
                <Loader size={32} className="animate-spin text-blue-500" />
              </div>
            ) : leadDetailData ? (
              <div className="overflow-y-auto max-h-[calc(90vh-70px)]">
                {/* Thông tin cơ bản */}
                <div className="p-5 border-b space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                      {(leadDetailData.name || 'K').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-gray-900">{leadDetailData.name || 'Chưa có tên'}</div>
                      <div className="text-sm text-gray-500">{leadDetailData.code || ''}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <select
                        value={leadDetailData.leadStatus || 'NEW'}
                        onChange={(e) => handleUpdateLeadFields(leadDetailData.id, { leadStatus: e.target.value })}
                        className={clsx('px-3 py-1 rounded-full text-xs font-medium border-0 cursor-pointer appearance-none pr-6 shadow-sm',
                          leadDetailData.leadStatus === 'NEW' && 'bg-blue-100 text-blue-700',
                          leadDetailData.leadStatus === 'CONTACTED' && 'bg-cyan-100 text-cyan-700',
                          leadDetailData.leadStatus === 'QUALIFIED' && 'bg-green-100 text-green-700',
                          leadDetailData.leadStatus === 'NEGOTIATING' && 'bg-yellow-100 text-yellow-700',
                          leadDetailData.leadStatus === 'WON' && 'bg-emerald-100 text-emerald-700',
                          leadDetailData.leadStatus === 'LOST' && 'bg-red-100 text-red-700',
                          leadDetailData.leadStatus === 'INVALID' && 'bg-gray-200 text-gray-600',
                          leadDetailData.leadStatus === 'IN_PROGRESS' && 'bg-orange-100 text-orange-700',
                          leadDetailData.leadStatus === 'UNQUALIFIED' && 'bg-red-100 text-red-700',
                          leadDetailData.leadStatus === 'CONVERTED' && 'bg-purple-100 text-purple-700',
                        )}
                      >
                        <option value="NEW">Mới</option>
                        <option value="CONTACTED">Đã liên hệ</option>
                        <option value="QUALIFIED">Đủ điều kiện</option>
                        <option value="NEGOTIATING">Đang đàm phán</option>
                        <option value="WON">Thắng</option>
                        <option value="LOST">Thua</option>
                        <option value="INVALID">Không hợp lệ</option>
                        <option value="CONVERTED">Đã chuyển đổi</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {leadDetailData.phone && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Phone size={14} className="text-gray-400" />
                        {leadDetailData.phone}
                      </div>
                    )}
                    {leadDetailData.email && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Mail size={14} className="text-gray-400" />
                        {leadDetailData.email}
                      </div>
                    )}
                    {(leadDetailData.province || leadDetailData.district || leadDetailData.ward || leadDetailData.address) && (
                      <div className="flex items-start gap-2 text-gray-700 col-span-2">
                        <MapPin size={14} className="text-gray-400 mt-0.5" />
                        <span>
                          {[
                            leadDetailData.address?.trim() || null,
                            formatAdminGeoLine(
                              leadDetailData.ward?.name,
                              leadDetailData.district?.name,
                              leadDetailData.province?.name
                            ) || null
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-700">
                      <Target size={14} className="text-gray-400" />
                      Nền tảng:
                      <select
                        value={leadDetailData.leadSourceId || ''}
                        onChange={(e) => handleUpdateLeadFields(leadDetailData.id, { leadSourceId: e.target.value })}
                        className="bg-transparent border-0 border-b border-gray-200 text-sm font-medium focus:ring-0 py-0 pr-6"
                      >
                        <option value="">— Chưa chọn —</option>
                        {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <Megaphone size={14} className="text-gray-400" />
                      Chiến dịch:
                      <select
                        value={leadDetailData.campaignId || ''}
                        onChange={(e) => handleUpdateLeadFields(leadDetailData.id, { campaignId: e.target.value })}
                        className="bg-transparent border-0 border-b border-gray-200 text-sm font-medium focus:ring-0 py-0 pr-6"
                        disabled={!leadDetailData.leadSourceId}
                      >
                        <option value="">
                          {!leadDetailData.leadSourceId ? 'Chọn nền tảng trước' : '— Chưa chọn —'}
                        </option>
                        {campaigns
                          .filter(c => !leadDetailData.leadSourceId || c.sourceId === leadDetailData.leadSourceId)
                          .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                        }
                      </select>
                    </div>
                    {leadDetailData.marketingOwner && (
                      <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2 text-gray-700">
                          <User size={14} className="text-blue-500" />
                          <span className="text-sm">NV Marketing: <span className="font-semibold">{leadDetailData.marketingOwner.fullName}</span></span>
                        </div>
                        {leadDetailData.marketingOwner.phone && (
                          <div className="flex items-center gap-2 text-gray-500 text-xs ml-5">
                            <Phone size={12} /> {leadDetailData.marketingOwner.phone}
                          </div>
                        )}
                        {leadDetailData.marketingOwner.emailCompany && (
                          <div className="flex items-center gap-2 text-gray-500 text-xs ml-5">
                            <Mail size={12} /> {leadDetailData.marketingOwner.emailCompany}
                          </div>
                        )}
                        {leadDetailData.marketingOwner.manager && (
                          <div className="mt-1 pt-2 border-t border-blue-100">
                            <div className="flex items-center gap-2 text-gray-600 text-sm">
                              <Users size={14} className="text-blue-400" />
                              Quản lý: <span className="font-semibold">{leadDetailData.marketingOwner.manager.fullName}</span>
                            </div>
                            {leadDetailData.marketingOwner.manager.phone && (
                              <div className="flex items-center gap-2 text-gray-500 text-xs ml-5 mt-1">
                                <Phone size={12} /> {leadDetailData.marketingOwner.manager.phone}
                              </div>
                            )}
                            {leadDetailData.marketingOwner.manager.emailCompany && (
                              <div className="flex items-center gap-2 text-gray-500 text-xs ml-5">
                                <Mail size={12} /> {leadDetailData.marketingOwner.manager.emailCompany}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {leadDetailData.gender && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <User size={14} className="text-gray-400" />
                        Giới tính: {leadDetailData.gender === 'male' ? 'Nam' : leadDetailData.gender === 'female' ? 'Nữ' : 'Khác'}
                      </div>
                    )}
                    {leadDetailData.dateOfBirth && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Calendar size={14} className="text-gray-400" />
                        Ngày sinh: {formatDate(leadDetailData.dateOfBirth)}
                      </div>
                    )}
                  </div>
                  {leadDetailData.tags && leadDetailData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {leadDetailData.tags.map((t: any) => (
                        <span key={t.tag?.id || t.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                          {t.tag?.name || ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Đơn hàng đầu tiên */}
                <div className="p-5 border-b">
                  <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                    <Package size={16} className="text-indigo-500" />
                    Đơn hàng đầu tiên
                  </h4>
                  {leadDetailData.orders && leadDetailData.orders.length > 0 ? (
                    (() => {
                      const order = leadDetailData.orders[0];
                      return (
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-900">#{order.code}</span>
                            <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium',
                              order.orderStatus === 'COMPLETED' && 'bg-green-100 text-green-700',
                              order.orderStatus === 'PENDING' && 'bg-yellow-100 text-yellow-700',
                              order.orderStatus === 'CONFIRMED' && 'bg-blue-100 text-blue-700',
                              order.orderStatus === 'PROCESSING' && 'bg-orange-100 text-orange-700',
                              order.orderStatus === 'CANCELLED' && 'bg-red-100 text-red-700',
                              order.orderStatus === 'SHIPPING' && 'bg-purple-100 text-purple-700',
                            )}>
                              {translateStatus(order.orderStatus, ORDER_STATUS_MAP)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            Ngày đặt: {formatDate(order.orderDate)}
                          </div>
                          <div className="text-sm text-gray-600">
                            Tổng tiền: <span className="font-semibold text-gray-900">
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(order.finalAmount || order.totalAmount))}
                            </span>
                          </div>
                          {order.shippingStatus && (
                            <div className="text-sm text-gray-600">
                              Trạng thái giao: <span className="font-medium">{translateStatus(order.shippingStatus, SHIPPING_STATUS_MAP)}</span>
                            </div>
                          )}
                          {order.items && order.items.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs font-medium text-gray-500 mb-1">Sản phẩm:</div>
                              {order.items.map((item: any) => (
                                <div key={item.id} className="text-xs text-gray-700 flex justify-between">
                                  <span>{item.product?.name || item.product?.code || 'SP'} x{item.quantity}</span>
                                  <span>{new Intl.NumberFormat('vi-VN').format(Number(item.totalPrice))}đ</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
                      Chưa có đơn hàng
                    </div>
                  )}
                </div>

                {/* Lịch sử tác động */}
                <div className="p-5">
                  <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                    <Clock size={16} className="text-green-500" />
                    Lịch sử tác động khách hàng
                    {leadDetailData.interactions && (
                      <span className="text-xs font-normal text-gray-400">({leadDetailData.interactions.length})</span>
                    )}
                  </h4>
                  {leadDetailData.interactions && leadDetailData.interactions.length > 0 ? (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {leadDetailData.interactions.map((interaction: any) => (
                        <div key={interaction.id} className="relative pl-6 pb-3 border-l-2 border-gray-200 last:border-l-0">
                          <div className="absolute left-[-5px] top-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white"></div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex justify-between items-start mb-1">
                              <div className="flex items-center gap-2">
                                <span className={clsx('px-2 py-0.5 rounded text-xs font-medium',
                                  interaction.type === 'CALL' && 'bg-blue-100 text-blue-700',
                                  interaction.type === 'EMAIL' && 'bg-purple-100 text-purple-700',
                                  interaction.type === 'MEETING' && 'bg-green-100 text-green-700',
                                  interaction.type === 'NOTE' && 'bg-yellow-100 text-yellow-700',
                                  interaction.type === 'SMS' && 'bg-orange-100 text-orange-700',
                                  !['CALL', 'EMAIL', 'MEETING', 'NOTE', 'SMS'].includes(interaction.type) && 'bg-gray-100 text-gray-700',
                                )}>
                                  {translateStatus(interaction.type, INTERACTION_TYPE_MAP)}
                                </span>
                                {interaction.employee && (
                                  <span className="text-xs text-gray-500">
                                    bởi <span className="font-medium">{interaction.employee.fullName}</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-400">
                                {formatDateTime(interaction.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{interaction.content}</p>
                            {interaction.result && (
                              <p className="text-xs text-gray-500 mt-1">Kết quả: {interaction.result}</p>
                            )}
                            {interaction.nextActionAt && (
                              <p className="text-xs text-blue-600 mt-1">
                                Hành động tiếp theo: {formatDateTime(interaction.nextActionAt)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
                      Chưa có lịch sử tác động
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketing;
