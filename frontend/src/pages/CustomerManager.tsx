import { useState, useEffect, useMemo } from 'react';
import { useDataStore } from '../context/useDataStore';
import { useAuthStore } from '../context/useAuthStore';
import { Search, Eye, Trash2, Users, UserPlus, Download, RefreshCcw, Edit, Bell, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Customer, NotificationTarget } from '../types';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import NotificationManager from './NotificationManager';
import { formatDate } from '../utils/format';
import { ToolbarButton } from '../components/ui/ToolbarButton';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';

const CustomerManager = () => {
  const { customers, customerStats, fetchCustomers, fetchCustomerStats, addCustomer, deleteCustomer, updateCustomer, users } = useDataStore();
  const { user, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'customers' | 'notifications'>('customers');
  const [notificationParams, setNotificationParams] = useState<{
      initialTargetType?: NotificationTarget['type'];
      initialTargetValue?: string;
      openCreateModalOnLoad?: boolean;
  }>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTier, setFilterTier] = useState('All');
  const [filterRevenue, setFilterRevenue] = useState('All');
  const [filterStaffName, setFilterStaffName] = useState('');
  const [filterStaffPhone] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    dob: '',
    assignedStaffId: '',
    managerId: ''
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchCustomers(), fetchCustomerStats()]);
    setIsRefreshing(false);
  };

  // Real-time refresh
  useRealtimeRefresh(['Customer', 'CustomerInteraction', 'CustomerStatus'], fetchData);

  // Filter Logic
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Role based filtering is already done in backend for fetchCustomers, 
      // but we might need additional client-side filtering if requirements change.
      // Currently backend sends only allowed customers.
      
      const matchesSearch = 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.phone.includes(searchTerm) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesTier = filterTier === 'All' || c.membershipTier === filterTier;
      
      let matchesRevenue = true;
      if (filterRevenue !== 'All') {
        if (filterRevenue === 'under10m') matchesRevenue = c.totalOrdersValue < 10000000;
        else if (filterRevenue === '10m-50m') matchesRevenue = c.totalOrdersValue >= 10000000 && c.totalOrdersValue <= 50000000;
        else if (filterRevenue === 'over50m') matchesRevenue = c.totalOrdersValue > 50000000;
      }

      // Staff filtering
      const assignedStaff = users.find(u => u.id === c.assignedStaffId);
      const matchesStaffName = !filterStaffName || (assignedStaff?.name.toLowerCase().includes(filterStaffName.toLowerCase()));
      const matchesStaffPhone = !filterStaffPhone || (assignedStaff?.phone.includes(filterStaffPhone));

      return matchesSearch && matchesTier && matchesRevenue && matchesStaffName && matchesStaffPhone;
    });
  }, [customers, searchTerm, filterTier, filterRevenue, filterStaffName, filterStaffPhone, users]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customers');

    worksheet.columns = [
      { header: 'Tên khách hàng', key: 'name', width: 25 },
      { header: 'SĐT', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Địa chỉ', key: 'address', width: 30 },
      { header: 'Ngày sinh', key: 'dob', width: 15 },
      { header: 'Hạng thành viên', key: 'tier', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Tổng chi tiêu', key: 'total', width: 20 },
      { header: 'Nhân viên CSKH', key: 'staff', width: 20 },
      { header: 'SĐT NV', key: 'staffPhone', width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };

    filteredCustomers.forEach(c => {
      const staff = users.find(u => u.id === c.assignedStaffId);
      worksheet.addRow({
        name: c.name,
        phone: c.phone,
        email: c.email || '',
        address: c.address,
        dob: c.dob ? formatDate(c.dob) : '',
        tier: c.membershipTier,
        status: c.customerStatus?.name || '',
        total: c.totalOrdersValue,
        staff: staff?.name || 'Chưa gán',
        staffPhone: staff?.phone || '',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'Danh_sach_khach_hang.xlsx');
  };

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        email: customer.email || '',
        address: customer.address,
        dob: customer.dob ? new Date(customer.dob).toISOString().split('T')[0] : '',
        assignedStaffId: customer.assignedStaffId,
        managerId: customer.managerId || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        dob: '',
        assignedStaffId: user?.id || '',
        managerId: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, formData);
      } else {
        await addCustomer({
            ...formData,
            membershipTier: 'Bronze',
            totalOrdersValue: 0,
        });
      }
      setIsModalOpen(false);
      fetchData(); // Refresh data
    } catch (error) {
      alert('Có lỗi xảy ra, vui lòng thử lại');
    }
  };

  const handleSendNotification = (phone: string) => {
      setNotificationParams({
          initialTargetType: 'specific',
          initialTargetValue: phone,
          openCreateModalOnLoad: true
      });
      setActiveTab('notifications');
  };

  const handleDelete = async (id: string, name: string) => {
      if (!hasPermission('DELETE_CUSTOMER')) return;
      if (window.confirm(`Bạn có chắc muốn xóa khách hàng ${name}? Thao tác xóa toàn bộ dữ liệu liên quan (đơn hàng, lead, v.v.) và không thể hoàn tác.`)) {
          await deleteCustomer(id);
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab('customers')}
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 sm:flex-none whitespace-nowrap",
            activeTab === 'customers' 
              ? "bg-white text-primary shadow-sm" 
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          )}
        >
          <List size={18} />
          Danh sách khách hàng
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 sm:flex-none whitespace-nowrap",
            activeTab === 'notifications' 
              ? "bg-white text-primary shadow-sm" 
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          )}
        >
          <Bell size={18} />
          Gửi thông báo
        </button>
      </div>

      {activeTab === 'customers' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                    <Users size={24} />
                </div>
                <div>
                    <p className="text-sm text-gray-500">Tổng khách hàng</p>
                    <p className="text-2xl font-bold">{customerStats?.totalCustomers || 0}</p>
                </div>
            </div>
            <div className="card p-4 flex items-center gap-4">
                <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                    <UserPlus size={24} />
                </div>
                <div>
                    <p className="text-sm text-gray-500">Khách hàng mới (Tháng)</p>
                    <p className="text-2xl font-bold">{customerStats?.newCustomers || 0}</p>
                </div>
            </div>
            <div className="card p-4 flex items-center gap-4">
                <div className="p-3 bg-yellow-100 text-yellow-600 rounded-lg">
                    <span className="font-bold text-xl">$</span>
                </div>
                <div>
                    <p className="text-sm text-gray-500">Doanh thu (Tháng)</p>
                    <div className="flex items-end gap-2">
                        <p className="text-xl font-bold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(customerStats?.totalRevenue || 0)}</p>
                        {customerStats?.revenueGrowth !== undefined && (
                            <span className={clsx("text-xs mb-1", customerStats.revenueGrowth >= 0 ? "text-green-500" : "text-red-500")}>
                                {customerStats.revenueGrowth > 0 ? '+' : ''}{customerStats.revenueGrowth}%
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="card p-4 flex items-center gap-4">
                <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                    <RefreshCcw size={24} />
                </div>
                <div>
                    <p className="text-sm text-gray-500">Khách có đơn (30 ngày)</p>
                    <p className="text-2xl font-bold">{customerStats?.activeCustomers30Days || 0}</p>
                </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Danh sách khách hàng</h2>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <ToolbarButton
                    variant="secondary"
                    onClick={fetchData} 
                    disabled={isRefreshing}
                    className={clsx("p-2 shrink-0", isRefreshing && "animate-spin")}
                    title="Làm mới dữ liệu"
                >
                    <RefreshCcw size={20} />
                </ToolbarButton>
                 <ToolbarButton variant="secondary" onClick={handleExport} className="flex-1 sm:flex-none">
                    <Download size={20} />
                    <span className="whitespace-nowrap">Xuất Excel</span>
                </ToolbarButton>
                <ToolbarButton variant="primary" onClick={() => handleOpenModal()} className="flex-1 sm:flex-none">
                    <UserPlus size={20} />
                    <span className="whitespace-nowrap">Thêm khách hàng</span>
                </ToolbarButton>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="card space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="text" 
                      placeholder="Tìm tên, SĐT, Email..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <select 
                  value={filterTier}
                  onChange={(e) => setFilterTier(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="All">Tất cả hạng</option>
                  <option value="Bronze">Thành viên (Bronze)</option>
                  <option value="Silver">Bạc (Silver)</option>
                  <option value="Gold">Vàng (Gold)</option>
                  <option value="Platinum">Kim cương (Platinum)</option>
                </select>
                <select 
                  value={filterRevenue}
                  onChange={(e) => setFilterRevenue(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="All">Tất cả mức chi tiêu</option>
                  <option value="under10m">Dưới 10 triệu</option>
                  <option value="10m-50m">10 - 50 triệu</option>
                  <option value="over50m">Trên 50 triệu</option>
                </select>
                 <input 
                      type="text" 
                      placeholder="Tìm theo tên NV phụ trách..." 
                      value={filterStaffName}
                      onChange={(e) => setFilterStaffName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
            </div>
            
            {/* Table (Desktop) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-600 text-sm uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Khách hàng</th>
                    <th className="px-4 py-3 whitespace-nowrap">Liên hệ</th>
                    <th className="px-4 py-3 whitespace-nowrap">Hạng</th>
                    <th className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
                    <th className="px-4 py-3 whitespace-nowrap">NV Phụ trách</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Tổng chi tiêu</th>
                    <th className="px-4 py-3 whitespace-nowrap text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedCustomers.map((customer) => {
                      const staff = users.find(u => u.id === customer.assignedStaffId);
                      return (
                        <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{customer.name}</div>
                              <div className="text-sm text-gray-500">{customer.address}</div>
                          </td>
                          <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{customer.phone}</div>
                              <div className="text-xs text-gray-500">{customer.email}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={clsx(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              customer.membershipTier === 'Platinum' ? "bg-purple-100 text-purple-700" :
                              customer.membershipTier === 'Gold' ? "bg-yellow-100 text-yellow-700" :
                              customer.membershipTier === 'Silver' ? "bg-gray-200 text-gray-700" :
                              "bg-orange-100 text-orange-700"
                            )}>
                              {customer.membershipTier}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {customer.customerStatus ? (
                              <span
                                className="px-2 py-1 rounded-full text-xs font-medium text-white"
                                style={{ backgroundColor: customer.customerStatus.color }}
                              >
                                {customer.customerStatus.name}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-sm">---</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{staff?.name || '---'}</div>
                              <div className="text-xs text-gray-500">{staff?.phone}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(customer.totalOrdersValue)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => handleSendNotification(customer.phone)}
                                  className="p-1.5 text-secondary hover:bg-secondary/10 rounded-lg transition-colors"
                                  title="Gửi thông báo"
                                >
                                  <Bell size={18} />
                                </button>
                                <button 
                                  onClick={() => navigate(`/customers/${customer.id}`)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Xem chi tiết"
                                >
                                  <Eye size={18} />
                                </button>
                                <button 
                                  onClick={() => handleOpenModal(customer)}
                                  className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                  title="Chỉnh sửa"
                                >
                                  <Edit size={18} />
                                </button>
                                {hasPermission('DELETE_CUSTOMER') && (
                                 <button 
                                  onClick={() => handleDelete(customer.id, customer.name)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Xóa khách hàng"
                                >
                                  <Trash2 size={18} />
                                </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                  })}
                  {paginatedCustomers.length === 0 && (
                      <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                              Không tìm thấy khách hàng nào.
                          </td>
                      </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {paginatedCustomers.map((customer) => {
                  const staff = users.find(u => u.id === customer.assignedStaffId);
                  return (
                    <div key={customer.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-gray-900">{customer.name}</h3>
                                <p className="text-sm text-gray-500">{customer.phone}</p>
                            </div>
                            <span className={clsx(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              customer.membershipTier === 'Platinum' ? "bg-purple-100 text-purple-700" :
                              customer.membershipTier === 'Gold' ? "bg-yellow-100 text-yellow-700" :
                              customer.membershipTier === 'Silver' ? "bg-gray-200 text-gray-700" :
                              "bg-orange-100 text-orange-700"
                            )}>
                              {customer.membershipTier}
                            </span>
                        </div>

                        {customer.customerStatus && (
                          <div className="mb-2">
                            <span
                              className="px-2 py-1 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: customer.customerStatus.color }}
                            >
                              {customer.customerStatus.name}
                            </span>
                          </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-gray-50 p-2 rounded">
                                <p className="text-xs text-gray-500">Chi tiêu</p>
                                <p className="font-medium text-gray-900">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(customer.totalOrdersValue)}
                                </p>
                            </div>
                            <div className="bg-gray-50 p-2 rounded">
                                <p className="text-xs text-gray-500">Phụ trách</p>
                                <p className="font-medium text-gray-900 truncate">
                                    {staff?.name || '---'}
                                </p>
                            </div>
                        </div>

                        {customer.address && (
                            <p className="text-sm text-gray-500 flex items-center gap-1">
                                <span className="text-xs font-medium bg-gray-100 px-1.5 py-0.5 rounded">ĐC</span>
                                {customer.address}
                            </p>
                        )}

                        <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                            <button 
                                onClick={() => handleSendNotification(customer.phone)}
                                className="flex-1 py-2 bg-secondary/10 text-secondary rounded-lg font-medium text-sm flex items-center justify-center gap-1"
                            >
                                <Bell size={16} /> TB
                            </button>
                            <button 
                                onClick={() => navigate(`/customers/${customer.id}`)}
                                className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium text-sm flex items-center justify-center gap-1"
                            >
                                <Eye size={16} /> Xem
                            </button>
                            <button 
                                onClick={() => handleOpenModal(customer)}
                                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg font-medium text-sm flex items-center justify-center gap-1"
                            >
                                <Edit size={16} /> Sửa
                            </button>
                            {hasPermission('DELETE_CUSTOMER') && (
                            <button 
                                onClick={() => handleDelete(customer.id, customer.name)}
                                className="flex-1 py-2 bg-red-50 text-red-600 rounded-lg font-medium text-sm flex items-center justify-center gap-1"
                            >
                                <Trash2 size={16} /> Xóa
                            </button>
                            )}
                        </div>
                    </div>
                  );
              })}
              {paginatedCustomers.length === 0 && (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      Không tìm thấy khách hàng nào.
                  </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0 pt-4 border-t border-gray-100">
                    <span className="text-sm text-gray-500 order-2 sm:order-1">
                        Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} trong tổng số {filteredCustomers.length}
                    </span>
                    <div className="flex gap-2 order-1 sm:order-2">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                            Trước
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={clsx(
                                    "px-3 py-1 border rounded",
                                    currentPage === page ? "bg-primary text-white border-primary" : "border-gray-200 hover:bg-gray-50"
                                )}
                            >
                                {page}
                            </button>
                        ))}
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                            Sau
                        </button>
                    </div>
                </div>
            )}
          </div>

          {/* Modal Create/Edit */}
          {isModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-xl font-bold mb-4">{editingCustomer ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng mới'}</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách hàng *</label>
                                <input 
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full p-2 border border-gray-200 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại *</label>
                                <input 
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={e => setFormData({...formData, phone: e.target.value})}
                                    className="w-full p-2 border border-gray-200 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input 
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                    className="w-full p-2 border border-gray-200 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
                                <input 
                                    type="date"
                                    value={formData.dob}
                                    onChange={e => setFormData({...formData, dob: e.target.value})}
                                    className="w-full p-2 border border-gray-200 rounded-lg"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                                <input 
                                    type="text"
                                    value={formData.address}
                                    onChange={e => setFormData({...formData, address: e.target.value})}
                                    className="w-full p-2 border border-gray-200 rounded-lg"
                                />
                            </div>
                             
                             {/* Staff & Manager Display (Read-only) */}
                            <div className="md:col-span-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                 <h4 className="text-sm font-semibold text-gray-700 mb-2">Thông tin phụ trách (Đồng bộ từ CRM)</h4>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Nhân viên phụ trách</label>
                                        <div className="text-sm font-medium text-gray-900">
                                            {formData.assignedStaffId ? (users.find(u => u.id === formData.assignedStaffId)?.name || '---') : 'Chưa gán'}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Quản lý phụ trách</label>
                                        <div className="text-sm font-medium text-gray-900">
                                            {/* Assuming managerId might be added to formData or Customer type in the future. For now, we can try to find the manager of the assigned staff if direct managerId is not available */}
                                            {formData.assignedStaffId ? (
                                                (() => {
                                                    const staff = users.find(u => u.id === formData.assignedStaffId);
                                                    const manager = staff?.managerId ? users.find(u => u.id === staff.managerId) : null;
                                                    return manager?.name || '---';
                                                })()
                                            ) : (
                                                // If direct managerId exists (future proof)
                                                (formData as any).managerId ? (users.find(u => u.id === (formData as any).managerId)?.name || '---') : 'Chưa gán'
                                            )}
                                        </div>
                                    </div>
                                 </div>
                                 <p className="text-xs text-gray-500 mt-2 italic">
                                    * Thông tin này được tự động đồng bộ từ hệ thống CRM dựa trên số điện thoại khách hàng.
                                 </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button 
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                Hủy
                            </button>
                            <button 
                                type="submit"
                                className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90"
                            >
                                {editingCustomer ? 'Lưu thay đổi' : 'Thêm mới'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
          )}
        </>
      ) : (
        <NotificationManager {...notificationParams} />
      )}
    </div>
  );
};

export default CustomerManager;