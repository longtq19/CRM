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

/** So sánh theo ngày lịch (UTC date của bản ghi form): ngày bắt đầu phải nhỏ hơn ngày kết thúc (không trùng ngày). */
export function isStrictCampaignStartBeforeEnd(startDate: Date, endDate: Date): boolean {
  const s = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const e = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return s < e;
}

/** Chưa tới ngày bắt đầu (00:00 VN của ngày bắt đầu trên form). */
export function isBeforeCampaignStartDateVietnam(now: Date, startDate: Date | null | undefined): boolean {
  if (!startDate) return false;
  const y = startDate.getUTCFullYear();
  const m = startDate.getUTCMonth();
  const d = startDate.getUTCDate();
  const startOfVietnamDayUtc = Date.UTC(y, m, d, 17, 0, 0, 0) - 24 * 60 * 60 * 1000;
  return now.getTime() < startOfVietnamDayUtc;
}

const TERMINAL_STATUSES = new Set(['ENDED', 'COMPLETED']);

/** Chiến dịch không còn nhận lead / không cấu hình API key mới (theo lịch hoặc trạng thái kết thúc). */
export function isCampaignEndedForApi(now: Date, campaign: {
  status: string;
  startDate: Date;
  endDate: Date | null;
}): boolean {
  if (TERMINAL_STATUSES.has(campaign.status)) return true;
  return isPastCampaignEndDateInclusiveVietnam(now, campaign.endDate);
}
