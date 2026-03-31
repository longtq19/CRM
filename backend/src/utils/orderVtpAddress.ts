import { prisma } from '../config/database';

/**
 * Viettel Post getPrice/createOrder bắt buộc RECEIVER_DISTRICT.
 * Với địa chỉ sau sáp nhập (2 cấp), UI có thể chỉ chọn Tỉnh + Xã; mã huyện VTP lấy từ `wards.vtp_district_id` (đồng bộ từ listWardsNew).
 */
export async function resolveReceiverVtpDistrictId(order: {
  receiverDistrictId: number | null;
  receiverWardId: number | null;
}): Promise<number | null> {
  const d = order.receiverDistrictId;
  if (d != null && !Number.isNaN(Number(d))) {
    return Number(d);
  }
  const wId = order.receiverWardId;
  if (wId == null) return null;
  const w = await prisma.ward.findUnique({
    where: { id: String(wId) },
    select: { vtpDistrictId: true },
  });
  return w?.vtpDistrictId ?? null;
}

/**
 * `provinces.id` sau sync V3 là chuỗi PROVINCE_ID (số). FE có thể gửi id đó hoặc UUID nếu dữ liệu lệch — tra DB để ra mã số VTP.
 */
export async function resolveVtpProvinceIdFromClient(raw: unknown): Promise<number | null> {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  if (Number.isFinite(n) && n > 0) return n;
  const p = await prisma.province.findUnique({ where: { id: String(raw) } });
  if (!p) return null;
  const fromId = parseInt(String(p.id).trim(), 10);
  return Number.isFinite(fromId) && fromId > 0 ? fromId : null;
}

/**
 * `wards.id` sau sync là chuỗi WARDS_ID. Trả về số WARDS_ID cho API VTP.
 */
export async function resolveVtpWardIdFromClient(raw: unknown): Promise<number | null> {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  if (Number.isFinite(n) && n > 0) return n;
  const w = await prisma.ward.findUnique({ where: { id: String(raw) } });
  if (!w) return null;
  const fromId = parseInt(String(w.id).trim(), 10);
  return Number.isFinite(fromId) && fromId > 0 ? fromId : null;
}

export interface WarehouseVtpSenderResolved {
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderProvince: number;
  senderDistrict: number;
  senderWard: number;
}

/**
 * Điểm gửi cho getPrice/createOrder — **bắt buộc** lấy từ kho trong DB (không dùng biến môi trường).
 * Sau sáp nhập: có thể không có `district_id`; mã quận/huyện VTP lấy từ `wards.vtp_district_id`.
 */
export async function resolveWarehouseVtpSender(warehouseId: string): Promise<WarehouseVtpSenderResolved | null> {
  const wh = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    include: { province: true, district: true, ward: true },
  });
  if (!wh || !wh.provinceId || !wh.wardId || !wh.province || !wh.ward) {
    return null;
  }
  const pProv = parseInt(String(wh.province.id).trim(), 10);
  const pWard = parseInt(String(wh.ward.id).trim(), 10);
  if (!Number.isFinite(pProv) || !Number.isFinite(pWard) || pProv <= 0 || pWard <= 0) {
    return null;
  }
  let pDist: number;
  if (wh.districtId && wh.district) {
    const d = parseInt(String(wh.district.id).trim(), 10);
    pDist = Number.isFinite(d) && d > 0 ? d : wh.ward.vtpDistrictId ?? NaN;
  } else {
    pDist = wh.ward.vtpDistrictId ?? NaN;
  }
  if (!Number.isFinite(pDist) || pDist <= 0) {
    return null;
  }
  const phone = (wh.contactPhone || '').trim();
  if (!phone) {
    return null;
  }
  const addr = (wh.detailAddress || wh.address || '').trim();
  if (!addr) {
    return null;
  }
  const name = (wh.contactName || wh.name || '').trim();
  if (!name) {
    return null;
  }
  return {
    senderName: name,
    senderPhone: phone,
    senderAddress: addr,
    senderProvince: pProv,
    senderDistrict: pDist,
    senderWard: pWard,
  };
}
