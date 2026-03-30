/**
 * Chỉ xóa danh mục địa chỉ trong DB (provinces / districts / wards) và gỡ FK liên quan.
 * Không nạp lại dữ liệu — dùng khi muốn tách bước: xóa → rồi seed từ JSON / sync VTP sau.
 *
 * Bắt buộc backup trước: npm run backup:db
 *
 * Chạy từ backend:
 *   npx ts-node scripts/clear-address-catalog.ts --yes
 *   npm run clear:address:db -- --yes
 */
import path from 'path';
import dotenv from 'dotenv';
import { clearAddressCatalogForReseed } from '../src/services/addressVtpSyncService';

function getBackendRoot(): string {
  const parentDir = path.basename(path.dirname(__dirname));
  if (parentDir === 'dist') {
    return path.resolve(__dirname, '../..');
  }
  return path.resolve(__dirname, '..');
}

dotenv.config({ path: path.join(getBackendRoot(), '.env'), override: true });

(async () => {
  if (!process.argv.includes('--yes')) {
    console.error(
      'Thiếu --yes. Thao tác sẽ xóa customer_addresses, gỡ tỉnh/huyện/xã trên khách, xóa toàn bộ provinces/districts/wards.\n' +
        'Chạy: npm run backup:db rồi: npm run clear:address:db -- --yes'
    );
    process.exit(1);
  }
  try {
    await clearAddressCatalogForReseed();
    console.log('Đã xóa danh mục địa chỉ trong DB.');
    console.log('Bước tiếp (chọn một):');
    console.log('  - VTP: npm run sync:address:vtp (hoặc :prod sau build)');
    console.log('  - JSON: npm run seed:address (cần đủ file trong data/addresses/)');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
})();
