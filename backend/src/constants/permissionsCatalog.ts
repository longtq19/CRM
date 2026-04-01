/**
 * Catalog quyền chính thức (đồng bộ DB khi `syncDefaultMenus` / `ensureDefaultPermissionsCatalog`).
 * `description` dùng làm hướng dẫn ngắn trên UI Nhóm quyền (tooltip).
 * Nhóm theo **module** (comment `01.`–`15.`) khớp `PERMISSION_GROUPS` trong `frontend/src/components/RoleGroupManager.tsx`.
 */
export type PermissionCatalogEntry = {
  code: string;
  name: string;
  /** Mô tả tiếng Việt: phạm vi API / màn hình được mở */
  description: string;
};

export const DEFAULT_PERMISSIONS: PermissionCatalogEntry[] = [
  // ── 01. Hệ thống ──
  {
    code: 'FULL_ACCESS',
    name: 'Toàn quyền hệ thống',
    description:
      'JWT coi như có mọi mã quyền: toàn bộ API và nút trên giao diện (trừ chỉnh sửa nhóm Quản trị hệ thống trên UI).',
  },
  {
    code: 'MANAGE_SYSTEM',
    name: 'Quản lý hệ thống',
    description: 'Truy cập tab Hệ thống (nhật ký, tài khoản nhân sự) và các API tương ứng cùng VIEW_LOGS.',
  },
  {
    code: 'VIEW_LOGS',
    name: 'Xem nhật ký hoạt động',
    description: 'Đọc nhật ký hệ thống (system_logs) qua API và màn hình Nhật ký.',
  },
  {
    code: 'VIEW_SETTINGS',
    name: 'Xem cấu hình hệ thống',
    description:
      'Xem cấu hình chung, danh mục trạng thái khách, thống kê phân hạng; đọc API role-groups / system-config (đọc).',
  },
  {
    code: 'EDIT_SETTINGS',
    name: 'Chỉnh sửa cấu hình hệ thống',
    description:
      'Sửa cấu hình hệ thống, danh mục trạng thái khách, phân hạng chi tiêu; cập nhật system-config; chỉnh RBAC cùng MANAGE_ROLE_GROUPS.',
  },
  {
    code: 'STAFF_LOGOUT',
    name: 'Đăng xuất nhân viên',
    description: 'Buộc đăng xuất / vô hiệu phiên tài khoản nhân viên (auth admin).',
  },
  {
    code: 'STAFF_LOCK',
    name: 'Khóa / mở khóa tài khoản',
    description: 'Khóa hoặc mở khóa tài khoản đăng nhập nhân viên.',
  },
  {
    code: 'VIEW_ROLE_GROUPS',
    name: 'Xem nhóm quyền (RBAC)',
    description: 'Xem danh sách nhóm quyền, menu và chức năng đã gán (API role-groups đọc).',
  },
  {
    code: 'MANAGE_ROLE_GROUPS',
    name: 'Quản lý nhóm quyền (menu, quyền, phạm vi xem)',
    description: 'Tạo/sửa/xóa nhóm quyền, gán menu & quyền, cập nhật phạm vi xem HR/Khách hàng.',
  },

  // ── 02. Dashboard & Báo cáo ──
  {
    code: 'VIEW_DASHBOARD',
    name: 'Xem Dashboard',
    description: 'Vào trang Dashboard và các API báo cáo tổng quan gắn Dashboard.',
  },
  {
    code: 'VIEW_REPORTS',
    name: 'Xem báo cáo',
    description: 'Xem module Báo cáo và các endpoint báo cáo yêu cầu VIEW_REPORTS hoặc kết hợp VIEW_PERFORMANCE.',
  },
  {
    code: 'VIEW_PERFORMANCE',
    name: 'Xem hiệu suất làm việc',
    description: 'Xem báo cáo hiệu suất, marketing, báo cáo tổng hợp (performance API).',
  },

  // ── 3. Nhân sự ──
  {
    code: 'MANAGE_HR',
    name: 'Quản lý nhân sự',
    description:
      'Tạo/sửa/xóa hồ sơ NV, import Excel, cấu trúc org (cùng CONFIG_ORG_STRUCTURE khi route yêu cầu), gán nhóm quyền NV.',
  },
  {
    code: 'VIEW_HR',
    name: 'Xem nhân sự (theo phạm vi)',
    description: 'Xem danh sách/chi tiết NV trong phạm vi phân quyền HR (không tự có quyền ghi).',
  },
  {
    code: 'VIEW_EMPLOYEE_TYPE_CATALOG',
    name: 'Xem danh mục loại nhân viên',
    description: 'Xem danh sách loại nhân viên (tab Danh mục HR).',
  },
  {
    code: 'MANAGE_EMPLOYEE_TYPE_CATALOG',
    name: 'Quản lý danh mục loại nhân viên',
    description: 'Thêm/sửa/xóa loại nhân viên trong danh mục.',
  },
  {
    code: 'VIEW_CONTRACTS',
    name: 'Xem hợp đồng',
    description: 'Xem hợp đồng lao động trong phạm vi module HR.',
  },
  {
    code: 'VIEW_LEAVE_REQUESTS',
    name: 'Xem đơn nghỉ phép',
    description: 'Xem đơn nghỉ phép (theo luồng phê duyệt/phạm vi).',
  },
  {
    code: 'MANAGE_LEAVE_REQUESTS',
    name: 'Quản lý đơn nghỉ phép',
    description: 'Duyệt/từ chối/cập nhật đơn nghỉ phép (trừ xóa vĩnh viễn — xem DELETE_LEAVE_REQUESTS).',
  },
  {
    code: 'DELETE_LEAVE_REQUESTS',
    name: 'Xóa đơn nghỉ phép',
    description: 'Xóa vĩnh viễn bản ghi đơn nghỉ phép (API permanent-delete; không thay cho MANAGE_LEAVE_REQUESTS).',
  },

  // ── 04. Kho số & Phân bổ ──
  {
    code: 'VIEW_FLOATING_POOL',
    name: 'Xem kho số thả nổi',
    description: 'Mở kho thả nổi (GET data-pool); có thể kết hợp VIEW_SALES hoặc VIEW_MANAGED_UNIT_POOL tùy route.',
  },
  {
    code: 'MANAGE_DATA_POOL',
    name: 'Quản lý kho số thả nổi',
    description: 'Thêm/thu hồi lead vào kho, quản lý dữ liệu pool (POST add, recall khi đủ quyền).',
  },
  {
    code: 'DATA_POOL_CONFIG',
    name: 'Cấu hình kho số thả nổi',
    description: 'Đọc/ghi cấu hình phân phối kho thả nổi (GET/PUT /data-pool/config).',
  },
  {
    code: 'CONFIG_DISTRIBUTION',
    name: 'Cấu hình tỷ lệ phân bổ',
    description: 'Cấu hình tỉ lệ phân bổ giữa đơn vị (distribution-ratios).',
  },
  {
    code: 'CLAIM_LEAD',
    name: 'Nhận khách từ kho Sales (chưa phân)',
    description: 'Nhận lead từ kho Sales mở, cập nhật trạng thái xử lý (claim, processing-status).',
  },
  {
    code: 'ASSIGN_LEAD',
    name: 'Phân bổ khách',
    description: 'Gán lead, phân tự động, phân ngay (assign, auto-distribute, immediate-distribute).',
  },
  {
    code: 'DISTRIBUTE_FLOATING_POOL',
    name: 'Phân chia số từ kho thả nổi (trong phạm vi quản lý)',
    description: 'Phân số từ kho thả nổi trong phạm vi quản lý được (API distribute).',
  },
  {
    code: 'DISTRIBUTE_FLOATING_CROSS_ORG',
    name: 'Phân kho thả nổi ra mọi khối/đơn vị',
    description: 'Phân kho thả nổi không giới hạn một khối (cross org).',
  },
  {
    code: 'CLAIM_FLOATING_POOL',
    name: 'Nhận khách từ kho thả nổi',
    description: 'Nhận khách từ kho thả nổi (claim-customer).',
  },
  {
    code: 'VIEW_CSKH_POOL',
    name: 'Xem kho số CSKH',
    description: 'Xem kho số CSKH (API pool CSKH).',
  },
  {
    code: 'MANAGE_CSKH_POOL',
    name: 'Quản lý kho số CSKH',
    description: 'Thao tác gán/phân trong kho CSKH (kết hợp MANAGE_DATA_POOL hoặc DISTRIBUTE_SALES_CROSS_ORG tùy API).',
  },
  {
    code: 'VIEW_MANAGED_UNIT_POOL',
    name: 'Xem kho số theo đơn vị quản lý',
    description: 'Xem kho số trong phạm vi đơn vị mình quản lý (GET data-pool).',
  },
  {
    code: 'RECALL_MANAGED_UNIT_LEADS',
    name: 'Thu hồi lead trong phạm vi đơn vị quản lý',
    description: 'Thu hồi lead đã gán cho NV trong phạm vi đơn vị quản lý (recall).',
  },
  {
    code: 'DISTRIBUTE_SALES_CROSS_ORG',
    name: 'Phân kho Sales/CSKH cho bất kỳ khối/đơn vị/NV',
    description: 'Phân lead cho mọi khối/đơn vị/nhân viên (quyền phân phối rộng).',
  },

  // ── 05. Khách hàng ──
  {
    code: 'VIEW_CUSTOMERS',
    name: 'Xem khách hàng',
    description: 'Xem danh sách/chi tiết khách, xuất Excel, mẫu import (theo phạm vi xem CUSTOMER).',
  },
  {
    code: 'VIEW_ALL_COMPANY_CUSTOMERS',
    name: 'Xem toàn bộ khách hàng công ty',
    description: 'Bỏ lọc phạm vi cây — xem khách toàn công ty (helper viewScope).',
  },
  {
    code: 'MANAGE_CUSTOMERS',
    name: 'Quản lý khách hàng & Marketing',
    description:
      'Sửa khách, lead Marketing, chi phí chiến dịch (khi đủ quyền chiến dịch), tag khách; xem nền tảng cho dropdown cần VIEW_MARKETING_PLATFORMS hoặc quyền tạo/sửa/xóa nền tảng; CRUD chiến dịch dùng VIEW/CREATE/UPDATE/DELETE_MARKETING_CAMPAIGN; không gồm xóa khách (DELETE_CUSTOMER).',
  },
  {
    code: 'DELETE_CUSTOMER',
    name: 'Xóa khách hàng',
    description: 'Xóa vĩnh viễn bản ghi khách (API DELETE customer).',
  },

  // ── 06. Marketing ──
  {
    code: 'VIEW_MARKETING_PLATFORMS',
    name: 'Xem tab quản trị danh mục nền tảng (Marketing)',
    description:
      'Mở tab «Nền tảng» trên module Marketing (bảng quản trị). Danh sách đọc API `GET /marketing/sources` dùng chung cho mọi NV đã đăng nhập — không cần quyền này để đọc danh sách; tạo/sửa/xóa dùng quyền riêng.',
  },
  {
    code: 'CREATE_MARKETING_PLATFORM',
    name: 'Tạo nền tảng marketing',
    description: 'POST tạo nền tảng (marketing_sources).',
  },
  {
    code: 'UPDATE_MARKETING_PLATFORM',
    name: 'Sửa nền tảng marketing',
    description: 'PUT cập nhật nền tảng (marketing_sources).',
  },
  {
    code: 'DELETE_MARKETING_PLATFORM',
    name: 'Xóa nền tảng marketing',
    description: 'DELETE nền tảng khi đủ điều kiện nghiệp vụ (marketing_sources).',
  },
  {
    code: 'MANAGE_MARKETING_GROUPS',
    name: 'Quản lý nhóm Marketing',
    description: 'Quản lý nhóm Marketing (module nhóm / gán — theo route marketing-group).',
  },
  {
    code: 'VIEW_MARKETING_CAMPAIGNS',
    name: 'Xem chiến dịch marketing',
    description:
      'GET danh sách/chi tiết chiến dịch, API info chiến dịch; dropdown chiến dịch trên form Kinh doanh (không gồm tạo/sửa/xóa).',
  },
  {
    code: 'CREATE_MARKETING_CAMPAIGN',
    name: 'Tạo chiến dịch marketing',
    description: 'POST tạo chiến dịch mới (marketing_campaigns).',
  },
  {
    code: 'UPDATE_MARKETING_CAMPAIGN',
    name: 'Sửa chiến dịch marketing',
    description:
      'PUT cập nhật chiến dịch; cấu hình API key / webhook / allowed-origins / tích hợp public lead cho chiến dịch.',
  },
  {
    code: 'DELETE_MARKETING_CAMPAIGN',
    name: 'Xóa chiến dịch marketing',
    description: 'DELETE chiến dịch (gỡ gán khách, xóa chi phí/cơ hội gắn chiến dịch khi đủ điều kiện nghiệp vụ).',
  },

  // ── 07. Sales ──
  {
    code: 'VIEW_SALES',
    name: 'Xem Sales',
    description: 'Xem pipeline Sales, lead của mình, tương tác (API sales).',
  },
  {
    code: 'MANAGE_SALES',
    name: 'Quản lý Sales',
    description: 'Cập nhật trạng thái/ưu tiên lead, tương tác Sales; tạo khách nếu route cho phép.',
  },
  {
    code: 'VIEW_SALES_EFFECTIVENESS',
    name: 'Xem báo cáo hiệu quả & xếp hạng Sales',
    description: 'Tab báo cáo hiệu quả / xếp hạng trong module Sales (performance API).',
  },

  // ── 08. CSKH ──
  {
    code: 'VIEW_RESALES',
    name: 'Xem CSKH',
    description: 'Xem khách CSKH, lịch chăm sóc, tương tác (API resales).',
  },
  {
    code: 'MANAGE_RESALES',
    name: 'Quản lý CSKH',
    description: 'Cập nhật khách CSKH, tương tác, chuyển khách, ưu tiên lead.',
  },
  {
    code: 'VIEW_CSKH_EFFECTIVENESS',
    name: 'Xem báo cáo hiệu quả & xếp hạng CSKH',
    description: 'Tab báo cáo hiệu quả / xếp hạng trong module CSKH (performance API).',
  },

  // ── 09. Sản phẩm ──
  {
    code: 'MANAGE_PRODUCTS',
    name: 'Quản lý sản phẩm',
    description: 'CRUD sản phẩm, danh mục gắn bán hàng (product routes).',
  },

  // ── 10. Hỗ trợ ──
  {
    code: 'MANAGE_SUPPORT_TICKETS',
    name: 'Quản lý ticket hỗ trợ',
    description: 'Quản lý ticket module Hỗ trợ (support routes).',
  },

  // ── 11. Đơn hàng & Vận chuyển ──
  {
    code: 'VIEW_ORDERS',
    name: 'Xem đơn hàng',
    description: 'Xem danh sách/chi tiết đơn, trạng thái vận chuyển (đọc) trong phạm vi.',
  },
  {
    code: 'VIEW_ALL_COMPANY_ORDERS',
    name: 'Xem toàn bộ đơn hàng công ty',
    description: 'Bỏ lọc phạm vi — xem mọi đơn công ty (helper viewScope ORDER).',
  },
  {
    code: 'CREATE_ORDER',
    name: 'Tạo đơn hàng (của bản thân)',
    description: 'Tạo đơn mới (POST order) khi không cần quyền sửa toàn bộ đơn.',
  },
  {
    code: 'CREATE_ORDER_COMPANY',
    name: 'Tạo đơn cho khách toàn công ty',
    description:
      'Bỏ giới hạn «chỉ khách của mình / cấp dưới» khi POST tạo đơn — được chọn khách do NV khác phụ trách hoặc khách chưa gán NV (kết hợp CREATE_ORDER hoặc MANAGE_ORDERS). Quản trị hệ thống và FULL_ACCESS không cần gán riêng.',
  },
  {
    code: 'MANAGE_ORDERS',
    name: 'Quản lý đơn hàng (sửa đơn)',
    description: 'Sửa đơn, tạo đơn (kết hợp CREATE_ORDER), quản lý dòng đơn.',
  },
  {
    code: 'MANAGE_SHIPPING',
    name: 'Quản lý vận đơn',
    description: 'Xác nhận đơn, sửa vận chuyển, Viettel Post, trạng thái giao.',
  },
  {
    code: 'ASSIGN_SHIPPING_DAILY_QUOTA',
    name: 'Gán chỉ tiêu xử lý vận đơn theo ngày',
    description:
      'Gán chỉ tiêu ngày cho nhân viên loại «Vận đơn» (mã SHP, logistics hoặc tên chứa Vận đơn); đặt 0 để xóa chỉ tiêu ngày đó; có thể gán cho chính mình nếu hồ sơ cũng là Vận đơn. API chia đều (round-robin) hàng loạt đơn chờ xác nhận (`POST /orders/distribute-pending-confirm`, mode even) cho NV vận đơn.',
  },

  // ── 12. Kho vận ──
  {
    code: 'MANAGE_WAREHOUSE',
    name: 'Quản lý kho',
    description: 'Nhập/xuất/tồn, quản lý kho vận (inventory routes).',
  },

  // ── 13. Kế toán ──
  {
    code: 'VIEW_ACCOUNTING',
    name: 'Xem kế toán',
    description: 'Xem dữ liệu module kế toán (đọc).',
  },
  {
    code: 'MANAGE_ACCOUNTING',
    name: 'Quản lý kế toán',
    description: 'Ghi/sửa chứng từ, bảng lương, hóa đơn kế toán (theo route).',
  },

  // ── 14. Vận hành & Cơ cấu ──
  {
    code: 'CONFIG_OPERATIONS',
    name: 'Cấu hình Vận hành',
    description: 'Tham số vận hành, mục tiêu KD (cùng EDIT_SETTINGS trên một số API), cấu hình hệ thống dạng key-value.',
  },
  {
    code: 'CONFIG_ORG_STRUCTURE',
    name: 'Cấu hình cơ cấu tổ chức',
    description: 'Tạo/sửa tổ chức, khối, đơn vị, chức danh; sắp xếp cây (không gồm luồng data-flow — xem CONFIG_DATA_FLOW).',
  },
  {
    code: 'CONFIG_DATA_FLOW',
    name: 'Cấu hình luồng dữ liệu',
    description: 'Cập nhật luồng phân data trên khối, gán đơn vị lá (data-flow, staff một số route).',
  },
  {
    code: 'VIEW_DIVISIONS',
    name: 'Xem khối / cấu trúc tổ chức',
    description: 'Xem cấu trúc khối/đơn vị trong báo cáo và màn Vận hành (đọc).',
  },

  // ── 15. Tiện ích ──
  {
    code: 'MANAGE_NOTIFICATIONS',
    name: 'Quản lý thông báo',
    description: 'Tạo/gửi/sửa thông báo hệ thống (notification manager).',
  },
  {
    code: 'CREATE_DRAFT_NOTIFICATION',
    name: 'Tạo thông báo nháp',
    description: 'Tạo bản nháp thông báo trước khi gửi.',
  },
  {
    code: 'MANAGE_DOCUMENTS',
    name: 'Quản lý tài liệu',
    description: 'Upload/quản lý tài liệu module Tài liệu.',
  },
  {
    code: 'MANAGE_INTERNAL_NOTES',
    name: 'Quản lý ghi chú nội bộ',
    description: 'Tạo/sửa ghi chú nội bộ trên khách (internal notes API).',
  },
  {
    code: 'DELETE_CONVERSATION',
    name: 'Xóa cuộc trò chuyện',
    description: 'Xóa nhóm chat / cuộc trò chuyện trong Tin nhắn nội bộ.',
  },
  {
    code: 'DELETE_ORDER',
    name: 'Xóa đơn hàng (vĩnh viễn)',
    description: 'Xóa vĩnh viễn bản ghi đơn hàng khỏi hệ thống (kết hợp VIEW_ORDERS).',
  },
];
