import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../context/useAuthStore';
import { apiClient, ApiHttpError } from '../api/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Search, 
  UserPlus, 
  Edit, 
  Trash2,
  Eye,
  MessageSquare,
  Phone,
  Mail,
  Briefcase,
  Loader,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Upload,
  Download,
  CalendarDays,
  FileText,
  Settings2
} from 'lucide-react';
import clsx from 'clsx';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { resolveUploadUrl } from '../utils/assetsUrl';
import type { Employee, Subsidiary } from '../types';
import { translate } from '../utils/dictionary';
import { exportEmployeesToExcel } from '../utils/excel';
import { SearchableSelect } from '../components/SearchableSelect';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import { formatDate } from '../utils/format';
import { ToolbarButton } from '../components/ui/ToolbarButton';

const HRManager = () => {
  const { user: currentUser, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Use a ref to track if this is the initial load
  const isInitialLoad = React.useRef(true);
  
  // Capture filters immediately on mount from location state.
  // We use a ref so that this value is stable and won't change even if we clear history state later.
  const savedFiltersRef = React.useRef(location.state?.filters || {});
  const savedFilters = savedFiltersRef.current;

  // Clear history state on mount to ensure F5 reloads fresh
  useEffect(() => {
      if (location.state?.filters) {
          // Replace current history entry with one that has no state
          navigate(location.pathname, { replace: true, state: {} });
      }
  }, []); 

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [hrDepartmentUnits, setHrDepartmentUnits] = useState<{ id: string; name: string; code: string }[]>([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(savedFilters.page || 1);
  const [itemsPerPage, setItemsPerPage] = useState(savedFilters.limit || 25);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Tabs
  const [activeTab, setActiveTab] = useState<'general' | 'contracts'>('general');
  // Tab Quản lý hợp đồng
  const [contractList, setContractList] = useState<any[]>([]);
  const [contractListLoading, setContractListLoading] = useState(false);
  const [contractStatusFilter, setContractStatusFilter] = useState<string>('');
  const [contractExpiringSoon, setContractExpiringSoon] = useState(false);
  

  // Filters
  const [searchTerm, setSearchTerm] = useState(savedFilters.search || '');
  const [debouncedSearch, setDebouncedSearch] = useState(savedFilters.search || '');
  const [filterSubsidiary, setFilterSubsidiary] = useState<string>(savedFilters.subsidiary || '');
  const [filterHrDepartmentUnit, setFilterHrDepartmentUnit] = useState<string>(
    savedFilters.hrDepartmentUnit || ''
  );
  const [filterRoleGroup, setFilterRoleGroup] = useState<string>(savedFilters.roleGroup || '');
  const [filterEmployeeType, setFilterEmployeeType] = useState<string>(savedFilters.employeeType || '');
  
  // Role Groups for Filter
  const [roleGroups, setRoleGroups] = useState<{id: string, code: string, name: string}[]>([]);
  // Loại nhân viên (EmployeeType) cho filter và form
  const [employeeTypes, setEmployeeTypes] = useState<{id: string, code: string, name: string}[]>([]);

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Notification
  const [notification, setNotification] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({
    show: false, message: '', type: 'success'
  });

  // Sinh nhật tháng
  const [birthdayCount, setBirthdayCount] = useState(0);
  const [birthdayList, setBirthdayList] = useState<
    Array<{
      id: string;
      fullName: string;
      dateOfBirth: string;
      hrDepartmentUnit?: { name: string } | null;
      code?: string;
      avatarUrl?: string;
    }>
  >([]);
  const [birthdayModalOpen, setBirthdayModalOpen] = useState(false);

  const [organizations, setOrganizations] = useState<{ id: string; code: string; name: string }[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(
    savedFilters.organization || ''
  );

  const getFilterState = () => ({
    page: currentPage,
    limit: itemsPerPage,
    search: searchTerm,
    organization: selectedOrganizationId,
    subsidiary: filterSubsidiary,
    hrDepartmentUnit: filterHrDepartmentUnit,
    roleGroup: filterRoleGroup,
    employeeType: filterEmployeeType,
    scrollPosition: window.scrollY,
    searchFocused: document.activeElement === searchInputRef.current
  });

  const handleMessage = (empId: string) => {
    navigate(`/chat?userId=${empId}`, {
      state: {
        from: '/hr',
        filters: getFilterState()
      }
    });
  };

  const handleView = (empId: string) => {
    navigate(`/hr/${empId}/view`, {
      state: {
        from: '/hr',
        filters: getFilterState()
      }
    });
  };

  const handleEdit = (empId: string) => {
    navigate(`/hr/${empId}/edit`, {
      state: {
        from: '/hr',
        filters: getFilterState()
      }
    });
  };

  const handleCreate = () => {
    navigate('/hr/create', {
      state: {
        from: '/hr',
        filters: getFilterState()
      }
    });
  };

  const renderAvatar = (emp: Employee, size = 10) => {
     const avatarUrl = emp.avatarUrl || emp.avatar;
     if (avatarUrl) {
       const finalUrl = resolveUploadUrl(avatarUrl);
 
       return (
         <img 
           src={finalUrl} 
           alt={emp.fullName} 
           className={`w-${size} h-${size} rounded-full object-cover border border-gray-100`}
           onError={(e) => {
             (e.target as HTMLImageElement).src = getUiAvatarFallbackUrl(emp.fullName);
           }}
         />
       );
     }
     return (
       <div className={`w-${size} h-${size} rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm`}>
         {emp.fullName.charAt(0)}
       </div>
     );
   };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(prev => {
        if (prev !== searchTerm) {
          setCurrentPage(1);
          return searchTerm;
        }
        return prev;
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchRoleGroups();
    fetchEmployeeTypes();
    (async () => {
      try {
        const res: any = await apiClient.get('/hr/organizations');
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setOrganizations(list);
        setSelectedOrganizationId((prev) => {
          const candidates = [prev, savedFilters.organization as string | undefined].filter(
            (x): x is string => Boolean(x)
          );
          for (const id of candidates) {
            if (list.some((o: { id: string }) => o.id === id)) return id;
          }
          const kagri = list.find(
            (o: { code?: string }) => String(o.code || '').toUpperCase() === 'KAGRI'
          );
          return kagri?.id || list[0]?.id || '';
        });
      } catch (e) {
        console.error('Error loading organizations:', e);
        setOrganizations([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedOrganizationId) return;
    fetchMasterData();
  }, [selectedOrganizationId]);

  const fetchBirthdaysInMonth = async () => {
    try {
      const res: any = await apiClient.get('/hr/employees/birthdays-in-month');
      setBirthdayCount(res?.count ?? 0);
      setBirthdayList(res?.data ?? []);
    } catch {
      setBirthdayCount(0);
      setBirthdayList([]);
    }
  };

  useEffect(() => {
    if (activeTab !== 'contracts') fetchBirthdaysInMonth();
  }, [activeTab]);

  const fetchRoleGroups = async () => {
    try {
      const res: any = await apiClient.get('/hr/role-groups');
      if (Array.isArray(res)) {
        setRoleGroups(res);
      } else if (res.data) {
        setRoleGroups(res.data);
      }
    } catch (error) {
      console.error('Error fetching role groups:', error);
    }
  };

  const fetchEmployeeTypes = async () => {
    try {
      const res: any = await apiClient.get('/hr/employee-types');
      if (Array.isArray(res)) {
        setEmployeeTypes(res);
      } else if (res.data) {
        setEmployeeTypes(res.data);
      }
    } catch (error) {
      console.error('Error fetching employee types:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'contracts') return;
    fetchEmployees();
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearch,
    filterSubsidiary,
    filterHrDepartmentUnit,
    filterRoleGroup,
    filterEmployeeType,
    selectedOrganizationId,
    activeTab,
  ]);

  const fetchContractList = async () => {
    setContractListLoading(true);
    try {
      const params = new URLSearchParams();
      if (contractStatusFilter) params.set('status', contractStatusFilter);
      if (contractExpiringSoon) params.set('expiringSoon', '1');
      const res: any = await apiClient.get(`/contracts?${params.toString()}`);
      setContractList(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error(e);
      setContractList([]);
    } finally {
      setContractListLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'contracts') fetchContractList();
  }, [activeTab, contractStatusFilter, contractExpiringSoon]);

  useEffect(() => {
      // Only run this once when loading finishes for the first time
      if (!loading && isInitialLoad.current) {
          if (savedFilters.scrollPosition) {
              window.scrollTo(0, savedFilters.scrollPosition);
          }
          if (savedFilters.searchFocused && searchInputRef.current) {
              searchInputRef.current.focus();
              // Move cursor to end if possible
              try {
                  const len = searchInputRef.current.value.length;
                  searchInputRef.current.setSelectionRange(len, len);
              } catch (e) {}
          }
          isInitialLoad.current = false;
      }
  }, [loading]);

  const fetchMasterData = async () => {
    if (!selectedOrganizationId) return;
    try {
      const [subRes, hrUnitsRes] = await Promise.all([
        apiClient.get('/hr/subsidiaries'),
        apiClient.get('/hr/hr-department-units'),
      ]);
      setSubsidiaries((subRes as any) || []);
      setHrDepartmentUnits(Array.isArray(hrUnitsRes) ? hrUnitsRes : (hrUnitsRes as any)?.data ?? []);
    } catch (error) {
      console.error('Error fetching master data:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', normalizePageSize(itemsPerPage).toString());
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (filterSubsidiary) params.append('subsidiaryId', filterSubsidiary);
      if (filterHrDepartmentUnit) params.append('hrDepartmentUnitId', filterHrDepartmentUnit);
      if (filterRoleGroup) params.append('roleGroupId', filterRoleGroup);
      if (filterEmployeeType) params.append('employeeTypeId', filterEmployeeType);
      if (selectedOrganizationId) params.append('organizationId', selectedOrganizationId);

      const res: any = await apiClient.get(`/hr/employees?${params.toString()}`);
      
      if (res && res.data) {
        setEmployees(res.data);
        setTotalItems(res.pagination?.total || 0);
        setTotalPages(res.pagination?.totalPages || 1);
      } else {
        setEmployees([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      showNotification('Lỗi tải danh sách nhân viên', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const showImportErrorsDetail = (errors: unknown) => {
    const list = Array.isArray(errors) ? errors.map((e) => String(e || '').trim()).filter(Boolean) : [];
    if (list.length === 0) return;
    const lines = list.slice(0, 80).map((e) => `• ${e}`).join('\n');
    const more = list.length > 80 ? `\n… và ${list.length - 80} lỗi khác.` : '';
    alert(`Chi tiết lỗi import (${list.length}):\n${lines}${more}`);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      showNotification('Đang import dữ liệu...', 'success');
      const res: any = await apiClient.postMultipart('/hr/employees/import', formData);

      const dupList: any[] = Array.isArray(res.duplicates) ? res.duplicates : [];
      if (dupList.length > 0) {
        const intro =
          'Thường do SĐT hoặc email cá nhân trong file trùng với nhân viên đã có. Mã NV (VD: NV0028) là mã trong hệ thống — không phải mã lấy từ file nếu bạn để trống cột Mã NV.';
        const lines = dupList
          .slice(0, 50)
          .map((d: any) => {
            const rowHint = d?.row != null ? `Dòng ${d.row}: ` : '';
            const who = `${d?.existing?.code || d.code || '—'} — ${d?.existing?.fullName || d.fullName || '—'} — ${d?.existing?.departmentUnit || d.departmentUnit || '—'}`;
            const contact = [d?.phone && `SĐT: ${d.phone}`, d?.emailPersonal && `Email: ${d.emailPersonal}`]
              .filter(Boolean)
              .join(' · ');
            const contactPart = contact ? ` (${contact})` : '';
            const reason = d?.reason ? ` — ${d.reason}` : '';
            return `• ${rowHint}${who}${contactPart}${reason}`;
          })
          .join('\n');
        const more = dupList.length > 50 ? `\n… và ${dupList.length - 50} bản ghi trùng khác.` : '';
        alert(`Trùng với nhân viên đã có (${dupList.length})\n\n${intro}\n\n${lines}${more}`);
      }

      if (res.success > 0) {
          showNotification(`Đã import thành công ${res.success} nhân viên.`, 'success');
          if (res.failed > 0) {
               showImportErrorsDetail(res.errors);
               console.log('Import errors:', res.errors);
          }
          fetchEmployees();
      } else {
           if (res.failed > 0) {
               showImportErrorsDetail(res.errors);
               console.log('Import errors:', res.errors);
           } else if (!dupList.length) {
               showNotification(res.message || 'Import thất bại', 'error');
           }
      }
    } catch (error: any) {
      console.error('Import error:', error);
      if (error instanceof ApiHttpError) {
        const payload: any = (error as any).payload;
        showImportErrorsDetail(payload?.errors);
      }
      showNotification(error.message || 'Lỗi khi import file', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.getBlob('/hr/employees/import-template');
      if (!blob) {
        throw new Error('Không nhận được dữ liệu file mẫu');
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Employee_Import_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download template error:', error);
      showNotification(error.message || 'Lỗi khi tải file mẫu', 'error');
    }
  };

  const canDelete = hasPermission('FULL_ACCESS');

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      showNotification('Bạn không có quyền xóa nhân viên', 'error');
      return;
    }
    if (!window.confirm('Bạn có chắc chắn muốn xóa nhân viên này?')) return;
    try {
      await apiClient.delete(`/hr/employees/${id}`);
      showNotification('Xóa nhân viên thành công');
      fetchEmployees();
    } catch (error: any) {
      showNotification(error?.message || 'Lỗi khi xóa nhân viên', 'error');
    }
  };

  const handleExport = async () => {
    try {
        showNotification('Đang chuẩn bị file xuất...', 'success');
        
        // Fetch all data matching current filters
        const params = new URLSearchParams();
        params.append('limit', '10000'); 
        if (debouncedSearch) params.append('search', debouncedSearch);
        if (filterSubsidiary) params.append('subsidiaryId', filterSubsidiary);
        if (filterHrDepartmentUnit) params.append('hrDepartmentUnitId', filterHrDepartmentUnit);
        if (filterRoleGroup) params.append('roleGroupId', filterRoleGroup);
        if (filterEmployeeType) params.append('employeeTypeId', filterEmployeeType);
        if (selectedOrganizationId) params.append('organizationId', selectedOrganizationId);

        const res: any = await apiClient.get(`/hr/employees?${params.toString()}`);
        
        if (res.data && res.data.length > 0) {
            await exportEmployeesToExcel(res.data);
            showNotification('Xuất file Excel thành công');
        } else {
            showNotification('Không có dữ liệu để xuất', 'error');
        }
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Lỗi khi xuất file Excel', 'error');
    }
  };

  const canEdit = hasPermission('MANAGE_HR') || hasPermission('FULL_ACCESS');
  const canOpenCatalogs =
    canEdit ||
    hasPermission('VIEW_HR') ||
    hasPermission('VIEW_EMPLOYEE_TYPE_CATALOG') ||
    hasPermission('MANAGE_EMPLOYEE_TYPE_CATALOG');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Quản lý nhân sự</h2>
            <p className="text-gray-500 text-sm flex items-center gap-2 flex-wrap">
              <span>Tổng số: {totalItems} nhân viên</span>
              {activeTab !== 'contracts' && (
                <button
                  onClick={() => { setBirthdayModalOpen(true); fetchBirthdaysInMonth(); }}
                  className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 hover:underline font-medium"
                >
                  <CalendarDays size={14} />
                  Sinh nhật tháng này: {birthdayCount}
                </button>
              )}
            </p>
          </div>

          {/* Tabs */}
          <div className="bg-gray-100 p-1 rounded-lg flex gap-1 self-start lg:self-center flex-wrap">
             <button
               onClick={() => { setActiveTab('general'); setCurrentPage(1); }}
               className={clsx(
                 "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                 activeTab === 'general' ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900"
               )}
             >
               Quản lý chung
             </button>
             <button
               onClick={() => setActiveTab('contracts')}
               className={clsx(
                 "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                 activeTab === 'contracts' ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900"
               )}
             >
               Quản lý hợp đồng
             </button>
          </div>

          <div className="flex gap-2 w-full lg:w-auto flex-wrap">
            {activeTab === 'general' && (
              <>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept=".xlsx, .xls"
                />
                <ToolbarButton variant="primary" onClick={handleCreate} className="flex-1 sm:flex-none">
                    <UserPlus size={18} /> <span className="whitespace-nowrap">Thêm nhân viên</span>
                </ToolbarButton>
                <ToolbarButton
                    variant="secondary"
                    onClick={handleImportClick}
                    className="flex-1 sm:flex-none"
                    title="Nhập Excel"
                >
                    <Upload size={18} />
                    <span className="hidden sm:inline">Nhập Excel</span>
                </ToolbarButton>
                <ToolbarButton
                    variant="secondary"
                    onClick={handleDownloadTemplate}
                    className="flex-1 sm:flex-none"
                    title="Tải file mẫu nhân viên"
                >
                    <Download size={18} />
                    <span className="hidden sm:inline">Tải mẫu</span>
                </ToolbarButton>
                <ToolbarButton
                    variant="secondary"
                    onClick={handleExport}
                    className="flex-1 sm:flex-none"
                    title="Xuất Excel"
                >
                    <FileSpreadsheet size={18} />
                    <span className="hidden sm:inline">Xuất Excel</span>
                </ToolbarButton>
                <ToolbarButton variant="secondary" onClick={() => navigate('/hr/leave-requests')} className="flex-1 sm:flex-none">
                    <CalendarDays size={18} /> <span className="whitespace-nowrap">Nghỉ phép</span>
                </ToolbarButton>
                {canOpenCatalogs && (
                  <ToolbarButton
                    variant="secondary"
                    onClick={() => navigate('/hr/catalogs')}
                    className="flex-1 sm:flex-none"
                    title="Danh mục: công ty con, bộ phận, loại nhân viên"
                  >
                    <Settings2 size={18} />
                    <span className="hidden sm:inline whitespace-nowrap">Danh mục</span>
                  </ToolbarButton>
                )}
              </>
            )}

          </div>
        </div>
      </div>

      {/* Tab: Quản lý hợp đồng */}
      {activeTab === 'contracts' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm text-gray-600">Trạng thái hiệu lực:</label>
            <select
              value={contractStatusFilter}
              onChange={(e) => setContractStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 min-w-[180px]"
            >
              <option value="">Tất cả</option>
              <option value="effective">Còn hiệu lực</option>
              <option value="expired">Đã hết hạn</option>
              <option value="not_yet_effective">Chưa hiệu lực</option>
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={contractExpiringSoon}
                onChange={(e) => setContractExpiringSoon(e.target.checked)}
                className="rounded border-gray-300 text-primary"
              />
              <span className="text-sm text-gray-700">Hợp đồng sắp hết hạn</span>
            </label>
          </div>
          {contractListLoading ? (
            <div className="flex justify-center p-12"><Loader className="animate-spin text-primary" size={40} /></div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Nhân viên</th>
                    <th className="px-4 py-3">File hợp đồng</th>
                    <th className="px-4 py-3">Ngày hiệu lực</th>
                    <th className="px-4 py-3">Ngày hết hạn</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contractList.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Chưa có hợp đồng nào.</td></tr>
                  ) : (
                    contractList.map((c: any) => {
                      const today = new Date(); today.setHours(0,0,0,0);
                      const s = c.startDate ? new Date(c.startDate) : null;
                      const e = c.endDate ? new Date(c.endDate) : null;
                      if (s) s.setHours(0,0,0,0);
                      if (e) e.setHours(0,0,0,0);
                      let statusLabel = 'Chưa xác định';
                      let statusColor = 'bg-gray-100 text-gray-600';
                      if (e && e < today) { statusLabel = 'Hết hạn'; statusColor = 'bg-red-100 text-red-700'; }
                      else if (s && s > today) { statusLabel = 'Chưa hiệu lực'; statusColor = 'bg-yellow-100 text-yellow-700'; }
                      else if (s && s <= today && (!e || e >= today)) { statusLabel = 'Còn hiệu lực'; statusColor = 'bg-green-100 text-green-700'; }
                      return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{c.employee?.fullName || '-'}</span>
                          {c.employee?.code && <span className="text-xs text-gray-500 ml-1">({c.employee.code})</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{c.fileName || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{s ? formatDate(s) : '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{e ? formatDate(e) : '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{statusLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => navigate(`/hr/${c.employeeId}/edit`, { state: { from: '/hr', scrollTo: 'contracts' } })}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg"
                            title="Chỉnh sửa nhân sự"
                          >
                            <Edit size={18} />
                          </button>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filters + Table (tab chung / sales) */}
      {activeTab !== 'contracts' && (
      <>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col md:flex-row flex-wrap gap-4">
          {organizations.length > 1 && (
            <select
              value={selectedOrganizationId}
              onChange={(e) => {
                setSelectedOrganizationId(e.target.value);
                setCurrentPage(1);
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 min-w-[200px] w-full md:w-auto"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} {o.code ? `(${o.code})` : ''}
                </option>
              ))}
            </select>
          )}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Tìm theo tên, mã NV, SĐT, Email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          
          <select
            value={filterSubsidiary}
            onChange={(e) => {
              setFilterSubsidiary(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 min-w-[180px] w-full md:w-auto"
          >
            <option value="">-- Công ty con --</option>
            {subsidiaries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={filterHrDepartmentUnit}
            onChange={(e) => {
              setFilterHrDepartmentUnit(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 min-w-[160px] w-full md:w-auto"
          >
            <option value="">-- Bộ phận --</option>
            {hrDepartmentUnits
              .slice()
              .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>

          <select 
            value={filterRoleGroup} 
            onChange={(e) => {
              setFilterRoleGroup(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 min-w-[180px] w-full md:w-auto"
          >
            <option value="">-- Nhóm quyền --</option>
            {roleGroups
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(rg => <option key={rg.id} value={rg.id}>{translate(rg.name)}</option>)}
          </select>

          <select 
            value={filterEmployeeType} 
            onChange={(e) => {
              setFilterEmployeeType(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 min-w-[160px] w-full md:w-auto"
          >
            <option value="">-- Loại nhân viên --</option>
            {employeeTypes.map(et => <option key={et.id} value={et.id}>{et.name}</option>)}
          </select>

        </div>
      </div>

      {/* Table & Cards */}
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader className="animate-spin text-primary" size={40} />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-600 text-sm uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Nhân viên</th>
                  <th className="px-4 py-3">Chức danh</th>
                  <th className="px-4 py-3">Bộ phận</th>
                  <th className="px-4 py-3">Công ty con</th>
                  <th className="px-4 py-3">Loại NV</th>
                  <th className="px-4 py-3">Liên hệ</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.length > 0 ? employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {renderAvatar(emp)}
                        <div>
                          <div className="font-medium text-gray-900">{emp.fullName}</div>
                          <div className="text-xs text-gray-500 font-mono">{emp.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800 flex items-center gap-1">
                        <Briefcase size={14} className="text-gray-400 shrink-0" />{' '}
                        {emp.hrJobTitle || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {emp.hrDepartmentUnit?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {Array.isArray(emp.subsidiaries) && emp.subsidiaries.length > 0
                          ? emp.subsidiaries.map((s: Subsidiary) => s.name).join(', ')
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{(emp as any).employeeType?.name || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 text-sm">
                        {emp.phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone size={14} /> {emp.phone}
                          </div>
                        )}
                        {emp.emailCompany && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Mail size={14} /> {emp.emailCompany}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const statusObj = typeof emp.status === 'object' ? emp.status : null;
                        const statusCode = statusObj ? statusObj.code : String(emp.status);
                        const statusName = statusObj ? statusObj.name : String(emp.status);
                        
                        return (
                          <span className={clsx(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            statusCode === 'WORKING' || statusCode === 'working' ? "bg-success/10 text-success" : 
                            statusCode === 'RESIGNED' || statusCode === 'resigned' ? "bg-red-100 text-red-700" : 
                            "bg-gray-100 text-gray-700"
                          )}>
                            {translate(statusName)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {emp.id !== currentUser?.id && (
                          <button
                            onClick={() => handleMessage(emp.id)}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg"
                            title="Nhắn tin"
                          >
                            <MessageSquare size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => handleView(emp.id)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          title="Xem chi tiết"
                        >
                          <Eye size={18} />
                        </button>
                        {activeTab === 'general' && canDelete && (
                          <button
                            onClick={() => handleDelete(emp.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            title="Xóa nhân viên"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-500">
                      Không tìm thấy nhân viên nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden flex flex-col divide-y divide-gray-100">
            {employees.length > 0 ? employees.map((emp) => (
              <div key={emp.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        {renderAvatar(emp)}
                        <div>
                          <div className="font-medium text-gray-900">{emp.fullName}</div>
                          <div className="text-xs text-gray-500 font-mono">{emp.code}</div>
                        </div>
                    </div>
                    {(() => {
                        const statusObj = typeof emp.status === 'object' ? emp.status : null;
                        const statusCode = statusObj ? statusObj.code : String(emp.status);
                        const statusName = statusObj ? statusObj.name : String(emp.status);
                        
                        return (
                          <span className={clsx(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            statusCode === 'WORKING' || statusCode === 'working' ? "bg-success/10 text-success" : 
                            statusCode === 'RESIGNED' || statusCode === 'resigned' ? "bg-red-100 text-red-700" : 
                            "bg-gray-100 text-gray-700"
                          )}>
                            {translate(statusName)}
                          </span>
                        );
                    })()}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                        <span className="text-gray-500 text-xs block">Chức danh</span>
                        <span className="font-medium text-gray-800">{emp.hrJobTitle || '-'}</span>
                    </div>
                    <div>
                        <span className="text-gray-500 text-xs block">Bộ phận</span>
                        <span className="font-medium text-gray-800">{emp.hrDepartmentUnit?.name || '—'}</span>
                    </div>
                    <div className="col-span-2">
                        <span className="text-gray-500 text-xs block">Công ty con</span>
                        <span className="font-medium text-gray-800">
                          {Array.isArray(emp.subsidiaries) && emp.subsidiaries.length > 0
                            ? emp.subsidiaries.map((s: Subsidiary) => s.name).join(', ')
                            : '—'}
                        </span>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2 pt-2">
                  {emp.id !== currentUser?.id && (
                    <button
                      onClick={() => handleMessage(emp.id)}
                      className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                      title="Nhắn tin"
                    >
                      <MessageSquare size={20} />
                    </button>
                  )}
                  <button
                    onClick={() => handleView(emp.id)}
                    className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center justify-center gap-2"
                  >
                    <Eye size={16} /> Xem chi tiết
                  </button>
                  {emp.phone && (
                    <a href={`tel:${emp.phone}`} className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Phone size={18} />
                    </a>
                  )}
                  {canDelete && activeTab === 'general' && (
                    <button
                      onClick={() => handleDelete(emp.id)}
                      className="p-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center justify-center gap-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-gray-500">
                 Không tìm thấy nhân viên nào
              </div>
            )}
          </div>
          
          {/* Pagination */}
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <PaginationBar
              page={currentPage}
              limit={normalizePageSize(itemsPerPage)}
              total={totalItems}
              totalPages={totalPages || 1}
              onPageChange={setCurrentPage}
              onLimitChange={(l) => { setItemsPerPage(normalizePageSize(l)); setCurrentPage(1); }}
              itemLabel="nhân viên"
            />
          </div>
        </div>
      )}

      </>
      )}

      {/* Modal danh sách sinh nhật tháng */}
      {birthdayModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setBirthdayModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-amber-50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <CalendarDays size={20} className="text-amber-600" />
                Sinh nhật tháng này ({birthdayList.length})
              </h3>
              <button onClick={() => setBirthdayModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4">
              {birthdayList.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Không có nhân sự nào sinh nhật trong tháng này.</p>
              ) : (
                <ul className="space-y-3">
                  {birthdayList.map((emp) => {
                    const d = emp.dateOfBirth ? new Date(emp.dateOfBirth) : null;
                    const day = d ? d.getDate() : '';
                    const month = d ? d.getMonth() + 1 : '';
                    const dateStr = day ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` : '';
                    return (
                      <li key={emp.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm shrink-0">
                          {emp.fullName?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <button onClick={() => { setBirthdayModalOpen(false); handleView(emp.id); }} className="font-medium text-gray-900 hover:text-primary truncate block text-left w-full">
                            {emp.fullName}
                          </button>
                          <p className="text-xs text-gray-500">{emp.hrDepartmentUnit?.name || emp.code || ''}</p>
                        </div>
                        <span className="text-sm font-medium text-amber-600 shrink-0">{dateStr}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification.show && (
        <div className={clsx(
            "fixed top-5 right-5 z-[100] bg-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in border-l-4 min-w-[300px]",
            notification.type === 'success' ? "border-success" : "border-red-500"
        )}>
            {notification.type === 'success' ? <Check className="text-success" /> : <X className="text-red-500" />}
            <div>
                <h4 className="font-bold text-sm">{notification.type === 'success' ? 'Thành công' : 'Lỗi'}</h4>
                <p className="text-gray-500 text-sm">{notification.message}</p>
            </div>
        </div>
      )}
      
    </div>
  );
};

export default HRManager;
