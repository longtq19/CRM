/**
 * Ảnh fallback ui-avatars.com: màu nền **ổn định theo chuỗi** (cùng tên → cùng ảnh mọi máy).
 * Không dùng `background=random` — tham số đó khiến mỗi lần tải có thể ra màu/ảnh khác nhau.
 */
export function avatarBackgroundHexFromString(input: string): string {
  let h = 2166136261;
  const s = String(input ?? '').trim() || '?';
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}

export function getUiAvatarFallbackUrl(
  name: string,
  opts?: { textColor?: string; size?: number; bold?: boolean }
): string {
  const params = new URLSearchParams();
  params.set('name', String(name ?? '').trim() || '?');
  params.set('background', avatarBackgroundHexFromString(name));
  params.set('color', opts?.textColor ?? 'fff');
  if (opts?.size != null) params.set('size', String(opts.size));
  if (opts?.bold) params.set('bold', 'true');
  return `https://ui-avatars.com/api/?${params.toString()}`;
}
