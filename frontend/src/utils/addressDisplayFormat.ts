/**
 * Hiển thị địa danh hành chính: Title Case (mỗi từ viết hoa đầu, vi-VN).
 * Khớp logic backend `jsonExportTitleCaseAdministrativeName`; DB vẫn lưu chữ thường.
 */
const vi = 'vi-VN';

export function administrativeTitleCase(name: string): string {
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

/**
 * Khớp tên địa danh (tỉnh/thành…) với khóa trong bản đồ / danh mục cố định khi API trả chữ thường hoặc khác định dạng.
 */
export function matchAdministrativeNameKey<T>(
  rawName: string,
  record: Record<string, T>
): string | undefined {
  if (!rawName?.trim()) return undefined;
  const s = rawName.trim();
  if (Object.prototype.hasOwnProperty.call(record, s)) return s;
  const titled = administrativeTitleCase(s);
  if (Object.prototype.hasOwnProperty.call(record, titled)) return titled;
  const lower = s.toLocaleLowerCase(vi);
  for (const k of Object.keys(record)) {
    if (k.toLocaleLowerCase(vi) === lower) return k;
  }
  return undefined;
}

/** Chuỗi gợi ý dạng "xã, huyện, tỉnh" — Title Case từng đoạn sau dấu phẩy */
export function administrativeTitleCaseAddressLabel(label: string): string {
  if (!label?.trim()) return label;
  return label
    .split(',')
    .map((part) => administrativeTitleCase(part))
    .join(', ');
}

/** Nối tên xã / huyện / tỉnh để hiển thị (đã Title Case) */
export function formatAdminGeoLine(
  ward?: string | null,
  district?: string | null,
  province?: string | null
): string {
  return [ward, district, province]
    .filter((x): x is string => Boolean(x && String(x).trim()))
    .map((n) => administrativeTitleCase(n))
    .join(', ');
}
