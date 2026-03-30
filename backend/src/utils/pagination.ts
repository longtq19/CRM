/** Các mức phân trang: 25, 50, 100. Dùng chung cho toàn bộ API danh sách */
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
const ABSOLUTE_MAX_LIMIT = 2000;

export function normalizeLimit(value: unknown): number {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return DEFAULT_PAGE_SIZE;
  if (num > 100 && num <= ABSOLUTE_MAX_LIMIT) return num;
  if (PAGE_SIZES.includes(num as 25 | 50 | 100)) return num;
  if (num <= 25) return 25;
  if (num <= 50) return 50;
  if (num > ABSOLUTE_MAX_LIMIT) return ABSOLUTE_MAX_LIMIT;
  return 100;
}

export function getPaginationParams(query: { page?: unknown; limit?: unknown }) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = normalizeLimit(query.limit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
