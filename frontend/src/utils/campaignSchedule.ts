/**
 * Đồng bộ logic với `backend/src/utils/campaignSchedule.ts` (form ngày YYYY-MM-DD → ISO).
 */

export function isPastCampaignEndDateInclusiveVietnam(now: Date, endDate: Date | null | undefined): boolean {
  if (!endDate) return false;
  const y = endDate.getUTCFullYear();
  const m = endDate.getUTCMonth();
  const d = endDate.getUTCDate();
  const endInclusiveUtc = Date.UTC(y, m, d, 16, 59, 59, 999);
  return now.getTime() > endInclusiveUtc;
}

export function isStrictCampaignStartBeforeEnd(startDate: Date, endDate: Date): boolean {
  const s = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const e = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return s < e;
}

export function isCampaignEndedForDisplay(
  storedStatus: string,
  endDateIso: string | null | undefined,
): boolean {
  if (storedStatus === 'ENDED' || storedStatus === 'COMPLETED') return true;
  if (!endDateIso) return false;
  return isPastCampaignEndDateInclusiveVietnam(new Date(), new Date(endDateIso));
}

/** Trạng thái hiển thị: nếu đã qua ngày kết thúc theo lịch → coi là Kết thúc. */
export function getEffectiveCampaignStatus(
  storedStatus: string,
  endDateIso: string | null | undefined,
): string {
  if (isCampaignEndedForDisplay(storedStatus, endDateIso)) return 'ENDED';
  return storedStatus;
}
