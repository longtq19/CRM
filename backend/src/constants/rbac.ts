/**
 * RBAC canonical role codes (EN) — stored in DB as RoleGroup.code.
 * Display strings live in frontend i18n: role.<code_with_underscores> → e.g. role.system_administrator
 */

export const ROLE_CODES = {
  SYSTEM_ADMINISTRATOR: 'system_administrator',
  CRM_ADMINISTRATOR: 'crm_administrator',
  MARKETING_STAFF: 'marketing_staff',
  MARKETING_MANAGER: 'marketing_manager',
  SALES_EXECUTIVE: 'sales_executive',
  SALES_MANAGER: 'sales_manager',
  CUSTOMER_SUCCESS_EXECUTIVE: 'customer_success_executive',
  CUSTOMER_SUCCESS_MANAGER: 'customer_success_manager',
  LOGISTICS_STAFF: 'logistics_staff',
  LOGISTICS_MANAGER: 'logistics_manager',
  WAREHOUSE_STAFF: 'warehouse_staff',
  WAREHOUSE_MANAGER: 'warehouse_manager',
  ACCOUNTANT: 'accountant',
  ACCOUNTING_MANAGER: 'accounting_manager',
  HR_ASSISTANT: 'hr_assistant',
  HR_MANAGER: 'hr_manager',
} as const;

export type RoleGroupCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

/** Legacy RoleGroup.code → new canonical code (for migration / seeds). */
export const LEGACY_ROLE_CODE_MAP: Record<string, string> = {
  ADM: ROLE_CODES.SYSTEM_ADMINISTRATOR,
  ADMIN: ROLE_CODES.CRM_ADMINISTRATOR,
  BOD: ROLE_CODES.CRM_ADMINISTRATOR,

  MKT: ROLE_CODES.MARKETING_STAFF,
  MKT_STAFF: ROLE_CODES.MARKETING_STAFF,
  MKT_MGR: ROLE_CODES.MARKETING_MANAGER,

  SAL: ROLE_CODES.SALES_EXECUTIVE,
  SAL_STAFF: ROLE_CODES.SALES_EXECUTIVE,
  SAL_MGR: ROLE_CODES.SALES_MANAGER,

  RES: ROLE_CODES.CUSTOMER_SUCCESS_EXECUTIVE,
  RES_MGR: ROLE_CODES.CUSTOMER_SUCCESS_MANAGER,
  CSK_STAFF: ROLE_CODES.CUSTOMER_SUCCESS_EXECUTIVE,
  CSK_MGR: ROLE_CODES.CUSTOMER_SUCCESS_MANAGER,

  SHP: ROLE_CODES.LOGISTICS_STAFF,
  SHP_MGR: ROLE_CODES.LOGISTICS_MANAGER,
  LOG_STAFF: ROLE_CODES.LOGISTICS_STAFF,
  LOG_MGR: ROLE_CODES.LOGISTICS_MANAGER,

  WHR: ROLE_CODES.WAREHOUSE_STAFF,
  WHR_MGR: ROLE_CODES.WAREHOUSE_MANAGER,

  HRA: ROLE_CODES.HR_ASSISTANT,
  HRA_STAFF: ROLE_CODES.HR_ASSISTANT,
  HRA_MGR: ROLE_CODES.HR_MANAGER,

  ITC: ROLE_CODES.HR_ASSISTANT,
  ITC_STAFF: ROLE_CODES.HR_ASSISTANT,
  ITC_MGR: ROLE_CODES.HR_MANAGER,

  ACC_STAFF: ROLE_CODES.ACCOUNTANT,
  ACC_MGR: ROLE_CODES.ACCOUNTING_MANAGER,

  COM_STAFF: ROLE_CODES.MARKETING_STAFF,
  COM_MGR: ROLE_CODES.MARKETING_MANAGER,
  ECO_STAFF: ROLE_CODES.MARKETING_STAFF,
  ECO_MGR: ROLE_CODES.MARKETING_MANAGER,
};

/** Technical system admin — full permission bypass in API (replaces legacy ADM). */
export function isTechnicalAdminRoleCode(code: string | undefined | null): boolean {
  if (!code) return false;
  if (code === ROLE_CODES.SYSTEM_ADMINISTRATOR) return true;
  return code === 'ADM';
}

/** Nhận diện nhóm CRM (seed/migration/i18n). Không dùng để bypass quyền API — chỉ gán qua Nhóm quyền + JWT. */
export function isCrmAdministratorRoleCode(code: string | undefined | null): boolean {
  if (!code) return false;
  if (code === ROLE_CODES.CRM_ADMINISTRATOR) return true;
  return code === 'ADMIN';
}

/**
 * Kiểm tra quyền catalog trên JWT (sau `authenticate`).
 * Chỉ `system_administrator` / legacy `ADM` bypass; `FULL_ACCESS` tương đương một trong các mã truyền vào.
 */
export function userHasCatalogPermission(
  user: { roleGroupCode?: string | null; permissions?: string[] } | null | undefined,
  codes: string | string[]
): boolean {
  if (!user) return false;
  if (isTechnicalAdminRoleCode(user.roleGroupCode)) return true;
  const perms = user.permissions || [];
  if (perms.includes('FULL_ACCESS')) return true;
  const list = Array.isArray(codes) ? codes : [codes];
  return list.some((c) => perms.includes(c));
}

/** May manage staff session logout / lock from Settings — chỉ quản trị hệ thống; STAFF_* vẫn kiểm tra ở API. */
export function isStaffAccountPrivilegedRoleCode(code: string | undefined | null): boolean {
  return isTechnicalAdminRoleCode(code);
}

/** HR full-management roles: toàn quyền module Nhân sự. */
export function isHrManagementRoleCode(code: string | undefined | null): boolean {
  if (!code) return false;
  if (code === ROLE_CODES.HR_ASSISTANT || code === ROLE_CODES.HR_MANAGER) return true;
  return ['HR_ASSISTANT', 'HR_MANAGER', 'HRA', 'HRA_STAFF', 'HRA_MGR', 'NV_HCNS', 'QL_HCNS'].includes(code);
}

/** @deprecated Dùng `userHasCatalogPermission` + quyền catalog; giữ chỉ cho tương thích. */
export function canAccessOperationsModuleByRoleCode(code: string | undefined | null): boolean {
  return isTechnicalAdminRoleCode(code);
}

/** Chỉ technical admin được CRUD module Hệ thống. */
export function canCrudSystemModuleByRoleCode(code: string | undefined | null): boolean {
  return isTechnicalAdminRoleCode(code);
}
