/**
 * Đồng bộ với `backend/src/config/routePermissionPolicy.ts`.
 * Quyền thực tế chỉ gán qua Nhóm quyền trong DB.
 */

/** DELETE .../staff-assignment/:employeeId — đồng bộ `OPS_LEAF_STAFF_REMOVE_PERMISSIONS` (backend). */
export const OPS_LEAF_STAFF_REMOVE_PERMISSIONS = [
  'CONFIG_ORG_STRUCTURE',
  'CONFIG_DATA_FLOW',
  'MANAGE_HR',
] as const;

export const SYSTEM_MODULE_PATH_ACCESS_PERMISSIONS = [
  'FULL_ACCESS',
  'VIEW_ROLE_GROUPS',
  'MANAGE_ROLE_GROUPS',
  'VIEW_SETTINGS',
  'EDIT_SETTINGS',
  'VIEW_LOGS',
  'MANAGE_SYSTEM',
  'STAFF_LOCK',
  'STAFF_LOGOUT',
  'STAFF_TEMP_PASSWORD',
  'STAFF_INSPECT',
  'MANAGE_EMPLOYEE_ACCOUNTS',
] as const;

/** Vào `/data-pool` khi có quyền xem kho thả nổi hoặc kho theo đơn vị quản lý (không bắt buộc có menu nếu đủ quyền). */
export const DATA_POOL_MODULE_PATH_ACCESS_PERMISSIONS = [
  'VIEW_FLOATING_POOL',
  'VIEW_MANAGED_UNIT_POOL',
] as const;

/** Vào `/sales` khi có quản lý Marketing + Sales (không bắt buộc có menu nếu đủ quyền). */
export const SALES_MODULE_PATH_ACCESS_PERMISSIONS = [
  'MANAGE_MARKETING_GROUPS',
  'MANAGE_SALES',
] as const;
