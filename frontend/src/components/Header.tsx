import { useAuthStore } from '../context/useAuthStore';
import { LogOut, Bell, Menu, MessageSquare, KeyRound, Check, AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { translate } from '../utils/dictionary';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import { apiClient } from '../api/client';
import { useChat } from '../context/ChatContext';
import ChatListDropdown from './chat/ChatListDropdown';
import EmployeeDetailModal from './EmployeeDetailModal';
import { useNotificationStore } from '../context/useNotificationStore';
import { enablePushNotifications } from '../utils/pushNotification';
import clsx from 'clsx';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { formatDateTime } from '../utils/format';

interface HeaderProps {
  toggleSidebar: () => void;
  isSidebarCollapsed?: boolean;
}

const Header = ({ toggleSidebar, isSidebarCollapsed = false }: HeaderProps) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { isChatListOpen, toggleChatList, socket } = useChat();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  /** Làm mới ảnh header khi file avatar ghi đè cùng URL (`/uploads/avatars/<id>.jpg`). */
  const [headerAvatarNonce, setHeaderAvatarNonce] = useState(0);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, message: '', type: 'success' });

  // Notification state
  const { 
    unreadCount: notificationUnreadCount, 
    notifications,
    fetchUnreadCount, 
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    handleNewLead,
    addToast
  } = useNotificationStore();
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    try {
      const result = await enablePushNotifications();
      addToast({
        type: result.success ? 'success' : 'error',
        title: result.success ? 'Đã bật thông báo' : 'Không bật được',
        message: result.message,
        duration: 5000
      });
    } finally {
      setPushEnabling(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      try {
        const res = await apiClient.get('/chat/unread');
        if (res && res.count !== undefined) {
          setUnreadCount(res.count);
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchUnread();

    const interval = setInterval(fetchUnread, 10000);
    return () => clearInterval(interval);
  }, [user]);

  // Listen for socket events to update unread count
  useEffect(() => {
    if (!socket || !user) return;

    const handleUpdate = () => {
        apiClient.get('/chat/unread').then(res => {
            if (res && res.count !== undefined) {
                setUnreadCount(res.count);
            }
        }).catch(console.error);
    };

    socket.on('new_message', handleUpdate);
    socket.on('message_read', handleUpdate);

    // Listen for new_lead event
    socket.on('new_lead', handleNewLead);

    const handleNotificationNew = () => {
      fetchUnreadCount();
    };
    socket.on('notification:new', handleNotificationNew);

    return () => {
        socket.off('new_message', handleUpdate);
        socket.off('message_read', handleUpdate);
        socket.off('new_lead', handleNewLead);
        socket.off('notification:new', handleNotificationNew);
    };
  }, [socket, user, handleNewLead, fetchUnreadCount]);

  // Fetch notification unread count on mount
  useEffect(() => {
    if (user) {
      fetchUnreadCount();
    }
  }, [user, fetchUnreadCount]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotificationDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleNotificationDropdown = () => {
    if (!showNotificationDropdown) {
      fetchNotifications(1, false);
    }
    setShowNotificationDropdown(!showNotificationDropdown);
  };

  const handleNotificationClick = (notif: any) => {
    if (!notif.isRead) {
      markAsRead(notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
      setShowNotificationDropdown(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      await logout();
      navigate('/login');
    }
  };

  const openChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangeError('');
    setChangeSuccess('');
    setShowChangePassword(true);
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setChangeError('');
    setChangeSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setChangeError('Vui lòng nhập đầy đủ các trường.');
      return;
    }

    if (newPassword.length < 6) {
      setChangeError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangeError('Mật khẩu mới và nhập lại không khớp.');
      return;
    }

    try {
      setSaving(true);
      const res = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword
      });
      if (res && res.success) {
        setShowChangePassword(false);
        setNotification({
          show: true,
          message: res.message || 'Đổi mật khẩu thành công.',
          type: 'success'
        });
        setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);

        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setChangeError(res?.message || 'Đổi mật khẩu thất bại.');
      }
    } catch (error: any) {
      setChangeError(error.message || 'Lỗi kết nối server.');
    } finally {
      setSaving(false);
    }
  };

  const getAvatarUrl = () => {
    if (!user) return '';
    if (user.avatar) {
      const base = resolveUploadUrl(user.avatar);
      if (headerAvatarNonce === 0) return base;
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}v=${headerAvatarNonce}`;
    }

    return getUiAvatarFallbackUrl(user.name);
  };

  if (!user) return null;

  return (
    <>
      <header className={clsx(
        "h-16 bg-white border-b border-gray-200 fixed top-0 right-0 left-0 z-20 px-4 md:px-6 flex items-center justify-between md:justify-end transition-all duration-300",
        isSidebarCollapsed ? "md:left-20" : "md:left-64"
      )}>
        <button
          className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          onClick={toggleSidebar}
        >
          <Menu size={24} />
        </button>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="relative">
            <button
              onClick={toggleChatList}
              className={`p-2 transition-colors ${isChatListOpen ? 'text-primary bg-blue-50 rounded-lg' : 'text-gray-400 hover:text-primary'}`}
              title="Tin nhắn"
            >
              <MessageSquare size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-white">
                  {unreadCount > 5 ? '5+' : unreadCount}
                </span>
              )}
            </button>
            {isChatListOpen && <ChatListDropdown onClose={toggleChatList} />}
          </div>

          <div className="relative" ref={notificationRef}>
            <button 
              onClick={toggleNotificationDropdown}
              className={clsx(
                "relative p-2 transition-colors",
                showNotificationDropdown ? 'text-primary bg-blue-50 rounded-lg' : 'text-gray-400 hover:text-primary'
              )}
              title="Thông báo"
            >
              <Bell size={20} />
              {notificationUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-white">
                  {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotificationDropdown && (
              <div className="fixed top-16 left-2 right-2 mt-1 md:absolute md:top-full md:right-0 md:left-auto md:mt-2 md:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-[9999]">
                <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between bg-gray-50 gap-2">
                  <h3 className="font-semibold text-gray-900">Thông báo</h3>
                  <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <button
                      onClick={handleEnablePush}
                      disabled={pushEnabling || !('Notification' in window)}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                      title="Nhận thông báo lead mới kể cả khi màn hình khóa"
                    >
                      {pushEnabling ? 'Đang bật...' : 'Bật thông báo khi khóa màn hình'}
                    </button>
                    {notificationUnreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="text-xs text-primary hover:underline"
                      >
                        Đánh dấu tất cả đã đọc
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowNotificationDropdown(false);
                        navigate('/notifications');
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 hidden md:inline"
                    >
                      Xem tất cả
                    </button>
                  </div>
                </div>
                
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Bell size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Không có thông báo nào</p>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={clsx(
                          'px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors',
                          !notif.isRead && 'bg-blue-50/50'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={clsx(
                            'w-2 h-2 rounded-full mt-2 flex-shrink-0',
                            notif.isRead ? 'bg-gray-300' : 'bg-primary'
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className={clsx(
                              'text-sm',
                              notif.isRead ? 'text-gray-600' : 'text-gray-900 font-medium'
                            )}>
                              {notif.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {notif.content}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDateTime(notif.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                    <button
                      onClick={() => {
                        setShowNotificationDropdown(false);
                        navigate('/notifications');
                      }}
                      className="w-full text-center text-sm text-primary hover:underline py-1"
                    >
                      Xem tất cả thông báo →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="h-8 w-px bg-gray-200"></div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-sm font-medium text-secondary leading-tight">{user.name}</p>
              <p className="text-[11px] text-gray-500 capitalize">
                {translate(user.role)}
              </p>
            </div>
            
            <div 
              onClick={() => setShowProfile(true)}
              className="relative w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 cursor-pointer hover:border-primary transition-colors"
            >
              <img
                src={getAvatarUrl()}
                alt={user.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = getUiAvatarFallbackUrl(user.name);
                }}
              />
            </div>

            <button
              onClick={openChangePassword}
              className="ml-2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Đổi mật khẩu"
            >
              <KeyRound size={20} />
            </button>

            <button
              onClick={handleLogout}
              className="ml-1 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Đăng xuất"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {showProfile && user && (
        <EmployeeDetailModal 
          employeeId={user.id} 
          onClose={() => setShowProfile(false)} 
          onAvatarUpdated={() => setHeaderAvatarNonce(Date.now())}
        />
      )}

      {showChangePassword && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-secondary mb-1">Đổi mật khẩu</h2>
            <p className="text-xs text-secondary mb-4">
              Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.
            </p>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Mật khẩu mới</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Nhập lại mật khẩu mới</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                />
              </div>
              {changeError && (
                <p className="text-xs text-red-500">{changeError}</p>
              )}
              {changeSuccess && (
                <p className="text-xs text-green-600">{changeSuccess}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePassword(false)}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? 'Đang lưu...' : 'Lưu mật khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification.show && (
        <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-4 duration-300 ${
            notification.type === 'success' ? 'bg-success text-white' : 'bg-red-600 text-white'
        }`}>
            {notification.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
            <p className="font-medium">{notification.message}</p>
            <button onClick={() => setNotification(prev => ({ ...prev, show: false }))} className="ml-2 hover:opacity-70 text-white">
              <X size={16} />
            </button>
        </div>
      )}
    </>
  );
};

export default Header;
