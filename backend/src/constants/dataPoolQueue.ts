/** Hàng đợi trong data_pool: tách kho Sales (chưa phân) và kho thả nổi (trả số theo pool_push_processing_statuses). */
export const DATA_POOL_QUEUE = {
  /** Lead mới / import / marketing — NV Sales nhận từ đây (claim / auto). */
  SALES_OPEN: 'SALES_OPEN',
  /** Chỉ số trả về theo trạng thái xử lý cấu hình trong tham số vận hành. */
  FLOATING: 'FLOATING',
} as const;

export type DataPoolQueue = (typeof DATA_POOL_QUEUE)[keyof typeof DATA_POOL_QUEUE];
