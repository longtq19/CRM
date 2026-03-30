/**
 * Lấy token dài hạn Viettel Post từ USERNAME/PASSWORD trong .env
 * Chạy: node scripts/vtp-get-token.js
 * Sau đó copy token in ra và gán vào VTP_TOKEN trong .env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const VTP_API_URL = (process.env.VTP_API_URL || 'https://partner.viettelpost.vn/v2').replace(/\/$/, '');
const USERNAME = process.env.VTP_USERNAME;
const PASSWORD = process.env.VTP_PASSWORD;

async function main() {
  if (!USERNAME || !PASSWORD) {
    console.log('Thiếu VTP_USERNAME hoặc VTP_PASSWORD trong .env');
    process.exit(1);
  }
  console.log('Bước 1: Đăng nhập lấy token tạm...');
  const loginRes = await fetch(`${VTP_API_URL}/user/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ USERNAME, PASSWORD })
  });
  const loginData = await loginRes.json();
  if (loginData.error || !loginData.data?.token) {
    console.log('Lỗi đăng nhập:', loginData.message || loginData);
    process.exit(1);
  }
  const tempToken = loginData.data.token;
  console.log('Bước 2: Đổi sang token dài hạn...');
  const longRes = await fetch(`${VTP_API_URL}/user/ownerconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Token': tempToken },
    body: JSON.stringify({ USERNAME, PASSWORD })
  });
  const longData = await longRes.json();
  if (longData.error || !longData.data?.token) {
    console.log('Lỗi lấy token dài hạn:', longData.message || longData);
    process.exit(1);
  }
  console.log('\n--- Token dài hạn (ghi vào VTP_TOKEN trong .env) ---');
  console.log(longData.data.token);
  console.log('---');
}

main().catch(e => { console.error(e); process.exit(1); });
