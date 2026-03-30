import { Request, Response, NextFunction } from 'express';
import { logModel } from '../models/logModel';

const AUDIT_ALREADY_LOGGED_FLAG = '__auditAlreadyLogged';

// Map HTTP methods to action names
const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'Tạo mới',
  PUT: 'Cập nhật',
  PATCH: 'Cập nhật',
  DELETE: 'Xóa'
};

// Map route patterns to object names (Vietnamese) - thứ tự ưu tiên: route dài/đặc thù trước
const ROUTE_OBJECT_MAP: Record<string, string> = {
  // Auth (exact trước)
  '/auth/admin/set-temp-password': 'Mật khẩu tạm',
  '/auth/admin/logout-employee': 'Đăng xuất tài khoản nhân sự',
  '/auth/admin/lock-employee': 'Tạm khóa/Mở khóa tài khoản',
  '/auth/change-password': 'Đổi mật khẩu',
  '/auth/admin/force-change-password': 'Đổi mật khẩu bắt buộc',
  // Public API (ghi nhận lead từ website)
  '/public/lead': 'Lead từ website',
  // HR
  '/employee-types': 'Loại nhân viên',
  '/employees': 'Nhân sự',
  '/divisions': 'Khối',
  '/departments': 'Phòng ban',
  '/positions': 'Chức vụ',
  '/subsidiaries': 'Công ty con',
  '/contracts': 'Hợp đồng',
  '/upload/': 'Upload (HR)',
  // Products & Inventory
  '/products/categories': 'Danh mục sản phẩm',
  '/products': 'Sản phẩm',
  '/products/import': 'Import sản phẩm',
  '/inventory': 'Tồn kho',
  '/warehouses': 'Kho hàng',
  '/transactions': 'Giao dịch kho',
  '/adjust': 'Điều chỉnh tồn kho',
  '/import-returned': 'Nhập hàng hoàn',
  '/report-damaged': 'Báo hỏng tồn kho',
  // Customers
  '/customer-tags': 'Thẻ khách hàng',
  '/customers': 'Khách hàng',
  '/farms': 'Nông trại khách hàng',
  // Data pool & Sales
  '/data-pool': 'Kho số chung',
  '/sales': 'Sales',
  '/resales': 'CSKH',
  '/orders': 'Đơn hàng',
  // Marketing
  '/marketing/sources': 'Nguồn marketing',
  '/marketing/campaigns': 'Chiến dịch marketing',
  '/marketing/leads': 'Lead marketing',
  '/marketing/costs': 'Chi phí chiến dịch',
  '/marketing-groups': 'Nhóm marketing',
  '/groups': 'Nhóm (marketing)',
  '/api-key': 'API key chiến dịch',
  '/allowed-origins': 'CORS chiến dịch',
  // Documents & Notes
  '/documents': 'Tài liệu',
  '/internal-notes': 'Ghi chú nội bộ',
  // Settings & Phân quyền
  '/role-groups': 'Nhóm quyền',
  '/view-scopes': 'Phạm vi xem',
  '/system-configs': 'Cấu hình hệ thống',
  // Kế toán
  '/accounting': 'Kế toán',
  '/salary-components': 'Đầu mục lương',
  '/payrolls': 'Bảng lương',
  '/invoices': 'Hóa đơn nháp',
  '/reports/generate': 'Báo cáo tài chính',
  '/providers': 'Nhà cung cấp hóa đơn',
  '/role-metrics': 'Chỉ số kế toán theo vai trò',
  // Hạng khách hàng
  '/customer-ranks': 'Hạng khách hàng',
  '/spending-ranks': 'Hạng chi tiêu',
  // Địa chỉ / VTP
  '/vtp': 'Viettel Post / Địa chỉ',
  '/address': 'Địa chỉ',
  // Nghỉ phép & Hỗ trợ & Hiệu suất
  '/leave-requests': 'Nghỉ phép',
  '/support-tickets': 'Phiếu hỗ trợ',
  '/performance': 'Hiệu suất',
  '/targets': 'Mục tiêu kinh doanh',
  // Warranty & Notifications & Chat
  '/warranty/claims': 'Bảo hành',
  '/admin/notifications': 'Thông báo',
  '/chat/groups': 'Nhóm chat',
  '/chat/messages': 'Tin nhắn',
  '/chat/private': 'Tin nhắn riêng',
  '/chat/group-avatar': 'Ảnh nhóm chat',
  '/seed/': 'Seed dữ liệu',
};

// Routes to skip logging (read-only or internal)
const SKIP_ROUTES = [
  '/login',
  '/logout',
  '/validate-phone',
  '/logs',
  '/user-notifications',
  '/check-auth',
  '/messages/read', // Mark as read is not important
  '/notifications/read',
  '/auth/admin/',
  '/auth/change-password',
  '/auth/consume-staff-check-token',
  // Các module này đã ghi log thủ công chi tiết, tránh bản ghi trùng.
  '/customers',
  '/customer-tags',
  '/farms',
  '/marketing/sources',
  '/marketing/campaigns',
  '/marketing/leads',
  '/marketing/costs',
];

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'oldpassword',
  'newpassword',
  'token',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'api_key',
]);

/** Nhãn tiếng Việt cho trường body phổ biến — dùng khi chưa có log thủ công từ controller */
const FIELD_LABEL_VI: Record<string, string> = {
  name: 'Tên',
  code: 'Mã',
  fullName: 'Họ tên',
  phone: 'Số điện thoại',
  email: 'Email',
  address: 'Địa chỉ',
  detailAddress: 'Địa chỉ chi tiết',
  manager: 'Người quản lý',
  type: 'Loại',
  status: 'Trạng thái',
  contactName: 'Người liên hệ',
  contactPhone: 'SĐT liên hệ',
  provinceId: 'Tỉnh/TP',
  districtId: 'Quận/Huyện',
  wardId: 'Phường/Xã',
  title: 'Tiêu đề',
  orderCode: 'Mã đơn',
  commonName: 'Tên thường gọi',
  description: 'Mô tả',
  note: 'Ghi chú',
  warehouseId: 'Kho',
  productId: 'Sản phẩm',
  batchId: 'Lô',
  quantity: 'Số lượng',
  amount: 'Số tiền',
  month: 'Tháng',
  year: 'Năm',
  employeeId: 'Nhân viên',
  departmentId: 'Đơn vị',
  divisionId: 'Khối',
  positionId: 'Chức danh',
  organizationId: 'Tổ chức',
  configKey: 'Khóa cấu hình',
};

/** Gom mô tả ngắn từ body (không thay thế log so sánh trước/sau từ controller) */
const summarizeBodyForAudit = (
  body: Record<string, unknown>,
  method: string,
): string | null => {
  if (!['POST', 'PUT', 'PATCH'].includes(method) || Object.keys(body).length === 0) return null;
  const parts: string[] = [];
  const keys = Object.keys(body).filter((k) => body[k] != null && body[k] !== '');
  const ordered = [...keys].sort((a, b) => {
    const pa = FIELD_LABEL_VI[a] ? 0 : 1;
    const pb = FIELD_LABEL_VI[b] ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
  for (const k of ordered.slice(0, 14)) {
    const v = body[k];
    let s: string;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      s = String(v).trim();
    } else if (Array.isArray(v)) {
      s = `[${v.length} mục]`;
    } else {
      s = '[đối tượng]';
    }
    if (!s || s.length > 180) continue;
    const label = FIELD_LABEL_VI[k] || k;
    parts.push(`${label}: ${s}`);
  }
  if (parts.length === 0) return null;
  return parts.join('; ');
};

const sanitizeBodyForLog = (body: any): Record<string, unknown> => {
  const src = body && typeof body === 'object' ? body : {};
  const out: Record<string, unknown> = {};
  Object.entries(src).forEach(([k, v]) => {
    const normalizedKey = String(k).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    if (SENSITIVE_KEYS.has(normalizedKey)) return;
    if (v == null) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) return;
      out[k] = t.length > 120 ? `${t.slice(0, 117)}...` : t;
      return;
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
      return;
    }
    if (Array.isArray(v)) {
      out[k] = `[${v.length} items]`;
      return;
    }
    out[k] = '[object]';
  });
  return out;
};

// Get object name from route (ưu tiên route dài hơn để match đúng đối tượng)
const getObjectName = (path: string): string => {
  const cleanPath = path.split('?')[0].replace(/\/$/, '');
  const entries = Object.entries(ROUTE_OBJECT_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [route, name] of entries) {
    if (cleanPath.includes(route)) return name;
  }
  const parts = cleanPath.split('/').filter(Boolean);
  if (parts.length > 0) {
    const basePath = parts.find(p => !p.match(/^[0-9a-f-]{36}$/i) && !p.match(/^\d+$/));
    return basePath || 'Hệ thống';
  }
  return 'Hệ thống';
};

// Get action details from request
const getActionDetails = (req: Request, method: string, objectName: string): string => {
  const body = sanitizeBodyForLog(req.body || {});
  const params = req.params || {};
  
  // Build details based on object type
  let details = '';
  
  switch (objectName) {
    case 'Nhân sự':
      if (body.fullName) details = `Tên: ${body.fullName}`;
      else if (params.id) details = `ID: ${params.id}`;
      break;
    case 'Sản phẩm':
      if (body.name) details = `Tên: ${body.name}`;
      else if (body.commonName) details = `Tên: ${body.commonName}`;
      else if (params.id) details = `ID: ${params.id}`;
      break;
    case 'Khách hàng':
      if (body.name) details = `Tên: ${body.name}`;
      else if (body.phone) details = `SĐT: ${body.phone}`;
      else if (params.id) details = `ID: ${params.id}`;
      break;
    case 'Đơn hàng':
      if (body.orderCode) details = `Mã: ${body.orderCode}`;
      else if (params.id) details = `ID: ${params.id}`;
      break;
    case 'Tài liệu':
      if (body.title) details = `Tiêu đề: ${body.title}`;
      else if (params.id) details = `ID: ${params.id}`;
      break;
    case 'Nhóm quyền':
      if (body.name) details = `Tên: ${body.name}`;
      else if (params.id) details = `ID: ${params.id}`;
      break;
    case 'Cấu hình hệ thống':
      if (body.configs && Array.isArray(body.configs)) {
        details = `Cập nhật ${body.configs.length} cấu hình`;
      } else if (params.key) {
        details = `Key: ${params.key}`;
      }
      break;
    case 'Chiến dịch marketing':
      if (body.name) details = `Tên: ${body.name}`;
      else if (params.campaignId) details = `ID: ${params.campaignId}`;
      break;
    case 'Lead từ website':
      if (body.phone) details = `SĐT: ${body.phone}`;
      if (body.name) details = (details ? details + ', ' : '') + `Tên: ${body.name}`;
      break;
    case 'Nghỉ phép':
      if (params.id) details = `Đơn: ${params.id}`;
      else if (body.employeeId) details = `Nhân viên: ${body.employeeId}`;
      break;
    case 'Phiếu hỗ trợ':
      if (params.id) details = `Ticket: ${params.id}`;
      if (body.status) details = (details ? details + ', ' : '') + `Trạng thái: ${body.status}`;
      break;
    case 'Kế toán':
      if (body.month && body.year) details = `Kỳ: ${body.month}/${body.year}`;
      else if (params.id) details = `ID: ${params.id}`;
      break;
    case 'Hạng khách hàng':
    case 'Hạng chi tiêu':
      if (body.name) details = `Tên: ${body.name}`;
      else if (params.customerId) details = `Khách: ${params.customerId}`;
      break;
    default: {
      const summarized = summarizeBodyForAudit(body, method);
      if (summarized) {
        details = summarized;
      } else if (params.id) {
        details = `ID: ${params.id}`;
      } else if (Object.keys(body).length > 0) {
        const firstKey = Object.keys(body)[0];
        const firstValue = body[firstKey];
        if (typeof firstValue === 'string' && firstValue.length < 100) {
          details = `${FIELD_LABEL_VI[firstKey] || firstKey}: ${firstValue}`;
        }
      }
      break;
    }
  }
  
  return details || '';
};

// Middleware to log write operations
export const auditLog = async (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  
  // Only log write operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }
  
  // Skip certain routes
  const path = req.path || req.originalUrl;
  if (SKIP_ROUTES.some(route => path.includes(route))) {
    return next();
  }
  
  // Store original json method
  const originalJson = res.json.bind(res);
  
  // Override json to capture response
  res.json = function(data: any) {
    setImmediate(async () => {
      try {
        if ((req as any)[AUDIT_ALREADY_LOGGED_FLAG]) {
          return;
        }
        const user = (req as any).user;
        // Ghi nhận cả request không có user (vd: API public/lead, webhook) để bắt mọi thay đổi DB
        const isPublicLead = path.includes('/public/lead');
        const isWebhook = path.includes('/webhook/');
        let userId: string;
        let userName: string;
        let userPhone: string | undefined;
        if (user) {
          userId = user.id || user.userId;
          userName = user.name || user.fullName || 'Unknown';
          userPhone = user.phone;
        } else if (isPublicLead) {
          userId = 'public-api';
          userName = 'API Website';
          userPhone = undefined;
        } else if (isWebhook) {
          userId = 'webhook';
          userName = 'Webhook (VTP, ...)';
          userPhone = undefined;
        } else {
          return;
        }

        const action = METHOD_ACTION_MAP[method] || method;
        const objectName = getObjectName(path);
        const details = getActionDetails(req, method, objectName);
        const statusCode = res.statusCode;
        let result: 'Thành công' | 'Thất bại' | 'Thành công một phần' = 'Thành công';
        if (statusCode >= 400) result = 'Thất bại';
        else if (statusCode === 207) result = 'Thành công một phần';

        await logModel.create({
          userId,
          userName,
          userPhone,
          action,
          object: objectName,
          result,
          details: details || `${action} ${objectName}`
        });
      } catch (error) {
        console.error('Audit log error:', error);
      }
    });
    return originalJson(data);
  };
  
  next();
};

// Helper function for manual logging in controllers (when more detail is needed)
export const logManualAction = async (params: {
  userId: string;
  userName: string;
  userPhone?: string;
  action: string;
  object: string;
  details: string;
  result?: 'Thành công' | 'Thất bại' | 'Thành công một phần';
}) => {
  try {
    await logModel.create({
      userId: params.userId,
      userName: params.userName,
      userPhone: params.userPhone,
      action: params.action,
      object: params.object,
      result: params.result || 'Thành công',
      details: params.details
    });
  } catch (error) {
    console.error('Manual log error:', error);
  }
};
