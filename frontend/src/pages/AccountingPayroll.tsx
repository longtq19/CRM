import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  X, 
  Save, 
  ChevronLeft,
  ChevronRight,
  Check,
  FileText,
  DollarSign,
  Calendar,
  Filter,
  Download,
  Settings,
  ArrowLeft
} from 'lucide-react';
import { apiClient } from '../api/client';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import { toast } from 'react-hot-toast';
import { formatCurrency } from '../utils/format';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../context/useAuthStore';

interface SalaryComponent {
  id: string;
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'BENEFIT';
  isTaxable: boolean;
  isActive: boolean;
  description?: string;
  sortOrder: number;
}

interface PayrollItem {
  id: string;
  componentId: string;
  component: SalaryComponent;
  amount: number;
  note?: string;
}

interface Payroll {
  id: string;
  month: number;
  year: number;
  employeeId: string;
  employee: {
    id: string;
    code: string;
    fullName: string;
    department?: { name: string };
    position?: { name: string };
    employeeType?: { code: string; name: string };
  };
  grossSalary: number;
  totalDeduction: number;
  netSalary: number;
  workDays: number;
  leaveDays: number;
  overtimeHours: number;
  status: string;
  note?: string;
  items: PayrollItem[];
  approver?: { fullName: string };
  creator?: { fullName: string };
  approvedAt?: string;
  createdAt: string;
}

interface Employee {
  id: string;
  code: string;
  fullName: string;
  department?: { name: string };
}

const AccountingPayroll = () => {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showComponentModal, setShowComponentModal] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<Payroll | null>(null);
  const [editingComponent, setEditingComponent] = useState<SalaryComponent | null>(null);
  const [viewingPayroll, setViewingPayroll] = useState<Payroll | null>(null);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState('');
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState('');
  const [employeeTypes, setEmployeeTypes] = useState<{ id: string; code: string; name: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    employeeId: '',
    workDays: 22,
    leaveDays: 0,
    overtimeHours: 0,
    note: '',
    items: [] as { componentId: string; amount: number; note?: string }[]
  });

  const [componentForm, setComponentForm] = useState({
    code: '',
    name: '',
    type: 'EARNING' as 'EARNING' | 'DEDUCTION' | 'BENEFIT',
    isTaxable: true,
    description: '',
    sortOrder: 0
  });

  const canManageAccounting = useAuthStore((s) => s.hasPermission('MANAGE_ACCOUNTING'));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    fetchComponents();
    fetchEmployees();
    (async () => {
      try {
        const res: any = await apiClient.get('/hr/employee-types');
        setEmployeeTypes(Array.isArray(res) ? res : res?.data || []);
      } catch {
        setEmployeeTypes([]);
      }
    })();
  }, []);

  useEffect(() => {
    fetchPayrolls();
  }, [selectedYear, selectedMonth, statusFilter, employeeTypeFilter, page, limit]);

  const fetchPayrolls = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: selectedYear.toString(),
        month: selectedMonth.toString(),
        page: page.toString(),
        limit: String(limit)
      });
      if (statusFilter) params.append('status', statusFilter);
      if (employeeTypeFilter) params.append('employeeTypeId', employeeTypeFilter);

      const res = await apiClient.get(`/accounting/payrolls?${params}`);
      setPayrolls(res.data?.data || []);
      setTotalPages(res.data?.pagination?.totalPages || 1);
      setTotal(res.data?.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching payrolls:', error);
      toast.error('Không thể tải danh sách bảng lương');
      setPayrolls([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchComponents = async () => {
    try {
      const res = await apiClient.get('/accounting/salary-components');
      setComponents(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching components:', error);
      setComponents([]);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await apiClient.get('/hr/employees?limit=1000');
      setEmployees(res.data?.data || res.data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    }
  };

  const handleCreatePayroll = () => {
    setEditingPayroll(null);
    setFormData({
      employeeId: '',
      workDays: 22,
      leaveDays: 0,
      overtimeHours: 0,
      note: '',
      items: components.filter(c => c.isActive).map(c => ({
        componentId: c.id,
        amount: 0,
        note: ''
      }))
    });
    setShowModal(true);
  };

  const handleEditPayroll = (payroll: Payroll) => {
    setEditingPayroll(payroll);
    setFormData({
      employeeId: payroll.employeeId,
      workDays: payroll.workDays,
      leaveDays: payroll.leaveDays,
      overtimeHours: Number(payroll.overtimeHours),
      note: payroll.note || '',
      items: components.filter(c => c.isActive).map(c => {
        const existingItem = payroll.items.find(i => i.componentId === c.id);
        return {
          componentId: c.id,
          amount: existingItem ? Number(existingItem.amount) : 0,
          note: existingItem?.note || ''
        };
      })
    });
    setShowModal(true);
  };

  const handleSavePayroll = async () => {
    try {
      const payload = {
        month: selectedMonth,
        year: selectedYear,
        ...formData,
        items: formData.items.filter(i => i.amount > 0)
      };

      if (editingPayroll) {
        await apiClient.put(`/accounting/payrolls/${editingPayroll.id}`, payload);
        toast.success('Đã cập nhật bảng lương');
      } else {
        await apiClient.post('/accounting/payrolls', payload);
        toast.success('Đã tạo bảng lương');
      }

      setShowModal(false);
      fetchPayrolls();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleApprovePayroll = async (id: string) => {
    if (!confirm('Xác nhận duyệt bảng lương này?')) return;
    
    try {
      await apiClient.post(`/accounting/payrolls/${id}/approve`);
      toast.success('Đã duyệt bảng lương');
      fetchPayrolls();
    } catch (error) {
      toast.error('Không thể duyệt bảng lương');
    }
  };

  const handleGenerateMonthly = async () => {
    if (!confirm(`Tạo bảng lương tháng ${selectedMonth}/${selectedYear} cho tất cả nhân viên?`)) return;
    
    try {
      const res = await apiClient.post('/accounting/payrolls/generate', {
        month: selectedMonth,
        year: selectedYear
      });
      toast.success(res.data.message);
      fetchPayrolls();
    } catch (error) {
      toast.error('Không thể tạo bảng lương hàng loạt');
    }
  };

  const handleSaveComponent = async () => {
    try {
      if (editingComponent) {
        await apiClient.put(`/accounting/salary-components/${editingComponent.id}`, componentForm);
        toast.success('Đã cập nhật đầu mục lương');
      } else {
        await apiClient.post('/accounting/salary-components', componentForm);
        toast.success('Đã tạo đầu mục lương');
      }
      setShowComponentModal(false);
      fetchComponents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleDeleteComponent = async (id: string) => {
    if (!confirm('Xác nhận xóa đầu mục này?')) return;
    
    try {
      await apiClient.delete(`/accounting/salary-components/${id}`);
      toast.success('Đã xóa đầu mục');
      fetchComponents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể xóa');
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Nháp',
      PENDING: 'Chờ duyệt',
      APPROVED: 'Đã duyệt',
      PAID: 'Đã thanh toán',
      CANCELLED: 'Đã hủy'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-700',
      PENDING: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-green-100 text-green-700',
      PAID: 'bg-blue-100 text-blue-700',
      CANCELLED: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      EARNING: 'Thu nhập',
      DEDUCTION: 'Khấu trừ',
      BENEFIT: 'Phúc lợi'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      EARNING: 'bg-green-100 text-green-700',
      DEDUCTION: 'bg-red-100 text-red-700',
      BENEFIT: 'bg-blue-100 text-blue-700'
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  const calculateTotals = () => {
    let gross = 0;
    let deduction = 0;

    formData.items.forEach(item => {
      const comp = components.find(c => c.id === item.componentId);
      if (comp) {
        if (comp.type === 'EARNING' || comp.type === 'BENEFIT') {
          gross += item.amount;
        } else {
          deduction += item.amount;
        }
      }
    });

    return { gross, deduction, net: gross - deduction };
  };

  const filteredPayrolls = payrolls.filter(p => 
    !searchTerm || 
    p.employee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.employee.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/accounting" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="p-2 bg-blue-50 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quản lý lương</h1>
            <p className="text-sm text-gray-500">Bảng lương và đầu mục lương</p>
          </div>
        </div>

        {canManageAccounting && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingComponent(null);
                setComponentForm({ code: '', name: '', type: 'EARNING', isTaxable: true, description: '', sortOrder: 0 });
                setShowComponentModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Đầu mục lương
            </button>
            <button
              onClick={handleGenerateMonthly}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Tạo hàng loạt
            </button>
            <button
              onClick={handleCreatePayroll}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tạo bảng lương
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <select
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(parseInt(e.target.value)); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {months.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => { setSelectedYear(parseInt(e.target.value)); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="DRAFT">Nháp</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="PAID">Đã thanh toán</option>
            </select>
            <select
              value={employeeTypeFilter}
              onChange={(e) => { setEmployeeTypeFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Tất cả loại NV</option>
              {employeeTypes.map(et => (
                <option key={et.id} value={et.id}>{et.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, mã nhân viên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div className="text-sm text-gray-500">
            Tổng: <span className="font-medium text-gray-900">{total}</span> bảng lương
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhân viên</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng ban</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại NV</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ngày công</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tổng thu nhập</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Khấu trừ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Thực lĩnh</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  </td>
                </tr>
              ) : filteredPayrolls.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                filteredPayrolls.map(payroll => (
                  <tr key={payroll.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{payroll.employee.fullName}</p>
                        <p className="text-xs text-gray-500">{payroll.employee.code}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {payroll.employee.department?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {payroll.employee.employeeType?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className="text-gray-900">{payroll.workDays}</span>
                      {payroll.leaveDays > 0 && (
                        <span className="text-red-500 ml-1">(-{payroll.leaveDays})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                      {formatCurrency(payroll.grossSalary)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                      {formatCurrency(payroll.totalDeduction)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(payroll.netSalary)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(payroll.status)}`}>
                        {getStatusLabel(payroll.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setViewingPayroll(payroll)}
                          className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded"
                          title="Xem chi tiết"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {canManageAccounting && payroll.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => handleEditPayroll(payroll)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Sửa"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleApprovePayroll(payroll.id)}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                              title="Duyệt"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(totalPages > 1 || total > 0) && (
          <div className="px-4 py-3 border-t border-gray-100">
            <PaginationBar
              page={page}
              limit={normalizePageSize(limit)}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onLimitChange={(l) => { setLimit(normalizePageSize(l)); setPage(1); }}
              itemLabel="bảng lương"
            />
          </div>
        )}
      </div>

      {/* Salary Components Summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Đầu mục lương</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['EARNING', 'DEDUCTION', 'BENEFIT'].map(type => (
              <div key={type} className="space-y-2">
                <h4 className={`text-sm font-medium px-2 py-1 rounded ${getTypeColor(type)}`}>
                  {getTypeLabel(type)}
                </h4>
                <div className="space-y-1">
                  {components.filter(c => c.type === type && c.isActive).map(comp => (
                    <div key={comp.id} className="flex items-center justify-between px-2 py-1 text-sm hover:bg-gray-50 rounded">
                      <span className="text-gray-700">{comp.name}</span>
                      {canManageAccounting && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingComponent(comp);
                              setComponentForm({
                                code: comp.code,
                                name: comp.name,
                                type: comp.type,
                                isTaxable: comp.isTaxable,
                                description: comp.description || '',
                                sortOrder: comp.sortOrder
                              });
                              setShowComponentModal(true);
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteComponent(comp.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create/Edit Payroll Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingPayroll ? 'Sửa bảng lương' : 'Tạo bảng lương mới'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-4">
                {/* Employee Selection */}
                {!editingPayroll && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên *</label>
                    <select
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      required
                    >
                      <option value="">-- Chọn nhân viên --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.code} - {emp.fullName} {emp.department ? `(${emp.department.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Work Info */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày công</label>
                    <input
                      type="number"
                      value={formData.workDays}
                      onChange={(e) => setFormData({ ...formData, workDays: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      min="0"
                      max="31"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày nghỉ</label>
                    <input
                      type="number"
                      value={formData.leaveDays}
                      onChange={(e) => setFormData({ ...formData, leaveDays: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giờ tăng ca</label>
                    <input
                      type="number"
                      value={formData.overtimeHours}
                      onChange={(e) => setFormData({ ...formData, overtimeHours: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      min="0"
                      step="0.5"
                    />
                  </div>
                </div>

                {/* Salary Items */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">Chi tiết lương</h4>
                  
                  {['EARNING', 'BENEFIT', 'DEDUCTION'].map(type => (
                    <div key={type} className="border border-gray-100 rounded-lg p-3">
                      <h5 className={`text-sm font-medium mb-2 ${
                        type === 'EARNING' ? 'text-green-600' :
                        type === 'DEDUCTION' ? 'text-red-600' : 'text-blue-600'
                      }`}>
                        {getTypeLabel(type)}
                      </h5>
                      <div className="space-y-2">
                        {formData.items
                          .filter(item => {
                            const comp = components.find(c => c.id === item.componentId);
                            return comp?.type === type;
                          })
                          .map((item, idx) => {
                            const comp = components.find(c => c.id === item.componentId);
                            if (!comp) return null;
                            
                            return (
                              <div key={item.componentId} className="flex items-center gap-3">
                                <span className="text-sm text-gray-600 w-40">{comp.name}</span>
                                <input
                                  type="number"
                                  value={item.amount}
                                  onChange={(e) => {
                                    const newItems = [...formData.items];
                                    const itemIdx = newItems.findIndex(i => i.componentId === item.componentId);
                                    newItems[itemIdx].amount = parseFloat(e.target.value) || 0;
                                    setFormData({ ...formData, items: newItems });
                                  }}
                                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm text-right"
                                  min="0"
                                  placeholder="0"
                                />
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tổng thu nhập:</span>
                      <span className="font-medium text-green-600">{formatCurrency(calculateTotals().gross)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tổng khấu trừ:</span>
                      <span className="font-medium text-red-600">{formatCurrency(calculateTotals().deduction)}</span>
                    </div>
                    <div className="flex justify-between text-base pt-2 border-t border-gray-200">
                      <span className="font-medium text-gray-900">Thực lĩnh:</span>
                      <span className="font-bold text-primary">{formatCurrency(calculateTotals().net)}</span>
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <textarea
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleSavePayroll}
                disabled={!editingPayroll && !formData.employeeId}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Payroll Detail Modal */}
      {viewingPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Chi tiết bảng lương</h2>
              <button onClick={() => setViewingPayroll(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-100px)]">
              <div className="space-y-4">
                {/* Employee Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Nhân viên</p>
                      <p className="font-medium">{viewingPayroll.employee.fullName}</p>
                      <p className="text-sm text-gray-500">{viewingPayroll.employee.code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Kỳ lương</p>
                      <p className="font-medium">Tháng {viewingPayroll.month}/{viewingPayroll.year}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Ngày công / Nghỉ</p>
                      <p className="font-medium">{viewingPayroll.workDays} / {viewingPayroll.leaveDays}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Trạng thái</p>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(viewingPayroll.status)}`}>
                        {getStatusLabel(viewingPayroll.status)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Salary Items */}
                <div className="space-y-3">
                  {['EARNING', 'BENEFIT', 'DEDUCTION'].map(type => {
                    const items = viewingPayroll.items.filter(i => i.component.type === type);
                    if (items.length === 0) return null;

                    return (
                      <div key={type} className="border border-gray-100 rounded-lg p-3">
                        <h5 className={`text-sm font-medium mb-2 ${
                          type === 'EARNING' ? 'text-green-600' :
                          type === 'DEDUCTION' ? 'text-red-600' : 'text-blue-600'
                        }`}>
                          {getTypeLabel(type)}
                        </h5>
                        <div className="space-y-1">
                          {items.map(item => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <span className="text-gray-600">{item.component.name}</span>
                              <span className="font-medium">{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div className="bg-primary/5 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tổng thu nhập:</span>
                    <span className="font-medium text-green-600">{formatCurrency(viewingPayroll.grossSalary)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tổng khấu trừ:</span>
                    <span className="font-medium text-red-600">{formatCurrency(viewingPayroll.totalDeduction)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="font-medium text-gray-900">Thực lĩnh:</span>
                    <span className="font-bold text-xl text-primary">{formatCurrency(viewingPayroll.netSalary)}</span>
                  </div>
                </div>

                {viewingPayroll.note && (
                  <div>
                    <p className="text-sm text-gray-500">Ghi chú</p>
                    <p className="text-gray-700">{viewingPayroll.note}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Salary Component Modal */}
      {showComponentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingComponent ? 'Sửa đầu mục lương' : 'Thêm đầu mục lương'}
              </h2>
              <button onClick={() => setShowComponentModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã *</label>
                <input
                  type="text"
                  value={componentForm.code}
                  onChange={(e) => setComponentForm({ ...componentForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  disabled={!!editingComponent}
                  placeholder="VD: BASIC_SALARY"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên *</label>
                <input
                  type="text"
                  value={componentForm.name}
                  onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  placeholder="VD: Lương cơ bản"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại *</label>
                <select
                  value={componentForm.type}
                  onChange={(e) => setComponentForm({ ...componentForm, type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="EARNING">Thu nhập</option>
                  <option value="DEDUCTION">Khấu trừ</option>
                  <option value="BENEFIT">Phúc lợi</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isTaxable"
                  checked={componentForm.isTaxable}
                  onChange={(e) => setComponentForm({ ...componentForm, isTaxable: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="isTaxable" className="text-sm text-gray-700">Tính thuế TNCN</label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea
                  value={componentForm.description}
                  onChange={(e) => setComponentForm({ ...componentForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thứ tự</label>
                <input
                  type="number"
                  value={componentForm.sortOrder}
                  onChange={(e) => setComponentForm({ ...componentForm, sortOrder: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => setShowComponentModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveComponent}
                disabled={!componentForm.code || !componentForm.name}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingPayroll;
