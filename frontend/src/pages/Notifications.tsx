import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  RefreshCcw, 
  Loader,
  UserPlus,
  ShoppingCart,
  FileText,
  MessageSquare,
  AlertCircle,
  Package,
  Calendar,
  Megaphone,
  Truck,
  Filter,
  AlertTriangle,
  Info,
  CheckCircle
} from 'lucide-react';
import clsx from 'clsx';
import { useNotificationStore, type UserNotification } from '../context/useNotificationStore';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import { formatDate } from '../utils/format';

type NotificationCategory = 'all' | 'GENERAL' | 'URGENT' | 'INFO' | 'WARNING' | 'SUCCESS';
type NotificationType = 'all' | 'SYSTEM' | 'ORDER' | 'LEAVE' | 'CHAT' | 'MARKETING' | 'SALES' | 'INVENTORY' | 'SHIPPING';

const Notifications = () => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    pagination,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllRead
  } = useNotificationStore();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType>('all');

  useEffect(() => {
    fetchNotifications(1, filter === 'unread');
  }, [filter, fetchNotifications]);
  const handlePageChange = (page: number) => fetchNotifications(page, filter === 'unread');
  const handleLimitChange = (limit: number) => fetchNotifications(1, filter === 'unread', limit);

  const handleNotificationClick = (notif: UserNotification) => {
    if (!notif.isRead) {
      markAsRead(notif.id);
    }
    if (notif.link) {
      // Thông báo hợp đồng (HR): mở trang chỉnh sửa nhân sự và cuộn tới block Quản lý hợp đồng
      const isHrContractLink = notif.type === 'HR' && /^\/hr\/[^/]+\/edit$/.test(notif.link);
      navigate(notif.link, isHrContractLink ? { state: { scrollTo: 'contracts' } } : undefined);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'NEW_LEAD':
      case 'MARKETING':
        return <Megaphone className="w-5 h-5 text-pink-500" />;
      case 'NEW_ORDER':
      case 'ORDER':
      case 'ORDER_EDITED':
      case 'ORDER_EDIT_REQUEST':
        return <ShoppingCart className="w-5 h-5 text-green-500" />;
      case 'NEW_DOCUMENT':
        return <FileText className="w-5 h-5 text-blue-500" />;
      case 'NEW_MESSAGE':
      case 'CHAT':
        return <MessageSquare className="w-5 h-5 text-purple-500" />;
      case 'LEAVE':
        return <Calendar className="w-5 h-5 text-orange-500" />;
      case 'INVENTORY':
        return <Package className="w-5 h-5 text-amber-500" />;
      case 'SHIPPING':
        return <Truck className="w-5 h-5 text-cyan-500" />;
      case 'SALES':
        return <UserPlus className="w-5 h-5 text-indigo-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'URGENT':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'WARNING':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'SUCCESS':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'INFO':
        return <Info className="w-4 h-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getNotificationBgColor = (type: string, category: string, isRead: boolean) => {
    if (isRead) return 'bg-white';
    
    if (category === 'URGENT') return 'bg-red-50';
    if (category === 'WARNING') return 'bg-yellow-50';
    if (category === 'SUCCESS') return 'bg-green-50';
    
    switch (type) {
      case 'NEW_LEAD':
      case 'MARKETING':
        return 'bg-pink-50';
      case 'NEW_ORDER':
      case 'ORDER':
        return 'bg-green-50';
      case 'NEW_DOCUMENT':
        return 'bg-blue-50';
      case 'NEW_MESSAGE':
      case 'CHAT':
        return 'bg-purple-50';
      case 'LEAVE':
        return 'bg-orange-50';
      case 'INVENTORY':
        return 'bg-amber-50';
      case 'SHIPPING':
        return 'bg-cyan-50';
      default:
        return 'bg-gray-50';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return formatDate(dateString);
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(notif => {
    if (categoryFilter !== 'all' && (notif as any).category !== categoryFilter) return false;
    if (typeFilter !== 'all' && notif.type !== typeFilter) return false;
    return true;
  });

  const categories: { id: NotificationCategory; label: string; color: string }[] = [
    { id: 'all', label: 'Tất cả', color: 'gray' },
    { id: 'URGENT', label: 'Khẩn cấp', color: 'red' },
    { id: 'WARNING', label: 'Cảnh báo', color: 'yellow' },
    { id: 'INFO', label: 'Thông tin', color: 'blue' },
    { id: 'SUCCESS', label: 'Thành công', color: 'green' },
    { id: 'GENERAL', label: 'Chung', color: 'gray' }
  ];

  const types: { id: NotificationType; label: string }[] = [
    { id: 'all', label: 'Tất cả loại' },
    { id: 'SYSTEM', label: 'Hệ thống' },
    { id: 'ORDER', label: 'Đơn hàng' },
    { id: 'LEAVE', label: 'Nghỉ phép' },
    { id: 'CHAT', label: 'Tin nhắn' },
    { id: 'MARKETING', label: 'Marketing' },
    { id: 'SALES', label: 'Sales' },
    { id: 'INVENTORY', label: 'Tồn kho' },
    { id: 'SHIPPING', label: 'Vận chuyển' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thông báo</h1>
          <p className="text-gray-500 text-sm mt-1">
            Quản lý tất cả thông báo của bạn
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchNotifications(1, filter === 'unread')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {isLoading ? <Loader size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            Làm mới
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
            >
              <CheckCheck size={16} />
              Đánh dấu tất cả đã đọc
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <Bell size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Tổng thông báo</p>
            <p className="text-2xl font-bold">{pagination.total}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-lg">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Chưa đọc</p>
            <p className="text-2xl font-bold">{unreadCount}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Khẩn cấp</p>
            <p className="text-2xl font-bold">
              {notifications.filter(n => (n as any).category === 'URGENT' && !n.isRead).length}
            </p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <Check size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Đã đọc</p>
            <p className="text-2xl font-bold">{pagination.total - unreadCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Lọc:</span>
          </div>
          
          {/* Read/Unread filter */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setFilter('all')}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === 'all'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === 'unread'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Chưa đọc {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as NotificationCategory)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as NotificationType)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          {notifications.some(n => n.isRead) && (
            <button
              onClick={() => deleteAllRead()}
              className="ml-auto text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={14} />
              Xóa đã đọc
            </button>
          )}
        </div>
      </div>

      {/* Notification list */}
      <div className="card overflow-hidden">
        {isLoading && notifications.length === 0 ? (
          <div className="py-12 text-center">
            <Loader size={32} className="animate-spin mx-auto text-primary" />
            <p className="text-sm text-gray-500 mt-2">Đang tải...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-12 text-center">
            <Bell size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">
              {filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                className={clsx(
                  'p-4 cursor-pointer hover:bg-gray-50 transition-colors',
                  getNotificationBgColor(notif.type, (notif as any).category || 'GENERAL', notif.isRead)
                )}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-2 bg-white rounded-lg shadow-sm">
                    {getNotificationIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={clsx(
                            'text-sm',
                            notif.isRead ? 'text-gray-700' : 'text-gray-900 font-semibold'
                          )}>
                            {notif.title}
                          </p>
                          {getCategoryIcon((notif as any).category || 'GENERAL')}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {notif.content}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-xs text-gray-400">
                            {formatTime(notif.createdAt)}
                          </p>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {types.find(t => t.id === notif.type)?.label || notif.type}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!notif.isRead && (
                          <span className="w-2 h-2 bg-primary rounded-full" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notif.id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa thông báo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {(pagination.totalPages > 1 || pagination.total > 0) && (
          <div className="px-4 py-3 border-t border-gray-100">
            <PaginationBar
              page={pagination.page}
              limit={normalizePageSize(pagination.limit)}
              total={pagination.total}
              totalPages={pagination.totalPages}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              itemLabel="thông báo"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
