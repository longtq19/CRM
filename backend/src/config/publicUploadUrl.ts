/**
 * File lưu trong thư mục backend `uploads/`; Express phục vụ tĩnh `/uploads/...`.
 * API trả và DB lưu đường dẫn tương đối `/uploads/...` (không dùng host CDN/subdomain riêng).
 */

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20MB

/** Trả về `/uploads/...` (không tiền tố domain). */
export function toPublicUploadUrl(relativePath: string): string {
  if (!relativePath) return relativePath;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
}

/** Chuẩn hóa trước khi ghi DB: lưu `/uploads/...`; URL đầy đủ cũ được rút về pathname. */
export function normalizeUploadUrlForStorage(input: string | null | undefined): string | null {
  if (input == null || String(input).trim() === '') return null;
  let s = String(input).trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.pathname.startsWith('/uploads')) {
        return u.pathname + u.search + u.hash;
      }
    } catch {
      /* ignore */
    }
    return s;
  }
  return s.startsWith('/') ? s : `/${s}`;
}

/** Đường dẫn kiểu `uploads/avatars/x.jpg` để nối getRootDir() — xóa file cũ. */
export function localRelativePathFromUploadUrl(url: string): string | null {
  if (!url) return null;
  let pathPart = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      pathPart = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  if (pathPart.startsWith('/uploads/')) {
    return pathPart.replace(/^\//, '');
  }
  return null;
}

export function getMaxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_BYTES;
  if (raw == null || String(raw).trim() === '') return DEFAULT_MAX_BYTES;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1024 * 1024) return DEFAULT_MAX_BYTES;
  return Math.min(n, 100 * 1024 * 1024);
}

/** Giới hạn từng route không vượt MAX_UPLOAD_BYTES. */
export function capUploadFileSize(routeDefaultBytes: number): number {
  return Math.min(routeDefaultBytes, getMaxUploadBytes());
}
