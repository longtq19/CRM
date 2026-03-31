import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { getIO } from '../socket';
import { getMarketingAttributionEffectiveDaysForCustomer } from '../services/leadDuplicateService';
import { parseVtpDate } from '../utils/vtpDateParser';

/**
 * =====================================================
 * VIETTEL POST WEBHOOK CONFIGURATION
 * =====================================================
 * 
 * Để cấu hình webhook trên Viettel Post Partner Portal:
 * 
 * 1. Đăng nhập: https://partner.viettelpost.vn
 * 2. Vào mục: Cài đặt > Webhook / Callback URL
 * 3. Điền các thông số sau:
 * 
 * =====================================================
 * THÔNG SỐ CẤU HÌNH WEBHOOK
 * =====================================================
 * 
 * Webhook URL: https://your-domain.com/api/webhook/viettelpost/order-status
 *   hoặc /order-st (khớp với cấu hình trên VTP Portal)
 * Method: POST
 * Content-Type: application/json
 * Secret parameters: Cấu hình trong .env → VTP_WEBHOOK_SECRET=kagri_vtp_webhook_2026_secret_key
 *   VTP gửi token trong body TOKEN hoặc header x-vtp-token
 * 
 * Ví dụ production:
 * URL: https://crm.kagri.tech/api/webhook/viettelpost/order-status
 * Secret: kagri_vtp_webhook_2026_secret_key (phải khớp với VTP_WEBHOOK_SECRET trong .env)
 * 
 * =====================================================
 * MÃ TRẠNG THÁI ĐƠN HÀNG VIETTEL POST
 * =====================================================
 * 
 * -100: Đơn hàng mới tạo, chưa duyệt
 * 100: Đã tiếp nhận đơn hàng
 * 101: Đang lấy hàng
 * 102: Đã lấy hàng
 * 103: Đã nhập kho
 * 104: Bưu tá đang lấy hàng
 * 105: Đã rời kho
 * 107: Đã hủy đơn qua API
 * 200: Đã nhận hàng từ bưu tá
 * 201: Đang vận chuyển
 * 202: Đã đến kho đích
 * 300: Đang phát hàng
 * 400: Phát hàng không thành công
 * 500: Đang giao cho bưu tá phát
 * 501: Giao hàng thành công
 * 502: Chuyển hoàn
 * 503: Đang chuyển hoàn
 * 504: Hoàn hàng thành công
 * 505: Hàng về kho chờ hoàn
 * 506: Khách không nhận hàng
 * 507: Hàng thất lạc
 * 508: Hàng hư hỏng
 * 509: COD đã thu
 * 510: COD đã chuyển
 * 
 * =====================================================
 */

// Mapping VTP status code to internal status (khớp bảng trạng thái VTP / checklist GoLive)
const VTP_STATUS_MAP: { [key: number]: { status: string; description: string } } = {
  [-100]: { status: 'PENDING', description: 'Đơn hàng mới tạo, chưa duyệt' },
  [100]: { status: 'CONFIRMED', description: 'Đã tiếp nhận đơn hàng' },
  [101]: { status: 'CANCELLED', description: 'VTP từ chối nhận' },
  [102]: { status: 'CONFIRMED', description: 'Đơn hàng chờ xử lý' },
  [103]: { status: 'IN_WAREHOUSE', description: 'Giao cho bưu cục' },
  [104]: { status: 'PICKING', description: 'Giao cho Bưu tá đi nhận' },
  [105]: { status: 'PICKED', description: 'Bưu Tá đã nhận hàng' },
  [107]: { status: 'CANCELLED', description: 'Đối tác yêu cầu hủy' },
  [200]: { status: 'IN_TRANSIT', description: 'Nhận từ bưu tá' },
  [201]: { status: 'CANCELLED', description: 'Hủy nhập phiếu gửi' },
  [300]: { status: 'IN_TRANSIT', description: 'Khai thác đi' },
  [400]: { status: 'AT_DESTINATION', description: 'Khai thác đến' },
  [500]: { status: 'DELIVERING', description: 'Giao bưu tá đi phát' },
  [501]: { status: 'DELIVERED', description: 'Phát thành công' },
  [502]: { status: 'RETURNING', description: 'Chuyển hoàn bưu cục gốc' },
  [503]: { status: 'CANCELLED', description: 'Hủy theo yêu cầu KH' },
  [504]: { status: 'RETURNED', description: 'Hoàn thành công' },
  [505]: { status: 'RETURNING', description: 'Phát thất bại - Yêu cầu hoàn' },
  [506]: { status: 'DELIVERY_FAILED', description: 'Phát thất bại' },
  [507]: { status: 'DELIVERED', description: 'KH đến bưu cục nhận' },
  [508]: { status: 'DELIVERING', description: 'Phát tiếp' },
  [515]: { status: 'RETURNING', description: 'Duyệt hoàn' },
  [550]: { status: 'DELIVERING', description: 'Phát tiếp (KH yêu cầu)' },
  [509]: { status: 'COD_COLLECTED', description: 'COD đã thu' },
  [510]: { status: 'COD_TRANSFERRED', description: 'COD đã chuyển' }
};

/**
 * Webhook endpoint nhận callback từ Viettel Post
 * 
 * Request body từ VTP:
 * {
 *   "DATA": [
 *     {
 *       "ORDER_NUMBER": "ABC123",        // Mã đơn hàng của bạn
 *       "ORDER_REFERENCE": "VTP123456",  // Mã vận đơn VTP
 *       "ORDER_STATUS": 501,             // Mã trạng thái
 *       "STATUS_NAME": "Giao hàng thành công",
 *       "MONEY_COLLECTION": 500000,      // Tiền COD
 *       "MONEY_TOTAL": 30000,            // Tổng phí
 *       "NOTE": "Ghi chú",
 *       "LAST_UPDATE_TIME": "2024-01-15T10:30:00"
 *     }
 *   ],
 *   "TOKEN": "your-webhook-token"
 * }
 */
export const handleVTPWebhook = async (req: Request, res: Response) => {
  try {
    console.log('📦 VTP Webhook received:', JSON.stringify(req.body, null, 2));
    
    const webhookToken = process.env.VTP_WEBHOOK_SECRET;
    const authHeader = req.headers['authorization'];
    const receivedToken =
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader) ||
      req.body.TOKEN ||
      req.headers['x-vtp-token'] ||
      req.headers['token'];
    
    if (webhookToken && receivedToken !== webhookToken) {
      console.warn('⚠️ Invalid webhook token');
      return res.status(401).json({ error: true, message: 'Invalid token' });
    }
    
    const raw = req.body.DATA ?? req.body.data ?? req.body;
    const data = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    
    if (data.length === 0) {
      return res.status(400).json({ error: true, message: 'Invalid data format' });
    }
    
    const results = [];
    
    for (const item of data) {
      const orderNumber = item.ORDER_NUMBER ?? item.order_number ?? item.partner_id;
      const vtpOrderCode = item.ORDER_REFERENCE ?? item.order_reference ?? item.label_id;
      const statusCode = parseInt(String(item.ORDER_STATUS ?? item.order_status ?? item.status_id ?? 0), 10);
      const statusName = item.STATUS_NAME ?? item.status_name ?? item.reason ?? '';
      const location = item.LOCALION_CURRENTLY ?? item.LOCATION_CURRENTLY ?? item.location ?? '';
      const moneyCollection = item.MONEY_COLLECTION ?? item.money_collection ?? 0;
      const note = item.NOTE ?? item.note ?? '';
      const updateTime = item.ORDER_STATUSDATE ?? item.LAST_UPDATE_TIME ?? item.last_update_time ?? item.action_time ?? new Date().toISOString();
      
      if (!orderNumber) {
        console.warn('⚠️ Missing order number in webhook data');
        continue;
      }
      
      // Find order: VTP gửi ORDER_NUMBER có thể là mã vận đơn VTP hoặc mã đơn nội bộ (code)
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { code: String(orderNumber) },
            { trackingNumber: String(orderNumber) },
            { shippingCode: String(vtpOrderCode || orderNumber) }
          ]
        },
        include: {
          customer: true,
          employee: true
        }
      });
      
      if (!order) {
        console.warn(`⚠️ Order not found: ${orderNumber}`);
        results.push({ orderNumber, success: false, message: 'Order not found' });
        continue;
      }
      
      const statusInfo = VTP_STATUS_MAP[statusCode] ?? {
        status: 'UNKNOWN',
        description: statusName || `Trạng thái ${statusCode}`
      };
      const description = statusName || statusInfo.description;
      const noteWithLocation = location ? (note ? `${note}\n${location}` : location) : note;
      const deliveredAt = statusInfo.status === 'DELIVERED' ? new Date() : null;
      
      await prisma.order.update({
        where: {
          id_orderDate: { id: order.id, orderDate: order.orderDate }
        },
        data: {
          shippingStatus: statusInfo.status,
          shippingCode: vtpOrderCode || order.shippingCode,
          trackingNumber: order.trackingNumber || vtpOrderCode || order.shippingCode,
          ...(deliveredAt ? { deliveredAt } : {}),
          updatedAt: new Date()
        }
      });
      
      await prisma.orderShippingLog.create({
        data: {
          orderId: order.id,
          orderDate: order.orderDate,
          statusCode: String(statusCode),
          status: statusInfo.status,
          description,
          note: noteWithLocation,
          vtpOrderCode: vtpOrderCode || undefined,
          rawData: JSON.stringify(item),
          timestamp: parseVtpDate(updateTime)
        }
      });

      // Extend marketing attribution window from the latest delivered order date.
      if (deliveredAt && order.customerId && order.customer?.marketingOwnerId) {
        const attributionDays = await getMarketingAttributionEffectiveDaysForCustomer(order.customerId);
        await prisma.customer.update({
          where: { id: order.customerId },
          data: { attributionExpiredAt: new Date(deliveredAt.getTime() + attributionDays * 24 * 60 * 60 * 1000) },
        });
      }
      
      // Emit real-time notification
      const io = getIO();
      if (io) {
        // Notify to order owner
        if (order.employeeId) {
          io.to(`user:${order.employeeId}`).emit('order:status_updated', {
            orderId: order.id,
            orderCode: order.code,
            status: statusInfo.status,
            description: statusInfo.description,
            customerName: order.customer?.name,
            timestamp: updateTime
          });
        }
        
        // Notify to shipping staff room
        io.to('shipping:staff').emit('order:status_updated', {
          orderId: order.id,
          orderCode: order.code,
          status: statusInfo.status,
          description: statusInfo.description,
          customerName: order.customer?.name,
          timestamp: updateTime
        });
      }
      
      console.log(`✅ Order ${orderNumber} updated: ${statusInfo.status} - ${statusInfo.description}`);
      results.push({ orderNumber, success: true, status: statusInfo.status });
    }
    
    // VTP requires HTTP 200 response
    res.status(200).json({
      error: false,
      message: 'Webhook processed successfully',
      results
    });
    
  } catch (error) {
    console.error('❌ VTP Webhook error:', error);
    // Still return 200 to prevent VTP from retrying
    res.status(200).json({
      error: true,
      message: 'Internal error but acknowledged'
    });
  }
};

/**
 * Test webhook endpoint (for debugging)
 */
export const testWebhook = async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Webhook endpoint is working',
    receivedData: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'token': req.headers['token'],
      'x-vtp-token': req.headers['x-vtp-token']
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Lấy lịch sử trạng thái đơn hàng
 */
export const getOrderShippingLogs = async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId as string;
    
    const logs = await prisma.orderShippingLog.findMany({
      where: { orderId },
      orderBy: { timestamp: 'desc' }
    });
    
    res.json(logs);
  } catch (error) {
    console.error('Get shipping logs error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử vận chuyển' });
  }
};
