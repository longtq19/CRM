/**
 * Trạng thái xử lý số (Sales) — mã lưu DB / API.
 * Danh sách đẩy kho thả nổi do cấu hình `pool_push_processing_statuses` chọn subset.
 */
export const POOL_PUSH_STATUS_DEFINITIONS: { code: string; label: string }[] = [
  { code: 'WRONG_NUMBER', label: 'Sai số' },
  { code: 'INVALID_NUMBER_TYPE', label: 'Số loại / số không hợp lệ' },
  { code: 'NO_ANSWER', label: 'Không nghe máy' },
  { code: 'NO_NEED', label: 'Không có nhu cầu' },
  { code: 'BROWSING', label: 'Khách tham khảo' },
  { code: 'TRASH_LEAD', label: 'Sổ thả / lead rác' },
  { code: 'DEAL_CLOSED', label: 'Chốt đơn' },
  { code: 'RELEASED', label: 'Trả số / nhả lead' },
  { code: 'FOLLOW_UP_LATER', label: 'Hẹn gọi lại' },
  { code: 'COMPETITOR', label: 'Đang dùng đối thủ' },
  { code: 'PRICE_OBJECTION', label: 'Chê giá' },
];

export const POOL_PUSH_STATUS_CODES = new Set(POOL_PUSH_STATUS_DEFINITIONS.map((d) => d.code));

/** Mặc định: các trạng thái đưa số về kho thả nổi (không gồm chốt đơn). */
export const DEFAULT_POOL_PUSH_PROCESSING_STATUSES: string[] = [
  'WRONG_NUMBER',
  'INVALID_NUMBER_TYPE',
  'NO_ANSWER',
  'NO_NEED',
  'BROWSING',
  'TRASH_LEAD',
  'RELEASED',
  'FOLLOW_UP_LATER',
  'COMPETITOR',
  'PRICE_OBJECTION',
];

export function parsePoolPushStatusesJson(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return [...DEFAULT_POOL_PUSH_PROCESSING_STATUSES];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [...DEFAULT_POOL_PUSH_PROCESSING_STATUSES];
    return arr.filter((x) => typeof x === 'string' && POOL_PUSH_STATUS_CODES.has(x));
  } catch {
    return [...DEFAULT_POOL_PUSH_PROCESSING_STATUSES];
  }
}

export function serializePoolPushStatuses(arr: string[]): string {
  const unique = [...new Set(arr.filter((x) => POOL_PUSH_STATUS_CODES.has(x)))];
  return JSON.stringify(unique.length ? unique : DEFAULT_POOL_PUSH_PROCESSING_STATUSES);
}
