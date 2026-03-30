/**
 * Nguồn chân lý duy nhất cho nhận diện vai trò Marketing / Sales / Resales.
 * Dùng cho báo cáo hiệu suất, dashboard kế toán, phân quyền, v.v.
 *
 * Quy tắc:
 * - Nhận diện theo salesType (Employee.salesType) HOẶC theo roleGroup.code.
 * - Gộp đủ cả mã cũ (MKT_*, SAL_*, CSK_*) và mã mới (MARKETING_*, TELESALES_*, REALSALES_*)
 *   để không làm mất dữ liệu hiện tại.
 */

/** Các mã nhóm vai trò được coi là Marketing (seed: MKT_*, assign-role-groups: MARKETING, MARKETING_MGR) */
export const MARKETING_ROLE_CODES: string[] = [
  'MARKETING',
  'MARKETING_MGR',
  'MKT_STAFF',
  'MKT_MGR',
  'MKT',
  'marketing_staff',
  'marketing_manager',
  'NV_MKT',
  'QL_MKT',
  'MKT_MANAGER'
];

/** Các mã nhóm vai trò được coi là Sales (Telesales / Sales) */
export const SALES_ROLE_CODES: string[] = [
  'SAL_STAFF',
  'SAL_MGR',
  'SAL',
  'sales_executive',
  'sales_manager',
  'NV_SALES',
  'QL_SALES',
  'TELESALES_MGR',
  'TELESALES'
];

/** Các mã nhóm vai trò được coi là Resales (CSKH) */
export const RESALES_ROLE_CODES: string[] = [
  'CSKH_STAFF',
  'CSKH_MGR',
  'NV_CSKH',
  'QL_CSKH',
  'REALSALES_MGR',
  'REALSALES',
  'CSK_MGR',
  'CSK_STAFF',
  'RES',
  'RES_MGR',
  'customer_success_executive',
  'customer_success_manager',
];

/** Điều kiện Prisma where (OR) để lấy nhân viên Marketing */
export const marketingEmployeeWhere = () => ({
  OR: [
    { salesType: 'MARKETING' },
    { roleGroup: { code: { in: MARKETING_ROLE_CODES } } }
  ]
});

/** Điều kiện Prisma where (OR) để lấy nhân viên Sales */
export const salesEmployeeWhere = () => ({
  OR: [
    { salesType: 'SALES' },
    { roleGroup: { code: { in: SALES_ROLE_CODES } } }
  ]
});

/** Điều kiện Prisma where (OR) để lấy nhân viên Resales */
export const resalesEmployeeWhere = () => ({
  OR: [
    { salesType: 'RESALES' },
    { roleGroup: { code: { in: RESALES_ROLE_CODES } } }
  ]
});

/** Kiểm tra roleCode có thuộc Marketing không (dùng cho createdByRole, v.v.) */
export function isMarketingRole(roleCode: string): boolean {
  if (!roleCode) return false;
  if (roleCode === 'marketing_staff' || roleCode === 'marketing_manager') return true;
  const u = roleCode.toUpperCase();
  return u === 'MARKETING' || u.includes('MKT') || u.includes('MARKETING');
}

/** Kiểm tra roleCode có thuộc Resales/CSKH không */
export function isResalesRole(roleCode: string): boolean {
  if (!roleCode) return false;
  if (roleCode === 'customer_success_executive' || roleCode === 'customer_success_manager') return true;
  const u = roleCode.toUpperCase();
  return u === 'RESALES' || u.includes('CSKH') || u.includes('CSK') || u.includes('REALSALES');
}

/** Kiểm tra roleCode có thuộc Sales không */
export function isSalesRole(roleCode: string): boolean {
  if (!roleCode) return false;
  if (isResalesRole(roleCode)) return false;
  if (roleCode === 'sales_executive' || roleCode === 'sales_manager') return true;
  const u = roleCode.toUpperCase();
  return u === 'SALES' || u.includes('SAL') || u.includes('TELESALES');
}
