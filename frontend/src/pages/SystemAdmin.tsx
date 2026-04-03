import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import type { Employee } from '../types';
import RoleGroupManager from '../components/RoleGroupManager';
import {
  FileText,
  KeyRound,
  Users,
  Shield,
  Search,
  Lock,
  Unlock,
  LogOut,
  Loader2,
  ShieldAlert,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Eye,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { formatDateTime, formatDateTimeSeconds } from '../utils/format';
import PaginationBar from '../components/PaginationBar';
import SetTempPasswordModal from '../components/SetTempPasswordModal';
import { normalizePageSize } from '../constants/pagination';
import { isTechnicalAdminRole } from '../constants/rbac';

type TabId = 'logs' | 'role-groups' | 'staff';

interface SystemLog {
  id: string;
  timestamp: string;
  userName: string;
  userPhone?: string;
  action: string;
  object: string;
  details?: string;
  result: string;
}

const SystemAdmin = () => {
  const { user, hasPermission } = useAuthStore();
  const isADM = isTechnicalAdminRole(user?.roleGroup?.code);
  const canRoleGroups =
    isADM ||
    hasPermission('VIEW_ROLE_GROUPS') ||
    hasPermission('MANAGE_ROLE_GROUPS') ||
    hasPermission('EDIT_SETTINGS');
  /** Tab nhật ký: VIEW_LOGS là chính */
  const canLogs =
    isADM || hasPermission('VIEW_LOGS') || hasPermission('MANAGE_SYSTEM');
  /** Tab tài khoản nhân sự: MANAGE_EMPLOYEE_ACCOUNTS là chính */
  const canStaff =
    isADM ||
    hasPermission('MANAGE_EMPLOYEE_ACCOUNTS') ||
    hasPermission('STAFF_LOCK') ||
    hasPermission('STAFF_LOGOUT') ||
    hasPermission('STAFF_TEMP_PASSWORD') ||
    hasPermission('STAFF_INSPECT') ||
    hasPermission('MANAGE_SYSTEM');

  const TABS: { id: TabId; label: string; icon: LucideIcon }[] = useMemo(() => {
    const t: { id: TabId; label: string; icon: LucideIcon }[] = [];
    if (canLogs) t.push({ id: 'logs', label: 'Nhật ký hệ thống', icon: FileText });
    if (canRoleGroups) t.push({ id: 'role-groups', label: 'Nhóm quyền', icon: Shield });
    if (canStaff) t.push({ id: 'staff', label: 'Tài khoản nhân sự', icon: Users });
    return t;
  }, [canLogs, canRoleGroups, canStaff]);

  const [activeTab, setActiveTab] = useState<TabId>('role-groups');

  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logPagination, setLogPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [logMeta, setLogMeta] = useState<{
    uniqueUsers: string[];
    uniqueActions: string[];
  }>({ uniqueUsers: [], uniqueActions: [] });
  const [logFilters, setLogFilters] = useState({
    search: '',
    action: 'All',
    userName: 'All',
    startDate: '',
    endDate: '',
  });
  const [logPage, setLogPage] = useState(1);
  const [logLimit, setLogLimit] = useState(25);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  const [staffSearch, setStaffSearch] = useState('');
  const [staffList, setStaffList] = useState<Employee[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffActionId, setStaffActionId] = useState<string | null>(null);
  const [staffMessage, setStaffMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tempPwdEmployee, setTempPwdEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (TABS.length === 0) return;
    if (!TABS.some((x) => x.id === activeTab)) {
      setActiveTab(TABS[0].id);
    }
  }, [TABS, activeTab]);

  useEffect(() => {
    if (!canLogs || activeTab !== 'logs') return;
    fetchLogs();
  }, [canLogs, activeTab, logPage, logLimit, logFilters]);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: logPage,
        limit: normalizePageSize(logLimit),
        ...(logFilters.search && { search: logFilters.search }),
        ...(logFilters.action !== 'All' && { action: logFilters.action }),
        ...(logFilters.userName !== 'All' && { userName: logFilters.userName }),
        ...(logFilters.startDate && { startDate: logFilters.startDate }),
        ...(logFilters.endDate && { endDate: logFilters.endDate }),
      };
      const q = new URLSearchParams(params as any).toString();
      const data = await apiClient.get(`/logs?${q}`);
      setLogs(data?.logs ?? []);
      setLogPagination(
        data?.pagination ?? {
          page: logPage,
          limit: logLimit,
          total: 0,
          totalPages: 1,
        }
      );
      setLogMeta({
        uniqueUsers: data?.uniqueUsers ?? [],
        uniqueActions: data?.uniqueActions ?? [],
      });
    } catch (e) {
      console.error('Fetch logs error:', e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!canStaff || activeTab !== 'staff') return;
    const q = staffSearch.trim();
    setStaffLoading(true);
    apiClient
      .get(`/hr/employees?search=${encodeURIComponent(q)}&limit=500`)
      .then((res: any) => {
        const list: Employee[] = res?.data ?? res?.data?.data ?? [];
        list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'vi'));
        setStaffList(list);
      })
      .catch(() => setStaffList([]))
      .finally(() => setStaffLoading(false));
  }, [canStaff, activeTab, staffSearch]);

  const handleLock = async (emp: Employee, lock: boolean) => {
    if (emp.id === user?.id) return;
    if (!window.confirm(lock ? `Tạm khóa "${emp.fullName}"?` : `Mở khóa "${emp.fullName}"?`)) return;
    setStaffActionId(emp.id);
    setStaffMessage(null);
    try {
      const res: any = await apiClient.post('/auth/admin/lock-employee', { employeeId: emp.id, lock });
      if (res?.success) {
        setStaffList((prev) => prev.map((e) => (e.id === emp.id ? { ...e, isLocked: lock } : e)));
        setStaffMessage({ type: 'success', text: res.message || 'Thành công.' });
      } else setStaffMessage({ type: 'error', text: res?.message || 'Thất bại.' });
    } catch (e: any) {
      setStaffMessage({ type: 'error', text: e?.message || 'Lỗi.' });
    } finally {
      setStaffActionId(null);
    }
  };

  const handleLogout = async (emp: Employee) => {
    if (emp.id === user?.id) return;
    if (!window.confirm(`Đăng xuất "${emp.fullName}"?`)) return;
    setStaffActionId(emp.id);
    setStaffMessage(null);
    try {
      const res: any = await apiClient.post('/auth/admin/logout-employee', { employeeId: emp.id });
      if (res?.success) setStaffMessage({ type: 'success', text: res.message || 'Đã đăng xuất.' });
      else setStaffMessage({ type: 'error', text: res?.message || 'Thất bại.' });
    } catch (e: any) {
      setStaffMessage({ type: 'error', text: e?.message || 'Lỗi.' });
    } finally {
      setStaffActionId(null);
    }
  };

  const handleStaffCheck = async (emp: Employee) => {
    if (emp.id === user?.id) return;
    if (
      !window.confirm(
        `Mở cửa sổ mới và đăng nhập bằng tài khoản "${emp.fullName}"?\n\nCửa sổ đó chỉ dùng phiên nhân sự (liên kết hết hạn sau ~15 phút, một lần dùng token); tab quản trị giữ nguyên phiên của bạn.`
      )
    ) {
      return;
    }
    setStaffMessage(null);
    setStaffActionId(emp.id);
    try {
      const res: any = await apiClient.post('/auth/admin/issue-staff-check-token', { employeeId: emp.id });
      if (!res?.success || !res?.token) {
        setStaffMessage({ type: 'error', text: res?.message || 'Không tạo được liên kết kiểm tra.' });
        return;
      }
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
      const loginPath = `${base}/login`.replace(/^\/+/, '/');
      const loginUrl = new URL(loginPath, window.location.origin);
      loginUrl.searchParams.set('staffCheck', res.token);
      const popupFeatures =
        'width=1280,height=800,left=80,top=40,scrollbars=yes,resizable=yes,menubar=no,toolbar=no';
      window.open(loginUrl.toString(), 'hcrm_staff_check', popupFeatures);
      setStaffMessage({
        type: 'success',
        text: 'Đã mở cửa sổ kiểm tra (phiên độc lập với tab quản trị). Nếu trình duyệt chặn pop-up, hãy cho phép cho trang này.',
      });
    } catch (e: any) {
      setStaffMessage({ type: 'error', text: e?.message || 'Lỗi kết nối.' });
    } finally {
      setStaffActionId(null);
    }
  };

  const normalizeResultText = (result: string) => {
    if (result === 'SUCCESS') return 'Thành công';
    if (result === 'FAILURE') return 'Thất bại';
    if (result === 'PARTIAL_SUCCESS') return 'Thành công một phần';
    return result;
  };

  const getVietnameseActionDescription = (log: SystemLog) => {
    const actor = log.userName || 'Người dùng';
    const action = String(log.action || '').toLowerCase();
    const objectName = log.object || 'đối tượng';

    if (action.includes('tạo') || action === 'create') {
      return `${actor} đã tạo mới ${objectName.toLowerCase()}.`;
    }
    if (action.includes('cập nhật') || action === 'update' || action.includes('patch')) {
      return `${actor} đã cập nhật ${objectName.toLowerCase()}.`;
    }
    if (action.includes('xóa') || action === 'delete') {
      return `${actor} đã xóa ${objectName.toLowerCase()}.`;
    }
    if (log.action === 'STAFF_CHECK_LOGIN') {
      return `${actor} đã mở phiên kiểm tra tài khoản nhân sự.${log.details ? ` ${log.details}` : ''}`;
    }
    if (action.includes('đăng nhập') || action === 'login') {
      return `${actor} đã đăng nhập vào hệ thống.`;
    }
    if (action.includes('đăng xuất') || action === 'logout') {
      return `${actor} đã đăng xuất khỏi hệ thống.`;
    }

    return `${actor} đã thực hiện hành động ${log.action} trên ${objectName}.`;
  };

  const canAccessSystemPage = isADM || canRoleGroups || canLogs || canStaff;
  if (!canAccessSystemPage) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div className="text-center bg-white p-8 rounded-xl shadow-sm border max-w-md">
          <ShieldAlert size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Truy cập bị từ chối</h2>
          <p className="text-gray-500">
            Cần ít nhất một quyền trong nhóm: Nhật ký (VIEW_LOGS), Nhóm quyền (VIEW/MANAGE_ROLE_GROUPS), hoặc Quản lý tài khoản (MANAGE_EMPLOYEE_ACCOUNTS).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        {isADM || canLogs || canStaff ? 'Quản trị hệ thống' : 'Phân quyền'}
      </h1>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'role-groups' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <RoleGroupManager />
        </div>
      )}

      {/* Tab: Nhật ký hệ thống */}
      {activeTab === 'logs' && canLogs && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={logFilters.search}
                onChange={(e) => setLogFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select
              value={logFilters.action}
              onChange={(e) => setLogFilters((f) => ({ ...f, action: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="All">Tất cả hành động</option>
              {logMeta.uniqueActions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={logFilters.userName}
              onChange={(e) => setLogFilters((f) => ({ ...f, userName: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="All">Tất cả người dùng</option>
              {logMeta.uniqueUsers.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <input
              type="date"
              value={logFilters.startDate}
              onChange={(e) => setLogFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="date"
              value={logFilters.endDate}
              onChange={(e) => setLogFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          {logsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Thời gian</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Người thực hiện</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Hành động</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Đối tượng</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Xem</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          <Clock size={14} className="inline mr-1" />
                          {formatDateTime(log.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{log.userName}</span>
                          {log.userPhone && <span className="text-gray-500 ml-1">({log.userPhone})</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
                            <Activity size={12} />{log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{log.object}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Eye size={12} />
                            Xem chi tiết
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              'flex items-center gap-1 text-sm',
                              log.result === 'SUCCESS' || log.result === 'Thành công' ? 'text-green-600' : 'text-red-600'
                            )}
                          >
                            {(log.result === 'SUCCESS' || log.result === 'Thành công') ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            {log.result === 'SUCCESS' ? 'Thành công' : log.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={logPage}
                limit={normalizePageSize(logLimit)}
                total={logPagination.total}
                totalPages={logPagination.totalPages || 1}
                onPageChange={setLogPage}
                onLimitChange={(l) => { setLogLimit(normalizePageSize(l)); setLogPage(1); }}
                itemLabel="bản ghi"
              />
            </>
          )}
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Chi tiết hành động</h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
                {getVietnameseActionDescription(selectedLog)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="font-medium text-gray-700">Người thực hiện:</span> {selectedLog.userName}</div>
                <div><span className="font-medium text-gray-700">Số điện thoại:</span> {selectedLog.userPhone || '—'}</div>
                <div><span className="font-medium text-gray-700">Thời gian:</span> {formatDateTimeSeconds(selectedLog.timestamp)}</div>
                <div><span className="font-medium text-gray-700">Kết quả:</span> {normalizeResultText(selectedLog.result)}</div>
                <div><span className="font-medium text-gray-700">Hành động:</span> {selectedLog.action}</div>
                <div><span className="font-medium text-gray-700">Đối tượng:</span> {selectedLog.object}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Nội dung chi tiết</div>
                <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words">
                  {selectedLog.details || 'Không có mô tả chi tiết.'}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tài khoản nhân sự */}
      {activeTab === 'staff' && canStaff && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Tìm tên, mã, SĐT..."
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {staffMessage && (
            <div className={clsx('text-sm px-3 py-2 rounded-lg', staffMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
              {staffMessage.text}
            </div>
          )}
          {staffLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Tên</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Mã</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staffList.map((emp) => {
                    const isSelf = emp.id === user?.id;
                    const busy = staffActionId === emp.id;
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{emp.fullName}</td>
                        <td className="px-4 py-3 text-gray-600">{emp.code}</td>
                        <td className="px-4 py-3">
                          {emp.isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs"><Lock size={12} />Khóa</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">Hoạt động</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isSelf ? (
                            <span className="text-gray-400 text-xs">(Tài khoản của bạn)</span>
                          ) : (
                            <div className="flex flex-wrap justify-end gap-2">
                              {(isADM || hasPermission('STAFF_TEMP_PASSWORD') || hasPermission('MANAGE_EMPLOYEE_ACCOUNTS')) && (
                                <button
                                  type="button"
                                  onClick={() => setTempPwdEmployee(emp)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50 text-xs"
                                >
                                  <KeyRound size={14} />
                                  Mật khẩu tạm
                                </button>
                              )}
                              {(isADM || hasPermission('STAFF_INSPECT') || hasPermission('MANAGE_EMPLOYEE_ACCOUNTS')) && (
                                <button
                                  type="button"
                                  onClick={() => handleStaffCheck(emp)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-blue-200 text-blue-800 hover:bg-blue-50 disabled:opacity-50 text-xs"
                                >
                                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                                  Kiểm tra
                                </button>
                              )}
                              {(isADM || hasPermission('STAFF_LOGOUT') || hasPermission('MANAGE_EMPLOYEE_ACCOUNTS')) && (
                                <button
                                  type="button"
                                  onClick={() => handleLogout(emp)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 text-xs"
                                >
                                  {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                                  Đăng xuất
                                </button>
                              )}
                              {(isADM || hasPermission('STAFF_LOCK') || hasPermission('MANAGE_EMPLOYEE_ACCOUNTS')) && (
                                <>
                                  {emp.isLocked ? (
                                    <button
                                      type="button"
                                      onClick={() => handleLock(emp, false)}
                                      disabled={busy}
                                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 text-xs"
                                    >
                                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
                                      Mở khóa
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleLock(emp, true)}
                                      disabled={busy}
                                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 text-xs"
                                    >
                                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                                      Tạm khóa
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <SetTempPasswordModal
        employee={tempPwdEmployee}
        open={!!tempPwdEmployee}
        onClose={() => setTempPwdEmployee(null)}
        onSuccess={(msg) => setStaffMessage({ type: 'success', text: msg })}
      />
    </div>
  );
};

export default SystemAdmin;
