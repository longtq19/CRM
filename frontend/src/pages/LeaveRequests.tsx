import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import { isTechnicalAdminRole } from '../constants/rbac';
import { 
  Calendar, Clock, CheckCircle, XCircle, AlertCircle, 
  Plus, Filter, Search, User, FileText, Settings,
  Loader, Check, X, Trash2
} from 'lucide-react';
import clsx from 'clsx';
import { formatDate, formatDateTime } from '../utils/format';

interface LeaveRequest {
  id: string;
  code: string;
  employeeId: string;
  employee: {
    id: string;
    code: string;
    fullName: string;
    avatarUrl?: string;
    department?: { name: string };
    position?: { name: string };
  };
  leaveType: string;
  /** Tên loại khi leaveType = OTHER */
  leaveTypeOtherLabel?: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  lateMinutes?: number;
  earlyMinutes?: number;
  reason?: string;
  status: string;
  approverId?: string;
  approver?: { id: string; fullName: string };
  approvedAt?: string;
  rejectedAt?: string;
  approverNote?: string;
  confirmerId?: string;
  confirmer?: { id: string; fullName: string };
  confirmedAt?: string;
  hrNote?: string;
  createdAt: string;
}

interface LeaveConfig {
  advanceDays: number;
  approvalHours: number;
}

/** Loại nghỉ khi tạo đơn (đồng bộ CREATABLE_LEAVE_TYPES backend). */
const LEAVE_TYPES: Record<string, { label: string; color: string }> = {
  ANNUAL: { label: 'Nghỉ phép năm', color: 'bg-blue-100 text-blue-700' },
  SICK: { label: 'Nghỉ ốm', color: 'bg-yellow-100 text-yellow-700' },
  MATERNITY: { label: 'Nghỉ thai sản', color: 'bg-pink-100 text-pink-700' },
  WEDDING: { label: 'Nghỉ cưới', color: 'bg-purple-100 text-purple-700' },
  FUNERAL: { label: 'Nghỉ tang', color: 'bg-gray-100 text-gray-700' },
  OTHER: { label: 'Khác', color: 'bg-gray-100 text-gray-600' },
};

/** Dữ liệu cũ (không còn mở khi tạo mới) — chỉ để hiển thị. */
const LEGACY_LEAVE_LABELS: Record<string, string> = {
  UNPAID: 'Nghỉ không lương',
  LATE_ARRIVAL: 'Xin đi muộn',
  EARLY_LEAVE: 'Xin về sớm',
};

function getLeaveTypeDisplay(request: LeaveRequest): { label: string; color: string } {
  if (request.leaveType === 'OTHER' && request.leaveTypeOtherLabel?.trim()) {
    return {
      label: request.leaveTypeOtherLabel.trim(),
      color: LEAVE_TYPES.OTHER!.color,
    };
  }
  const fromMap = LEAVE_TYPES[request.leaveType];
  if (fromMap) return fromMap;
  const legacy = LEGACY_LEAVE_LABELS[request.leaveType];
  if (legacy) {
    return { label: legacy, color: 'bg-slate-100 text-slate-700' };
  }
  return { label: request.leaveType, color: 'bg-gray-100 text-gray-600' };
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APPROVED: { label: 'Đã duyệt', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  REJECTED: { label: 'Từ chối', color: 'bg-red-100 text-red-700', icon: XCircle },
  CONFIRMED: { label: 'Đã xác nhận', color: 'bg-green-100 text-green-700', icon: Check },
  CANCELLED: { label: 'Đã hủy', color: 'bg-gray-100 text-gray-500', icon: X }
};

type TabType = 'my-requests' | 'pending-approvals' | 'pending-confirmations' | 'all' | 'settings';

const LeaveRequests = () => {
  const { user, hasPermission } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('my-requests');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<LeaveConfig>({ advanceDays: 0, approvalHours: 0 });
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    leaveType: 'ANNUAL',
    leaveTypeOtherLabel: '',
    startDate: '',
    endDate: '',
    reason: '',
  });
  
  // Filter states
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Action modal states
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'confirm'>('approve');
  const [actionNote, setActionNote] = useState('');
  
  /** Tab cài đặt nghỉ phép: giữ ngoại lệ quản trị hệ thống (system_administrator / ADM). */
  const isAdmin = isTechnicalAdminRole(user?.roleGroup?.code);
  /** Giao diện HCNS (tab chờ xác nhận / tất cả): theo quyền gán trên Nhóm quyền. */
  const isHR =
    hasPermission('MANAGE_HR') ||
    hasPermission('VIEW_HR') ||
    hasPermission('MANAGE_LEAVE_REQUESTS') ||
    hasPermission('VIEW_LEAVE_REQUESTS');
  /** Gọi được API xóa vĩnh viễn (DELETE_LEAVE_REQUESTS, FULL_ACCESS hoặc quản trị kỹ thuật). */
  const canPermanentDelete = hasPermission('DELETE_LEAVE_REQUESTS');
  const permissionCodes = (user?.permissions || []).map((p: string | { code: string }) =>
    typeof p === 'string' ? p : p.code
  );
  const hasExplicitDeleteLeaveRequest = permissionCodes.includes('DELETE_LEAVE_REQUESTS');
  /** Đơn đã duyệt / đã xác nhận: cần gán đúng quyền «Xóa đơn nghỉ phép» hoặc quản trị kỹ thuật; FULL_ACCESS không đủ. */
  const canShowPermanentDeleteForRequest = (request: LeaveRequest) => {
    if (!canPermanentDelete) return false;
    if (request.status === 'APPROVED' || request.status === 'CONFIRMED') {
      return isAdmin || hasExplicitDeleteLeaveRequest;
    }
    return true;
  };
  const isManager = true; // Phạm vi duyệt do backend xác định

  useEffect(() => {
    loadConfig();
    loadRequests();
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      const data = await apiClient.get('/leave-requests/config');
      setConfig(data);
    } catch (error) {
      console.error('Load config error:', error);
    }
  };

  const loadRequests = async () => {
    try {
      setLoading(true);
      let endpoint = '/leave-requests';
      
      if (activeTab === 'pending-approvals') {
        endpoint = '/leave-requests/pending-approvals';
      } else if (activeTab === 'pending-confirmations') {
        endpoint = '/leave-requests/pending-confirmations';
      } else if (activeTab === 'my-requests') {
        endpoint = '/leave-requests?employeeId=' + user?.id;
      }
      
      const data = await apiClient.get(endpoint);
      setRequests(data || []);
    } catch (error) {
      console.error('Load requests error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async () => {
    if (formData.leaveType === 'OTHER' && !formData.leaveTypeOtherLabel.trim()) {
      alert('Vui lòng nhập tên loại nghỉ khi chọn «Khác»');
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.post('/leave-requests', {
        leaveType: formData.leaveType,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        leaveTypeOtherLabel:
          formData.leaveType === 'OTHER' ? formData.leaveTypeOtherLabel.trim() : undefined,
      });
      setShowCreateModal(false);
      setFormData({
        leaveType: 'ANNUAL',
        leaveTypeOtherLabel: '',
        startDate: '',
        endDate: '',
        reason: '',
      });
      loadRequests();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi tạo yêu cầu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedRequest) return;
    
    try {
      setActionLoading(true);
      
      if (actionType === 'approve') {
        await apiClient.post(`/leave-requests/${selectedRequest.id}/approve`, { note: actionNote });
      } else if (actionType === 'reject') {
        await apiClient.post(`/leave-requests/${selectedRequest.id}/reject`, { note: actionNote });
      } else if (actionType === 'confirm') {
        await apiClient.post(`/leave-requests/${selectedRequest.id}/confirm`, { hrNote: actionNote });
      }
      
      setShowActionModal(false);
      setShowDetailModal(false);
      setActionNote('');
      loadRequests();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi xử lý yêu cầu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!confirm('Bạn có chắc muốn hủy yêu cầu này?')) return;
    
    try {
      await apiClient.delete(`/leave-requests/${id}`);
      loadRequests();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi hủy yêu cầu');
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (
      !confirm(
        'Xóa vĩnh viễn đơn nghỉ phép này khỏi hệ thống? Thao tác không thể hoàn tác.'
      )
    )
      return;

    try {
      setActionLoading(true);
      await apiClient.post(`/leave-requests/${id}/permanent-delete`, {});
      setShowDetailModal(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi xóa đơn nghỉ phép');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setActionLoading(true);
      await apiClient.put('/leave-requests/config', config);
      alert('Đã lưu cấu hình');
    } catch (error: any) {
      alert(error.message || 'Lỗi khi lưu cấu hình');
    } finally {
      setActionLoading(false);
    }
  };

  const openActionModal = (type: 'approve' | 'reject' | 'confirm', request: LeaveRequest) => {
    setSelectedRequest(request);
    setActionType(type);
    setActionNote('');
    setShowActionModal(true);
  };

  const filteredRequests = requests.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (!r.employee.fullName.toLowerCase().includes(search) && 
          !r.code.toLowerCase().includes(search)) return false;
    }
    return true;
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Quản lý nghỉ phép</h1>
          <p className="text-gray-500 text-sm">Xin nghỉ phép, duyệt và xác nhận yêu cầu</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus size={18} /> Xin nghỉ phép
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab('my-requests')}
          className={clsx(
            'px-4 py-2 font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'my-requests' 
              ? 'border-green-600 text-green-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <User size={16} className="inline mr-2" />
          Yêu cầu của tôi
        </button>
        
        {(isAdmin || isManager) && (
          <button
            onClick={() => setActiveTab('pending-approvals')}
            className={clsx(
              'px-4 py-2 font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'pending-approvals' 
                ? 'border-green-600 text-green-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <Clock size={16} className="inline mr-2" />
            Chờ duyệt
          </button>
        )}
        
        {(isAdmin || isHR) && (
          <button
            onClick={() => setActiveTab('pending-confirmations')}
            className={clsx(
              'px-4 py-2 font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'pending-confirmations' 
                ? 'border-green-600 text-green-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <CheckCircle size={16} className="inline mr-2" />
            Chờ xác nhận
          </button>
        )}
        
        {(isAdmin || isHR) && (
          <button
            onClick={() => setActiveTab('all')}
            className={clsx(
              'px-4 py-2 font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'all' 
                ? 'border-green-600 text-green-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <FileText size={16} className="inline mr-2" />
            Tất cả
          </button>
        )}
        
        {(isAdmin ||
          hasPermission('MANAGE_LEAVE_REQUESTS') ||
          hasPermission('MANAGE_HR')) && (
          <button
            onClick={() => setActiveTab('settings')}
            className={clsx(
              'px-4 py-2 font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'settings' 
                ? 'border-green-600 text-green-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <Settings size={16} className="inline mr-2" />
            Cài đặt
          </button>
        )}
      </div>

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-xl">
          <h2 className="text-lg font-semibold mb-4">Cài đặt nghỉ phép</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số ngày phải xin trước
              </label>
              <input
                type="number"
                min={0}
                value={config.advanceDays}
                onChange={(e) =>
                  setConfig({ ...config, advanceDays: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                className="w-full border rounded-lg px-4 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                {config.advanceDays <= 0
                  ? '0 = không bắt buộc xin trước (cho phép tạo đơn bổ sung sau khi đã nghỉ).'
                  : `Nhân sự phải xin nghỉ trước ít nhất ${config.advanceDays} ngày (tính từ hôm nay tới ngày bắt đầu nghỉ; không áp khi ngày bắt đầu đã qua).`}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Thời gian duyệt (giờ)
              </label>
              <input
                type="number"
                min={0}
                value={config.approvalHours}
                onChange={(e) =>
                  setConfig({ ...config, approvalHours: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                className="w-full border rounded-lg px-4 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                {config.approvalHours <= 0
                  ? '0 = không giới hạn thời gian duyệt (hệ thống không khóa đơn theo hạn giờ).'
                  : `Tham khảo nghiệp vụ: quản lý nên xử lý trong khoảng ${config.approvalHours} giờ (không cưỡng chế tự động).`}
              </p>
            </div>
            
            <button
              onClick={handleSaveConfig}
              disabled={actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading ? <Loader className="animate-spin" size={18} /> : 'Lưu cài đặt'}
            </button>
          </div>
        </div>
      )}

      {/* List View */}
      {activeTab !== 'settings' && (
        <>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Tìm theo tên, mã..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader className="animate-spin text-green-600" size={32} />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Không có yêu cầu nào
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhân sự</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại nghỉ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thời gian</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Số ngày</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRequests.map((request) => {
                    const status = STATUS_MAP[request.status] || STATUS_MAP.PENDING;
                    const leaveTypeDisplay = getLeaveTypeDisplay(request);
                    const StatusIcon = status.icon;
                    
                    return (
                      <tr key={request.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-gray-600">{request.code}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
                              {request.employee.fullName?.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{request.employee.fullName}</p>
                              <p className="text-xs text-gray-500">{request.employee.department?.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-1 rounded-full text-xs font-medium', leaveTypeDisplay.color)}>
                            {leaveTypeDisplay.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>{formatDate(request.startDate)}</div>
                          <div className="text-gray-500">→ {formatDate(request.endDate)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <>
                            <span className="font-semibold text-gray-800">{request.totalDays}</span>
                            <span className="text-gray-500 text-sm"> ngày</span>
                          </>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit', status.color)}>
                            <StatusIcon size={12} />
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowDetailModal(true);
                              }}
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                              title="Xem chi tiết"
                            >
                              <FileText size={16} />
                            </button>
                            
                            {request.status === 'PENDING' && (isAdmin || request.employeeId === user?.id) && (
                              <button
                                onClick={() => handleCancelRequest(request.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                title="Hủy yêu cầu"
                              >
                                <X size={16} />
                              </button>
                            )}
                            
                            {request.status === 'PENDING' && (isAdmin || isManager) && request.employeeId !== user?.id && (
                              <>
                                <button
                                  onClick={() => openActionModal('approve', request)}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                  title="Duyệt"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => openActionModal('reject', request)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  title="Từ chối"
                                >
                                  <X size={16} />
                                </button>
                              </>
                            )}
                            
                            {request.status === 'APPROVED' && (isAdmin || isHR) && (
                              <button
                                onClick={() => openActionModal('confirm', request)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                title="Xác nhận"
                              >
                                <CheckCircle size={16} />
                              </button>
                            )}

                            {canShowPermanentDeleteForRequest(request) && (
                              <button
                                type="button"
                                onClick={() => handlePermanentDelete(request.id)}
                                disabled={actionLoading}
                                className="p-1.5 text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
                                title="Xóa khỏi hệ thống (không hoàn tác)"
                              >
                                <Trash2 size={16} />
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
        </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Xin nghỉ phép</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại nghỉ</label>
                <select
                  value={formData.leaveType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData({
                      ...formData,
                      leaveType: v,
                      leaveTypeOtherLabel: v === 'OTHER' ? formData.leaveTypeOtherLabel : '',
                    });
                  }}
                  className="w-full border rounded-lg px-4 py-2"
                >
                  {Object.entries(LEAVE_TYPES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {formData.leaveType === 'OTHER' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên loại nghỉ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.leaveTypeOtherLabel}
                    onChange={(e) =>
                      setFormData({ ...formData, leaveTypeOtherLabel: e.target.value })
                    }
                    className="w-full border rounded-lg px-4 py-2"
                    placeholder="Ví dụ: Nghỉ việc riêng có lương, …"
                    maxLength={200}
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full border rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full border rounded-lg px-4 py-2"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lý do</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2 h-24"
                  placeholder="Nhập lý do xin nghỉ..."
                />
              </div>
              
              <p className="text-xs text-gray-500">
                * Lưu ý: Phải xin nghỉ trước ít nhất {config.advanceDays} ngày
              </p>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateRequest}
                disabled={
                  actionLoading ||
                  !formData.startDate ||
                  !formData.endDate ||
                  (formData.leaveType === 'OTHER' && !formData.leaveTypeOtherLabel.trim())
                }
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader className="animate-spin" size={18} /> : 'Gửi yêu cầu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold">Chi tiết yêu cầu</h2>
                <p className="text-sm text-gray-500 font-mono">{selectedRequest.code}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Employee Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-medium">
                  {selectedRequest.employee.fullName?.charAt(0)}
                </div>
                <div>
                  <p className="font-medium">{selectedRequest.employee.fullName}</p>
                  <p className="text-sm text-gray-500">
                    {selectedRequest.employee.position?.name} - {selectedRequest.employee.department?.name}
                  </p>
                </div>
              </div>
              
              {/* Leave Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-500">Loại nghỉ</span>
                  <p className="font-medium">{getLeaveTypeDisplay(selectedRequest).label}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Thời lượng</span>
                  <p className="font-medium">{selectedRequest.totalDays} ngày</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Từ ngày</span>
                  <p className="font-medium">{formatDate(selectedRequest.startDate)}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Đến ngày</span>
                  <p className="font-medium">{formatDate(selectedRequest.endDate)}</p>
                </div>
              </div>
              
              {selectedRequest.reason && (
                <div>
                  <span className="text-sm text-gray-500">Lý do</span>
                  <p className="font-medium">{selectedRequest.reason}</p>
                </div>
              )}
              
              {/* Status */}
              <div className="border-t pt-4">
                <span className="text-sm text-gray-500">Trạng thái</span>
                <div className={clsx(
                  'mt-1 px-3 py-2 rounded-lg flex items-center gap-2 w-fit',
                  STATUS_MAP[selectedRequest.status]?.color
                )}>
                  {(() => {
                    const StatusIcon = STATUS_MAP[selectedRequest.status]?.icon;
                    return StatusIcon ? <StatusIcon size={16} /> : null;
                  })()}
                  {STATUS_MAP[selectedRequest.status]?.label}
                </div>
              </div>
              
              {/* Timeline */}
              <div className="border-t pt-4 space-y-3">
                <span className="text-sm text-gray-500 font-medium">Lịch sử xử lý</span>
                
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-gray-400"></div>
                  <div>
                    <p className="text-sm">Tạo yêu cầu</p>
                    <p className="text-xs text-gray-500">{formatDateTime(selectedRequest.createdAt)}</p>
                  </div>
                </div>
                
                {selectedRequest.approvedAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
                    <div>
                      <p className="text-sm">Đã duyệt bởi {selectedRequest.approver?.fullName}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(selectedRequest.approvedAt)}</p>
                      {selectedRequest.approverNote && (
                        <p className="text-sm text-gray-600 mt-1">"{selectedRequest.approverNote}"</p>
                      )}
                    </div>
                  </div>
                )}
                
                {selectedRequest.rejectedAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-red-500"></div>
                    <div>
                      <p className="text-sm">Từ chối bởi {selectedRequest.approver?.fullName}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(selectedRequest.rejectedAt)}</p>
                      {selectedRequest.approverNote && (
                        <p className="text-sm text-gray-600 mt-1">"{selectedRequest.approverNote}"</p>
                      )}
                    </div>
                  </div>
                )}
                
                {selectedRequest.confirmedAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-green-500"></div>
                    <div>
                      <p className="text-sm">Xác nhận bởi {selectedRequest.confirmer?.fullName}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(selectedRequest.confirmedAt)}</p>
                      {selectedRequest.hrNote && (
                        <p className="text-sm text-green-700 mt-1 font-medium">"{selectedRequest.hrNote}"</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-2 mt-6 border-t pt-4">
              {selectedRequest && canShowPermanentDeleteForRequest(selectedRequest) && (
                <button
                  type="button"
                  onClick={() => handlePermanentDelete(selectedRequest.id)}
                  disabled={actionLoading}
                  className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 mr-auto"
                >
                  Xóa khỏi hệ thống
                </button>
              )}
              {selectedRequest.status === 'PENDING' && (isAdmin || isManager) && selectedRequest.employeeId !== user?.id && (
                <>
                  <button
                    onClick={() => openActionModal('reject', selectedRequest)}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Từ chối
                  </button>
                  <button
                    onClick={() => openActionModal('approve', selectedRequest)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Duyệt
                  </button>
                </>
              )}
              
              {selectedRequest.status === 'APPROVED' && (isAdmin || isHR) && (
                <button
                  onClick={() => openActionModal('confirm', selectedRequest)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Xác nhận
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">
              {actionType === 'approve' && 'Duyệt yêu cầu'}
              {actionType === 'reject' && 'Từ chối yêu cầu'}
              {actionType === 'confirm' && 'Xác nhận yêu cầu'}
            </h2>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Yêu cầu: <span className="font-mono">{selectedRequest.code}</span>
              </p>
              <p className="text-sm text-gray-600">
                Nhân sự: <span className="font-medium">{selectedRequest.employee.fullName}</span>
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {actionType === 'confirm' ? 'Ghi chú xác nhận *' : 'Ghi chú'}
              </label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                className="w-full border rounded-lg px-4 py-2 h-24"
                placeholder={
                  actionType === 'confirm' 
                    ? 'VD: Trừ phép năm / Trừ lương / Nghỉ không lương...' 
                    : 'Nhập ghi chú...'
                }
              />
              {actionType === 'confirm' && (
                <p className="text-xs text-gray-500 mt-1">
                  * Bắt buộc nhập ghi chú để xác nhận
                </p>
              )}
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowActionModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleAction}
                disabled={actionLoading || (actionType === 'confirm' && !actionNote)}
                className={clsx(
                  'px-4 py-2 text-white rounded-lg disabled:opacity-50',
                  actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                )}
              >
                {actionLoading ? <Loader className="animate-spin" size={18} /> : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveRequests;
