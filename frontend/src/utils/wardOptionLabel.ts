import { administrativeTitleCase } from './addressDisplayFormat';

/** Chuẩn hóa tên xã để gom các biến thể khoảng trắng / Unicode. */
export function normalizeWardNameKey(name: string): string {
  return name
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi');
}

/** Các khóa tên (đã chuẩn hóa) xuất hiện nhiều hơn một lần trong danh sách. */
export function buildWardDuplicateNameKeys(wards: { name: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const w of wards) {
    const k = normalizeWardNameKey(w.name);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const dups = new Set<string>();
  for (const [k, c] of counts) {
    if (c > 1) dups.add(k);
  }
  return dups;
}

/**
 * Nhãn option: nếu trùng tên với xã khác trong cùng danh sách, thêm hậu tố mã/id để phân biệt.
 */
export function wardSelectLabel(
  w: { id: string; name: string; code?: string | null },
  duplicateNameKeys: Set<string>
): string {
  const k = normalizeWardNameKey(w.name);
  const display = administrativeTitleCase(w.name);
  if (!duplicateNameKeys.has(k)) return display;
  const suffix =
    w.code != null && String(w.code).trim() !== '' && String(w.code) !== w.id
      ? String(w.code).trim()
      : w.id;
  return `${display} · ${suffix}`;
}
