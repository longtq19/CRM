/**
 * Thử tạo một đơn vận chuyển thật trên Viettel Post (API partner).
 * Điều kiện: .env có VTP_TOKEN hoặc VTP_USERNAME+VTP_PASSWORD.
 *
 * Mặc định nhận: **liên tỉnh** Hà Nội (VTP_SENDER_*) → TP.HCM (2 / 43 / 49289) — tránh cùng điểm gửi–nhận
 * (VTP thường từ chối) và khớp getPriceAll. Ghi đè bằng `VTP_TEST_RECEIVER_PROVINCE|DISTRICT|WARD`.
 * `VTP_TEST_USE_DB_RECEIVER=1` — lấy tỉnh/huyện/xã nhận từ DB (cần sync địa chỉ, hiểu bộ mã).
 *
 * Chạy từ thư mục backend: npm run test:vtp-order
 */
import 'dotenv/config';
import { prisma } from '../src/config/database';
import { viettelPostService } from '../src/services/viettelPostService';

function vtpNum(v: string | null | undefined): number {
  if (v == null || v === '') return NaN;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

async function main() {
  const sProvince = parseInt(process.env.VTP_SENDER_PROVINCE || '1', 10);
  const sDistrict = parseInt(process.env.VTP_SENDER_DISTRICT || '8', 10);
  const sWard = parseInt(process.env.VTP_SENDER_WARD || '175', 10);
  const sName = process.env.VTP_SENDER_NAME || 'KAGRI BIO';
  const sPhone = process.env.VTP_SENDER_PHONE || process.env.VTP_USERNAME || '0352737467';
  const sAddr = process.env.VTP_SENDER_ADDRESS || 'Số 103, ngõ 95, Đạo Xuyên, Bát Tràng';

  const useDbReceiver = String(process.env.VTP_TEST_USE_DB_RECEIVER || '').trim() === '1';

  const envNz = (k: string) => {
    const v = process.env[k];
    return v != null && String(v).trim() !== '';
  };
  const explicitRx =
    envNz('VTP_TEST_RECEIVER_PROVINCE') ||
    envNz('VTP_TEST_RECEIVER_DISTRICT') ||
    envNz('VTP_TEST_RECEIVER_WARD');

  /** Mặc định liên tỉnh HN→HCM (đã khớp getPriceAll với nhiều hợp đồng TMĐT). */
  const DEFAULT_R_PROVINCE = 2;
  const DEFAULT_R_DISTRICT = 43;
  const DEFAULT_R_WARD = 49289;

  let rProvince = explicitRx
    ? parseInt(process.env.VTP_TEST_RECEIVER_PROVINCE || String(DEFAULT_R_PROVINCE), 10)
    : DEFAULT_R_PROVINCE;
  let rDistrict = explicitRx
    ? parseInt(process.env.VTP_TEST_RECEIVER_DISTRICT || String(DEFAULT_R_DISTRICT), 10)
    : DEFAULT_R_DISTRICT;
  let rWard = explicitRx
    ? parseInt(process.env.VTP_TEST_RECEIVER_WARD || String(DEFAULT_R_WARD), 10)
    : DEFAULT_R_WARD;

  let receiverNote = explicitRx
    ? 'Địa chỉ nhận từ biến môi trường VTP_TEST_RECEIVER_* (thiếu mã nào thì bù bằng mặc định HCM)'
    : `Mặc định script: TP.HCM (tỉnh ${DEFAULT_R_PROVINCE}, quận VTP ${DEFAULT_R_DISTRICT}, xã ${DEFAULT_R_WARD})`;

  if (useDbReceiver) {
    let ward = await prisma.ward.findFirst({
      where: { vtpDistrictId: { not: null } },
      include: { province: true },
    });

    if (ward?.vtpDistrictId != null && ward.province) {
      rProvince = vtpNum(ward.province.id) || vtpNum(ward.province.code);
      rWard = vtpNum(ward.code) || vtpNum(ward.id);
      rDistrict = ward.vtpDistrictId;
      receiverNote = `DB sau sáp nhập: ${ward.name}`;
    } else {
      const wOld = await prisma.ward.findFirst({
        where: { districtId: { not: null } },
        include: { province: true, district: true },
      });
      if (!wOld?.province || !wOld.district) {
        console.error('Không có xã trong DB. Bỏ VTP_TEST_USE_DB_RECEIVER hoặc đồng bộ địa chỉ VTP.');
        process.exit(1);
      }
      ward = wOld;
      rProvince = vtpNum(wOld.province.id) || vtpNum(wOld.province.code);
      rDistrict = vtpNum(wOld.district.code) || vtpNum(wOld.district.id);
      rWard = vtpNum(wOld.code) || vtpNum(wOld.id);
      receiverNote = `DB trước sáp nhập: ${wOld.name}`;
    }

    if (!Number.isFinite(rProvince) || !Number.isFinite(rDistrict) || !Number.isFinite(rWard)) {
      console.error('Không suy ra được mã VTP nhận (NaN).');
      process.exit(1);
    }
  }

  const orderCode = `HCRM-VTP-TEST-${Date.now()}`;
  console.log('Mã đơn nội bộ (ORDER_NUMBER):', orderCode);
  console.log('Gửi:', { sProvince, sDistrict, sWard, sName });
  console.log('Nhận:', { rProvince, rDistrict, rWard, receiverNote });

  const result = await viettelPostService.createOrder({
    orderId: orderCode,
    orderDate: new Date(),
    senderName: sName,
    senderPhone: sPhone,
    senderAddress: sAddr,
    senderProvince: sProvince,
    senderDistrict: sDistrict,
    senderWard: sWard,
    receiverName: 'Người nhận test HCRM',
    receiverPhone: '0900000001',
    receiverAddress: '123 đường test, phường nhận — ' + receiverNote,
    receiverProvince: rProvince,
    receiverDistrict: rDistrict,
    receiverWard: rWard,
    productName: 'Hang test HCRM',
    productQuantity: 1,
    productWeight: 500,
    productPrice: 100000,
    moneyCollection: 100000,
    note: 'Test script HCRM — hủy trên VTP nếu còn cho phép',
  });

  console.log('Kết quả VTP:', result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
