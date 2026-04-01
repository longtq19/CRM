/** Đồng bộ mã với backend `operationParams.ts` — nhãn hiển thị FE. */
export const DEFAULT_LEAD_PROCESSING_STATUS_CODE = 'NEW';

export const POOL_PUSH_STATUS_DEFINITIONS: { code: string; label: string }[] = [
  { code: 'NEW', label: 'Mới' },
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

/** Đồng bộ `DEFAULT_POOL_PUSH_PROCESSING_STATUSES` backend — khi chưa có cấu hình trong DB */
export const DEFAULT_POOL_PUSH_PROCESSING_STATUSES: string[] = [
  'WRONG_NUMBER',
  'INVALID_NUMBER_TYPE',
  'NO_NEED',
  'TRASH_LEAD',
  'RELEASED',
];
