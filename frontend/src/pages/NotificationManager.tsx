import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../context/useAuthStore';
import { useDataStore } from '../context/useDataStore';
import type { Notification, NotificationTarget } from '../types';
import { 
  Info, 
  XCircle, 
  Search, 
  Filter, 
  Send,
  Trash2,
  Plus,
  Users,
  MapPin,
  Leaf,
  Award,
  Clock,
  Settings,
  BookOpen,
  Megaphone,
  Phone,
  Edit,
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatDateTime } from '../utils/format';

// Constants for Filters
const TARGET_TYPES = [
  { value: 'customer_phone', label: 'Khách hàng cụ thể', icon: Phone },
  { value: 'staff', label: 'Toàn bộ nhân sự', icon: Users },
];

const NOTIFICATION_TYPES = [
  { value: 'system_maintenance', label: 'Bảo trì hệ thống', icon: Settings },
  { value: 'knowledge_share', label: 'Chia sẻ kiến thức', icon: BookOpen },
  { value: 'marketing', label: 'Marketing', icon: Megaphone },
  { value: 'maintenance_warranty', label: 'Bảo hành & Bảo trì', icon: Settings }, // For filter/display only
];

const CREATE_NOTIFICATION_TYPES = [
  { value: 'system_maintenance', label: 'Bảo trì hệ thống', icon: Settings },
  { value: 'knowledge_share', label: 'Chia sẻ kiến thức', icon: BookOpen },
  { value: 'marketing', label: 'Marketing', icon: Megaphone },
];

const CROPS = ['Cà phê', 'Sầu riêng', 'Lúa', 'Thanh long', 'Khác'];
const AREAS = [
  'Trung du và miền núi Bắc Bộ', 
  'Đồng bằng sông Hồng', 
  'Duyên Hải Bắc Trung Bộ', 
  'Duyên hải Nam Trung Bộ', 
  'Tây Nguyên', 
  'Đông Nam Bộ', 
  'Đồng Bằng sông Cửu Long'
];
const RANKS = ['Thành Viên', 'Đồng', 'Bạc', 'Vàng', 'Kim Cương'];

const NotificationManager = ({ 
  initialTargetType, 
  initialTargetValue, 
  openCreateModalOnLoad = false 
}: { 
  initialTargetType?: NotificationTarget['type']; 
  initialTargetValue?: string; 
  openCreateModalOnLoad?: boolean; 
} = {}) => {
  const { user, hasPermission } = useAuthStore();
  const { 
    notifications, 
    notificationPagination,
    customers,
    fetchNotifications, 
    fetchCustomers,
    addNotification, 
    updateNotification, 
    deleteNotification 
  } = useDataStore();
  
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Send Mode State
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('schedule');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'SCHEDULED' | 'SENT' | 'DRAFT'>('all');
  const [filterType, setFilterType] = useState<'all' | 'system_maintenance' | 'knowledge_share' | 'marketing' | 'maintenance_warranty'>('all');
  const [filterTarget, setFilterTarget] = useState<string>('everything');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    type: 'system_maintenance' | 'knowledge_share' | 'marketing' | 'maintenance_warranty';
    targetType: NotificationTarget['type'];
    targetValue: string;
    schedule: string; // ISO string or empty
    ctaLabel: string;
    ctaUrl: string;
  }>({
    title: '',
    content: '',
    type: 'system_maintenance',
    targetType: 'area',
    targetValue: AREAS[0],
    schedule: '',
    ctaLabel: '',
    ctaUrl: ''
  });

  useEffect(() => {
    if (openCreateModalOnLoad) {
      resetForm();
      if (initialTargetType) {
         setFormData(prev => ({
            ...prev,
            targetType: initialTargetType,
            targetValue: initialTargetValue || ''
         }));
      }
      setIsModalOpen(true);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
        setLoading(true);
        await Promise.all([
          fetchNotifications(currentPage, itemsPerPage),
          fetchCustomers()
        ]);
        setLoading(false);
    };
    load();
  }, [fetchNotifications, fetchCustomers, currentPage, itemsPerPage]);

  const canManage = hasPermission('MANAGE_NOTIFICATIONS') || hasPermission('FULL_ACCESS'); 
  const canSendToStaff = hasPermission('SEND_STAFF_NOTIFICATION') || canManage;
  const isStaff = !canManage;

  const handleSubmit = async (e: React.FormEvent, status: 'DRAFT' | 'SENT' | 'SCHEDULED') => {
    e.preventDefault();
    
    // Validation for Title and Content
    if (!formData.title.trim()) {
      alert('Vui lòng nhập tiêu đề thông báo');
      return;
    }
    if (!formData.content.trim()) {
      alert('Vui lòng nhập nội dung thông báo');
      return;
    }
    if (formData.content.trim().length < 50) {
      alert('Nội dung thông báo phải có tối thiểu 50 ký tự');
      return;
    }

    // Validation for schedule
    if (status === 'SCHEDULED') {
        if (!formData.schedule) {
            alert('Vui lòng chọn thời gian hẹn lịch');
            return;
        }
        if (new Date(formData.schedule).getTime() <= new Date().getTime()) {
            alert('Thời gian hẹn lịch phải là thời gian trong tương lai');
            return;
        }
    }

    // Validation for Staff
    if (isStaff) {
      if (formData.targetType === 'staff' && !canSendToStaff) {
         alert('Bạn không có quyền gửi thông báo cho nhân sự');
         return;
      }
      
      if (formData.targetType !== 'customer_phone' && formData.targetType !== 'staff') {
        alert('Bạn chỉ có quyền gửi thông báo cho khách hàng cụ thể hoặc toàn bộ nhân sự (nếu được phép)');
        return;
      }

      const inputPhones = formData.targetValue.split(',').map(s => s.trim()).filter(Boolean);
      if (inputPhones.length === 0) {
        alert('Vui lòng nhập số điện thoại khách hàng');
        return;
      }

      const myCustomers = customers.filter(c => c.assignedStaffId === user?.id);
      const myCustomerPhones = myCustomers.map(c => c.phone);
      
      const invalidPhones = inputPhones.filter(p => !myCustomerPhones.includes(p));
      
      if (invalidPhones.length > 0) {
        alert(`Các số điện thoại sau không thuộc khách hàng bạn phụ trách: ${invalidPhones.join(', ')}`);
        return;
      }
      
      if (status !== 'DRAFT') {
          // Should not happen if UI is correct, but double check
          alert('Nhân viên chỉ được phép tạo bản nháp.');
          return;
      }
    }

    if (status === 'SENT') {
      if (!window.confirm('Bạn có chắc chắn muốn gửi thông báo này ngay bây giờ?')) {
        return;
      }
    }

    const payload = {
      title: formData.title,
      content: formData.content,
      type: formData.type,
      target: {
        type: formData.targetType,
        value: formData.targetType === 'customer_phone' ? formData.targetValue.split(',').map(s => s.trim()) : 
               formData.targetValue
      },
      schedule: status === 'SCHEDULED' ? formData.schedule : '',
      cta: formData.ctaLabel ? {
        label: formData.ctaLabel,
        url: formData.ctaUrl
      } : undefined,
      status: status
    };

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateNotification(editingId, payload);
        alert('Cập nhật thông báo thành công');
      } else {
        await addNotification(payload);
        alert('Tạo thông báo mới thành công');
      }
      setIsModalOpen(false);
      resetForm();
      // Refresh list
      fetchNotifications(currentPage, itemsPerPage);
    } catch (error) {
      alert('Có lỗi xảy ra: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendNow = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn gửi thông báo này ngay bây giờ?')) return;
    try {
      await updateNotification(id, { status: 'SENT' });
      alert('Đã gửi thông báo thành công');
      fetchNotifications(currentPage, itemsPerPage);
    } catch (error) {
      alert('Gửi thất bại');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa thông báo này?')) return;
    try {
      await deleteNotification(id);
      fetchNotifications(currentPage, itemsPerPage);
    } catch (error) {
      alert('Xóa thất bại');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      type: 'system_maintenance',
      targetType: isStaff ? 'customer_phone' : 'area',
      targetValue: isStaff ? '' : AREAS[0],
      schedule: '',
      ctaLabel: '',
      ctaUrl: ''
    });
    setSendMode('schedule');
    setEditingId(null);
  };

  const openEditModal = (notif: Notification) => {
    setEditingId(notif.id);
    setSendMode(notif.scheduledAt ? 'schedule' : 'now');
    setFormData({
      title: notif.title,
      content: notif.content,
      type: notif.type,
      targetType: notif.target.type,
      targetValue: Array.isArray(notif.target.value) ? notif.target.value.join(', ') : (notif.target.value || ''),
      schedule: notif.scheduledAt ? new Date(notif.scheduledAt).toISOString().slice(0, 16) : '',
      ctaLabel: notif.cta?.label || '',
      ctaUrl: notif.cta?.url || ''
    });
    setIsModalOpen(true);
  };

  // Client-side filtering removed. Backend handles filtering.
  const filteredNotifications = notifications;

  const getIcon = (type: string) => {
    switch (type) {
      case 'system_maintenance': return <Settings className="text-gray-500" size={20} />;
      case 'knowledge_share': return <BookOpen className="text-blue-500" size={20} />;
      case 'marketing': return <Megaphone className="text-purple-500" size={20} />;
      case 'maintenance_warranty': return <Settings className="text-primary" size={20} />;
      default: return <Info className="text-gray-500" size={20} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT': return <span className="px-2 py-1 bg-success/10 text-success rounded-full text-xs font-medium">Đã gửi</span>;
      case 'SCHEDULED': return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Đã hẹn lịch</span>;
      case 'DISABLED': return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">Đã tắt</span>;
      case 'DRAFT': return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium border border-gray-300">Nháp</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quản lý thông báo tới khách hàng</h2>
          <p className="text-gray-500 text-sm">Quản lý và gửi thông báo đến người dùng</p>
        </div>
        {(canManage) && (
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90 flex items-center gap-2 shadow-sm"
          >
            <Plus size={18} /> Tạo thông báo mới
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 w-full items-center">
          <div className="relative flex-1 md:w-64 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Tìm theo tiêu đề, nội dung, mã..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="SENT">Đã gửi</option>
              <option value="SCHEDULED">Đã hẹn lịch</option>
              <option value="DRAFT">Nháp</option>
            </select>
          </div>
          
          <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">Tất cả loại</option>
              {NOTIFICATION_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <select 
              value={filterTarget}
              onChange={(e) => setFilterTarget(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="everything">Tất cả đối tượng</option>
              {TARGET_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">Từ:</span>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">Đến:</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
             </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Thông báo</th>
                <th className="px-6 py-4">Đối tượng</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Thời gian gửi</th>
                <th className="px-6 py-4">Thống kê</th>
                {canManage && <th className="px-6 py-4 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                 <tr><td colSpan={6} className="text-center py-8 text-gray-500">Đang tải dữ liệu...</td></tr>
              ) : filteredNotifications.length === 0 ? (
                 <tr><td colSpan={6} className="text-center py-8 text-gray-500">Không có thông báo nào</td></tr>
              ) : (
                filteredNotifications.map((notif) => (
                  <tr key={notif.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">{getIcon(notif.type)}</div>
                        <div>
                          <div className="font-medium text-gray-900">{notif.title}</div>
                          <div className="text-xs text-gray-500 mt-1 line-clamp-1">{notif.content}</div>
                          <div className="text-xs text-gray-400 mt-1">Mã: {notif.code || notif.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        {notif.target.type === 'area' && <MapPin size={14} />}
                        {notif.target.type === 'crop' && <Leaf size={14} />}
                        {notif.target.type === 'rank' && <Award size={14} />}
                        {notif.target.type === 'customer_phone' && <Phone size={14} />}
                        {notif.target.type === 'all' && <Users size={14} />}
                        <span className="capitalize">
                           {notif.target.type === 'area' ? `Khu vực: ${notif.target.value}` :
                            notif.target.type === 'crop' ? `Cây trồng: ${notif.target.value}` :
                            notif.target.type === 'rank' ? `Thứ hạng: ${notif.target.value}` :
                            notif.target.type === 'customer_phone' ? `SĐT: ${Array.isArray(notif.target.value) ? notif.target.value.join(', ') : notif.target.value}` :
                            notif.target.type === 'staff' ? 'Toàn bộ nhân sự' :
                            'Tất cả người dùng'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(notif.status)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
{notif.sentAt ? formatDateTime(notif.sentAt) :
                       notif.scheduledAt ? <span className="text-blue-600">{formatDateTime(notif.scheduledAt)}</span> : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500">
                        <div>Đã gửi: {notif.stats?.sent || 0}</div>
                        <div>Đã xem: {notif.stats?.read || 0}</div>
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(notif.status === 'DRAFT' || notif.status === 'SCHEDULED') && notif.type !== 'maintenance_warranty' && (
                             <>
                             {/* Show Send button only if not staff */}
                             {!isStaff && (
                               <button 
                                 onClick={() => handleSendNow(notif.id)} 
                                 className="p-1 hover:bg-gray-100 rounded text-green-600"
                                 title="Gửi ngay"
                               >
                                 <Send size={16} />
                               </button>
                             )}
                             
                             {/* Show Edit/Delete only if authorized (Staff can only edit their own) */}
                             {(!isStaff || (isStaff && notif.createdBy === user?.id)) && (
                               <>
                                <button onClick={() => openEditModal(notif)} className="p-1 hover:bg-gray-100 rounded text-blue-600" title="Chỉnh sửa">
                                  <Edit size={16} />
                                </button>
                                <button onClick={() => handleDelete(notif.id)} className="p-1 hover:bg-gray-100 rounded text-red-600" title="Xóa">
                                  <Trash2 size={16} />
                                </button>
                               </>
                             )}
                             </>
                          )}
                          {(notif.status === 'SENT' || notif.type === 'maintenance_warranty') && (
                              <span className="text-xs text-gray-400 italic">Không thể thao tác</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col divide-y divide-gray-100">
          {loading ? (
             <div className="text-center py-8 text-gray-500">Đang tải dữ liệu...</div>
          ) : filteredNotifications.length === 0 ? (
             <div className="text-center py-8 text-gray-500">Không có thông báo nào</div>
          ) : (
            filteredNotifications.map((notif) => (
              <div key={notif.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                     <div className="mt-1">{getIcon(notif.type)}</div>
                     <div>
                       <div className="font-medium text-gray-900">{notif.title}</div>
                       <div className="text-xs text-gray-400 mt-1">Mã: {notif.code || notif.id}</div>
                     </div>
                  </div>
                  <div>{getStatusBadge(notif.status)}</div>
                </div>
                
                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    {notif.content}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                        {notif.target.type === 'area' && <MapPin size={14} />}
                        {notif.target.type === 'crop' && <Leaf size={14} />}
                        {notif.target.type === 'rank' && <Award size={14} />}
                        {notif.target.type === 'customer_phone' && <Phone size={14} />}
                        {notif.target.type === 'all' && <Users size={14} />}
                        <span className="capitalize">
                           {notif.target.type === 'area' ? notif.target.value :
                            notif.target.type === 'crop' ? notif.target.value :
                            notif.target.type === 'rank' ? notif.target.value :
                            notif.target.type === 'customer_phone' ? (Array.isArray(notif.target.value) ? notif.target.value.join(', ') : notif.target.value) :
                            'Tất cả'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Clock size={14} />
{notif.sentAt ? formatDateTime(notif.sentAt) :
                       notif.scheduledAt ? <span className="text-blue-600">{formatDateTime(notif.scheduledAt)}</span> : '-'}
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <div className="text-xs text-gray-500 flex gap-3">
                        <span>Đã gửi: <b>{notif.stats?.sent || 0}</b></span>
                        <span>Đã xem: <b>{notif.stats?.read || 0}</b></span>
                    </div>
                    
                    {canManage && (
                        <div className="flex items-center gap-2">
                          {(notif.status === 'DRAFT' || notif.status === 'SCHEDULED') && notif.type !== 'maintenance_warranty' && (
                             <>
                             {!isStaff && (
                               <button 
                                 onClick={() => handleSendNow(notif.id)} 
                                 className="p-2 bg-green-50 text-green-600 rounded-lg"
                                 title="Gửi ngay"
                               >
                                 <Send size={16} />
                               </button>
                             )}
                             
                             {(!isStaff || (isStaff && notif.createdBy === user?.id)) && (
                               <>
                                <button onClick={() => openEditModal(notif)} className="p-2 bg-blue-50 text-blue-600 rounded-lg" title="Chỉnh sửa">
                                  <Edit size={16} />
                                </button>
                                <button onClick={() => handleDelete(notif.id)} className="p-2 bg-red-50 text-red-600 rounded-lg" title="Xóa">
                                  <Trash2 size={16} />
                                </button>
                               </>
                             )}
                             </>
                          )}
                        </div>
                    )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Hiển thị</span>
                <select 
                    value={itemsPerPage}
                    onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1); // Reset to page 1
                    }}
                    className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={75}>75</option>
                </select>
                <span className="text-sm text-gray-500">dòng mỗi trang</span>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 mr-4">
                    Trang {notificationPagination.page} / {notificationPagination.totalPages} (Tổng {notificationPagination.total})
                </span>
                <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft size={20} />
                </button>
                <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, notificationPagination.totalPages))}
                    disabled={currentPage === notificationPagination.totalPages || notificationPagination.totalPages === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Cập nhật thông báo' : 'Tạo thông báo mới'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <form className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại thông báo</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {CREATE_NOTIFICATION_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đối tượng nhận</label>
                  <select
                    value={formData.targetType}
                    disabled={isStaff}
                    onChange={(e) => {
                       const newType = e.target.value as any;
                       let newValue = '';
                       if (newType === 'area') newValue = AREAS[0];
                       if (newType === 'crop') newValue = CROPS[0];
                       if (newType === 'rank') newValue = RANKS[0];
                       
                       setFormData({...formData, targetType: newType, targetValue: newValue});
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-100"
                  >
                    {TARGET_TYPES.filter(t => {
                       if (t.value === 'staff') return canSendToStaff;
                       if (isStaff) return t.value === 'customer_phone';
                       return true;
                    }).map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target Value Input */}
              <div>
                 {formData.targetType === 'area' && (
                   <select 
                     value={formData.targetValue}
                     onChange={(e) => setFormData({...formData, targetValue: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                   >
                     {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                   </select>
                 )}
                 
                 {formData.targetType === 'crop' && (
                   <select 
                     value={formData.targetValue}
                     onChange={(e) => setFormData({...formData, targetValue: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                   >
                     {CROPS.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 )}

                 {formData.targetType === 'rank' && (
                   <select 
                     value={formData.targetValue}
                     onChange={(e) => setFormData({...formData, targetValue: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                   >
                     {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                   </select>
                 )}

                 {formData.targetType === 'customer_phone' && (
                   <div className="space-y-1">
                     <input
                       type="text"
                       value={formData.targetValue}
                       onChange={(e) => setFormData({...formData, targetValue: e.target.value})}
                       placeholder="Nhập số điện thoại (phân cách bằng dấu phẩy)"
                       className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                     />
                     <p className="text-xs text-gray-500">Ví dụ: 0912345678, 0987654321</p>
                   </div>
                 )}
                 
                 {formData.targetType === 'all' && (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                        Thông báo sẽ được gửi đến tất cả người dùng trong hệ thống.
                    </div>
                 )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              <div className="border-t border-gray-100 pt-4 mt-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Thời gian gửi</label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="sendMode"
                      checked={sendMode === 'schedule'}
                      onChange={() => setSendMode('schedule')}
                      className="w-4 h-4 text-primary focus:ring-primary/50"
                    />
                    <span className="text-sm text-gray-700">Hẹn giờ gửi</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="sendMode"
                      checked={sendMode === 'now'}
                      onChange={() => setSendMode('now')}
                      className="w-4 h-4 text-primary focus:ring-primary/50"
                    />
                    <span className="text-sm text-gray-700">Gửi ngay</span>
                  </label>
                </div>

                {sendMode === 'schedule' && (
                  <div className="max-w-xs">
                    <input
                      type="datetime-local"
                      value={formData.schedule}
                      onChange={(e) => setFormData({...formData, schedule: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required={sendMode === 'schedule'}
                    />
                    <p className="text-xs text-gray-500 mt-1">Chọn thời gian để hệ thống tự động gửi thông báo</p>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Send size={16} /> Call to Action (Tùy chọn)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Nhãn nút (VD: Xem ngay)</label>
                        <input
                        type="text"
                        value={formData.ctaLabel}
                        onChange={(e) => setFormData({...formData, ctaLabel: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Đường dẫn (URL)</label>
                        <input
                        type="text"
                        value={formData.ctaUrl}
                        onChange={(e) => setFormData({...formData, ctaUrl: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        placeholder="https://..."
                        />
                    </div>
                  </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hủy
                </button>
                
                {/* Save Draft Button - Always visible */}
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, 'DRAFT')}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText size={18} /> {isSubmitting ? 'Đang lưu...' : 'Lưu nháp'}
                </button>

                {/* Send Button - Hidden for Staff, or specific logic */}
                {!isStaff && (
                    <button
                    type="button"
                    onClick={(e) => handleSubmit(e, sendMode === 'schedule' ? 'SCHEDULED' : 'SENT')}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                    <Send size={18} /> {isSubmitting ? 'Đang xử lý...' : (sendMode === 'schedule' ? 'Tạo thông báo' : 'Gửi ngay')}
                    </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationManager;
