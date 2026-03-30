import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { Toast } from '../components/ToastNotification';

export interface UserNotification {
  id: string;
  employeeId: string;
  title: string;
  content: string;
  type: string;
  link?: string;
  metadata?: any;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

interface NotificationState {
  notifications: UserNotification[];
  unreadCount: number;
  toasts: Toast[];
  isLoading: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  // Actions
  fetchNotifications: (page?: number, unreadOnly?: boolean, limit?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllRead: () => Promise<void>;

  // Toast actions
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  
  // Socket event handler
  handleNewLead: (data: any) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  toasts: [],
  isLoading: false,
  pagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  },

  fetchNotifications: async (page = 1, unreadOnly = false, limit?: number) => {
    try {
      set({ isLoading: true });
      const currentLimit = limit ?? get().pagination.limit;
      const data = await apiClient.get(`/user-notifications?page=${page}&limit=${currentLimit}&unreadOnly=${unreadOnly}`);
      set({
        notifications: data.notifications,
        unreadCount: data.unreadCount,
        pagination: data.pagination,
        isLoading: false
      });
    } catch (error) {
      console.error('Fetch notifications error:', error);
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const data = await apiClient.get('/user-notifications/unread-count');
      set({ unreadCount: data.unreadCount });
    } catch (error) {
      console.error('Fetch unread count error:', error);
    }
  },

  markAsRead: async (id: string) => {
    try {
      await apiClient.put(`/user-notifications/${id}/read`, {});
      set(state => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1)
      }));
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await apiClient.put('/user-notifications/mark-all-read', {});
      set(state => ({
        notifications: state.notifications.map(n => ({
          ...n,
          isRead: true,
          readAt: new Date().toISOString()
        })),
        unreadCount: 0
      }));
    } catch (error) {
      console.error('Mark all as read error:', error);
    }
  },

  deleteNotification: async (id: string) => {
    try {
      await apiClient.delete(`/user-notifications/${id}`);
      set(state => ({
        notifications: state.notifications.filter(n => n.id !== id),
        pagination: {
          ...state.pagination,
          total: state.pagination.total - 1
        }
      }));
    } catch (error) {
      console.error('Delete notification error:', error);
    }
  },

  deleteAllRead: async () => {
    try {
      await apiClient.delete('/user-notifications/read');
      set(state => ({
        notifications: state.notifications.filter(n => !n.isRead),
        pagination: {
          ...state.pagination,
          total: state.notifications.filter(n => !n.isRead).length
        }
      }));
    } catch (error) {
      console.error('Delete all read error:', error);
    }
  },

  addToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    set(state => ({
      toasts: [...state.toasts, { ...toast, id }]
    }));
  },

  removeToast: (id: string) => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id)
    }));
  },

  handleNewLead: (data: any) => {
    // Thêm toast notification
    get().addToast({
      type: 'new_lead',
      title: data.title || 'Lead mới từ Marketing',
      message: data.content || data.message || `${data.customerName} - ${data.customerPhone}`,
      link: data.link || '/data-pool',
      duration: 8000
    });

    // Tăng số thông báo chưa đọc
    set(state => ({
      unreadCount: state.unreadCount + 1
    }));

    // Thêm vào đầu danh sách notifications nếu đang hiển thị
    if (data.id) {
      const newNotification: UserNotification = {
        id: data.id,
        employeeId: '',
        title: data.title || 'Lead mới từ Marketing',
        content: data.content || data.message,
        type: 'NEW_LEAD',
        link: data.link || '/data-pool',
        metadata: {
          customerId: data.customerId,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          campaignId: data.campaignId,
          campaignName: data.campaignName
        },
        isRead: false,
        createdAt: data.timestamp || new Date().toISOString()
      };

      set(state => ({
        notifications: [newNotification, ...state.notifications]
      }));
    }
  }
}));
