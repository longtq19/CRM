/**
 * Ngày kết thúc trên form (`YYYY-MM-DD` → thường lưu `T00:00:00.000Z` cùng ngày lịch UTC).
 * Coi chiến dịch còn nhận lead đến hết 23:59:59.999 theo giờ Việt Nam (UTC+7, không DST) của ngày đó.
 */
export function isPastCampaignEndDateInclusiveVietnam(now: Date, endDate: Date | null | undefined): boolean {
  if (!endDate) return false;
  const y = endDate.getUTCFullYear();
  const m = endDate.getUTCMonth();
  const d = endDate.getUTCDate();
  const endInclusiveUtc = Date.UTC(y, m, d, 16, 59, 59, 999);
  return now.getTime() > endInclusiveUtc;
}
