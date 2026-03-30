import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { EmployeeForm } from '../components/EmployeeForm';
import { apiClient, API_URL } from '../api/client';
import { Loader, AlertCircle, ChevronLeft, FileText, Upload, Eye, Trash2 } from 'lucide-react';
import type { Employee, Contract } from '../types';
import { useAuthStore } from '../context/useAuthStore';
import { formatDate } from '../utils/format';

const getContractStatus = (contract: Contract) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = contract.startDate ? new Date(contract.startDate) : null;
  const end = contract.endDate ? new Date(contract.endDate) : null;
  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(0, 0, 0, 0);

  if (end && end < today) return { label: 'Hết hạn', color: 'bg-red-100 text-red-700' };
  if (start && start > today) return { label: 'Chưa hiệu lực', color: 'bg-yellow-100 text-yellow-700' };
  if (start && start <= today && (!end || end >= today)) return { label: 'Còn hiệu lực', color: 'bg-green-100 text-green-700' };
  return { label: 'Chưa xác định', color: 'bg-gray-100 text-gray-600' };
};

const EmployeeEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, hasPermission } = useAuthStore();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [error, setError] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const contractSectionRef = useRef<HTMLDivElement>(null);

  const fetchContracts = async () => {
    if (!id) return;
    try {
        const res = await apiClient.get(`/contracts/list/${id}`);
        setContracts(res as any || []);
    } catch (error) {
        console.error('Error fetching contracts', error);
    }
  };

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        setLoading(true);
        const res: any = await apiClient.get(`/hr/employees/${id}`);
        setEmployee(res);
        await fetchContracts();
      } catch (err) {
        console.error('Error fetching employee:', err);
        setError('Không thể tải thông tin nhân viên');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchEmployee();
    }
  }, [id]);

  // Cuộn tới phần Quản lý hợp đồng khi vào từ tab "Quản lý hợp đồng"
  useEffect(() => {
    if (location.state?.scrollTo === 'contracts' && contractSectionRef.current && !loading) {
      contractSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, location.state?.scrollTo]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    // Client-side validation
    if (file.type !== 'application/pdf') {
        alert('Chỉ chấp nhận file định dạng PDF');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('File quá lớn. Giới hạn 5MB');
        return;
    }

    if (contractStartDate && contractEndDate && contractEndDate <= contractStartDate) {
        alert('Ngày hết hạn phải sau ngày hiệu lực.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (contractStartDate) formData.append('startDate', contractStartDate);
    if (contractEndDate) formData.append('endDate', contractEndDate);

    try {
        setUploadLoading(true);
        await apiClient.postMultipart(`/contracts/upload/${id}`, formData);
        await fetchContracts();
        alert('Tải lên thành công');
    } catch (error: any) {
        console.error('Upload error:', error);
        const message = error.response?.data?.message || error.message || 'Lỗi khi tải lên';
        alert(message);
    } finally {
        setUploadLoading(false);
        // Reset file input
        e.target.value = '';
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa hợp đồng này?')) return;
    
    try {
        setUploadLoading(true);
        await apiClient.delete(`/contracts/${contractId}`);
        await fetchContracts();
    } catch (error: any) {
        console.error('Delete error:', error);
        alert(error.response?.data?.message || 'Lỗi khi xóa');
    } finally {
        setUploadLoading(false);
    }
  };

  const startEditingContract = (contract: Contract) => {
    setEditingContractId(contract.id);
    setEditStartDate(contract.startDate ? new Date(contract.startDate).toISOString().split('T')[0] : '');
    setEditEndDate(contract.endDate ? new Date(contract.endDate).toISOString().split('T')[0] : '');
  };

  const handleUpdateContractDates = async (contractId: string) => {
    if (editStartDate && editEndDate && editEndDate <= editStartDate) {
      alert('Ngày hết hạn phải sau ngày hiệu lực.');
      return;
    }
    try {
      setUploadLoading(true);
      await apiClient.put(`/contracts/${contractId}`, {
        startDate: editStartDate || null,
        endDate: editEndDate || null
      });
      setEditingContractId(null);
      await fetchContracts();
    } catch (error: any) {
      console.error('Update contract error:', error);
      alert(error.response?.data?.message || 'Lỗi khi cập nhật hợp đồng');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDownload = async (contractId: string, fileName: string) => {
    try {
        const blob = await apiClient.getBlob(`/contracts/download/${contractId}`);
        if (blob) {
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        }
    } catch (error) {
        console.error('Download error:', error);
        alert('Lỗi khi tải xuống hợp đồng');
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
          onClick={() => navigate('/hr')}
          className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <ChevronLeft size={18} /> Quay lại danh sách
        </button>
      </div>
    );
  }

  const canDeleteContract = hasPermission('MANAGE_HR') || hasPermission('FULL_ACCESS');

  return (
    <div className="space-y-6">
      <EmployeeForm mode="edit" initialData={employee} />

      {/* Contract Management Section */}
      <div id="section-contracts" ref={contractSectionRef} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FileText className="text-primary" /> Quản lý hợp đồng
            </h3>
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <label htmlFor="contract-start-date" className="text-xs text-gray-500">Ngày hiệu lực (bắt buộc nên nhập)</label>
                    <input
                        id="contract-start-date"
                        type="date"
                        value={contractStartDate}
                        onChange={(e) => setContractStartDate(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label htmlFor="contract-end-date" className="text-xs text-gray-500">Ngày hết hạn (tùy chọn, để nhắc hạn)</label>
                    <input
                        id="contract-end-date"
                        type="date"
                        value={contractEndDate}
                        onChange={(e) => setContractEndDate(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                </div>
                <input 
                    type="file" 
                    id="contract-upload-edit" 
                    className="hidden" 
                    accept=".pdf"
                    onChange={handleFileUpload}
                    disabled={uploadLoading}
                />
                <label 
                    htmlFor="contract-upload-edit"
                    className={`cursor-pointer flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm ${uploadLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {uploadLoading ? <Loader className="animate-spin" size={16} /> : <Upload size={16} />}
                    Tải lên hợp đồng
                </label>
            </div>
        </div>

        {contracts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <FileText size={48} className="mx-auto mb-2 text-gray-300" />
                <p>Chưa có hợp đồng nào được tải lên.</p>
            </div>
        ) : (
            <div className="space-y-3">
                {contracts.map(contract => {
                    const status = getContractStatus(contract);
                    const isEditing = editingContractId === contract.id;
                    return (
                    <div key={contract.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-200 transition-colors">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="bg-red-100 p-3 rounded-lg text-red-600 shrink-0">
                                    <FileText size={24} />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-gray-900 truncate">{contract.fileName}</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                                        <span>{(contract.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                                        <span>•</span>
                                        <span>Tải lên: {formatDate(contract.createdAt)}</span>
                                        {contract.startDate && <><span>•</span><span>Hiệu lực: {formatDate(contract.startDate)}</span></>}
                                        {contract.endDate && <><span>•</span><span>Hết hạn: {formatDate(contract.endDate)}</span></>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button 
                                    onClick={() => handleDownload(contract.id, contract.fileName)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Xem"
                                >
                                    <Eye size={20} />
                                </button>
                                {canDeleteContract && !isEditing && (
                                    <button
                                        onClick={() => startEditingContract(contract)}
                                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors text-xs font-medium"
                                        title="Sửa ngày"
                                    >
                                        Sửa ngày
                                    </button>
                                )}
                                {canDeleteContract && (
                                    <button 
                                        onClick={() => handleDeleteContract(contract.id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Xóa"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                        {isEditing && (
                            <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-end gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-gray-500">Ngày hiệu lực</label>
                                    <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-gray-500">Ngày hết hạn</label>
                                    <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                                </div>
                                <button onClick={() => handleUpdateContractDates(contract.id)}
                                    disabled={uploadLoading}
                                    className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
                                    Lưu
                                </button>
                                <button onClick={() => setEditingContractId(null)}
                                    className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">
                                    Hủy
                                </button>
                            </div>
                        )}
                    </div>
                    );
                })}
            </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeEdit;
