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
  warehouseId?: string;
}

export interface CreateOrderOutsideSystemData {
  productName: string;
  productQuantity?: number;
  productWeight?: number;  // gram
  productPrice?: number;  // COD
  note?: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverProvince: string;
  receiverDistrict: string;
  receiverWard: string;
  /** ID địa chỉ VTP (bắt buộc khi pushToVTP) */
  receiverProvinceId?: number;
  receiverDistrictId?: number;
  receiverWardId?: number;
  pushToVTP?: boolean;
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

  createOrderOutsideSystem: async (data: CreateOrderOutsideSystemData): Promise<Order> => {
    const response = await apiClient.post('/orders/outside-system', data);
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

  pushToViettelPost: async (id: string, orderDate: string): Promise<{ message: string; trackingNumber: string; order: Order }> => {
    const response = await apiClient.post(`/orders/${id}/${orderDate}/push-viettel-post`, {});
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
  }
};
