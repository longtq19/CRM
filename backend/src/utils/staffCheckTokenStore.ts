/**
 * Theo dõi JWT kiểm tra tài khoản (staff check) đã tiêu thụ — mỗi jti chỉ dùng một lần trong thời gian sống token.
 * Lưu trong bộ nhớ process: khi chạy nhiều instance Node cần Redis/DB (xem README).
 */

const consumedJti = new Map<string, number>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, expMs] of [...consumedJti.entries()]) {
    if (now > expMs) consumedJti.delete(k);
  }
}

/**
 * Đánh dấu jti đã dùng. Trả về false nếu jti đã được dùng trước đó (token còn hiệu lực).
 * `expUnixSec`: trường `exp` của JWT (Unix timestamp, giây).
 * Gọi đồng bộ trước bất kỳ await nào trong consume.
 */
export function tryMarkStaffCheckJtiConsumedOnce(jti: string, expUnixSec: number): boolean {
  if (!jti || typeof jti !== 'string') return false;
  pruneExpired();
  const expMs = expUnixSec * 1000;
  const now = Date.now();
  if (consumedJti.has(jti)) {
    const prev = consumedJti.get(jti)!;
    if (now > prev) {
      consumedJti.delete(jti);
    } else {
      return false;
    }
  }
  consumedJti.set(jti, expMs);
  return true;
}

/** Gỡ đánh dấu khi consume thất bại (4xx/5xx) để có thể thử lại cùng token. */
export function unmarkStaffCheckJti(jti: string): void {
  consumedJti.delete(jti);
}
