/** Mirror backend `RoleGroup.code` (canonical EN identifiers). */

export const ROLE_CODES = {
  SYSTEM_ADMINISTRATOR: 'system_administrator',
  CRM_ADMINISTRATOR: 'crm_administrator',
} as const;

export function isTechnicalAdminRole(code: string | undefined | null): boolean {
  if (!code) return false;
  if (code === ROLE_CODES.SYSTEM_ADMINISTRATOR) return true;
  return code === 'ADM';
}

/** Nhận diện nhóm CRM (hiển thị). Không dùng để bypass quyền trên FE — chỉ gán qua Nhóm quyền. */
export function isCrmAdministratorRole(code: string | undefined | null): boolean {
  if (!code) return false;
  if (code === ROLE_CODES.CRM_ADMINISTRATOR) return true;
  return code === 'ADMIN';
}

/** Ngoại lệ UI cho thao tác tài khoản nhân sự: chỉ quản trị hệ thống (khớp backend). */
export function isStaffAccountPrivilegedRole(code: string | undefined | null): boolean {
  return isTechnicalAdminRole(code);
}

/**
 * Tab báo cáo doanh thu / dashboard điều hành: quyền catalog hoặc quản trị hệ thống.
 * Truyền `hasPermission` từ `useAuthStore`.
 */
export function hasExecutiveReportUiAccess(
  hasPermission: (permissionCode: string) => boolean,
  roleCode?: string | null
): boolean {
  if (isTechnicalAdminRole(roleCode)) return true;
  return (
    hasPermission('VIEW_REPORTS') ||
    hasPermission('VIEW_PERFORMANCE') ||
    hasPermission('FULL_ACCESS')
  );
}

/**
 * Tab báo cáo hiệu quả & xếp hạng trong module Sales / CSKH (API `/performance/sales` | `/performance/resales`).
 */
export function hasModuleEffectivenessAccess(
  hasPermission: (permissionCode: string) => boolean,
  module: 'sales' | 'cskh',
  roleCode?: string | null
): boolean {
  if (isTechnicalAdminRole(roleCode)) return true;
  if (hasPermission('FULL_ACCESS')) return true;
  if (hasPermission('VIEW_PERFORMANCE') || hasPermission('VIEW_REPORTS')) return true;
  return module === 'sales'
    ? hasPermission('VIEW_SALES_EFFECTIVENESS')
    : hasPermission('VIEW_CSKH_EFFECTIVENESS');
}

