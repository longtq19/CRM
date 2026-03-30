/** Các mức phân trang dùng chung cho toàn bộ danh sách */
export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 25;

export function normalizePageSize(value: number): PageSize {
  if (PAGE_SIZES.includes(value as PageSize)) return value as PageSize;
  if (value <= 25) return 25;
  if (value <= 50) return 50;
  return 100;
}
