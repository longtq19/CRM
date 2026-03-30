/**
 * Kiểm tra nhanh API getPriceAll Viettel Post (cùng payload FE/backend tính cước).
 * Chạy: node scripts/test-vtp-getPriceAll.js
 * Cần .env: VTP_TOKEN hoặc VTP_USERNAME + VTP_PASSWORD
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axios = require('axios');

const apiUrl = (process.env.VTP_API_URL || 'https://partner.viettelpost.vn/v2').replace(/\/$/, '');

async function getToken() {
  const env = process.env.VTP_TOKEN || process.env.VIETTEL_POST_TOKEN;
  if (env && String(env).trim()) return String(env).trim();
  const u = process.env.VTP_USERNAME;
  const p = process.env.VTP_PASSWORD;
  if (!u || !p) throw new Error('Cần VTP_TOKEN hoặc VTP_USERNAME + VTP_PASSWORD');
  const r = await axios.post(`${apiUrl}/user/Login`, { USERNAME: u, PASSWORD: p });
  const t = r.data?.data?.token;
  if (!t) throw new Error('Login VTP thất bại');
  return t;
}

async function main() {
  console.log('=== Test VTP getPriceAll (không gửi kích thước) ===');
  const token = await getToken();
  const senderWard = parseInt(process.env.VTP_SENDER_WARD || '175', 10);
  // Cùng tỉnh (Hà Nội) — ID phải khớp danh mục VTP tài khoản; có thể chỉnh env VTP_TEST_*.
  const S_P = parseInt(process.env.VTP_TEST_SENDER_PROVINCE || '1', 10);
  const S_D = parseInt(process.env.VTP_TEST_SENDER_DISTRICT || '8', 10);
  const R_P = parseInt(process.env.VTP_TEST_RECEIVER_PROVINCE || '1', 10);
  const R_D = parseInt(process.env.VTP_TEST_RECEIVER_DISTRICT || '8', 10);
  const R_W = parseInt(process.env.VTP_TEST_RECEIVER_WARD || String(senderWard), 10);
  const body = {
    SENDER_PROVINCE: S_P,
    SENDER_DISTRICT: S_D,
    SENDER_WARD: senderWard,
    RECEIVER_PROVINCE: R_P,
    RECEIVER_DISTRICT: R_D,
    RECEIVER_WARD: R_W,
    PRODUCT_TYPE: 'HH',
    PRODUCT_WEIGHT: 1200,
    PRODUCT_PRICE: 100000,
    MONEY_COLLECTION: 100000,
    TYPE: 1,
  };
  const res = await axios.post(`${apiUrl}/order/getPriceAll`, body, {
    headers: { Token: token, 'Content-Type': 'application/json' },
  });
  const data = res.data;
  if (data?.error === true) {
    console.error('VTP lỗi:', data.message);
    process.exit(1);
  }
  if (Array.isArray(data) && data.length) {
    console.log('OK: nhận', data.length, 'dịch vụ. Ví dụ:', data[0].MA_DV_CHINH, data[0].GIA_CUOC);
  } else if (Array.isArray(data?.data)) {
    console.log('OK (data.data):', data.data.length, 'dịch vụ');
  } else {
    console.log('Response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
