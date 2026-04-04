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
    description: 'Có mọi quyền trong hệ thống. Dành cho Quản trị viên cao cấp nhất.',
  },
  {
    code: 'MANAGE_SYSTEM',
    name: 'Quản trị hệ thống',
    description: 'Truy cập tab Hệ thống, xem nhật ký, quản lý cấu hình và tài khoản nhân sự.',
  },
  {
    code: 'VIEW_LOGS',
    name: 'Xem nhật ký hệ thống',
    description: 'Xem nhật ký hoạt động (audit logs) của toàn bộ hệ thống.',
  },
  {
    code: 'VIEW_ROLE_GROUPS',
    name: 'Xem nhóm quyền',
    description: 'Xem danh sách nhóm quyền và các menu/quyền được gán.',
  },
  {
    code: 'MANAGE_ROLE_GROUPS',
    name: 'Quản lý nhóm quyền',
    description: 'Tạo mới, chỉnh sửa và xóa các nhóm quyền (RBAC).',
  },
  {
    code: 'VIEW_SETTINGS',
    name: 'Xem cấu hình chung',
    description: 'Xem các tham số cấu hình hệ thống, danh mục trạng thái, phân hạng.',
  },
  {
    code: 'EDIT_SETTINGS',
    name: 'Chỉnh sửa cấu hình chung',
    description: 'Cập nhật tham số cấu hình hệ thống, danh mục trạng thái, quy tắc phân hạng.',
  },
  {
    code: 'VIEW_EMPLOYEE_ACCOUNTS',
    name: 'Xem tài khoản nhân sự',
    description: 'Xem danh sách tài khoản đăng nhập của nhân viên.',
  },
  {
    code: 'STAFF_LOGOUT',
    name: 'Buộc đăng xuất nhân viên',
    description: 'Buộc kết thúc phiên làm việc của tài khoản nhân viên.',
  },
  {
    code: 'STAFF_LOCK',
    name: 'Khóa / Mở khóa tài khoản',
    description: 'Khóa hoặc mở khóa quyền đăng nhập của nhân viên.',
  },
  {
    code: 'STAFF_TEMP_PASSWORD',
    name: 'Cấp mật khẩu tạm',
    description: 'Reset và cung cấp mật khẩu tạm cho nhân viên.',
  },
  {
    code: 'STAFF_INSPECT',
    name: 'Kiểm tra phiên đăng nhập',
    description: 'Kiểm tra chi tiết bảo mật và trạng thái hoạt động của nhân viên.',
  },

  // ── 02. Dashboard & Báo cáo ──
  {
    code: 'VIEW_DASHBOARD',
    name: 'Xem Dashboard',
    description: 'Xem biểu đồ tổng quan và các báo cáo nhanh trên trang chủ.',
  },
  {
    code: 'VIEW_REPORTS',
    name: 'Xem module Báo cáo',
    description: 'Truy cập vào module Báo cáo chuyên sâu.',
  },
  {
    code: 'VIEW_PERFORMANCE',
    name: 'Xem báo cáo hiệu suất',
    description: 'Xem báo cáo hiệu suất làm việc của Marketing, Sales và CSKH.',
  },

  // ── 03. Nhân sự (HR) ──
  {
    code: 'VIEW_HR',
    name: 'Xem hồ sơ nhân sự',
    description: 'Xem danh sách và chi tiết hồ sơ nhân viên trong phạm vi quản lý.',
  },
  {
    code: 'CREATE_HR',
    name: 'Tạo hồ sơ nhân viên',
    description: 'Thêm mới nhân viên vào hệ thống (thủ công hoặc import).',
  },
  {
    code: 'UPDATE_HR',
    name: 'Sửa hồ sơ nhân viên',
    description: 'Cập nhật thông tin chi tiết của nhân sự.',
  },
  {
    code: 'DELETE_HR',
    name: 'Xóa hồ sơ nhân viên',
    description: 'Xóa vĩnh viễn hồ sơ nhân sự khỏi hệ thống.',
  },
  {
    code: 'MANAGE_HR',
    name: 'Toàn quyền nhân sự',
    description: 'Toàn quyền thao tác trên module HR (Tạo/Sửa/Xóa/Import).',
  },
  {
    code: 'VIEW_EMPLOYEE_TYPE_CATALOG',
    name: 'Xem danh mục loại nhân viên',
    description: 'Xem danh sách các loại nhân viên (Vận đơn, Sales, HR...).',
  },
  {
    code: 'MANAGE_EMPLOYEE_TYPE_CATALOG',
    name: 'Quản lý danh mục loại nhân viên',
    description: 'Thêm/Sửa/Xóa các loại nhân viên trong hệ thống.',
  },
  {
    code: 'VIEW_CONTRACTS',
    name: 'Xem hợp đồng lao động',
    description: 'Xem danh sách và chi tiết hợp đồng lao động.',
  },
  {
    code: 'MANAGE_CONTRACTS',
    name: 'Quản lý hợp đồng lao động',
    description: 'Tạo mới, cập nhật và xóa hợp đồng lao động.',
  },
  {
    code: 'VIEW_LEAVE_REQUESTS',
    name: 'Xem đơn nghỉ phép',
    description: 'Xem danh sách đơn nghỉ phép của nhân viên.',
  },
  {
    code: 'APPROVE_LEAVE_REQUESTS',
    name: 'Duyệt đơn nghỉ phép',
    description: 'Thực hiện phê duyệt hoặc từ chối đơn nghỉ phép.',
  },
  {
    code: 'DELETE_LEAVE_REQUESTS',
    name: 'Xóa đơn nghỉ phép',
    description: 'Xóa vĩnh viễn dữ liệu đơn nghỉ phép.',
  },
  // ── 04. Kho số & Phân bổ (Data Pool) ──
  {
    code: 'VIEW_FLOATING_POOL',
    name: 'Xem kho số thả nổi',
    description: 'Xem danh sách lead trong kho thả nổi công ty.',
  },
  {
    code: 'MANAGE_DATA_POOL',
    name: 'Quản lý kho số thả nổi',
    description: 'Thêm/Thu hồi lead vào kho, quản lý dữ liệu pool.',
  },
  {
    code: 'DATA_POOL_CONFIG',
    name: 'Cấu hình kho số thả nổi',
    description: 'Cấu hình các tham số vận hành và phân phối kho số.',
  },
  {
    code: 'CONFIG_DISTRIBUTION',
    name: 'Cấu hình tỷ lệ phân bổ',
    description: 'Thiết lập tỷ lệ chia lead cho các đơn vị/nhân sự.',
  },
  {
    code: 'CLAIM_LEAD',
    name: 'Nhận lead từ kho Sales',
    description: 'Tự nhận lead chưa phân công từ kho chung của Sales.',
  },
  {
    code: 'ASSIGN_LEAD',
    name: 'Phân bổ lead chủ động',
    description: 'Giao lead cho nhân viên cụ thể hoặc kích hoạt phân tự động.',
  },
  {
    code: 'RECALL_LEAD',
    name: 'Thu hồi lead',
    description: 'Thu hồi lead đã gán cho nhân viên về kho chung hoặc chuyển người khác.',
  },
  {
    code: 'VIEW_CSKH_POOL',
    name: 'Xem kho số CSKH',
    description: 'Truy cập kho dữ liệu dành riêng cho Chăm sóc khách hàng.',
  },

  // ── 05. Khách hàng ──
  {
    code: 'VIEW_CUSTOMERS',
    name: 'Xem danh sách khách hàng',
    description: 'Xem khách hàng trong phạm vi phân quyền (cá nhân/nhóm/đơn vị).',
  },
  {
    code: 'VIEW_ALL_COMPANY_CUSTOMERS',
    name: 'Xem toàn bộ khách hàng công ty',
    description: 'Xem mọi khách hàng trên hệ thống, không bị hạn chế bởi cơ cấu tổ chức.',
  },
  {
    code: 'CREATE_CUSTOMER',
    name: 'Thêm khách hàng mới',
    description: 'Tạo mới hồ sơ khách hàng (thủ công hoặc import).',
  },
  {
    code: 'UPDATE_CUSTOMER',
    name: 'Sửa thông tin khách hàng',
    description: 'Cập nhật thông tin chi tiết, phân loại, tag khách hàng.',
  },
  {
    code: 'DELETE_CUSTOMER',
    name: 'Xóa khách hàng',
    description: 'Xóa hồ sơ khách hàng khỏi hệ thống.',
  },
  {
    code: 'MANAGE_CUSTOMERS',
    name: 'Toàn quyền quản lý khách hàng',
    description: 'Gồm tất cả quyền Thêm/Sửa/Xóa và quản lý danh mục khách hàng.',
  },

  // ── 06. Marketing ──
  {
    code: 'VIEW_MARKETING_CAMPAIGNS',
    name: 'Xem chiến dịch Marketing',
    description: 'Xem danh sách và kết quả các chiến dịch Marketing.',
  },
  {
    code: 'CREATE_MARKETING_CAMPAIGN',
    name: 'Tạo chiến dịch Marketing',
    description: 'Thiết lập chiến dịch, API key, Webhook tích hợp lead.',
  },
  {
    code: 'UPDATE_MARKETING_CAMPAIGN',
    name: 'Sửa chiến dịch Marketing',
    description: 'Cập nhật tham số, chi phí và trạng thái chiến dịch.',
  },
  {
    code: 'DELETE_MARKETING_CAMPAIGN',
    name: 'Xóa chiến dịch Marketing',
    description: 'Gỡ bỏ hoàn toàn chiến dịch khỏi hệ thống.',
  },
  {
    code: 'VIEW_MARKETING_PLATFORMS',
    name: 'Xem nền tảng Marketing',
    description: 'Xem danh mục các nguồn/nền tảng (Facebook, TikTok, v.v.).',
  },
  {
    code: 'MANAGE_MARKETING_PLATFORMS',
    name: 'Quản lý nền tảng Marketing',
    description: 'Thêm/Sửa/Xóa các nền tảng Marketing.',
  },

  // ── 07. Sales ──
  {
    code: 'VIEW_SALES',
    name: 'Xem module Sales',
    description: 'Xem pipeline, danh sách lead đang xử lý.',
  },
  {
    code: 'UPDATE_SALES_LEAD',
    name: 'Cập nhật trạng thái Sales',
    description: 'Chuyển trạng thái lead, ghi chú tương tác và cập nhật ưu tiên.',
  },
  {
    code: 'MANAGE_SALES',
    name: 'Quản lý Sales (Leader)',
    description: 'Quản lý toàn bộ lead và tương tác của team/đơn vị phụ trách.',
  },

  // ── 08. CSKH (Resales) ──
  {
    code: 'VIEW_RESALES',
    name: 'Xem module CSKH',
    description: 'Xem danh sách khách hàng cần chăm sóc lại/đã mua.',
  },
  {
    code: 'UPDATE_RESALES_LEAD',
    name: 'Cập nhật tương tác CSKH',
    description: 'Ghi nhận lịch sử chăm sóc, trạng thái tái tiêu dùng.',
  },
  {
    code: 'MANAGE_RESALES',
    name: 'Quản lý CSKH (Leader)',
    description: 'Điều phối khách hàng và giám sát tương tác của team CSKH.',
  },

  // ── 09. Sản phẩm (Products) ──
  {
    code: 'VIEW_PRODUCTS',
    name: 'Xem danh sách sản phẩm',
    description: 'Xem thông tin sản phẩm và danh mục hàng hóa.',
  },
  {
    code: 'CREATE_PRODUCT',
    name: 'Thêm sản phẩm mới',
    description: 'Tạo mới bản ghi sản phẩm vào kho hàng bán.',
  },
  {
    code: 'UPDATE_PRODUCT',
    name: 'Cập nhật sản phẩm',
    description: 'Sửa thông tin, giá bán, mô tả sản phẩm.',
  },
  {
    code: 'DELETE_PRODUCT',
    name: 'Xóa sản phẩm',
    description: 'Gỡ bỏ sản phẩm khỏi danh mục kinh doanh.',
  },
  {
    code: 'MANAGE_PRODUCTS',
    name: 'Toàn quyền quản lý sản phẩm',
    description: 'Gồm tất cả quyền Thêm/Sửa/Xóa và quản lý danh mục sản phẩm.',
  },

  // ── 10. Hỗ trợ (Support) ──
  {
    code: 'VIEW_SUPPORT_TICKETS',
    name: 'Xem ticket hỗ trợ',
    description: 'Xem danh sách các yêu cầu hỗ trợ từ khách hàng.',
  },
  {
    code: 'UPDATE_SUPPORT_TICKETS',
    name: 'Xử lý ticket hỗ trợ',
    description: 'Phản hồi, cập nhật trạng thái và giải quyết khiếu nại.',
  },
  {
    code: 'DELETE_SUPPORT_TICKETS',
    name: 'Xóa ticket hỗ trợ',
    description: 'Xóa vĩnh viễn các yêu cầu hỗ trợ.',
  },
  // ── 11. Đơn hàng & Vận chuyển ──
  {
    code: 'VIEW_ORDERS',
    name: 'Xem đơn hàng',
    description: 'Xem danh sách và chi tiết đơn hàng (trong phạm vi phân quyền).',
  },
  {
    code: 'VIEW_ALL_COMPANY_ORDERS',
    name: 'Xem toàn bộ đơn hàng công ty',
    description: 'Xem mọi đơn hàng trên hệ thống, không bị hạn chế bởi cây tổ chức.',
  },
  {
    code: 'CREATE_ORDER',
    name: 'Tạo đơn hàng',
    description: 'Tạo đơn hàng mới (Sales/CSKH).',
  },
  {
    code: 'EDIT_ORDER',
    name: 'Sửa đơn hàng',
    description: 'Cập nhật thông tin người nhận, ghi chú, sản phẩm trong đơn.',
  },
  {
    code: 'CONFIRM_ORDER',
    name: 'Xác nhận đơn hàng',
    description: 'Phê duyệt đơn hàng, chuẩn bị để gửi vận chuyển.',
  },
  {
    code: 'PUSH_ORDER_TO_SHIPPING',
    name: 'Gửi đơn sang vận chuyển (VTP)',
    description: 'Đẩy thông tin sang Viettel Post hoặc đơn vị vận chuyển khác.',
  },
  {
    code: 'CANCEL_ORDER',
    name: 'Hủy đơn hàng',
    description: 'Thực hiện hủy đơn trên hệ thống hoặc trên cổng vận chuyển.',
  },
  {
    code: 'DELETE_ORDER',
    name: 'Xóa đơn hàng (vĩnh viễn)',
    description: 'Xóa hoàn toàn bản ghi đơn hàng khỏi hệ thống.',
  },
  {
    code: 'MANAGE_ORDERS',
    name: 'Toàn quyền đơn hàng',
    description: 'Toàn quyền Thêm/Sửa/Xóa/Xác nhận và quản lý đơn hàng.',
  },
  {
    code: 'MANAGE_SHIPPING',
    name: 'Quản lý vận đơn',
    description: 'Cập nhật trạng thái giao hàng, xử lý hàng hoàn.',
  },
  {
    code: 'ASSIGN_SHIPPING_DAILY_QUOTA',
    name: 'Gán chỉ tiêu vận đơn',
    description: 'Thiết lập chỉ tiêu xử lý đơn hàng ngày cho nhân viên logistics.',
  },

  // ── 12. Kho vận (Inventory) ──
  {
    code: 'VIEW_WAREHOUSE',
    name: 'Xem kho hàng',
    description: 'Xem danh sách kho, vị trí và tồn kho thực tế.',
  },
  {
    code: 'MANAGE_INVENTORY_IN',
    name: 'Nhập kho',
    description: 'Tạo phiếu nhập kho, cập nhật tăng số lượng tồn hàng.',
  },
  {
    code: 'MANAGE_INVENTORY_OUT',
    name: 'Xuất kho',
    description: 'Tạo phiếu xuất kho, cập nhật giảm số lượng tồn hàng.',
  },
  {
    code: 'MANAGE_WAREHOUSE',
    name: 'Toàn quyền quản lý kho',
    description: 'Quản lý toàn bộ hoạt động nhập/xuất/tồn và cấu hình kho.',
  },

  // ── 13. Kế toán (Accounting) ──
  {
    code: 'VIEW_ACCOUNTING',
    name: 'Xem kế toán',
    description: 'Xem dữ liệu thu chi, dòng tiền và báo cáo tài chính.',
  },
  {
    code: 'CREATE_ACCOUNTING',
    name: 'Tạo chứng từ kế toán',
    description: 'Lập phiếu thu, phiếu chi, hóa đơn.',
  },
  {
    code: 'UPDATE_ACCOUNTING',
    name: 'Sửa chứng từ kế toán',
    description: 'Cập nhật thông tin chứng từ đã lập.',
  },
  {
    code: 'MANAGE_ACCOUNTING',
    name: 'Toàn quyền kế toán',
    description: 'Quản lý toàn bộ nghiệp vụ kế toán, dòng tiền và bảng lương.',
  },

  // ── 14. Vận hành & Cơ cấu ──
  {
    code: 'CONFIG_OPERATIONS',
    name: 'Cấu hình vận hành',
    description: 'Thiết lập các tham số hệ thống, mục tiêu kinh doanh.',
  },
  {
    code: 'CONFIG_ORG_STRUCTURE',
    name: 'Cấu hình cơ cấu tổ chức',
    description: 'Tạo/Sửa Khối, Đơn vị, Bộ phận và chức danh.',
  },
  {
    code: 'CONFIG_DATA_FLOW',
    name: 'Cấu hình luồng dữ liệu',
    description: 'Thiết lập luồng phân phối data tự động giữa các khối.',
  },
  {
    code: 'VIEW_DIVISIONS',
    name: 'Xem cấu trúc tổ chức',
    description: 'Xem sơ đồ tổ chức và danh sách đơn vị.',
  },

  // ── 15. Tiện ích ──
  {
    code: 'MANAGE_NOTIFICATIONS',
    name: 'Quản lý thông báo chung',
    description: 'Tạo và quản lý các thông báo trên toàn hệ thống.',
  },
  {
    code: 'SEND_STAFF_NOTIFICATION',
    name: 'Gửi thông báo nhân sự',
    description: 'Gửi thông báo riêng đến từng nhân viên hoặc nhóm nhân sự.',
  },
  {
    code: 'CREATE_DRAFT_NOTIFICATION',
    name: 'Soạn thông báo nháp',
    description: 'Tạo bản nháp thông báo trước khi gửi chính thức.',
  },
  {
    code: 'VIEW_DOCUMENTS',
    name: 'Xem tài liệu công ty',
    description: 'Xem và tải các tài liệu nội bộ.',
  },
  {
    code: 'UPLOAD_DOCUMENT',
    name: 'Tải lên tài liệu',
    description: 'Tải tài liệu mới lên module quản lý tài liệu.',
  },
  {
    code: 'DELETE_DOCUMENT',
    name: 'Xóa tài liệu',
    description: 'Xóa bỏ các tài liệu trong module Tài liệu.',
  },
  {
    code: 'MANAGE_INTERNAL_NOTES',
    name: 'Quản lý ghi chú nội bộ',
    description: 'Thêm và sửa các ghi chú bảo mật trên khách hàng.',
  },
  {
    code: 'DELETE_CONVERSATION',
    name: 'Xóa cuộc trò chuyện',
    description: 'Xóa các nhóm chat hoặc hội thoại tin nhắn nội bộ.',
  },
];
