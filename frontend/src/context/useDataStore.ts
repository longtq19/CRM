import { create } from 'zustand';
import type { Customer, SystemLog, User, InternalNote, Notification, CustomerStats } from '../types';
import { apiClient } from '../api/client';

interface DataState {
  customers: Customer[];
  customerStats: CustomerStats | null;
  systemLogs: SystemLog[];
  logPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  logUniqueUsers: string[];
  logUniqueObjects: string[];
  logUniqueActions: string[];
  internalNotes: InternalNote[];
  notifications: Notification[];
  notificationPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  users: User[];
  
  initData: () => Promise<void>;
  markNotificationAsRead: (id: string) => void;
  fetchSystemLogs: (params?: any) => Promise<void>;
  
  // Async actions with API calls
  fetchCustomers: () => Promise<void>;
  fetchCustomerStats: () => Promise<void>;
  addCustomer: (customer: Omit<Customer, 'id' | 'joinedDate'>) => Promise<void>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  
  fetchInternalNotes: () => Promise<void>;
  addInternalNote: (note: Omit<InternalNote, 'id'>) => Promise<void>;
  updateInternalNote: (id: string, note: Partial<InternalNote>) => Promise<void>;
  deleteInternalNote: (id: string) => Promise<void>;

  fetchNotifications: (page?: number, limit?: number, filters?: any) => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'stats' | 'code'>) => Promise<void>;
  updateNotification: (id: string, notification: Partial<Notification>) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => ({
  customers: [],
  customerStats: null,
  systemLogs: [],
  logPagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  },
  logUniqueUsers: [],
  logUniqueObjects: [],
  logUniqueActions: [],
  internalNotes: [],
  notifications: [],
  notificationPagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  },
  users: [],
  
  initData: async () => {
    // Fetch real data from backend
    await Promise.all([
        get().fetchCustomers(),
        get().fetchCustomerStats(),
        get().fetchSystemLogs(),
        get().fetchInternalNotes(),
        get().fetchNotifications()
    ]);
  },
  
  markNotificationAsRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => n.id === id ? { ...n, isRead: true } : n)
  })),
  
  fetchSystemLogs: async (params?: any) => {
      try {
          const query = params ? new URLSearchParams(params).toString() : '';
          const url = query ? `/logs?${query}` : '/logs';
          const data = await apiClient.get(url);
          if (data && data.logs) {
              set({ 
                  systemLogs: data.logs,
                  logPagination: data.pagination || { page: 1, limit: 25, total: data.logs.length, totalPages: 1 },
                  logUniqueUsers: data.uniqueUsers || [],
                  logUniqueObjects: data.uniqueObjects || [],
                  logUniqueActions: data.uniqueActions || []
              });
          }
      } catch (error) {
          console.error('Failed to fetch system logs:', error);
      }
  },
  
  // Customers
  fetchCustomers: async () => {
      try {
          const data = await apiClient.get('/customers');
          if (Array.isArray(data)) {
              set({ customers: data });
          }
      } catch (error) {
          console.error('Failed to fetch customers:', error);
      }
  },
  fetchCustomerStats: async () => {
      try {
          const stats = await apiClient.get('/customers/stats');
          if (stats) {
              set({ customerStats: stats });
          }
      } catch (error) {
          console.error('Failed to fetch customer stats:', error);
      }
  },
  addCustomer: async (customer) => {
      try {
          const newCustomer = await apiClient.post('/customers', customer);
          if (newCustomer) {
              set((state) => ({ customers: [...state.customers, newCustomer] }));
          }
      } catch (error) {
          console.error('Failed to add customer:', error);
          throw error;
      }
  },
  updateCustomer: async (id, customer) => {
      try {
          const updatedCustomer = await apiClient.put(`/customers/${id}`, customer);
          if (updatedCustomer) {
              set((state) => ({
                  customers: state.customers.map(c => c.id === id ? updatedCustomer : c)
              }));
          }
      } catch (error) {
          console.error('Failed to update customer:', error);
          throw error;
      }
  },
  deleteCustomer: async (id) => {
      try {
          await apiClient.delete(`/customers/${id}`);
          set((state) => ({ customers: state.customers.filter(c => c.id !== id) }));
      } catch (error) {
          console.error('Failed to delete customer:', error);
          throw error;
      }
  },

  // Internal Notes
  fetchInternalNotes: async () => {
      try {
          const data = await apiClient.get('/internal-notes');
          if (Array.isArray(data)) {
              set({ internalNotes: data });
          }
      } catch (error) {
          console.error('Failed to fetch internal notes:', error);
      }
  },
  addInternalNote: async (note) => {
      try {
          const newNote = await apiClient.post('/internal-notes', note);
          if (newNote) {
              set((state) => ({ internalNotes: [...state.internalNotes, newNote] }));
          }
      } catch (error) {
          console.error('Failed to add internal note:', error);
          throw error;
      }
  },
  deleteInternalNote: async (id) => {
      try {
          await apiClient.delete(`/internal-notes/${id}`);
          set((state) => ({ internalNotes: state.internalNotes.filter(n => n.id !== id) }));
      } catch (error) {
          console.error('Failed to delete internal note:', error);
          throw error;
      }
  },
  updateInternalNote: async (id, note) => {
      try {
          const updatedNote = await apiClient.put(`/internal-notes/${id}`, note);
          if (updatedNote) {
              set((state) => ({
                  internalNotes: state.internalNotes.map(n => n.id === id ? updatedNote : n)
              }));
          }
      } catch (error) {
          console.error('Failed to update internal note:', error);
          throw error;
      }
  },

  // Notifications
  fetchNotifications: async (page = 1, limit = 25, filters: any = {}) => {
      try {
          // Clean filters to remove undefined/empty values
          const cleanFilters: any = {};
          Object.keys(filters).forEach(key => {
              if (filters[key] !== undefined && filters[key] !== '' && filters[key] !== null) {
                  cleanFilters[key] = filters[key];
              }
          });

          const queryParams = new URLSearchParams({
              page: page.toString(),
              limit: limit.toString(),
              ...cleanFilters
          }).toString();

          const response: any = await apiClient.get(`/admin/notifications?${queryParams}`);
          
          // Check structure of response
          // If response is the object { data: [], pagination: {} }
          if (response && response.data) {
             set({ 
                 notifications: response.data,
                 notificationPagination: response.pagination
             });
          } else if (Array.isArray(response)) {
             // Fallback for old API style if any
             set({ notifications: response });
          }
      } catch (error) {
          console.error('Failed to fetch notifications:', error);
      }
  },
  addNotification: async (notification) => {
      try {
          const newNotification = await apiClient.post('/admin/notifications', notification);
          if (newNotification) {
              set((state) => ({ notifications: [...state.notifications, newNotification] }));
          }
      } catch (error) {
          console.error('Failed to add notification:', error);
          throw error;
      }
  },
  updateNotification: async (id, notification) => {
      try {
          const updatedNotification = await apiClient.put(`/admin/notifications/${id}`, notification);
          if (updatedNotification) {
              set((state) => ({
                  notifications: state.notifications.map(n => n.id === id ? updatedNotification : n)
              }));
          }
      } catch (error) {
          console.error('Failed to update notification:', error);
          throw error;
      }
  },
  deleteNotification: async (id) => {
      try {
          await apiClient.delete(`/admin/notifications/${id}`);
          set((state) => ({ notifications: state.notifications.filter(n => n.id !== id) }));
      } catch (error) {
          console.error('Failed to delete notification:', error);
          throw error;
      }
  },
}));
