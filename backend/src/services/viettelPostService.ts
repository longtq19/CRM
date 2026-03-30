import axios from 'axios';
import { prisma } from '../config/database';

interface ViettelPostConfig {
  apiUrl: string;
  username: string;
  password: string;
  token?: string;
}

interface CreateOrderParams {
  orderId: string;
  orderDate: Date;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  /** ID tỉnh/thành (VTP PROVINCE_ID) */
  senderProvince: number;
  /** ID quận/huyện (VTP DISTRICT_ID) */
  senderDistrict: number;
  /** ID phường/xã (VTP WARDS_ID) */
  senderWard: number;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverProvince: number;
  receiverDistrict: number;
  receiverWard: number;
  productName: string;
  productQuantity: number;
  productWeight: number;
  productPrice: number;
  moneyCollection: number;
  note?: string;
}

interface TrackingInfo {
  status: string;
  statusCode: string;
  description: string;
  location: string;
  timestamp: Date;
}

class ViettelPostService {
  private config: ViettelPostConfig;
  private token: string | null = null;

  constructor() {
    this.config = {
      apiUrl: process.env.VTP_API_URL || process.env.VIETTEL_POST_API_URL || 'https://partner.viettelpost.vn/v2',
      username: process.env.VTP_USERNAME || process.env.VIETTEL_POST_USERNAME || '',
      password: process.env.VTP_PASSWORD || process.env.VIETTEL_POST_PASSWORD || '',
    };
  }

  private async getToken(): Promise<string> {
    const envToken = process.env.VTP_TOKEN || process.env.VIETTEL_POST_TOKEN;
    if (envToken && envToken.trim()) {
      return envToken.trim();
    }
    if (this.token) {
      return this.token;
    }
    if (!this.config.username || !this.config.password) {
      throw new Error('Viettel Post credentials not configured. Cần VTP_TOKEN hoặc VTP_USERNAME+VTP_PASSWORD trong .env');
    }
    try {
      const response = await axios.post(`${this.config.apiUrl}/user/Login`, {
        USERNAME: this.config.username,
        PASSWORD: this.config.password,
      });
      if (response.data && response.data.data && response.data.data.token) {
        this.token = response.data.data.token;
        return this.token as string;
      }
      throw new Error('Failed to get Viettel Post token');
    } catch (error: any) {
      console.error('Viettel Post login error:', error.message);
      throw new Error('Không thể kết nối với Viettel Post');
    }
  }

  async createOrder(params: CreateOrderParams): Promise<{ trackingNumber: string; orderId: string }> {
    const token = await this.getToken();

    const orderData = {
      ORDER_NUMBER: params.orderId,
      GROUPADDRESS_ID: 0,
      CUS_ID: 0,
      DELIVERY_DATE: (() => { const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; })(),
      SENDER_FULLNAME: params.senderName,
      SENDER_ADDRESS: params.senderAddress,
      SENDER_PHONE: params.senderPhone,
      SENDER_EMAIL: '',
      SENDER_WARD: Number(params.senderWard),
      SENDER_DISTRICT: Number(params.senderDistrict),
      SENDER_PROVINCE: Number(params.senderProvince),
      RECEIVER_FULLNAME: params.receiverName,
      RECEIVER_ADDRESS: params.receiverAddress,
      RECEIVER_PHONE: params.receiverPhone,
      RECEIVER_EMAIL: '',
      RECEIVER_WARD: Number(params.receiverWard),
      RECEIVER_DISTRICT: Number(params.receiverDistrict),
      RECEIVER_PROVINCE: Number(params.receiverProvince),
      PRODUCT_NAME: params.productName,
      PRODUCT_DESCRIPTION: params.productName,
      PRODUCT_QUANTITY: params.productQuantity,
      PRODUCT_PRICE: params.productPrice,
      PRODUCT_WEIGHT: params.productWeight,
      PRODUCT_TYPE: 'HH',
      ORDER_PAYMENT: 3, // Người nhận trả phí
      ORDER_SERVICE: 'VCN', // Chuyển phát nhanh
      ORDER_SERVICE_ADD: '',
      ORDER_VOUCHER: '',
      ORDER_NOTE: params.note || '',
      MONEY_COLLECTION: params.moneyCollection,
      MONEY_TOTALFEE: 0,
      MONEY_FEECOD: 0,
      MONEY_FEEVAS: 0,
      MONEY_FEEINSURANCE: 0,
      MONEY_FEE: 0,
      MONEY_FEEOTHER: 0,
      MONEY_TOTALVAT: 0,
      MONEY_TOTAL: params.moneyCollection,
    };

    try {
      const response = await axios.post(
        `${this.config.apiUrl}/order/createOrder`,
        orderData,
        {
          headers: {
            'Content-Type': 'application/json',
            Token: token,
          },
        }
      );

      if (response.data && response.data.data) {
        return {
          trackingNumber: response.data.data.ORDER_NUMBER,
          orderId: response.data.data.ORDER_ID || params.orderId,
        };
      }

      throw new Error(response.data?.message || 'Failed to create order');
    } catch (error: any) {
      console.error('Viettel Post create order error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Không thể tạo đơn vận chuyển');
    }
  }

  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo[]> {
    const token = await this.getToken();

    try {
      const response = await axios.get(
        `${this.config.apiUrl}/order/getOrderByOrderNumber/${trackingNumber}`,
        {
          headers: {
            Token: token,
          },
        }
      );

      if (response.data && response.data.data) {
        const order = response.data.data;
        const trackingLogs: TrackingInfo[] = [];

        if (order.STATUS_NAME) {
          trackingLogs.push({
            status: order.STATUS_NAME,
            statusCode: String(order.ORDER_STATUS),
            description: order.STATUS_NAME,
            location: order.RECEIVER_PROVINCE || '',
            timestamp: new Date(order.LAST_UPDATE || new Date()),
          });
        }

        return trackingLogs;
      }

      return [];
    } catch (error: any) {
      console.error('Viettel Post tracking error:', error.message);
      return [];
    }
  }

  /** Hủy vận đơn trên VTP (UpdateOrder TYPE=4). Điều kiện theo VTP: đơn chưa phát sinh trạng thái không cho hủy. */
  async cancelOrder(trackingNumber: string, note?: string): Promise<{ ok: boolean; message?: string }> {
    const token = await this.getToken();
    const NOTE = (note || 'Hủy đơn từ HCRM').slice(0, 150);

    try {
      const response = await axios.post(
        `${this.config.apiUrl}/order/UpdateOrder`,
        {
          ORDER_NUMBER: trackingNumber,
          TYPE: 4,
          NOTE,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Token: token,
          },
        }
      );

      const data = response.data;
      if (data?.status === 200 && data?.error === false) {
        return { ok: true };
      }
      return { ok: false, message: data?.message || 'Viettel Post từ chối hủy đơn' };
    } catch (error: any) {
      console.error('Viettel Post cancel error:', error.response?.data || error.message);
      const msg = error.response?.data?.message || error.message || 'Lỗi khi hủy trên Viettel Post';
      return { ok: false, message: msg };
    }
  }

  /**
   * Danh sách dịch vụ + cước (API getPriceAll).
   * Mặc định không gửi PRODUCT_LENGTH/WIDTH/HEIGHT (theo tài liệu VTP là tùy chọn).
   * Nên truyền đủ ward gửi/nhận để cước khớp thực tế.
   */
  async getPriceAllList(params: {
    senderProvince: number;
    senderDistrict: number;
    senderWard?: number;
    receiverProvince: number;
    receiverDistrict: number;
    receiverWard?: number;
    productWeight: number;
    productPrice: number;
    moneyCollection: number;
    productType?: string;
    /** 1 = nội địa */
    type?: number;
  }): Promise<any[]> {
    const token = await this.getToken();
    const weight = Math.max(100, Math.round(Number(params.productWeight) || 500));

    const body: Record<string, unknown> = {
      SENDER_PROVINCE: params.senderProvince,
      SENDER_DISTRICT: params.senderDistrict,
      RECEIVER_PROVINCE: params.receiverProvince,
      RECEIVER_DISTRICT: params.receiverDistrict,
      PRODUCT_TYPE: params.productType || 'HH',
      PRODUCT_WEIGHT: weight,
      PRODUCT_PRICE: params.productPrice,
      MONEY_COLLECTION: params.moneyCollection,
      TYPE: params.type ?? 1,
    };
    if (params.senderWard != null && !Number.isNaN(Number(params.senderWard))) {
      body.SENDER_WARD = Number(params.senderWard);
    }
    if (params.receiverWard != null && !Number.isNaN(Number(params.receiverWard))) {
      body.RECEIVER_WARD = Number(params.receiverWard);
    }

    const response = await axios.post(`${this.config.apiUrl}/order/getPriceAll`, body, {
      headers: {
        'Content-Type': 'application/json',
        Token: token,
      },
    });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    if (response.data?.error === true) {
      throw new Error(response.data?.message || 'Viettel Post từ chối tính cước');
    }
    if (Array.isArray(response.data?.data)) {
      return response.data.data;
    }
    return [];
  }

  async calculateFee(params: {
    senderProvince: string;
    senderDistrict: string;
    receiverProvince: string;
    receiverDistrict: string;
    productWeight: number;
    productPrice: number;
    moneyCollection: number;
    serviceType?: string;
  }): Promise<{ fee: number; deliveryTime: string }> {
    try {
      const list = await this.getPriceAllList({
        senderProvince: Number(params.senderProvince),
        senderDistrict: Number(params.senderDistrict),
        receiverProvince: Number(params.receiverProvince),
        receiverDistrict: Number(params.receiverDistrict),
        productWeight: params.productWeight,
        productPrice: params.productPrice,
        moneyCollection: params.moneyCollection,
      });
      const vcn = list.find((s: any) => s.MA_DV_CHINH === 'VCN');
      if (vcn) {
        return {
          fee: vcn.GIA_CUOC || 0,
          deliveryTime: vcn.THOI_GIAN || '2-3 ngày',
        };
      }
      return { fee: 0, deliveryTime: 'Không xác định' };
    } catch (error: any) {
      console.error('Viettel Post calculate fee error:', error.message);
      return { fee: 0, deliveryTime: 'Không xác định' };
    }
  }

  async syncOrderStatus(orderId: string, orderDate: Date): Promise<void> {
    const order = await prisma.order.findUnique({
      where: {
        id_orderDate: { id: orderId, orderDate }
      }
    });

    if (!order || !order.trackingNumber) {
      return;
    }

    const trackingInfo = await this.getTrackingInfo(order.trackingNumber);

    for (const info of trackingInfo) {
      await prisma.shippingLog.create({
        data: {
          orderId,
          orderDate,
          status: info.status,
          statusCode: info.statusCode,
          description: info.description,
          location: info.location,
          timestamp: info.timestamp,
        },
      });
    }

    // Update order shipping status based on latest tracking
    if (trackingInfo.length > 0) {
      const latestStatus = trackingInfo[0];
      let shippingStatus: 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' = 'SHIPPING';

      const statusCode = parseInt(latestStatus.statusCode);
      if (statusCode === 501 || statusCode === 503) {
        shippingStatus = 'DELIVERED';
      } else if (statusCode === 504 || statusCode === 505) {
        shippingStatus = 'RETURNED';
      } else if (statusCode === 107) {
        shippingStatus = 'CANCELLED';
      }

      await prisma.order.update({
        where: {
          id_orderDate: { id: orderId, orderDate }
        },
        data: { shippingStatus },
      });
    }
  }
}

export const viettelPostService = new ViettelPostService();
