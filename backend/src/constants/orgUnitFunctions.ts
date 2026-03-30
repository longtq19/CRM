/**
 * Mã chức năng đơn vị lá (`departments.function` / Prisma `OrgFunc`).
 * Đồng bộ với `schema.prisma` enum `OrgFunc`.
 */
export const ORG_UNIT_FUNCTION_CODES = [
  'MARKETING',
  'SALES',
  'CSKH',
  'REV_DATA_BEFORE_20250701',
  'REV_DATA_RANGE_20250701_20260131',
] as const;

export type OrgUnitFunctionCode = (typeof ORG_UNIT_FUNCTION_CODES)[number];

export function isAllowedOrgUnitFunction(value: string): value is OrgUnitFunctionCode {
  return (ORG_UNIT_FUNCTION_CODES as readonly string[]).includes(value);
}

/** Chức năng không bắt buộc khớp `employee_types` Marketing/Sales/CSKH khi gán nhân viên. */
export const ORG_FUNC_RELAXED_EMPLOYEE_TYPE_MATCH = new Set<string>([
  'REV_DATA_BEFORE_20250701',
  'REV_DATA_RANGE_20250701_20260131',
]);
