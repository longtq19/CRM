import { API_URL } from '../api/client';

function getBrowserOriginFromApiUrl(): string {
  if (typeof window === 'undefined') return '';
  const api = API_URL || '/api';
  if (api.startsWith('/')) return window.location.origin;
  try {
    return new URL(api).origin;
  } catch {
    return window.location.origin;
  }
}

/**
 * URL hiển thị cho file trong `/uploads/...` (DB lưu đường dẫn tương đối).
 * Dùng origin của **backend** (cùng host với API) khi SPA và API khác host.
 */
export function resolveUploadUrl(path: string | null | undefined): string {
  if (!path) return '';

  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const u = new URL(path);
      if (u.pathname.startsWith('/uploads')) {
        const origin = getBrowserOriginFromApiUrl();
        if (origin) {
          return `${origin}${u.pathname}${u.search}${u.hash}`;
        }
      }
    } catch {
      /* ignore */
    }
    return path;
  }

  if (!path.startsWith('/uploads')) return path;

  const origin = getBrowserOriginFromApiUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${p}` : p;
}
