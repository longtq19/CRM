import { apiClient } from './client';
import type { Order, OrderStats } from '../types';

export type { Order, OrderStats };

export interface OrdersResponse {
  data: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderFilters {
  page?: number;
  limit?: number;
  search?: string;
  orderStatus?: string;
  shippingStatus?: string;
  customerId?: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateOrderData {
  customerId?: string;
  items: { productId: string; quantity: number }[];
  discount?: number;
  note?: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverProvince?: string;
  receiverDistrict?: string;
  receiverWard?: string;
  receiverProvinceId?: number;
  receiverDistrictId?: number;
  receiverWardId?: number;
  /** Kho gửi — dùng khi đẩy Viettel Post (ưu tiên địa chỉ kho) */
  warehouseId?: string;
}

export interface UpdateOrderData {
  orderStatus?: string;
  paymentStatus?: string;
  note?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  receiverProvince?: string;
  receiverDistrict?: string;
  receiverWard?: string;
}

export const orderApi = {
  getOrders: async (filters: OrderFilters = {}): Promise<OrdersResponse> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    const response = await apiClient.get(`/orders?${params.toString()}`);
    return response as OrdersResponse;
  },

  getOrderById: async (id: string, orderDate: string): Promise<Order> => {
    const response = await apiClient.get(`/orders/${id}/${orderDate}`);
    return response as Order;
  },

  createOrder: async (data: CreateOrderData): Promise<Order> => {
    const response = await apiClient.post('/orders', data);
    return response as Order;
  },

  updateOrder: async (id: string, orderDate: string, data: UpdateOrderData): Promise<Order> => {
    const response = await apiClient.put(`/orders/${id}/${orderDate}`, data);
    return response as Order;
  },

  confirmOrder: async (id: string, orderDate: string): Promise<Order> => {
    const response = await apiClient.post(`/orders/${id}/${orderDate}/confirm`, {});
    return response as Order;
  },

  /** Chia xác nhận hàng loạt đơn chờ xác nhận cho NV vận đơn (quyền ASSIGN_SHIPPING_DAILY_QUOTA). Chỉ hỗ trợ mode even (chia đều). */
  distributePendingConfirm: async (body: {
    mode: 'even';
    employeeIds?: string[];
  }): Promise<{
    ok: boolean;
    mode: string;
    updated: number;
    byEmployee: Array<{ employeeId: string; code: string; fullName: string; count: number }>;
  }> => {
    return apiClient.post('/orders/distribute-pending-confirm', body) as Promise<{
      ok: boolean;
      mode: string;
      updated: number;
      byEmployee: Array<{ employeeId: string; code: string; fullName: string; count: number }>;
    }>;
  },

  pushToViettelPost: async (
    id: string,
    orderDate: string,
    body?: { warehouseId?: string }
  ): Promise<{ message: string; trackingNumber: string; order: Order }> => {
    const response = await apiClient.post(`/orders/${id}/${orderDate}/push-viettel-post`, body || {});
    return response as { message: string; trackingNumber: string; order: Order };
  },

  /** Hủy vận đơn đã tạo trên Viettel Post (UpdateOrder TYPE=4). Body: { note?: string } */
  cancelViettelPost: async (id: string, orderDate: string, body?: { note?: string }): Promise<{ message: string; order: Order }> => {
    const response = await apiClient.post(`/orders/${id}/${orderDate}/cancel-viettel-post`, body || {});
    return response as { message: string; order: Order };
  },

  getShippingStatus: async (id: string, orderDate: string): Promise<{
    shippingStatus: string;
    trackingNumber: string;
    shippingProvider: string;
    logs: any[];
  }> => {
    const response = await apiClient.get(`/orders/${id}/${orderDate}/shipping-status`);
    return response as any;
  },

  updateShippingStatus: async (id: string, orderDate: string, status: string, note?: string): Promise<Order> => {
    const response = await apiClient.put(`/orders/${id}/${orderDate}/shipping-status`, { status, note });
    return response as Order;
  },

  getStats: async (startDate?: string, endDate?: string): Promise<OrderStats> => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const response = await apiClient.get(`/orders/stats?${params.toString()}`);
    return response as OrderStats;
  },

  /** Chỉ tiêu xử lý vận đơn theo ngày (NV có MANAGE_SHIPPING) */
  getMyShippingDailyQuota: async (workDate?: string): Promise<{
    workDate: string;
    targetCount: number;
    confirmedCount: number;
    declinedCount: number;
    doneTotal: number;
    hasQuotaRow: boolean;
  }> => {
    const q = workDate ? `?workDate=${encodeURIComponent(workDate)}` : '';
    const response = await apiClient.get(`/shipping/daily-quotas/me${q}`);
    return response as any;
  },

  getShippingAssignableEmployees: async (): Promise<
    Array<{ id: string; fullName: string; code: string }>
  > => {
    const response = await apiClient.get('/shipping/daily-quotas/assignable-employees');
    return Array.isArray(response) ? response : [];
  },

  listShippingDailyQuotas: async (workDate?: string): Promise<{
    workDate: string;
    items: Array<{
      id: string;
      employeeId: string;
      targetCount: number;
      employee: { id: string; fullName: string; code: string };
      assignedBy: { id: string; fullName: string; code: string };
      confirmedCount: number;
      declinedCount: number;
      doneTotal: number;
    }>;
  }> => {
    const q = workDate ? `?workDate=${encodeURIComponent(workDate)}` : '';
    const response = await apiClient.get(`/shipping/daily-quotas${q}`);
    return response as any;
  },

  upsertShippingDailyQuotas: async (body: {
    workDate: string;
    items: Array<{ employeeId: string; targetCount: number }>;
  }): Promise<{ ok: boolean; workDate: string; updated: number }> => {
    return apiClient.put('/shipping/daily-quotas', body) as Promise<any>;
  },

  printViettelPost: async (
    trackingNumber?: string, 
    trackingNumbers?: string[],
    options?: { printType?: string; showPostage?: boolean }
  ): Promise<{
    error: boolean;
    message: string;
    data: { MESS_HTTP: string; MONITOR_TOKEN: string; PRINT_URL: string };
  }> => {
    const response = await apiClient.post('/vtp/print-order', { 
      orderCode: trackingNumber,
      orderCodes: trackingNumbers,
      ...options
    });
    return response as any;
  },

  deleteOrder: async (id: string, orderDate: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/orders/${id}/${orderDate}`);
    return response as { message: string };
  },
};
