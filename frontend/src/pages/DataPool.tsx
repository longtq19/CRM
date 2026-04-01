import { useEffect, useState, useCallback } from 'react';
import { apiClient, ApiHttpError } from '../api/client';
import PaginationBar from '../components/PaginationBar';
import { ToolbarButton } from '../components/ui/ToolbarButton';
import { normalizePageSize } from '../constants/pagination';
import { useAuthStore } from '../context/useAuthStore';
import { isTechnicalAdminRole } from '../constants/rbac';
import {
  Database, Search, RefreshCcw, Loader, UserPlus,
  Phone, Mail, Download, Eye, Send
} from 'lucide-react';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';
import { CustomerTagBadges, CustomerTagsQuickCell, type TagBadgeModel } from '../components/CustomerTags';
import { formatDate } from '../utils/format';
import { CROP_DEFS } from '../constants/cropConfigs';
import { useLeadProcessingStatuses } from '../hooks/useLeadProcessingStatuses';

interface DataPoolItem {
  id: string;
  customerId: string;
  source: string;
  status: string;
  priority: number;
  enteredAt: string;
  note: string | null;
  poolType: string;
  poolQueue?: string;
  roundCount: number;
  processingStatus: string | null;
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
  };
  assignedTo: { id: string; code: string; fullName: string } | null;
}

interface FuncUnit { id: string; name: string; function: string | null; }
interface Employee { id: string; code: string; fullName: string; employeeType?: { code: string } | null; }

const DataPool = () => {
  const { hasPermission, user } = useAuthStore();
  const { options: processingStatusOptions, loading: processingStatusCatalogLoading, statusLabel } =
    useLeadProcessingStatuses();
  const isTechAdmin = isTechnicalAdminRole(user?.roleGroup?.code);
  const roleCode = (user?.roleGroup?.code || '').toLowerCase();
  const isSalesCskhGroup = roleCode.includes('sales') || roleCode.includes('customer_success');

  const hasManagedUnitView =
    isTechAdmin ||
    hasPermission('VIEW_MANAGED_UNIT_POOL') ||
    hasPermission('FULL_ACCESS');
  
  const canDistributeFloating =
    isTechAdmin ||
    hasPermission('DISTRIBUTE_FLOATING_POOL') ||
    hasPermission('MANAGE_DATA_POOL') ||
    hasPermission('DISTRIBUTE_FLOATING_CROSS_ORG');
  const canClaimFloating =
    isTechAdmin ||
    isSalesCskhGroup ||
    hasPermission('CLAIM_FLOATING_POOL') ||
    hasPermission('MANAGE_DATA_POOL');
  const hasFloatingView =
    isTechAdmin || isSalesCskhGroup || hasPermission('VIEW_FLOATING_POOL') || hasPermission('FULL_ACCESS');

  const showFloatingTab = hasFloatingView;
  const showManagedTab = hasManagedUnitView;
  const canRecallManagedUnit =
    isTechAdmin ||
    hasPermission('RECALL_MANAGED_UNIT_LEADS');
  const canManageCustomerTags =
    hasPermission('MANAGE_CUSTOMERS') ||
    hasPermission('MANAGE_SALES') ||
    hasPermission('MANAGE_RESALES') ||
    hasPermission('MANAGE_MARKETING_GROUPS');

  const [listTab, setListTab] = useState<'floating' | 'managed'>('floating');
  const [items, setItems] = useState<DataPoolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalAvailableFloating, setTotalAvailableFloating] = useState(0);
  const [todayAdded, setTodayAdded] = useState(0);
  const [totalAssignedTeam, setTotalAssignedTeam] = useState(0);
  const [todayAssignedTeam, setTodayAssignedTeam] = useState(0);
  const [viewScopeDescription, setViewScopeDescription] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [processingStatusFilter, setProcessingStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [provinceFilter, setProvinceFilter] = useState('all');
  const [mainCropFilter, setMainCropFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [provinceOptions, setProvinceOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [tagOptions, setTagOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [tagCatalog, setTagCatalog] = useState<TagBadgeModel[]>([]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributeTargetType, setDistributeTargetType] = useState<'EMPLOYEE' | 'UNIT'>('EMPLOYEE');
  const [distributeTargetId, setDistributeTargetId] = useState('');
  const [distributing, setDistributing] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [unitOptions, setUnitOptions] = useState<FuncUnit[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const [detailCustomer, setDetailCustomer] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    if (!showFloatingTab && showManagedTab) {
      setListTab('managed');
    }
  }, [showFloatingTab, showManagedTab]);

  useEffect(() => {
    setSelectedIds([]);
    setPage(1);
  }, [listTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (listTab === 'managed') {
        params.set('status', 'ASSIGNED');
        params.set('managedScope', '1');
      } else {
        params.set('status', 'AVAILABLE');
        params.set('poolType', 'SALES');
        params.set('poolQueue', 'FLOATING');
      }
      if (search) params.set('search', search);
      if (processingStatusFilter !== 'all') params.set('processingStatus', processingStatusFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (provinceFilter !== 'all') params.set('provinceId', provinceFilter);
      if (mainCropFilter !== 'all') params.set('mainCrop', mainCropFilter);
      if (tagFilter) params.set('tagIds', tagFilter);

      const res = await apiClient.get(`/data-pool?${params}`);
      setItems(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || 1);
      setViewScopeDescription(
        typeof res.viewScopeDescription === 'string' ? res.viewScopeDescription : null,
      );
    } catch { /* ignore */ }
    setLoading(false);
  }, [
    listTab,
    page,
    pageSize,
    search,
    processingStatusFilter,
    sourceFilter,
    provinceFilter,
    mainCropFilter,
    tagFilter,
  ]);

  const loadStats = useCallback(async () => {
    try {
      const q = listTab === 'managed' ? '?managedScope=1' : '';
      const res = await apiClient.get(`/data-pool/stats${q}`);
      setTotalAvailableFloating(res.totalAvailableFloating ?? 0);
      setTodayAdded(res.todayAdded || 0);
      setTotalAssignedTeam(res.totalAssigned ?? 0);
      setTodayAssignedTeam(res.todayAssigned ?? 0);
      if (listTab === 'managed' && typeof res.viewScopeDescription === 'string') {
        setViewScopeDescription(res.viewScopeDescription);
      }
    } catch { /* ignore */ }
  }, [listTab]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    apiClient.get('/address/provinces').then((data: any) => {
      const arr = Array.isArray(data) ? data : data?.data;
      if (Array.isArray(arr)) setProvinceOptions(arr);
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
  }, []);

  const loadDistributeOptions = useCallback(async () => {
    try {
      const [empRes, unitRes] = await Promise.all([
        apiClient.get('/hr/employees?limit=500&status=WORKING'),
        apiClient.get('/hr/departments?function=SALES,CSKH&leafOnly=true'),
      ]);
      setEmployeeOptions(empRes.data || empRes || []);
      setUnitOptions(unitRes.data || unitRes || []);
    } catch { /* ignore */ }
  }, []);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const qs = new URLSearchParams();
      qs.set('status', 'all');
      if (search) qs.set('search', search);
      if (provinceFilter !== 'all') qs.set('provinceId', provinceFilter);
      if (mainCropFilter !== 'all') qs.set('mainCrop', mainCropFilter);
      if (tagFilter) qs.set('tagIds', tagFilter);
      const blob = await apiClient.getBlob(`/customers/export/excel?${qs.toString()}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const prefix = listTab === 'managed' ? 'lead-don-vi' : 'kho-so-tha-noi';
      a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg =
        e instanceof ApiHttpError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Lỗi khi xuất Excel';
      alert(msg);
    }
    setExportingExcel(false);
  };

  const handleClaimCustomer = async () => {
    if (!canClaimFloating) {
      alert('Bạn không có quyền nhận khách từ kho thả nổi (CLAIM_FLOATING_POOL / MANAGE_DATA_POOL).');
      return;
    }
    const countStr = prompt('Số lượng khách muốn nhận:', '1');
    if (!countStr) return;
    const count = parseInt(countStr, 10);
    if (!count || count <= 0) return;
    setClaiming(true);
    try {
      const res = await apiClient.post('/data-pool/claim-customer', { count });
      alert(res.message || `Đã nhận ${count} khách`);
      loadData();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi nhận khách');
    }
    setClaiming(false);
  };

  const handleDistribute = async () => {
    if (!distributeTargetId || selectedIds.length === 0) return;
    setDistributing(true);
    try {
      const res = await apiClient.post('/data-pool/distribute', {
        leadIds: selectedIds,
        targetEmployeeId: distributeTargetType === 'EMPLOYEE' ? distributeTargetId : undefined,
        targetDepartmentId: distributeTargetType === 'UNIT' ? distributeTargetId : undefined,
      });
      alert(res.message || 'Đã phân chia');
      setSelectedIds([]);
      setDistributeOpen(false);
      loadData();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi phân chia');
    }
    setDistributing(false);
  };

  const handleRecallManaged = async () => {
    if (!canRecallManagedUnit || selectedIds.length === 0) return;
    if (!window.confirm(`Thu hồi ${selectedIds.length} lead về kho để phân lại trong phạm vi đơn vị?`)) return;
    try {
      await apiClient.post('/data-pool/recall', {
        leadIds: selectedIds,
        reason: 'Thu hồi theo đơn vị quản lý',
      });
      alert('Đã thu hồi');
      setSelectedIds([]);
      loadData();
      loadStats();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi thu hồi');
    }
  };

  const openDistributeModal = () => {
    loadDistributeOptions();
    setDistributeTargetType('EMPLOYEE');
    setDistributeTargetId('');
    setDistributeOpen(true);
  };

  const viewCustomerDetail = async (customerId: string) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.get(`/customers/${customerId}`);
      setDetailCustomer(res);
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) setSelectedIds([]);
    else setSelectedIds(items.map(i => i.id));
  };

  const filteredEmployees = employeeSearch
    ? employeeOptions.filter(e =>
        e.fullName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        e.code.toLowerCase().includes(employeeSearch.toLowerCase())
      )
    : employeeOptions;

  const showRowCheckboxes =
    (listTab === 'floating' && canDistributeFloating) ||
    (listTab === 'managed' && canRecallManagedUnit);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Database className="w-6 h-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900">Kho số &amp; phân bổ</h1>
          <p className="text-sm text-gray-500">
            {listTab === 'floating'
              ? 'Kho thả nổi: lead trả về theo tham số vận hành (pool_push_processing_statuses). Kho Sales chưa phân xem tại trang Kinh doanh.'
              : 'Lead trong đơn vị: đang gán (ASSIGNED) cho nhân viên thuộc phạm vi bạn quản lý — thu hồi và phân lại theo quyền.'}
          </p>
          {viewScopeDescription && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
              {viewScopeDescription}
            </p>
          )}
        </div>
      </div>

      {showFloatingTab && showManagedTab && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setListTab('floating')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              listTab === 'floating'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Kho thả nổi
          </button>
          <button
            type="button"
            onClick={() => setListTab('managed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              listTab === 'managed'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Lead trong đơn vị
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {listTab === 'floating' ? (
          <>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">Số đang chờ (thả nổi)</p>
              <p className="text-2xl font-bold text-amber-600">{totalAvailableFloating}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">Mới hôm nay (vào pool)</p>
              <p className="text-2xl font-bold text-green-600">{todayAdded}</p>
            </div>
            <div className="bg-white rounded-lg border p-4 md:col-span-1 col-span-2">
              <p className="text-sm text-gray-500">Gợi ý</p>
              <p className="text-sm text-gray-700">Nhân sự Sales/CSKH đều có thể vào nhận khách từ kho này.</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">Lead đang gán (đơn vị)</p>
              <p className="text-2xl font-bold text-blue-600">{totalAssignedTeam}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">Gán mới hôm nay</p>
              <p className="text-2xl font-bold text-green-600">{todayAssignedTeam}</p>
            </div>
            <div className="bg-white rounded-lg border p-4 md:col-span-1 col-span-2">
              <p className="text-sm text-gray-500">Gợi ý</p>
              <p className="text-sm text-gray-700">
                Chọn lead và dùng Thu hồi về kho khi có quyền RECALL_MANAGED_UNIT_LEADS (hoặc quản trị).
              </p>
            </div>
          </>
        )}
      </div>

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
          <ToolbarButton variant="secondary" onClick={() => { loadData(); loadStats(); }}>
            <RefreshCcw className="w-4 h-4" /> Làm mới
          </ToolbarButton>
          <ToolbarButton
            variant="secondary"
            onClick={handleExportExcel}
            disabled={exportingExcel}
            title="Xuất danh sách khách (theo bộ lọc tìm kiếm) ra Excel — cần quyền xem khách hoặc kho số."
          >
            <Download className="w-4 h-4" /> {exportingExcel ? 'Đang xuất...' : 'Xuất Excel'}
          </ToolbarButton>
          {listTab === 'floating' && canClaimFloating && (
            <ToolbarButton variant="primary" onClick={handleClaimCustomer} disabled={claiming}>
              <UserPlus className="w-4 h-4" /> {claiming ? 'Đang nhận...' : 'Nhận khách'}
            </ToolbarButton>
          )}
          {listTab === 'floating' && canDistributeFloating && selectedIds.length > 0 && (
            <ToolbarButton variant="primary" onClick={openDistributeModal}>
              <Send className="w-4 h-4" /> Phân chia ({selectedIds.length})
            </ToolbarButton>
          )}
          {listTab === 'managed' && canRecallManagedUnit && selectedIds.length > 0 && (
            <ToolbarButton variant="primary" onClick={handleRecallManaged}>
              <RefreshCcw className="w-4 h-4" /> Thu hồi về kho ({selectedIds.length})
            </ToolbarButton>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={processingStatusFilter}
            disabled={processingStatusCatalogLoading}
            onChange={e => { setProcessingStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="all">Tất cả trạng thái xử lý</option>
            {processingStatusOptions.map(o => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
          >
            <option value="all">Tất cả nền tảng</option>
            <option value="MARKETING">Marketing</option>
            <option value="RECALL">Thu hồi</option>
            <option value="IMPORT">Nhập</option>
            <option value="RETURN">Hoàn trả</option>
            <option value="MANUAL">Thủ công</option>
          </select>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={provinceFilter}
            onChange={e => { setProvinceFilter(e.target.value); setPage(1); }}
          >
            <option value="all">Tất cả tỉnh/TP</option>
            {provinceOptions.map(p => (
              <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>
            ))}
          </select>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={mainCropFilter}
            onChange={e => { setMainCropFilter(e.target.value); setPage(1); }}
          >
            <option value="all">Tất cả nhóm cây</option>
            {CROP_DEFS.map(c => (
              <option key={c.value} value={c.value}>{c.value}</option>
            ))}
          </select>
          <select
            className="border rounded-lg px-3 py-2 text-sm min-w-[140px]"
            value={tagFilter}
            onChange={e => { setTagFilter(e.target.value); setPage(1); }}
          >
            <option value="">Tất cả thẻ</option>
            {tagOptions.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-gray-500">Đang tải...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Không có dữ liệu</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {showRowCheckboxes && (
                  <th className="px-3 py-3 text-left w-10">
                    <input type="checkbox" checked={selectedIds.length === items.length && items.length > 0} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="px-3 py-3 text-left">Khách hàng</th>
                <th className="px-3 py-3 text-left">Liên hệ</th>
                <th className="px-3 py-3 text-left min-w-[160px]">Thẻ khách hàng</th>
                {listTab === 'managed' && (
                  <th className="px-3 py-3 text-left">NV được gán</th>
                )}
                <th className="px-3 py-3 text-left">Nền tảng</th>
                <th className="px-3 py-3 text-left">Trạng thái xử lý</th>
                <th className="px-3 py-3 text-left">Vòng quay</th>
                <th className="px-3 py-3 text-left">Ngày vào kho</th>
                <th className="px-3 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  {showRowCheckboxes && (
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">{item.customer.name}</div>
                    <div className="text-xs text-gray-400">{item.customer.code}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 text-gray-700">
                      <Phone className="w-3 h-3" /> {item.customer.phone}
                    </div>
                    {item.customer.email && (
                      <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5">
                        <Mail className="w-3 h-3" /> {item.customer.email}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <CustomerTagsQuickCell
                      customerId={item.customer.id}
                      assignments={(item.customer.tags || []).map((t) => ({
                        tag: {
                          id: t.tag.id,
                          name: t.tag.name,
                          color: t.tag.color,
                          bgColor: t.tag.bgColor ?? null,
                        },
                      }))}
                      allTags={tagCatalog}
                      canEdit={canManageCustomerTags}
                      onUpdated={() => { loadData(); loadStats(); }}
                      tagRefreshSignal={0}
                    />
                  </td>
                  {listTab === 'managed' && (
                    <td className="px-3 py-3 text-gray-700">
                      {item.assignedTo ? (
                        <span className="font-medium">{item.assignedTo.fullName}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 text-gray-600">
                    {item.customer.campaign?.name || item.customer.leadSource?.name || item.source}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                      {statusLabel(item.processingStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{item.roundCount}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {formatDate(item.enteredAt)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      className="text-primary hover:underline text-xs"
                      onClick={() => viewCustomerDetail(item.customer.id)}
                    >
                      <Eye className="w-4 h-4 inline" /> Xem
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4">
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          limit={pageSize}
          onPageChange={setPage}
          onLimitChange={v => { setPageSize(normalizePageSize(v)); setPage(1); }}
        />
      </div>

      {distributeOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Phân chia {selectedIds.length} khách</h3>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phân cho</label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${distributeTargetType === 'EMPLOYEE' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700'}`}
                  onClick={() => { setDistributeTargetType('EMPLOYEE'); setDistributeTargetId(''); }}
                >
                  Nhân viên cụ thể
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${distributeTargetType === 'UNIT' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700'}`}
                  onClick={() => { setDistributeTargetType('UNIT'); setDistributeTargetId(''); }}
                >
                  Đơn vị chức năng
                </button>
              </div>

              {distributeTargetType === 'EMPLOYEE' ? (
                <div>
                  <input
                    type="text"
                    placeholder="Tìm nhân viên..."
                    className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                    value={employeeSearch}
                    onChange={e => setEmployeeSearch(e.target.value)}
                  />
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {filteredEmployees.slice(0, 50).map(emp => (
                      <div
                        key={emp.id}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${distributeTargetId === emp.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                        onClick={() => setDistributeTargetId(emp.id)}
                      >
                        {emp.fullName} <span className="text-gray-400">({emp.code})</span>
                      </div>
                    ))}
                    {filteredEmployees.length === 0 && <div className="px-3 py-4 text-gray-400 text-center text-sm">Không tìm thấy</div>}
                  </div>
                </div>
              ) : (
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={distributeTargetId}
                  onChange={e => setDistributeTargetId(e.target.value)}
                >
                  <option value="">-- Chọn đơn vị --</option>
                  {unitOptions.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.function || ''})</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm border rounded-lg" onClick={() => setDistributeOpen(false)}>Hủy</button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg disabled:opacity-50"
                onClick={handleDistribute}
                disabled={!distributeTargetId || distributing}
              >
                {distributing ? 'Đang phân...' : 'Xác nhận phân chia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailCustomer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Chi tiết khách hàng</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setDetailCustomer(null)}>✕</button>
            </div>
            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader className="w-6 h-6 animate-spin" /></div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-gray-500">Mã:</span> <span className="font-medium">{detailCustomer.code}</span></div>
                  <div><span className="text-gray-500">Tên:</span> <span className="font-medium">{detailCustomer.name}</span></div>
                  <div><span className="text-gray-500">SĐT:</span> {detailCustomer.phone}</div>
                  <div><span className="text-gray-500">Email:</span> {detailCustomer.email || '—'}</div>
                  <div className="col-span-2"><span className="text-gray-500">Địa chỉ:</span> {detailCustomer.address || '—'}</div>
                  {detailCustomer.province && (
                    <div><span className="text-gray-500">Tỉnh/TP:</span> {detailCustomer.province?.name ? administrativeTitleCase(detailCustomer.province.name) : '—'}</div>
                  )}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Thẻ:</span>{' '}
                  {detailCustomer.tags?.length > 0 ? (
                    <CustomerTagBadges
                      vibrant
                      tags={detailCustomer.tags?.map((t: any) => ({ tag: t.tag || t })) || []}
                    />
                  ) : (
                    <span className="text-gray-400 text-sm">Chưa có thẻ</span>
                  )}
                </div>
                {detailCustomer.note && (
                  <div><span className="text-gray-500">Ghi chú:</span> {detailCustomer.note}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataPool;
