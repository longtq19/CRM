/** Lưu trong `departments.data_flow_shares` (khối DIVISION). Phần trăm 0–100; tổng mỗi nhóm ≤ 100. */
export type DivisionDataFlowSharesJson = {
  marketingToSalesPct?: Record<string, number>;
  /** Phân % MKT→Sales theo khối con trực tiếp (id = bản ghi DIVISION con) khi trong cây có Sales ở các nhánh khối con */
  marketingToSalesChildDivisionPct?: Record<string, number>;
  salesToCsPct?: Record<string, number>;
  /** Phân % Sales→CSKH theo khối con trực tiếp (id = DIVISION con) */
  salesToCsChildDivisionPct?: Record<string, number>;
  /** Khối chỉ có đơn vị CSKH: chia tỉ lệ giữa các CSKH */
  csOnlyPct?: Record<string, number>;
  /** Marketing → Sales khi luồng từ khối đồng cấp có MKT; lưu trên khối nhận (có Sales lá), key = đơn vị lá Sales */
  externalMarketingToSalesPct?: Record<string, number>;
};
