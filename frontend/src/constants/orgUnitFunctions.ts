/**
 * Chức năng đơn vị lá — khớp `OrgFunc` backend / Prisma.
 */
export const ORG_UNIT_FUNCTION_CODES = [
  'MARKETING',
  'SALES',
  'CSKH',
  'REV_DATA_BEFORE_20250701',
  'REV_DATA_RANGE_20250701_20260131',
] as const;

export type OrgUnitFunctionCode = (typeof ORG_UNIT_FUNCTION_CODES)[number];

export const ORG_FUNC_RELAXED_STAFF_PICKER = new Set<string>([
  'REV_DATA_BEFORE_20250701',
  'REV_DATA_RANGE_20250701_20260131',
]);

/** Nhãn form / badge (tiếng Việt đầy đủ theo nghiệp vụ). */
export const ORG_UNIT_FUNCTION_LABELS: Record<OrgUnitFunctionCode, string> = {
  MARKETING: 'Marketing',
  SALES: 'Sales',
  CSKH: 'Chăm sóc khách hàng',
  REV_DATA_BEFORE_20250701:
    'Ghi nhận doanh thu phát sinh từ data có trước ngày 01/07/2025',
  REV_DATA_RANGE_20250701_20260131:
    'Ghi nhận doanh thu phát sinh từ data có được trong khoảng ngày 01/07/2025 đến ngày 31/01/2026',
};

/** Nhãn gọn trên badge dòng đơn vị (tránh dòng quá dài). */
export const ORG_UNIT_FUNCTION_BADGE_LABELS: Record<OrgUnitFunctionCode, string> = {
  MARKETING: 'Marketing',
  SALES: 'Sales',
  CSKH: 'CSKH',
  REV_DATA_BEFORE_20250701: 'DT — data trước 01/07/2025',
  REV_DATA_RANGE_20250701_20260131: 'DT — data 01/07/2025–31/01/2026',
};
