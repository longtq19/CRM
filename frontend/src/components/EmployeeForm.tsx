import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  UserPlus, 
  Building, 
  Briefcase,
  Loader,
  ChevronLeft,
  Save,
  Camera,
  Shield,
  Upload,
  FileText
} from 'lucide-react';
import clsx from 'clsx';
import { apiClient, API_URL, ApiHttpError } from '../api/client';
import type { Employee, Subsidiary, Bank, EmploymentType, EmployeeStatus, EmployeeType } from '../types';
import { translate } from '../utils/dictionary';
import { CreatableMultiSelect } from './CreatableMultiSelect';
import { SearchableSelect } from './SearchableSelect';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';

/** Chuỗi yyyy-mm-dd cho input type="date" theo giờ địa phương. */
function formatDateInputLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ngày tối đa được chọn = hôm qua (ngày sinh phải trước hôm nay). */
function getMaxBirthDateInput(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return formatDateInputLocal(d);
}

function isBirthDateStrictlyBeforeToday(isoYmd: string): boolean {
  const p = isoYmd.split('-').map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return false;
  const [yy, mm, dd] = p;
  const dob = new Date(yy, mm - 1, dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dob.setHours(0, 0, 0, 0);
  return dob < today;
}

const ErrorTooltip = ({ message }: { message?: string }) => (
  <div className="absolute top-full left-0 mt-1 z-20 animate-fade-in pointer-events-none">
    <div className="bg-red-500 text-white text-xs py-1.5 px-3 rounded-md shadow-lg flex items-center gap-1 relative before:content-[''] before:absolute before:bottom-full before:left-4 before:border-4 before:border-transparent before:border-b-red-500">
      <span className="font-medium">!</span>
      {message || 'Vui lòng điền thông tin này'}
    </div>
  </div>
);

interface EmployeeFormProps {
  initialData?: Partial<Employee>;
  mode: 'add' | 'edit';
}

export const EmployeeForm: React.FC<EmployeeFormProps> = ({ initialData, mode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const backState = location.state;

  const [selectedEmployee, setSelectedEmployee] = useState<Partial<Employee>>(initialData || { gender: 'Nam' });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialData?.avatarUrl || null);

  // Master Data
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<EmployeeStatus[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([]);
  const [hrDepartmentUnits, setHrDepartmentUnits] = useState<{ id: string; name: string; code: string }[]>([]);

  const [contractFile, setContractFile] = useState<File | null>(null);

  const [notification, setNotification] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({
    show: false, message: '', type: 'success'
  });
  const [birthDateHint, setBirthDateHint] = useState<string | null>(null);
  const [duplicateEmployees, setDuplicateEmployees] = useState<
    Array<{ code?: string; fullName?: string; departmentUnit?: string }>
  >([]);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (initialData) {
      setSelectedEmployee({
        ...initialData,
        dateOfBirth: initialData.dateOfBirth ? initialData.dateOfBirth.split('T')[0] : '',
        employmentType: (typeof initialData.employmentType === 'object' && initialData.employmentType) ? initialData.employmentType.code : (initialData.employmentType || ''),
        status: (typeof initialData.status === 'object' && initialData.status) ? initialData.status.code : (initialData.status || ''),
        employeeTypeId:
          initialData.employeeTypeId ||
          (typeof initialData.employeeType === 'object' && initialData.employeeType
            ? (initialData.employeeType as EmployeeType).id
            : ''),
        hrDepartmentUnitId:
          initialData.hrDepartmentUnitId ||
          (initialData.hrDepartmentUnit && typeof initialData.hrDepartmentUnit === 'object'
            ? initialData.hrDepartmentUnit.id
            : ''),
        hrJobTitle: initialData.hrJobTitle || '',
        contractEffectiveDate: initialData.contractEffectiveDate
          ? String(initialData.contractEffectiveDate).split('T')[0]
          : initialData.probationStartDate
            ? String(initialData.probationStartDate).split('T')[0]
            : '',
        contractEndDate: initialData.contractEndDate
          ? String(initialData.contractEndDate).split('T')[0]
          : initialData.probationEndDate
            ? String(initialData.probationEndDate).split('T')[0]
            : '',
        bankName: (initialData.bankAccounts && initialData.bankAccounts.length > 0) ? initialData.bankAccounts[0].bank.name : (initialData.bankName || ''),
        bankAccountNumber: (initialData.bankAccounts && initialData.bankAccounts.length > 0) ? initialData.bankAccounts[0].accountNumber : (initialData.bankAccountNumber || ''),
        bankAccountHolder: (initialData.bankAccounts && initialData.bankAccounts.length > 0) ? initialData.bankAccounts[0].accountHolder : (initialData.bankAccountHolder || ''),
        vehicleType: (initialData.vehicles && initialData.vehicles.length > 0) ? initialData.vehicles[0].type : (initialData.vehicleType || ''),
        vehicleName: (initialData.vehicles && initialData.vehicles.length > 0) ? initialData.vehicles[0].name : (initialData.vehicleName || ''),
        vehicleColor: (initialData.vehicles && initialData.vehicles.length > 0) ? initialData.vehicles[0].color : (initialData.vehicleColor || ''),
        vehicleLicensePlate: (initialData.vehicles && initialData.vehicles.length > 0) ? initialData.vehicles[0].licensePlate : (initialData.vehicleLicensePlate || ''),
        address: initialData.address || '',
      });
    }
  }, [initialData]);

  const fetchMasterData = async () => {
    try {
      setLoading(true);
      const [subRes, bankRes, empTypeRes, statusRes, empTypeCatRes, hrUnitsRes] = await Promise.all([
        apiClient.get('/hr/subsidiaries'),
        apiClient.get('/hr/banks'),
        apiClient.get('/hr/employment-types'),
        apiClient.get('/hr/employee-statuses'),
        apiClient.get('/hr/employee-types'),
        apiClient.get('/hr/hr-department-units'),
      ]);
      setSubsidiaries(subRes as any || []);
      setBanks(bankRes as any || []);
      setEmploymentTypes(empTypeRes as any || []);
      setEmployeeStatuses(statusRes as any || []);
      setEmployeeTypes(Array.isArray(empTypeCatRes) ? empTypeCatRes : (empTypeCatRes as any)?.data || []);
      const hrList = Array.isArray(hrUnitsRes) ? hrUnitsRes : (hrUnitsRes as any)?.data || [];
      setHrDepartmentUnits(hrList);
    } catch (error) {
      console.error('Error fetching master data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const maxSize = 25 * 1024 * 1024;
        if (file.size > maxSize) {
            showNotification('Ảnh đại diện tối đa 25MB', 'error');
            return;
        }
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setAvatarPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
  };

  const getFullImageUrl = (path: string | null) => {
    if (!path) return '';
    if (path.startsWith('data:')) return path;
    if (path.startsWith('http')) return path;
    if (path.startsWith('/uploads')) return resolveUploadUrl(path);
    const baseUrl = API_URL.replace(/\/api\/?$/, '');
    return `${baseUrl}${path}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setDuplicateEmployees([]);
    setBirthDateHint(null);
    setFieldErrors({});
    
    // Confirmation for Update
    if (mode === 'edit') {
        if (!window.confirm('Bạn có chắc chắn muốn cập nhật thông tin nhân viên này?')) {
            return;
        }
    }

    const newErrors: Record<string, boolean> = {};

    let dobNotInPast = false;
    if (!selectedEmployee.fullName) newErrors.fullName = true;
    if (!selectedEmployee.phone) newErrors.phone = true;
    if (!selectedEmployee.dateOfBirth) {
      newErrors.dateOfBirth = true;
    } else if (!isBirthDateStrictlyBeforeToday(String(selectedEmployee.dateOfBirth))) {
      newErrors.dateOfBirth = true;
      dobNotInPast = true;
    }
    if (!selectedEmployee.emailPersonal) newErrors.emailPersonal = true;
    if (!selectedEmployee.employeeTypeId) newErrors.employeeTypeId = true;
    if (!selectedEmployee.hrDepartmentUnitId) newErrors.hrDepartmentUnitId = true;

    if (selectedEmployee.bankName || selectedEmployee.bankAccountNumber || selectedEmployee.bankAccountHolder) {
      if (!selectedEmployee.bankName) newErrors.bankName = true;
      if (!selectedEmployee.bankAccountNumber) newErrors.bankAccountNumber = true;
      if (!selectedEmployee.bankAccountHolder) newErrors.bankAccountHolder = true;
    }

    if (selectedEmployee.vehicleType || selectedEmployee.vehicleLicensePlate || selectedEmployee.vehicleColor || selectedEmployee.vehicleName) {
      if (!selectedEmployee.vehicleType) newErrors.vehicleType = true;
      if (!selectedEmployee.vehicleLicensePlate) newErrors.vehicleLicensePlate = true;
      if (!selectedEmployee.vehicleColor) newErrors.vehicleColor = true;
      if (!selectedEmployee.vehicleName) newErrors.vehicleName = true;
    }

    if (Object.keys(newErrors).length > 0) {
        setFieldErrors(newErrors);
        setBirthDateHint(
          dobNotInPast
            ? 'Ngày sinh phải là ngày trong quá khứ (trước hôm nay), không được chọn hôm nay hoặc ngày tương lai.'
            : null
        );
        const onlyPastDob =
          dobNotInPast && Object.keys(newErrors).length === 1 && Boolean(newErrors.dateOfBirth);
        setFormError(
          onlyPastDob
            ? 'Ngày sinh phải là ngày trong quá khứ (trước hôm nay).'
            : dobNotInPast
              ? 'Ngày sinh phải là ngày trong quá khứ (trước hôm nay). Vui lòng kiểm tra thêm các trường bôi đỏ.'
              : 'Vui lòng kiểm tra lại các trường bôi đỏ'
        );
        
        // Order of fields to check for scrolling (top to bottom)
        const fieldOrder = [
            'fullName', 'dateOfBirth', 'phone', 'emailPersonal', 'employeeTypeId', 'hrDepartmentUnitId',
            'bankName', 'bankAccountNumber', 'bankAccountHolder',
            'vehicleType', 'vehicleName', 'vehicleLicensePlate', 'vehicleColor'
        ];
        
        const firstErrorKey = fieldOrder.find(key => newErrors[key]);
        
        if (firstErrorKey) {
            const element = document.getElementById(firstErrorKey);
            if (element) {
                // Ensure element is visible and not hidden behind fixed header
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    element.focus({ preventScroll: true });
                }, 100);
            }
        }
        
        return;
    }

    try {
      setSubmitLoading(true);
      
      let uploadedAvatarUrl = selectedEmployee.avatarUrl;
      if (avatarFile) {
        const formData = new FormData();
        if (selectedEmployee.id) formData.append('employeeId', selectedEmployee.id);
        if (selectedEmployee.code) formData.append('code', selectedEmployee.code);
        if (selectedEmployee.fullName) formData.append('fullName', selectedEmployee.fullName);
        formData.append('avatar', avatarFile);

        try {
            const uploadRes: any = await apiClient.postMultipart('/hr/employees/upload-avatar', formData);
            if (uploadRes?.url) {
                uploadedAvatarUrl = uploadRes.url;
            }
        } catch (err) {
            console.error('Avatar upload failed', err);
            const msg =
              err instanceof ApiHttpError ? err.message : 'Lỗi khi tải ảnh lên';
            setFormError(msg);
            setSubmitLoading(false);
            return;
        }
      }

      const payload: any = {
        ...selectedEmployee,
        avatarUrl: uploadedAvatarUrl,
      };

      if (typeof payload.employmentType === 'object' && payload.employmentType !== null) {
          payload.employmentType = (payload.employmentType as any).code;
      }
      if (typeof payload.status === 'object' && payload.status !== null) {
          payload.status = (payload.status as any).code;
      }
      if (typeof payload.position === 'object') delete payload.position;
      if (typeof payload.department === 'object') delete payload.department;
      if (typeof payload.division === 'object') delete payload.division;
      if (typeof payload.manager === 'object') delete payload.manager;
      if (typeof payload.roleGroup === 'object') delete payload.roleGroup;
      if (typeof payload.employeeType === 'object') delete payload.employeeType;
      if (typeof payload.hrDepartmentUnit === 'object') delete payload.hrDepartmentUnit;
      if (typeof payload.subsidiaries === 'object' && !Array.isArray(payload.subsidiaries)) delete payload.subsidiaries;
      delete payload.managerId;
      delete payload.divisionId;
      delete payload.departmentId;
      delete payload.positionId;
      delete payload.roleGroupId;
      delete payload.probationStartDate;
      delete payload.probationEndDate;

      const effRaw = String(selectedEmployee.contractEffectiveDate ?? '').trim();
      const endRaw = String(selectedEmployee.contractEndDate ?? '').trim();
      if (mode === 'edit') {
        payload.contractEffectiveDate = effRaw || null;
        payload.contractEndDate = endRaw || null;
      } else {
        if (effRaw) payload.contractEffectiveDate = effRaw;
        else delete payload.contractEffectiveDate;
        if (endRaw) payload.contractEndDate = endRaw;
        else delete payload.contractEndDate;
      }

      if (mode === 'add') {
        delete payload.id;
        delete payload.access;
        delete payload.createdAt;
        delete payload.updatedAt;
        const created: any = await apiClient.post('/hr/employees', payload);
        const createdId = created?.id;
        if (createdId && contractFile) {
          const formData = new FormData();
          formData.append('file', contractFile);
          if (endRaw) formData.append('endDate', endRaw);
          try {
            await apiClient.postMultipart(`/contracts/upload/${createdId}`, formData);
          } catch (contractErr: any) {
            console.error('Contract upload after create:', contractErr);
            showNotification(contractErr.response?.data?.message || 'Đã tạo nhân viên nhưng tải hợp đồng thất bại', 'error');
          }
        }
        navigate('/hr', { state: { filters: backState?.filters } });
      } else {
        await apiClient.put(`/hr/employees/${selectedEmployee.id}`, payload);
        navigate('/hr', { state: { filters: backState?.filters } });
      }
    } catch (error: unknown) {
      if (error instanceof ApiHttpError) {
        setFormError(error.message);
        const payload: any = (error as any).payload;
        const dupList = Array.isArray(payload?.duplicates) ? payload.duplicates : [];
        setDuplicateEmployees(
          dupList.map((d: any) => ({
            code: d?.code || '',
            fullName: d?.fullName || '',
            departmentUnit: d?.departmentUnit || '—',
          }))
        );
      } else if (error instanceof Error && error.message) {
        setFormError(error.message);
      } else {
        setFormError('Có lỗi xảy ra');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
      return <div className="flex justify-center p-8"><Loader className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {notification.show && (
            <div className={clsx("fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white animate-fade-in", 
                notification.type === 'success' ? "bg-green-500" : "bg-red-500")}>
                {notification.message}
            </div>
        )}

        <div className="p-6 border-b border-gray-100 flex items-center gap-4">
            <button onClick={() => navigate('/hr', { state: { filters: backState?.filters } })} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600">
                <ChevronLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-gray-800">
                {mode === 'add' ? 'Thêm nhân viên mới' : 'Cập nhật thông tin nhân viên'}
            </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6" noValidate>
            {formError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
                    {formError}
                    {duplicateEmployees.length > 0 && (
                        <div className="mt-3">
                            <div className="font-semibold">Danh sách nhân sự trùng:</div>
                            <ul className="mt-1 space-y-1 list-disc pl-5">
                                {duplicateEmployees.map((d, idx) => (
                                    <li key={`${d.code || 'NO_CODE'}-${idx}`}>
                                        {d.code || '—'} - {d.fullName || '—'} - {d.departmentUnit || '—'}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Info */}
                <div className="col-span-full">
                    <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4 flex items-center gap-2">
                        <UserPlus size={18} className="text-primary" /> Thông tin cá nhân
                    </h4>
                </div>

                <div className="col-span-full mb-2">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                                {avatarPreview ? (
                                    <img 
                                        src={getFullImageUrl(avatarPreview)} 
                                        alt="Avatar preview" 
                                        className="w-full h-full object-cover" 
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.src = getUiAvatarFallbackUrl(selectedEmployee.fullName || 'User');
                                        }}
                                    />
                                ) : (
                                    <Camera size={32} className="text-gray-400" />
                                )}
                            </div>
                            <label 
                                htmlFor="avatar-upload" 
                                className="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-sm"
                                title="Thay đổi ảnh đại diện"
                            >
                                <Camera size={14} />
                            </label>
                            <input
                                id="avatar-upload"
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarChange}
                                className="hidden"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Ảnh đại diện</label>
                            <p className="text-xs text-gray-500 mb-2">Hỗ trợ: JPG, PNG, GIF. Tối đa 25MB (Tự động nén ~1MB).</p>
                            <label 
                                htmlFor="avatar-upload"
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 cursor-pointer inline-block"
                            >
                                Chọn ảnh
                            </label>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-1">
                    <label className="label">Mã nhân viên (Tự động)</label>
                    <input 
                        type="text" 
                        value={selectedEmployee.code || ''}
                        placeholder="Tự động tạo"
                        className="input-field bg-gray-100 text-gray-500 cursor-not-allowed"
                        disabled
                    />
                </div>
                <div className="md:col-span-1 relative">
                    <label className="label">Họ và tên <span className="text-red-500">*</span></label>
                    <input 
                        id="fullName"
                        type="text" 
                        value={selectedEmployee.fullName || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, fullName: e.target.value});
                            if (fieldErrors.fullName) setFieldErrors(prev => ({...prev, fullName: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.fullName && "border-red-500 bg-red-50")}
                        required
                    />
                    {fieldErrors.fullName && <ErrorTooltip />}
                </div>

                <div>
                    <label className="label">Giới tính</label>
                    <select 
                        id="gender"
                        value={selectedEmployee.gender || 'Nam'}
                        onChange={e => setSelectedEmployee({...selectedEmployee, gender: e.target.value})}
                        className="input-field"
                    >
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                        <option value="Khác">Khác</option>
                    </select>
                </div>
                <div className="relative">
                    <label className="label">Ngày sinh <span className="text-red-500">*</span></label>
                    <input 
                        id="dateOfBirth"
                        type="date" 
                        max={getMaxBirthDateInput()}
                        value={selectedEmployee.dateOfBirth || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, dateOfBirth: e.target.value});
                            if (fieldErrors.dateOfBirth) setFieldErrors(prev => ({...prev, dateOfBirth: false}));
                            setBirthDateHint(null);
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.dateOfBirth && "border-red-500 bg-red-50")}
                        required
                    />
                    {fieldErrors.dateOfBirth && <ErrorTooltip message={birthDateHint || undefined} />}
                </div>

                {/* Contact */}
                <div className="relative">
                    <label className="label">Số điện thoại <span className="text-red-500">*</span></label>
                    <input 
                        id="phone"
                        type="tel" 
                        value={selectedEmployee.phone || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, phone: e.target.value});
                            if (fieldErrors.phone) setFieldErrors(prev => ({...prev, phone: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.phone && "border-red-500 bg-red-50")}
                        required
                    />
                    {fieldErrors.phone && <ErrorTooltip />}
                </div>
                <div>
                    <label className="label">Email công ty</label>
                    <input 
                        id="emailCompany"
                        type="email" 
                        value={selectedEmployee.emailCompany || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, emailCompany: e.target.value})}
                        className="input-field"
                    />
                </div>
                <div className="relative">
                    <label className="label">Email cá nhân <span className="text-red-500">*</span></label>
                    <input 
                        id="emailPersonal"
                        type="email" 
                        value={selectedEmployee.emailPersonal || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, emailPersonal: e.target.value});
                            if (fieldErrors.emailPersonal) setFieldErrors(prev => ({...prev, emailPersonal: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.emailPersonal && "border-red-500 bg-red-50")}
                        required
                    />
                    {fieldErrors.emailPersonal && <ErrorTooltip />}
                </div>

                <div className="md:col-span-2">
                    <label className="label">Địa chỉ</label>
                    <input 
                        id="address"
                        type="text" 
                        value={selectedEmployee.address || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, address: e.target.value})}
                        className="input-field"
                        placeholder="Số nhà, Tên đường, Phường/Xã, Quận/Huyện, Tỉnh/Thành phố"
                    />
                </div>

                {/* Work Info */}
                <div className="col-span-full mt-4">
                    <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4 flex items-center gap-2">
                        <Briefcase size={18} className="text-primary" /> Thông tin công việc
                    </h4>
                    <p className="text-xs text-gray-400 -mt-2 mb-3">
                        Công ty con, bộ phận và loại nhân viên chỉ <strong className="font-medium text-gray-500">chọn từ danh mục</strong> đã cấu hình (Nhân sự → Danh mục); không thêm mới tại form này. Chức danh (HR) là text tự do; không tham gia logic vận hành.
                    </p>
                </div>

                <div id="hrDepartmentUnitId" className="scroll-mt-28 relative">
                    <SearchableSelect
                        label="Bộ phận"
                        required
                        error={!!fieldErrors.hrDepartmentUnitId}
                        options={hrDepartmentUnits.map((u) => ({ value: u.id, label: u.name }))}
                        value={selectedEmployee.hrDepartmentUnitId || ''}
                        onChange={(v) => {
                            setSelectedEmployee({ ...selectedEmployee, hrDepartmentUnitId: v || undefined });
                            if (fieldErrors.hrDepartmentUnitId) setFieldErrors((prev) => ({ ...prev, hrDepartmentUnitId: false }));
                        }}
                        placeholder="-- Chọn bộ phận --"
                    />
                    {fieldErrors.hrDepartmentUnitId && <ErrorTooltip message="Vui lòng chọn bộ phận" />}
                </div>

                <div>
                    <label className="label">Công ty con</label>
                    <CreatableMultiSelect
                        allowCreate={false}
                        options={subsidiaries}
                        value={selectedEmployee.subsidiaries || []}
                        onChange={(newVal) => setSelectedEmployee({...selectedEmployee, subsidiaries: newVal as Subsidiary[]})}
                        placeholder="-- Chọn Công ty con --"
                    />
                </div>
                <div id="employeeTypeId" className="scroll-mt-28 relative">
                    <SearchableSelect
                        label="Loại nhân viên"
                        required
                        error={!!fieldErrors.employeeTypeId}
                        options={employeeTypes.map(et => ({ value: et.id, label: et.name }))}
                        value={selectedEmployee.employeeTypeId || ''}
                        onChange={v => {
                            setSelectedEmployee({ ...selectedEmployee, employeeTypeId: v || undefined });
                            if (fieldErrors.employeeTypeId) setFieldErrors(prev => ({ ...prev, employeeTypeId: false }));
                        }}
                        placeholder="-- Chọn Loại nhân viên --"
                    />
                    {fieldErrors.employeeTypeId && <ErrorTooltip message="Vui lòng chọn loại nhân viên" />}
                </div>
                <div>
                    <label className="label" htmlFor="hrJobTitle">Chức danh (HR)</label>
                    <input
                        id="hrJobTitle"
                        type="text"
                        value={selectedEmployee.hrJobTitle || ''}
                        onChange={(e) =>
                            setSelectedEmployee({ ...selectedEmployee, hrJobTitle: e.target.value || undefined })
                        }
                        className="input-field"
                        placeholder="Ví dụ: Trưởng nhóm HCNS"
                    />
                </div>
                <div>
                    <label className="label">Loại hợp đồng</label>
                    <select 
                        id="employmentType"
                        value={selectedEmployee.employmentType as string || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, employmentType: e.target.value})}
                        className="input-field"
                    >
                        <option value="">-- Chọn Loại hợp đồng --</option>
                        {employmentTypes.map(type => (
                            <option key={type.id} value={type.code}>{type.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label">Trạng thái</label>
                    <select 
                        id="status"
                        value={selectedEmployee.status as string || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, status: e.target.value})}
                        className="input-field"
                    >
                        <option value="">-- Chọn Trạng thái --</option>
                        {employeeStatuses.map(status => (
                            <option key={status.id} value={status.code}>{translate(status.name)}</option>
                        ))}
                    </select>
                </div>

                <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-2">
                        Ngày hiệu lực và ngày hết hạn hợp đồng (nếu có) — áp dụng cho mọi loại HĐ, không bắt buộc. Với HĐ thử việc, hai ngày này đồng bộ với kỳ thử việc trên hệ thống.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label" htmlFor="contractEffectiveDate">Ngày hiệu lực hợp đồng</label>
                            <input
                                id="contractEffectiveDate"
                                type="date"
                                value={selectedEmployee.contractEffectiveDate || ''}
                                onChange={e =>
                                    setSelectedEmployee({
                                        ...selectedEmployee,
                                        contractEffectiveDate: e.target.value || undefined,
                                    })
                                }
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="label" htmlFor="contractEndDate">Ngày hết hạn hợp đồng</label>
                            <input
                                id="contractEndDate"
                                type="date"
                                value={selectedEmployee.contractEndDate || ''}
                                onChange={e =>
                                    setSelectedEmployee({
                                        ...selectedEmployee,
                                        contractEndDate: e.target.value || undefined,
                                    })
                                }
                                className="input-field"
                            />
                        </div>
                    </div>
                </div>

                {/* Bank Info */}
                <div className="col-span-full mt-4">
                    <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4 flex items-center gap-2">
                        <Building size={18} className="text-primary" /> Thông tin ngân hàng
                    </h4>
                </div>
                <div className="relative">
                    <label className="label">Tên ngân hàng</label>
                    <input 
                        id="bankName"
                        list="bank-list"
                        type="text" 
                        value={selectedEmployee.bankName || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, bankName: e.target.value});
                            if (fieldErrors.bankName) setFieldErrors(prev => ({...prev, bankName: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.bankName && "border-red-500 bg-red-50")}
                        placeholder="Chọn hoặc nhập tên ngân hàng"
                    />
                    <datalist id="bank-list">
                        {banks.map(bank => (
                            <option key={bank.id} value={bank.name} />
                        ))}
                    </datalist>
                    {fieldErrors.bankName && <ErrorTooltip />}
                </div>
                <div className="relative">
                    <label className="label">Số tài khoản</label>
                    <input 
                        id="bankAccountNumber"
                        type="text" 
                        value={selectedEmployee.bankAccountNumber || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, bankAccountNumber: e.target.value});
                            if (fieldErrors.bankAccountNumber) setFieldErrors(prev => ({...prev, bankAccountNumber: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.bankAccountNumber && "border-red-500 bg-red-50")}
                    />
                    {fieldErrors.bankAccountNumber && <ErrorTooltip />}
                </div>
                <div className="col-span-full relative">
                    <label className="label">Chủ tài khoản</label>
                    <input 
                        id="bankAccountHolder"
                        type="text" 
                        value={selectedEmployee.bankAccountHolder || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, bankAccountHolder: e.target.value});
                            if (fieldErrors.bankAccountHolder) setFieldErrors(prev => ({...prev, bankAccountHolder: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.bankAccountHolder && "border-red-500 bg-red-50")}
                    />
                    {fieldErrors.bankAccountHolder && <ErrorTooltip />}
                </div>

                {/* Vehicle Info */}
                <div className="col-span-full mt-4">
                    <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4 flex items-center gap-2">
                        <Briefcase size={18} className="text-primary" /> Thông tin phương tiện
                    </h4>
                </div>
                <div className="relative">
                    <label className="label">Loại xe</label>
                    <select 
                        id="vehicleType"
                        value={selectedEmployee.vehicleType || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, vehicleType: e.target.value as any});
                            if (fieldErrors.vehicleType) setFieldErrors(prev => ({...prev, vehicleType: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.vehicleType && "border-red-500 bg-red-50")}
                    >
                        <option value="">-- Chọn Loại xe --</option>
                        <option value="motorbike">Xe máy</option>
                        <option value="car">Ô tô</option>
                    </select>
                    {fieldErrors.vehicleType && <ErrorTooltip />}
                </div>
                <div className="relative">
                    <label className="label">Tên xe</label>
                    <input 
                        id="vehicleName"
                        type="text" 
                        value={selectedEmployee.vehicleName || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, vehicleName: e.target.value});
                            if (fieldErrors.vehicleName) setFieldErrors(prev => ({...prev, vehicleName: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.vehicleName && "border-red-500 bg-red-50")}
                        placeholder="Honda Vision, Yamaha Exciter..."
                    />
                    {fieldErrors.vehicleName && <ErrorTooltip />}
                </div>
                <div className="relative">
                    <label className="label">Biển số</label>
                    <input 
                        id="vehicleLicensePlate"
                        type="text" 
                        value={selectedEmployee.vehicleLicensePlate || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, vehicleLicensePlate: e.target.value});
                            if (fieldErrors.vehicleLicensePlate) setFieldErrors(prev => ({...prev, vehicleLicensePlate: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.vehicleLicensePlate && "border-red-500 bg-red-50")}
                    />
                    {fieldErrors.vehicleLicensePlate && <ErrorTooltip />}
                </div>
                <div className="relative">
                    <label className="label">Màu xe</label>
                    <input 
                        id="vehicleColor"
                        type="text" 
                        value={selectedEmployee.vehicleColor || ''}
                        onChange={e => {
                            setSelectedEmployee({...selectedEmployee, vehicleColor: e.target.value});
                            if (fieldErrors.vehicleColor) setFieldErrors(prev => ({...prev, vehicleColor: false}));
                        }}
                        className={clsx("input-field scroll-mt-28", fieldErrors.vehicleColor && "border-red-500 bg-red-50")}
                    />
                    {fieldErrors.vehicleColor && <ErrorTooltip />}
                </div>

                {/* Legal Info - Thông tin pháp lý */}
                <div className="col-span-full mt-4">
                    <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4 flex items-center gap-2">
                        <Shield size={18} className="text-primary" /> Thông tin pháp lý
                    </h4>
                </div>
                <div>
                    <label className="label">Số CCCD/CMND</label>
                    <input 
                        id="idCardNumber"
                        type="text" 
                        value={(selectedEmployee as any).idCardNumber || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, idCardNumber: e.target.value} as any)}
                        className="input-field font-mono"
                        placeholder="012345678901"
                    />
                </div>
                <div>
                    <label className="label">Ngày cấp</label>
                    <input 
                        id="idCardIssuedDate"
                        type="date" 
                        value={(selectedEmployee as any).idCardIssuedDate?.split('T')[0] || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, idCardIssuedDate: e.target.value} as any)}
                        className="input-field"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="label">Nơi cấp</label>
                    <input 
                        id="idCardIssuedPlace"
                        type="text" 
                        value={(selectedEmployee as any).idCardIssuedPlace || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, idCardIssuedPlace: e.target.value} as any)}
                        className="input-field"
                        placeholder="Cục Cảnh sát QLHC về TTXH"
                    />
                </div>
                <div>
                    <label className="label">Mã số thuế cá nhân</label>
                    <input 
                        id="personalTaxCode"
                        type="text" 
                        value={(selectedEmployee as any).personalTaxCode || ''}
                        onChange={e => setSelectedEmployee({...selectedEmployee, personalTaxCode: e.target.value} as any)}
                        className="input-field font-mono"
                        placeholder="8XXXXXXXXX"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="label">Ảnh CCCD mặt trước</label>
                    <div className="flex items-center gap-4">
                        {(selectedEmployee as any).idCardFrontImage && (
                            <img 
                                src={getFullImageUrl((selectedEmployee as any).idCardFrontImage)} 
                                alt="CCCD mặt trước" 
                                className="w-32 h-20 object-contain border rounded"
                            />
                        )}
                        <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                            <Upload size={16} />
                            <span className="text-sm">Chọn ảnh</span>
                            <input 
                                type="file" 
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            const res: any = await apiClient.upload('/hr/upload-id-card', formData);
                                            setSelectedEmployee({...selectedEmployee, idCardFrontImage: res.url} as any);
                                        } catch (err) {
                                            showNotification('Lỗi upload ảnh', 'error');
                                        }
                                    }
                                }}
                            />
                        </label>
                    </div>
                </div>
                <div className="md:col-span-2">
                    <label className="label">Ảnh CCCD mặt sau</label>
                    <div className="flex items-center gap-4">
                        {(selectedEmployee as any).idCardBackImage && (
                            <img 
                                src={getFullImageUrl((selectedEmployee as any).idCardBackImage)} 
                                alt="CCCD mặt sau" 
                                className="w-32 h-20 object-contain border rounded"
                            />
                        )}
                        <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                            <Upload size={16} />
                            <span className="text-sm">Chọn ảnh</span>
                            <input 
                                type="file" 
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            const res: any = await apiClient.upload('/hr/upload-id-card', formData);
                                            setSelectedEmployee({...selectedEmployee, idCardBackImage: res.url} as any);
                                        } catch (err) {
                                            showNotification('Lỗi upload ảnh', 'error');
                                        }
                                    }
                                }}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {mode === 'add' && (
                <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-primary" /> Hợp đồng (tùy chọn)
                    </h4>
                    <p className="text-sm text-gray-500 mb-4">Có thể thêm file hợp đồng ngay khi tạo nhân viên. Để trống nếu thêm sau.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Ngày hết hạn (file đính kèm)</label>
                            <input
                                type="date"
                                value={selectedEmployee.contractEndDate || ''}
                                onChange={(e) =>
                                    setSelectedEmployee({
                                        ...selectedEmployee,
                                        contractEndDate: e.target.value || undefined,
                                    })
                                }
                                className="input"
                            />
                            <p className="text-xs text-gray-500 mt-1">Mặc định lấy từ «Ngày hết hạn hợp đồng» phía trên; có thể chỉnh trước khi tải file.</p>
                        </div>
                        <div>
                            <label className="label">File hợp đồng (PDF)</label>
                            <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 w-fit">
                                <Upload size={16} />
                                <span className="text-sm">{contractFile ? contractFile.name : 'Chọn file PDF'}</span>
                                <input
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    className="hidden"
                                    onChange={(e) => setContractFile(e.target.files?.[0] || null)}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'edit' && (
                <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-primary" /> Nhắc hẹn hợp đồng
                    </h4>
                    <p className="text-sm text-gray-500 mb-4">Cấu hình riêng cho nhân sự này: số ngày nhắc trước khi hết hạn và chu kỳ lặp lại nhắc. Để trống sẽ dùng mặc định (15 ngày, 2 ngày).</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Số ngày nhắc trước khi hết hạn</label>
                            <input
                                type="number"
                                min={1}
                                placeholder="15"
                                value={(selectedEmployee as any).contractReminderDaysBefore ?? ''}
                                onChange={(e) => setSelectedEmployee({ ...selectedEmployee, contractReminderDaysBefore: e.target.value === '' ? null : parseInt(e.target.value, 10) } as any)}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="label">Chu kỳ lặp lại nhắc (ngày)</label>
                            <input
                                type="number"
                                min={1}
                                placeholder="2"
                                value={(selectedEmployee as any).contractReminderRepeatDays ?? ''}
                                onChange={(e) => setSelectedEmployee({ ...selectedEmployee, contractReminderRepeatDays: e.target.value === '' ? null : parseInt(e.target.value, 10) } as any)}
                                className="input"
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="notify-on-new-contract"
                            checked={(selectedEmployee as any).notifyOnNewContractUpload !== false}
                            onChange={(e) => setSelectedEmployee({ ...selectedEmployee, notifyOnNewContractUpload: e.target.checked } as any)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="notify-on-new-contract" className="text-sm text-gray-700">Gửi thông báo khi tải hợp đồng mới lên</label>
                    </div>
                </div>
            )}

            <div className="mt-8 pt-4 border-t border-gray-100 flex justify-end gap-4">
                <button 
                    type="button"
                    onClick={() => navigate('/hr', { state: { filters: backState?.filters } })}
                    className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                >
                    Hủy
                </button>
                <button 
                    type="submit"
                    disabled={submitLoading}
                    className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    {submitLoading ? <Loader className="animate-spin" size={18} /> : <Save size={18} />}
                    {mode === 'add' ? 'Thêm nhân viên' : 'Cập nhật'}
                </button>
            </div>
        </form>
    </div>
  );
};
