import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiClient, API_URL } from '../api/client';
import { 
  Loader, 
  AlertCircle, 
  ChevronLeft, 
  Mail, 
  Phone, 
  Briefcase, 
  UserPlus, 
  Building,
  Edit,
  FileText,
  Eye,
  Check,
  Shield,
  CreditCard,
  Calendar,
  MapPin,
  Image,
} from 'lucide-react';
import clsx from 'clsx';
import type { Employee, Position, Contract } from '../types';
import { translate } from '../utils/dictionary';
import { formatDate } from '../utils/format';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { useAuthStore } from '../context/useAuthStore';

interface EmployeeDetailProps {
  employeeId?: string;
  onClose?: () => void;
}

const EmployeeDetail = ({ employeeId, onClose }: EmployeeDetailProps) => {
  const { id: paramId } = useParams<{ id: string }>();
  const id = employeeId || paramId;
  const navigate = useNavigate();
  const location = useLocation();
  const backState = location.state;
  const { user: currentUser, hasPermission } = useAuthStore();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // We need master data to display names properly if not populated, 
  // but usually API returns populated data or we fetch it. 
  // Assuming API returns basic populated data or IDs. 
  // Based on HRManager, it seems we might need to look up names if not populated.
  // Let's assume we might need to fetch master data if names are missing, 
  // but looking at HRManager, it fetches master data to display names from IDs.
  // I'll fetch master data here too to be safe.
  const [positions, setPositions] = useState<Position[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

  // Notification
  const [notification, setNotification] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({
    show: false, message: '', type: 'success'
  });

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
  };

  const fetchContracts = async () => {
    if (!id) return;
    try {
        const res = await apiClient.get(`/contracts/list/${id}`);
        setContracts(res as any || []);
    } catch (error) {
        console.error('Error fetching contracts:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [empRes, posRes] = await Promise.all([
          apiClient.get(`/hr/employees/${id}`),
          apiClient.get('/hr/positions?limit=1000'),
        ]);

        setEmployee(empRes as any);
        setPositions(posRes as any || []);

        // Fetch contracts
        try {
            const contractsRes = await apiClient.get(`/contracts/list/${id}`);
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

    if (id) {
      fetchData();
    }
  }, [id]);

  const getFullImageUrl = (path: string | null) => {
    if (!path) return '';
    if (path.startsWith('data:')) return path;
    if (path.startsWith('http')) return resolveUploadUrl(path);
    if (path.startsWith('/uploads')) return resolveUploadUrl(path);
    const baseUrl = API_URL.replace(/\/api\/?$/, '');
    return `${baseUrl}${path}`;
  };

  const handleDownload = async (contractId: string, fileName: string) => {
        try {
            const blob = await apiClient.getBlob(`/contracts/download/${contractId}`);
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                window.open(url, '_blank'); // Open in new tab
                
                // Clean up the URL object after a delay
                setTimeout(() => window.URL.revokeObjectURL(url), 100);
            }
        } catch (error) {
            console.error('Download error:', error);
            showNotification('Lỗi khi tải xuống hợp đồng', 'error');
        }
    };

    if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <AlertCircle size={48} className="mb-4" />
        <p className="text-lg font-medium">{error || 'Không tìm thấy nhân viên'}</p>
        <button 
          onClick={() => navigate('/hr', { state: { filters: backState?.filters } })}
          className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <ChevronLeft size={18} /> Quay lại danh sách
        </button>
      </div>
    );
  }

  const accessFlags = (employee as any).access;
  const canEdit =
    accessFlags?.canEdit === true ||
    hasPermission('MANAGE_HR') ||
    hasPermission('FULL_ACCESS');

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

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/hr', { state: { filters: backState?.filters } });
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600">
                    <ChevronLeft size={20} />
                </button>
                <h3 className="font-bold text-lg text-gray-800">Chi tiết nhân sự</h3>
            </div>
            {canEdit && (
                <div className="flex gap-2">
                    <button 
                        onClick={() => navigate(`/hr/${employee.id}/edit`, { state: { filters: backState?.filters } })}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Edit size={18} /> Cập nhật
                    </button>
                </div>
            )}
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
            <div className="flex flex-col md:flex-row gap-6">
                {/* Left: Avatar & Basic */}
                <div className="md:w-1/3 flex flex-col items-center text-center p-6 bg-gray-50 rounded-xl h-fit">
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl font-bold mb-4 overflow-hidden border-4 border-white shadow-sm">
                            {employee.avatarUrl ? (
                                <img 
                                    src={getFullImageUrl(employee.avatarUrl)} 
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
                        </div>
                        {employee.isOnline && (
                          <span className="absolute bottom-6 right-2 w-5 h-5 bg-green-500 border-4 border-white rounded-full"></span>
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

                    <div className="w-full space-y-4 text-left border-t border-gray-200 pt-4">
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                            <Mail size={18} className="text-gray-400" />
                            <div>
                                <p className="text-xs text-gray-400">Email công ty</p>
                                <span className="font-medium text-gray-800">{employee.emailCompany || '-'}</span>
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
                <div className="md:w-2/3 space-y-8">
                    <div>
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
                                <span className="text-sm text-gray-500 block mb-1">Loại nhân viên</span>
                                <span className="font-medium text-gray-800 block">
                                    {typeof employee.employeeType === 'object' && employee.employeeType
                                      ? employee.employeeType.name
                                      : '—'}
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
                        </div>
                    </div>

                    <div>
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

                    {/* Bank Info - Always Visible */}
                    <div>
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

                    {/* Vehicle Info - Always Visible */}
                    <div>
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

                    {/* Legal Info - Thông tin pháp lý */}
                    <div>
                        <h5 className="font-semibold text-gray-900 border-b pb-2 mb-4 flex items-center gap-2">
                            <Shield size={20} className="text-primary" /> Thông tin pháp lý
                        </h5>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <span className="text-sm text-gray-500 block mb-1 flex items-center gap-1">
                                    <CreditCard size={14} /> Số CCCD/CMND
                                </span>
                                <span className="font-medium text-gray-800 block font-mono">
                                    {(employee as any).idCardNumber || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-sm text-gray-500 block mb-1 flex items-center gap-1">
                                    <Calendar size={14} /> Ngày cấp
                                </span>
                                <span className="font-medium text-gray-800 block">
                                    {(employee as any).idCardIssuedDate 
                                        ? formatDate((employee as any).idCardIssuedDate) 
                                        : '-'}
                                </span>
                            </div>
                            <div className="col-span-2">
                                <span className="text-sm text-gray-500 block mb-1 flex items-center gap-1">
                                    <MapPin size={14} /> Nơi cấp
                                </span>
                                <span className="font-medium text-gray-800 block">
                                    {(employee as any).idCardIssuedPlace || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-sm text-gray-500 block mb-1">Mã số thuế cá nhân</span>
                                <span className="font-medium text-gray-800 block font-mono">
                                    {(employee as any).personalTaxCode || '-'}
                                </span>
                            </div>
                        </div>
                        
                        {/* ID Card Images */}
                        {((employee as any).idCardFrontImage || (employee as any).idCardBackImage) && (
                            <div className="mt-4 grid grid-cols-2 gap-4">
                                {(employee as any).idCardFrontImage && (
                                    <div>
                                        <span className="text-sm text-gray-500 block mb-2 flex items-center gap-1">
                                            <Image size={14} /> Ảnh mặt trước
                                        </span>
                                        <div className="border rounded-lg overflow-hidden bg-gray-50">
                                            <img 
                                                src={getFullImageUrl((employee as any).idCardFrontImage)} 
                                                alt="CCCD mặt trước"
                                                className="w-full h-40 object-contain cursor-pointer hover:opacity-90"
                                                onClick={() => window.open(getFullImageUrl((employee as any).idCardFrontImage), '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                                {(employee as any).idCardBackImage && (
                                    <div>
                                        <span className="text-sm text-gray-500 block mb-2 flex items-center gap-1">
                                            <Image size={14} /> Ảnh mặt sau
                                        </span>
                                        <div className="border rounded-lg overflow-hidden bg-gray-50">
                                            <img 
                                                src={getFullImageUrl((employee as any).idCardBackImage)} 
                                                alt="CCCD mặt sau"
                                                className="w-full h-40 object-contain cursor-pointer hover:opacity-90"
                                                onClick={() => window.open(getFullImageUrl((employee as any).idCardBackImage), '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Contract Info */}
                    <div className="mt-6 border-t border-gray-100 pt-6">
                        <div className="flex justify-between items-center mb-4">
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
        
        {/* Toast Notification */}
        {notification.show && (
            <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-4 duration-300 ${
                notification.type === 'success' ? 'bg-success text-white' : 'bg-red-600 text-white'
            }`}>
                {notification.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                <p className="font-medium">{notification.message}</p>
            </div>
        )}
    </div>
  );
};

export default EmployeeDetail;
