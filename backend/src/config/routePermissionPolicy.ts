/**
 * Chính sách API: mỗi route khai báo **mã quyền** (Permission.code trong DB).
 * Việc **ai** có quyền đó chỉ được cấu hình qua **Nhóm quyền** (gán permission cho role group), không gán theo mã nhóm vai trò cứng trong code.
 *
 * Ngoại lệ duy nhất trong `authMiddleware.checkPermission`: nhóm **system_administrator** / legacy **ADM**
 * luôn full API (và nhóm đó không sửa RBAC qua FE — xử lý trong `roleGroupController`).
 */

/** Đọc master tổ chức / danh sách NV (HR) — dùng cho nhiều GET /hr/... */
export const ORG_MASTER_READ_PERMISSIONS = [
  'MANAGE_HR',
  'VIEW_HR',
  'CONFIG_ORG_STRUCTURE',
  'CONFIG_DATA_FLOW',
  'CONFIG_OPERATIONS',
  'MANAGE_ROLE_GROUPS',
  'EDIT_SETTINGS',
] as const;

/** Ghi cấu trúc tổ chức (org, khối, đơn vị, chức danh) */
export const ORG_STRUCTURE_WRITE_PERMISSIONS = [
  'MANAGE_HR',
  'CREATE_HR',
  'UPDATE_HR',
  'DELETE_HR',
  'CONFIG_ORG_STRUCTURE',
] as const;

/** Ghi luồng dữ liệu / cập nhật đơn vị có nhánh data-flow */
export const DIVISION_DATA_FLOW_WRITE_PERMISSIONS = [
  'MANAGE_HR',
  'CONFIG_ORG_STRUCTURE',
  'CONFIG_DATA_FLOW',
] as const;

/** Đọc danh mục phục vụ hồ sơ NV (công ty con, ngân hàng, loại HĐ, trạng thái, …) */
export const HR_MASTER_CATALOG_READ_PERMISSIONS = [
  'MANAGE_HR',
  'VIEW_HR',
  'CREATE_HR',
  'UPDATE_HR',
] as const;

/**
 * Xóa hẳn bản ghi đơn nghỉ phép (POST .../permanent-delete). Chỉ mã này — không dùng MANAGE_HR/MANAGE_LEAVE.
 * `checkPermission` còn chấp nhận FULL_ACCESS + quản trị kỹ thuật.
 * Trong controller: đơn APPROVED/CONFIRMED chỉ xóa được nếu JWT có đúng `DELETE_LEAVE_REQUESTS` hoặc quản trị kỹ thuật (FULL_ACCESS không đủ).
 */
export const LEAVE_REQUEST_PERMANENT_DELETE_PERMISSIONS = ['DELETE_LEAVE_REQUESTS'] as const;

/** Tab Danh mục → Loại nhân viên: xem danh sách (kèm đã ẩn) */
export const EMPLOYEE_TYPE_CATALOG_VIEW_PERMISSIONS = [
  'VIEW_EMPLOYEE_TYPE_CATALOG',
  'MANAGE_EMPLOYEE_TYPE_CATALOG',
  'MANAGE_HR',
] as const;

/** Thêm / sửa / xóa bản ghi loại nhân viên */
export const EMPLOYEE_TYPE_CATALOG_WRITE_PERMISSIONS = [
  'MANAGE_EMPLOYEE_TYPE_CATALOG',
  'MANAGE_HR',
  'UPDATE_HR',
] as const;

/** GET /hr/role-groups (dropdown HR / RBAC) */
export const HR_ROLE_GROUP_LIST_PERMISSIONS = [
  'MANAGE_HR',
  'MANAGE_ROLE_GROUPS',
  'EDIT_SETTINGS',
] as const;

/** POST /hr/employees/assign-role-group */
export const HR_ASSIGN_ROLE_GROUP_PERMISSIONS = [
  'MANAGE_HR',
  'UPDATE_HR',
  'MANAGE_ROLE_GROUPS',
  'EDIT_SETTINGS',
] as const;

/**
 * Gỡ nhân viên khỏi đơn vị lá vận hành (DELETE staff-assignment).
 */
export const OPS_LEAF_STAFF_REMOVE_PERMISSIONS = [
  'CONFIG_ORG_STRUCTURE',
  'CONFIG_DATA_FLOW',
  'MANAGE_HR',
  'DELETE_HR',
] as const;

/** Bỏ lọc phạm vi HR khi xem danh sách/chi tiết NV (đủ quyền RBAC/cấu hình) */
export const HR_EMPLOYEE_SCOPE_BYPASS_PERMISSIONS = ['MANAGE_ROLE_GROUPS', 'EDIT_SETTINGS'] as const;

/**
 * GET /hr/employees?marketingOwnerOptions=1 — dropdown «Gán Marketing» khi Sales/CSKH/Marketing tạo khách:
 * bỏ lọc phạm vi HR, chỉ trả NV loại marketing (employee_types.code = marketing hoặc sales_type khớp).
 */
export const MARKETING_OWNER_DROPDOWN_READ_PERMISSIONS = [
  'MANAGE_SALES',
  'VIEW_SALES',
  'MANAGE_CUSTOMERS',
  'CREATE_CUSTOMER',
  'UPDATE_CUSTOMER',
  'VIEW_CUSTOMERS',
  'MANAGE_RESALES',
] as const;

/** API role-groups (RBAC) */
export const ROLE_GROUP_API_READ_PERMISSIONS = ['VIEW_ROLE_GROUPS', 'VIEW_SETTINGS'] as const;
export const ROLE_GROUP_API_WRITE_PERMISSIONS = ['MANAGE_ROLE_GROUPS', 'EDIT_SETTINGS'] as const;

/** Auth admin nhân sự */
export const AUTH_ADMIN_SET_TEMP_PASSWORD_PERMISSIONS = ['STAFF_TEMP_PASSWORD'] as const;
export const AUTH_ADMIN_STAFF_CHECK_TOKEN_PERMISSIONS = ['STAFF_INSPECT'] as const;
export const AUTH_ADMIN_LOGOUT_PERMISSIONS = ['STAFF_LOGOUT'] as const;
export const AUTH_ADMIN_LOCK_PERMISSIONS = ['STAFF_LOCK'] as const;

/** Nhật ký hệ thống */
export const SYSTEM_LOGS_READ_PERMISSIONS = ['VIEW_LOGS', 'MANAGE_SYSTEM'] as const;

/**
 * SPA `/system`: cho phép vào khi có quyền nghiệp vụ dù chưa gắn menu (đồng bộ `frontend/src/constants/routePermissionPolicy.ts`).
 */
export const SYSTEM_MODULE_PATH_ACCESS_PERMISSIONS = [
  'FULL_ACCESS',
  'VIEW_ROLE_GROUPS',
  'MANAGE_ROLE_GROUPS',
  'VIEW_SETTINGS',
  'EDIT_SETTINGS',
  'VIEW_LOGS',
  'MANAGE_SYSTEM',
  'VIEW_EMPLOYEE_ACCOUNTS',
  'STAFF_LOCK',
  'STAFF_LOGOUT',
  'STAFF_TEMP_PASSWORD',
  'STAFF_INSPECT',
] as const;

/** Helper: kiểm tra mảng permission từ JWT (nhóm quyền) */
export function userHasAnyPermission(
  userPermissions: string[] | undefined,
  required: readonly string[]
): boolean {
  const p = userPermissions || [];
  return required.some((code) => p.includes(code));
}

export function userBypassesHrEmployeeScope(userPermissions: string[] | undefined): boolean {
  return userHasAnyPermission(userPermissions, HR_EMPLOYEE_SCOPE_BYPASS_PERMISSIONS);
}
