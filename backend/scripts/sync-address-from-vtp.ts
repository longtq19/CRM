/**
 * Đồng bộ danh mục địa chỉ hành chính từ API Viettel Post vào PostgreSQL.
 *
 * Trước khi chạy với --clear: backup DB (trong backend: npm run backup:db).
 *
 * Chạy từ thư mục backend:
 *   npx ts-node scripts/sync-address-from-vtp.ts                    # both, không xóa trước
 *   npx ts-node scripts/sync-address-from-vtp.ts --clear             # xóa danh mục + gỡ FK khách rồi nạp both
 *   npx ts-node scripts/sync-address-from-vtp.ts --old [--clear]
 *   npx ts-node scripts/sync-address-from-vtp.ts --new [--clear]
 *
 * Cần .env: DATABASE_URL, VTP_TOKEN (hoặc đăng nhập VTP — hiện service chỉ dùng token).
 */
import path from 'path';
import dotenv from 'dotenv';
import { runVtpAddressSync, type VtpAddressSource } from '../src/services/addressVtpSyncService';

/** Thư mục backend: `scripts/` (ts-node) hoặc `dist/scripts/` (node bản build). */
function getBackendRoot(): string {
  const parentDir = path.basename(path.dirname(__dirname));
  if (parentDir === 'dist') {
    return path.resolve(__dirname, '..', '..');
  }
  return path.resolve(__dirname, '..');
}

dotenv.config({ path: path.join(getBackendRoot(), '.env'), override: true });

function parseArgs(): { source: VtpAddressSource; clear: boolean } {
  const argv = process.argv.slice(2);
  const clear = argv.includes('--clear');
  const hasNew = argv.includes('--new');
  const hasOld = argv.includes('--old');
  let source: VtpAddressSource = 'both';
  if (hasNew && !hasOld) source = 'new';
  else if (hasOld && !hasNew) source = 'old';
  return { source, clear };
}

(async () => {
  try {
    const { source, clear } = parseArgs();
    if (clear) {
      console.warn(
        '[sync-address-from-vtp] --clear: sẽ xóa customer_addresses, gỡ tỉnh/huyện/xã trên khách, xóa provinces/districts/wards. Đảm bảo đã backup DB.'
      );
    }
    const result = await runVtpAddressSync({ source, clear });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
})();
