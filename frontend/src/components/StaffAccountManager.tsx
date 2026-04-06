import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { Employee } from '../types';
import { useAuthStore } from '../context/useAuthStore';
import { isTechnicalAdminRole } from '../constants/rbac';
import { Lock, Unlock, LogOut, Loader2, Users, ShieldAlert, Search, KeyRound, ExternalLink } from 'lucide-react';
import SetTempPasswordModal from './SetTempPasswordModal';

const StaffAccountManager: React.FC = () => {
  const { user, hasPermission } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tempPwdEmployee, setTempPwdEmployee] = useState<Employee | null>(null);

  const canLogout =
    hasPermission('STAFF_LOGOUT') || isTechnicalAdminRole(user?.roleGroup?.code);
  const canLock =
    hasPermission('STAFF_LOCK') || isTechnicalAdminRole(user?.roleGroup?.code);
  const canSetTempPassword =
    hasPermission('MANAGE_HR') || isTechnicalAdminRole(user?.roleGroup?.code);

  const q = searchQuery.trim().toLowerCase();
  const filteredEmployees = q
    ? employees.filter(emp => {
        const name = (emp.fullName ?? '').toLowerCase();
        const code = (emp.code ?? '').toLowerCase();
        const phone = (emp.phone ?? '').toLowerCase();
        const roleName = (typeof emp.roleGroup === 'object' && emp.roleGroup && 'name' in emp.roleGroup
          ? (emp.roleGroup as { name?: string }).name ?? ''
          : String(emp.roleGroup ?? '')
        ).toLowerCase();
        return name.includes(q) || code.includes(q) || phone.includes(q) || roleName.includes(q);
      })
    : employees;

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true);
        const res: any = await apiClient.get('/hr/employees?limit=1000');
        const list: Employee[] = res?.data ?? res?.data?.data ?? [];
        list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'vi'));
        setEmployees(list);
      } catch (e) {
        console.error('Fetch employees error:', e);
        setMessage({ type: 'error', text: 'Không thể tải danh sách nhân sự.' });
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, []);

  const handleLogout = async (emp: Employee) => {
    if (!canLogout || emp.id === user?.id) return;
    if (!window.confirm(`Đăng xuất tài khoản "${emp.fullName}"? Phiên đăng nhập hiện tại của họ sẽ bị vô hiệu hóa.`)) return;
    setMessage(null);
    setActioningId(emp.id);
    try {
      const res: any = await apiClient.post('/auth/admin/logout-employee', { employeeId: emp.id });
      if (res?.success) {
        setMessage({ type: 'success', text: res.message || 'Đã đăng xuất tài khoản.' });
      } else {
        setMessage({ type: 'error', text: res?.message || 'Thao tác thất bại.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Lỗi kết nối.' });
    } finally {
      setActioningId(null);
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
    setMessage(null);
    setActioningId(emp.id);
    try {
      const res: any = await apiClient.post('/auth/admin/issue-staff-check-token', { employeeId: emp.id, targetId: emp.id });
      if (!res?.success || !res?.token) {
        setMessage({ type: 'error', text: res?.message || 'Không tạo được liên kết kiểm tra.' });
        return;
      }
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
      const loginPath = `${base}/login`.replace(/^\/+/, '/');
      const loginUrl = new URL(loginPath, window.location.origin);
      loginUrl.searchParams.set('staffCheck', res.token);
      const popupFeatures =
        'width=1280,height=800,left=80,top=40,scrollbars=yes,resizable=yes,menubar=no,toolbar=no';
      window.open(loginUrl.toString(), 'hcrm_staff_check', popupFeatures);
      setMessage({
        type: 'success',
        text: 'Đã mở cửa sổ kiểm tra (phiên độc lập với tab quản trị). Nếu trình duyệt chặn pop-up, hãy cho phép cho trang này.',
      });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Lỗi kết nối.' });
    } finally {
      setActioningId(null);
    }
  };

  const handleLock = async (emp: Employee, lock: boolean) => {
    if (!canLock || emp.id === user?.id) return;
    const action = lock ? 'tạm khóa' : 'mở khóa';
    if (!window.confirm(`${lock ? 'Tạm khóa' : 'Mở khóa'} tài khoản "${emp.fullName}"?`)) return;
    setMessage(null);
    setActioningId(emp.id);
    try {
      const res: any = await apiClient.post('/auth/admin/lock-employee', { employeeId: emp.id, lock });
      if (res?.success) {
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, isLocked: lock } : e));
        setMessage({ type: 'success', text: res.message || `Đã ${action} tài khoản.` });
      } else {
        setMessage({ type: 'error', text: res?.message || 'Thao tác thất bại.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Lỗi kết nối.' });
    } finally {
      setActioningId(null);
    }
  };

  if (!canLogout && !canLock && !canSetTempPassword) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
        <ShieldAlert className="text-amber-600 flex-shrink-0" size={24} />
        <p className="text-amber-800 text-sm">
          Bạn không có quyền STAFF_LOGOUT / STAFF_LOCK / MANAGE_HR (hoặc vai trò quản trị được phép). Liên hệ quản trị CRM/hệ thống.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Users size={20} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Tài khoản nhân sự</h3>
          <p className="text-xs text-gray-500">
            Đăng xuất phiên, tạm khóa/mở khóa (STAFF_LOGOUT, STAFF_LOCK) và đặt mật khẩu tạm (MANAGE_HR) khi nhân sự quên mật khẩu.
          </p>
        </div>
      </div>

      {message && (
        <div className={`text-sm px-3 py-2 rounded-lg border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, mã, SĐT hoặc nhóm quyền..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        {searchQuery.trim() && (
          <span className="text-sm text-gray-500">
            {filteredEmployees.length} / {employees.length} nhân sự
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Tên</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Mã</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Nhóm quyền</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Trạng thái</th>
                {(canLogout || canLock || canSetTempPassword) && (
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Thao tác</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => {
                const isSelf = emp.id === user?.id;
                const busy = actioningId === emp.id;
                return (
                  <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-3 px-4 font-medium text-gray-900">{emp.fullName}</td>
                    <td className="py-3 px-4 text-gray-600">{emp.code}</td>
                    <td className="py-3 px-4 text-gray-600">{(emp.roleGroup as any)?.name ?? emp.roleGroup ?? '—'}</td>
                    <td className="py-3 px-4">
                      {emp.isLocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                          <Lock size={12} /> Khóa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          Hoạt động
                        </span>
                      )}
                    </td>
                    {(canLogout || canLock || canSetTempPassword) && (
                      <td className="py-3 px-4 text-right">
                        {isSelf ? (
                          <span className="text-gray-400 text-xs">(Tài khoản của bạn)</span>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {canSetTempPassword && (
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
                            {canSetTempPassword && (
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
                            {canLogout && (
                              <button
                                type="button"
                                onClick={() => handleLogout(emp)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50 text-xs"
                              >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                                Đăng xuất
                              </button>
                            )}
                            {canLock && (
                              emp.isLocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleLock(emp, false)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50 text-xs"
                                >
                                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
                                  Mở khóa
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleLock(emp, true)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50 text-xs"
                                >
                                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                                  Tạm khóa
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && employees.length === 0 && (
        <p className="text-gray-500 text-sm py-4">Chưa có nhân sự nào.</p>
      )}
      {!loading && employees.length > 0 && filteredEmployees.length === 0 && (
        <p className="text-gray-500 text-sm py-4">Không tìm thấy nhân sự nào phù hợp với &quot;{searchQuery.trim()}&quot;.</p>
      )}

      <SetTempPasswordModal
        employee={tempPwdEmployee}
        open={!!tempPwdEmployee}
        onClose={() => setTempPwdEmployee(null)}
        onSuccess={(msg) => setMessage({ type: 'success', text: msg })}
      />
    </div>
  );
};

export default StaffAccountManager;
