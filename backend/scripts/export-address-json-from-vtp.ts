/**
 * Xuất backend/data/addresses/*.json trực tiếp từ Viettel Post (V2 + V3).
 * Tên địa danh trong file: Title Case (mỗi từ viết hoa đầu, vi-VN); nạp DB vẫn chuẩn về chữ thường.
 * Cần VTP_TOKEN (và tuỳ chọn VTP_API_URL) trong backend/.env.
 *
 * Chạy: cd backend && npm run export:address:vtp
 */
import path from 'path';
import dotenv from 'dotenv';
import { exportAddressJsonFromVtp } from '../src/services/addressVtpSyncService';

dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true });

const outDir = path.join(__dirname, '..', 'data', 'addresses');

exportAddressJsonFromVtp(outDir)
  .then(() => {
    console.log('Đã ghi JSON vào', outDir);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
