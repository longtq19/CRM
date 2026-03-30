/**
 * Chuẩn hóa tên địa danh lưu DB / JSON / API địa chỉ: **chữ thường** (locale vi),
 * NFC, gom khoảng trắng — tránh trùng do VTP trả ALL CAPS vs Title Case cùng id khác.
 */

const vi = 'vi-VN';

/**
 * Tên địa danh cho **file JSON xuất** (`export:address:vtp`, copy từ Postman): mỗi từ viết hoa chữ cái đầu (locale `vi-VN`), NFC, gom khoảng trắng.
 * Khi nạp DB / so khớp trùng nghĩa vẫn dùng `storageAdministrativeName` (chữ thường).
 */
export function jsonExportTitleCaseAdministrativeName(name: string): string {
  const s = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!s) return s;
  return s
    .split(' ')
    .map((word) => {
      if (!word) return word;
      const lower = word.toLocaleLowerCase(vi);
      return lower.charAt(0).toLocaleUpperCase(vi) + lower.slice(1);
    })
    .join(' ');
}

/** Giá trị lưu `provinces.name`, `districts.name`, `wards.name` và khi đọc JSON vào DB. */
export function storageAdministrativeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(vi);
}

/** Khóa so sánh / gộp trùng nghĩa (trùng với chuẩn lưu). */
export function normalizeWardNameKey(name: string): string {
  return storageAdministrativeName(name);
}

/**
 * Trong nhóm tên trùng nghĩa (khác cách viết), chọn bản ưu tiên rồi trả **chuẩn lưu** (lowercase).
 */
export function preferredNameAmongDuplicates(names: string[]): string {
  const trimmed = names.map((n) => n.normalize('NFC').trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!trimmed.length) return '';
  const mixed = trimmed.find((n) => n !== n.toLocaleUpperCase(vi));
  const pick = mixed ?? trimmed[0];
  return storageAdministrativeName(pick);
}

export type WardWithMergeMeta<T> = T & { mergedFromIds?: string[] };

/**
 * Gộp xã trùng nghĩa cho `GET /address/wards?directOnly=1`.
 * Giữ `id` số nhỏ nhất; `name` luôn lowercase.
 */
export function mergeWardsByNormalizedNameForResponse<T extends { id: string; name: string }>(
  wards: T[]
): WardWithMergeMeta<T>[] {
  const groups = new Map<string, T[]>();
  for (const w of wards) {
    const k = normalizeWardNameKey(w.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(w);
  }
  const out: WardWithMergeMeta<T>[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push({ ...list[0], name: storageAdministrativeName(list[0].name) } as WardWithMergeMeta<T>);
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id);
    });
    const winner = sorted[0];
    const label = preferredNameAmongDuplicates(sorted.map((w) => w.name));
    const mergedFromIds = sorted.map((w) => w.id);
    out.push({ ...winner, name: label, mergedFromIds } as WardWithMergeMeta<T>);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, vi));
}
