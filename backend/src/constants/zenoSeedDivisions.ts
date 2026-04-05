/**
 * Bảy khối mặc định dưới nút COMPANY tổ chức ZENO.
 * Giữ nguyên `code` (đã có trong DB / FK) — chỉ đổi `name` khi nghiệp vụ thống nhất nhãn hiển thị.
 */
export const ZENO_SEED_DIVISIONS: readonly { code: string; name: string }[] = [
  { code: 'DIV_KAGARI_BIO', name: 'ZENO BIO' },
  { code: 'DIV_NAM_DUONG', name: 'NAM DƯƠNG' },
  { code: 'DIV_PE', name: 'PE' },
  { code: 'DIV_KVC', name: 'KVC' },
  { code: 'DIV_THICH', name: 'THÍCH' },
  { code: 'DIV_TRUST_NATION', name: 'TRUST' },
  { code: 'DIV_CSKH_TONG', name: 'CSKH TỔNG' },
] as const;
