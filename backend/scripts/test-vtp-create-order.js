/**
 * Test API tạo đơn hàng Viettel Post (HCRM) — POST /api/vtp/create-order
 * Chạy: node scripts/test-vtp-create-order.js
 * Cần: server HCRM đang chạy, .env có thể có AUTH_PHONE, AUTH_PASSWORD để đăng nhập.
 * (Luồng POST /api/orders/outside-system đã gỡ khỏi sản phẩm.)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_PHONE = process.env.AUTH_PHONE || process.env.TEST_LOGIN_PHONE;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || process.env.TEST_LOGIN_PASSWORD;

const CREATE_VTP_ORDER_BODY = {
  orderCode: 'TEST-VTP-' + Date.now(),
  senderName: 'KAGRI BIO',
  senderPhone: '0352737467',
  senderAddress: 'Số 103, ngõ 95, Đạo Xuyên, Bát Tràng',
  senderProvince: 1,
  senderDistrict: 8,
  senderWard: 175,
  receiverName: 'Nguyễn Văn Test',
  receiverPhone: '0987654321',
  receiverAddress: 'Số 1, Phường Bến Nghé, Quận 1, Hồ Chí Minh',
  receiverProvince: 2,
  receiverDistrict: 43,
  receiverWard: 25,
  productName: 'Hàng test API',
  productWeight: 500,
  productPrice: 100000,
  moneyCollection: 100000,
  serviceType: 'VCN',
  note: 'Test tạo đơn từ script'
};

async function login() {
  if (!AUTH_PHONE || !AUTH_PASSWORD) return null;
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: AUTH_PHONE, password: AUTH_PASSWORD })
  });
  const data = await res.json();
  const cookie = res.headers.get('set-cookie');
  return { token: data?.token, cookie, user: data?.user };
}

async function createVTPOrderDirect(cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(`${BASE_URL}/api/vtp/create-order`, {
    method: 'POST',
    headers,
    body: JSON.stringify(CREATE_VTP_ORDER_BODY)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  return { status: res.status, data };
}

async function main() {
  console.log('=== Test POST /api/vtp/create-order (Viettel Post) ===');
  console.log('BASE_URL:', BASE_URL);
  console.log('');

  let cookie = null;
  try {
    const loginResult = await login();
    if (loginResult?.cookie) {
      cookie = loginResult.cookie.split(';')[0];
      console.log('Đăng nhập: OK');
    } else {
      console.log('Đăng nhập: bỏ qua (không có AUTH_PHONE/AUTH_PASSWORD hoặc sai)');
    }
  } catch (e) {
    console.log('Đăng nhập: Lỗi kết nối', e.message);
  }

  console.log('');
  console.log('Gọi POST /api/vtp/create-order...');
  try {
    const { status, data } = await createVTPOrderDirect(cookie);
    console.log('HTTP Status:', status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Lỗi gọi API:', e.message);
  }
}

main();
