import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { apiClient, API_URL, ApiHttpError } from '../api/client';
import { 
  Loader, 
  AlertCircle, 
  X, 
  Mail, 
  Phone, 
  Briefcase, 
  UserPlus, 
  Building,
  Edit,
  FileText,
  Eye,
  Camera,
  Check
} from 'lucide-react';
import clsx from 'clsx';
import type { Employee, Position, Contract } from '../types';
import { translate } from '../utils/dictionary';
import { useAuthStore } from '../context/useAuthStore';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { formatDate } from '../utils/format';

interface EmployeeDetailModalProps {
  employeeId: string;
  onClose: () => void;
  /** Gọi sau khi đổi ảnh thành công (vd. để làm mới avatar trên Header — cùng URL file ghi đè). */
  onAvatarUpdated?: () => void;
}

const EmployeeDetailModal = ({ employeeId, onClose, onAvatarUpdated }: EmployeeDetailModalProps) => {
  const navigate = useNavigate();
  const { user: currentUser, checkAuth, hasPermission } = useAuthStore();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Master Data
  const [positions, setPositions] = useState<Position[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

  // Avatar Upload State
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  /** Làm trình duyệt tải lại ảnh khi đường dẫn `/uploads/avatars/<id>.jpg` không đổi sau khi ghi đè file. */
  const [avatarDisplayNonce, setAvatarDisplayNonce] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification
  const [notification, setNotification] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({
    show: false, message: '', type: 'success'
  });

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!employeeId) return;
      try {
        setLoading(true);
        const [empRes, posRes] = await Promise.all([
          apiClient.get(`/hr/employees/${employeeId}`),
          apiClient.get('/hr/positions?limit=1000'),
        ]);
        
        setEmployee(empRes as any);
        setPositions(posRes as any || []);

        // Fetch contracts
        try {
            const contractsRes = await apiClient.get(`/contracts/list/${employeeId}`);
            setContracts(contractsRes as any || []);
        } catch (e) {
            console.error('Error fetching contracts', e);
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Không thể tải thông tin nhân viên');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [employeeId]);

  const getFullImageUrl = (path: string | null) => {
    if (!path) return '';
    if (path.startsWith('data:')) return path;
    if (path.startsWith('http')) return resolveUploadUrl(path);
    if (path.startsWith('/uploads')) return resolveUploadUrl(path);
    const baseUrl = API_URL.replace(/\/api\/?$/, '');
    return `${baseUrl}${path}`;
  };

  const getAvatarDisplaySrc = (path: string | null) => {
    const u = getFullImageUrl(path);
    if (!u || avatarDisplayNonce === 0) return u;
    const sep = u.includes('?') ? '&' : '?';
    return `${u}${sep}t=${avatarDisplayNonce}`;
  };

  const handleDownload = async (contractId: string, fileName: string) => {
        try {
            const blob = await apiClient.getBlob(`/contracts/download/${contractId}`);
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => window.URL.revokeObjectURL(url), 100);
            }
        } catch (error) {
            console.error('Download error:', error);
            showNotification('Lỗi khi tải xuống hợp đồng', 'error');
        }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const maxSize = 25 * 1024 * 1024; // 25MB
        if (file.size > maxSize) {
            showNotification('Ảnh đại diện tối đa 25MB', 'error');
            return;
        }

        try {
            setUploadingAvatar(true);
            const formData = new FormData();
            
            // Append info for filename generation (must be before file)
            if (employeeId) formData.append('employeeId', employeeId);
            if (employee?.code) formData.append('code', employee.code);
            if (employee?.fullName) formData.append('fullName', employee.fullName);
            
            formData.append('avatar', file);
            
            // If user is updating their own avatar, the backend might use current user from token.
            // But here we might be admin updating someone else's? 
            // The requirement says "All employees are allowed to change their own avatar."
            // If I am admin, I can update others? The requirement says "Edit Information Permission... Only users who are granted...".
            // It doesn't explicitly say about avatar for others, but usually admins can.
            // However, the backend endpoint `/hr/employees/upload-avatar` likely updates the current user OR takes an ID.
            // Let's check `hrRoutes.ts` later if needed. For now assume we use a specific endpoint or the same one.
            // Looking at `EmployeeForm`, it uses `/hr/employees/upload-avatar` which seems to not take ID in URL, suggesting it's for "current user" or relies on session.
            // Wait, `EmployeeForm` is used for "Add/Edit". If it's "Edit", it updates state `avatarUrl` and then sends PUT request with the URL.
            // Ah, `EmployeeForm` calls `upload-avatar` to get a URL, then sends that URL in the PUT request.
            
            // Here, we want to update ONLY the avatar immediately.
            // If I am the user, I can use that endpoint.
            // If I am viewing someone else, I should probably not be able to change their avatar unless I am admin editing the whole profile.
            // But the requirement focuses on "User Avatar Interaction... clicking on the user avatar... open a detail view".
            // This implies I am viewing MY OWN profile.
            // So I can use the upload endpoint and then update the employee record.
            
            // However, to be safe and immediate:
            // 1. Upload file to get URL.
            // 2. Update employee record with new avatarUrl.
            
            const uploadRes: any = await apiClient.postMultipart('/hr/employees/upload-avatar', formData);
            if (uploadRes?.url) {
                // Now update the employee record with this new URL
                // We only want to update avatarUrl, so we send a PATCH or PUT with just that field if possible,
                // or we need to send the whole object.
                // The backend `update` method usually expects full object or partial.
                // Let's assume partial update is supported or we just send what we have.
                // Actually, `EmployeeForm` sends full object.
                // Let's try to send just avatarUrl.
                
                await apiClient.patch(`/hr/employees/${employeeId}/avatar`, {
                    avatarUrl: uploadRes.url
                });
                
                setEmployee(prev => prev ? ({ ...prev, avatarUrl: uploadRes.url }) : null);
                setAvatarDisplayNonce(Date.now());
                showNotification('Cập nhật ảnh đại diện thành công', 'success');
                onAvatarUpdated?.();
                
                // If it's the current user, we might need to update global auth store?
                // The Header uses `user` from store. We should probably reload the page or update store.
                if (String(currentUser?.id) === String(employeeId)) {
                    // Update global auth store so header avatar updates
                    checkAuth();
                }
            }
        } catch (err: unknown) {
            console.error('Avatar upload failed', err);
            const msg =
              err instanceof ApiHttpError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : 'Lỗi khi tải ảnh lên';
            showNotification(msg, 'error');
        } finally {
            setUploadingAvatar(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }
  };

  if (!employeeId) return null;

  const isCurrentUser = String(currentUser?.id ?? '') === String(employeeId);
  const canEdit =
    (employee as any)?.access?.canEdit === true ||
    hasPermission('MANAGE_HR') ||
    hasPermission('FULL_ACCESS');
  // Note: If normal user has 'EDIT_PROFILE' permission (hypothetically), we would add it here.
  // But based on current codebase, permissions are usually role-based.
  
  const getOnlineStatus = (isOnline?: boolean, lastActiveAt?: string) => {
    if (isOnline) return 'Online';
    if (!lastActiveAt) return 'Ngoại tuyến';

    try {
      const lastActive = new Date(lastActiveAt);
      const now = new Date();
      const diffMs = now.getTime() - lastActive.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Vừa mới hoạt động';
      if (diffMins < 60) return `Hoạt động ${diffMins} phút trước`;
      if (diffHours < 24) return `Hoạt động ${diffHours} giờ trước`;
      return `Hoạt động ${diffDays} ngày trước`;
    } catch {
      return 'Ngoại tuyến';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden relative animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
            <h3 className="font-bold text-lg text-gray-800">Thông tin nhân sự</h3>
            <div className="flex items-center gap-2">
                {canEdit && (
                    <button 
                        onClick={() => {
                            onClose();
                            navigate(`/hr/${employeeId}/edit`);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                        <Edit size={16} /> Cập nhật thông tin
                    </button>
                )}
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
                    <X size={24} />
                </button>
            </div>
        </div>

        {loading ? (
            <div className="flex-1 flex justify-center items-center">
                <Loader className="animate-spin text-primary" size={40} />
            </div>
        ) : error || !employee ? (
            <div className="flex-1 flex flex-col items-center justify-center text-red-500">
                <AlertCircle size={48} className="mb-4" />
                <p className="text-lg font-medium">{error || 'Không tìm thấy nhân viên'}</p>
            </div>
        ) : (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Left: Avatar & Basic */}
                    <div className="md:w-1/3 flex flex-col items-center text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100 h-fit">
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl font-bold mb-4 overflow-hidden border-4 border-white shadow-sm relative">
                                {employee.avatarUrl ? (
                                    <img 
                                        src={getAvatarDisplaySrc(employee.avatarUrl)} 
                                        alt={employee.fullName} 
                                        className="w-full h-full object-cover" 
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.src = getUiAvatarFallbackUrl(employee.fullName);
                                        }}
                                    />
                                ) : (
                                    employee.fullName?.charAt(0)
                                )}
                                {uploadingAvatar && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                                        <Loader className="animate-spin" size={24} />
                                    </div>
                                )}
                            </div>
                            
                            {/* Avatar Upload Button - Visible for current user */}
                            {isCurrentUser && (
                                <>
                                    <label 
                                        htmlFor="avatar-upload-modal" 
                                        className="absolute bottom-4 right-0 bg-primary text-white p-2 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-md transform translate-x-1/4 -translate-y-1/4 z-10"
                                        title="Thay đổi ảnh đại diện"
                                    >
                                        <Camera size={16} />
                                    </label>
                                    <input
                                        id="avatar-upload-modal"
                                        type="file"
                                        accept="image/*"
                                        onChange={handleAvatarChange}
                                        className="hidden"
                                        ref={fileInputRef}
                                        disabled={uploadingAvatar}
                                    />
                                </>
                            )}

                            {employee.isOnline && (
                              <span className="absolute bottom-6 right-2 w-5 h-5 bg-green-500 border-4 border-white rounded-full pointer-events-none"></span>
                            )}
                        </div>

                        <h4 className="font-bold text-xl text-gray-900 mb-1">{employee.fullName}</h4>
                        <p className="text-gray-500 font-mono text-sm mb-3">{employee.code}</p>
                        
                        <div className="flex flex-col items-center gap-2 mb-6">
                            {(() => {
                                const statusObj = typeof employee.status === 'object' ? employee.status : null;
                                const statusCode = statusObj ? statusObj.code : String(employee.status);
                                const statusName = statusObj ? statusObj.name : String(employee.status);

                                return (
                                    <span className={clsx(
                                        "px-3 py-1 rounded-full text-xs font-medium",
                                        statusCode === 'WORKING' || statusCode === 'working' ? "bg-green-100 text-green-700" : 
                                        statusCode === 'RESIGNED' || statusCode === 'resigned' ? "bg-red-100 text-red-700" : 
                                        "bg-gray-100 text-gray-700"
                                    )}>
                                        {translate(statusName)}
                                    </span>
                                );
                            })()}
                            <p className={clsx(
                                "text-xs font-medium",
                                employee.isOnline ? "text-green-600" : "text-gray-400"
                            )}>
                                {getOnlineStatus(employee.isOnline, employee.lastActiveAt)}
                            </p>
                        </div>

                        <div className="w-full space-y-4 text-left border-t border-gray-100 pt-4">
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <Mail size={18} className="text-gray-400" />
                                <div>
                                    <p className="text-xs text-gray-400">Email công ty</p>
                                    <span className="font-medium text-gray-800 break-all">{employee.emailCompany || '-'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <Phone size={18} className="text-gray-400" />
                                 <div>
                                    <p className="text-xs text-gray-400">Số điện thoại</p>
                                    <span className="font-medium text-gray-800">{employee.phone || '-'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Details */}
                    <div className="md:w-2/3 space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h5 className="font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                                <Briefcase size={20} className="text-primary" /> Thông tin công việc
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-2">
                                    <span className="text-sm text-gray-500 block mb-1">Công ty con</span>
                                    <span className="font-medium text-gray-800 bg-gray-50 px-3 py-2 rounded-lg block">
                                        {employee.subsidiaries && employee.subsidiaries.length > 0 
                                            ? employee.subsidiaries.map(s => s.name).join(', ') 
                                            : '-'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Chức danh</span>
                                    <span className="font-medium text-gray-800 block">
                                        {translate(employee.position?.name || positions.find(p => p.id === employee.positionId)?.name || '-')}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Bộ phận</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.hrDepartmentUnit?.name || '—'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Loại hợp đồng</span>
                                    <span className="font-medium text-gray-800 capitalize block">
                                        {typeof employee.employmentType === 'object' ? employee.employmentType?.name : (employee.employmentType || '-')}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Nhóm quyền</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.roleGroup ? translate(employee.roleGroup.name) : (employee.roleGroupId || '-')}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Loại nhân viên</span>
                                    <span className="font-medium text-gray-800 block">
                                        {(employee as any).employeeType?.name ?? '—'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h5 className="font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                                <UserPlus size={20} className="text-primary" /> Thông tin cá nhân
                            </h5>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Ngày sinh</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.dateOfBirth ? formatDate(employee.dateOfBirth) : '-'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Giới tính</span>
                                    <span className="font-medium text-gray-800 block">{employee.gender || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Email cá nhân</span>
                                    <span className="font-medium text-gray-800 block">{employee.emailPersonal || '-'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-sm text-gray-500 block mb-1">Địa chỉ</span>
                                    <span className="font-medium text-gray-800 block">{employee.address || '-'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Bank Info */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h5 className="font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                                <Building size={20} className="text-primary" /> Thông tin ngân hàng
                            </h5>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Tên ngân hàng</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.bankAccounts && employee.bankAccounts.length > 0 ? employee.bankAccounts[0].bank.name : (employee.bankName || '-')}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Số tài khoản</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.bankAccounts && employee.bankAccounts.length > 0 ? employee.bankAccounts[0].accountNumber : (employee.bankAccountNumber || '-')}
                                    </span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-sm text-gray-500 block mb-1">Chủ tài khoản</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.bankAccounts && employee.bankAccounts.length > 0 ? employee.bankAccounts[0].accountHolder : (employee.bankAccountHolder || '-')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Vehicle Info */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h5 className="font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                                <Briefcase size={20} className="text-primary" /> Thông tin phương tiện
                            </h5>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Loại xe</span>
                                    <span className="font-medium text-gray-800 capitalize block">
                                        {employee.vehicles && employee.vehicles.length > 0 ? employee.vehicles[0].type : (employee.vehicleType || '-')}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Tên xe</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.vehicles && employee.vehicles.length > 0 ? employee.vehicles[0].name : (employee.vehicleName || '-')}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Biển số</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.vehicles && employee.vehicles.length > 0 ? employee.vehicles[0].licensePlate : (employee.vehicleLicensePlate || '-')}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 block mb-1">Màu xe</span>
                                    <span className="font-medium text-gray-800 block">
                                        {employee.vehicles && employee.vehicles.length > 0 ? employee.vehicles[0].color : (employee.vehicleColor || '-')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Contract Info */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-4 border-b pb-2">
                                <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <FileText size={20} className="text-primary" /> Hợp đồng lao động
                                </h5>
                            </div>
                            
                            {contracts.length === 0 ? (
                                <p className="text-gray-500 text-sm italic">Chưa có hợp đồng nào.</p>
                            ) : (
                                <div className="space-y-3">
                                    {contracts.map(contract => (
                                        <div key={contract.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="bg-red-100 p-2 rounded-lg text-red-600 shrink-0">
                                                    <FileText size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-gray-800 text-sm truncate">{contract.fileName}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {(contract.fileSize / 1024 / 1024).toFixed(2)} MB • {formatDate(contract.createdAt)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button 
                                                    onClick={() => handleDownload(contract.id, contract.fileName)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                    title="Xem chi tiết"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        {/* Toast Notification */}
        {notification.show && (
            <div className={`fixed top-4 right-4 z-[210] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-4 duration-300 ${
                notification.type === 'success' ? 'bg-success text-white' : 'bg-red-600 text-white'
            }`}>
                {notification.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                <p className="font-medium">{notification.message}</p>
            </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default EmployeeDetailModal;
