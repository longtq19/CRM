import { prisma } from '../config/database';

/**
 * Viettel Post getPrice/createOrder bắt buộc RECEIVER_DISTRICT.
 * Với địa chỉ sau sáp nhập (2 cấp), UI có thể chỉ chọn Tỉnh + Xã; mã huyện VTP lấy từ `wards.vtp_district_id` (đồng bộ từ listWardsNew).
 */
/**
 * Viettel Post getPrice/createOrder bắt buộc RECEIVER_DISTRICT.
 * Với địa chỉ sau sáp nhập (2 cấp), UI có thể chỉ chọn Tỉnh + Xã; mã huyện VTP lấy từ `wards.vtp_district_id` (đồng bộ từ listWardsNew).
 */
export async function resolveReceiverVtpDistrictId(order: {
  receiverDistrictId: number | null;
  receiverWardId: number | null;
}): Promise<number | null> {
  const d = order.receiverDistrictId;
  if (d != null && !Number.isNaN(Number(d)) && Number(d) > 0) {
    return Number(d);
  }
  const wId = order.receiverWardId;
  if (wId == null) return null;
  
  return getWardVtpDistrictId(String(wId));
}

/**
 * Trả về mã quận/huyện VTP cho một phường/xã.
 * Với địa chỉ sau sáp nhập (districtId = null), mã này được lưu ở `vtpDistrictId`.
 * Fallback: nếu bản ghi hiện tại không có vtpDistrictId, tìm bản ghi khác cùng tên+tỉnh (vị trí cũ/mới) để lấy mã.
 */
export async function getWardVtpDistrictId(wardId: string): Promise<number | null> {
  const w = await prisma.ward.findUnique({
    where: { id: wardId },
    select: { vtpDistrictId: true, name: true, provinceId: true, districtId: true },
  });
  if (!w) return null;
  if (w.vtpDistrictId != null) return w.vtpDistrictId;

  // Nếu bản ghi hiện tại không có, thử tìm xem có bản ghi "trùng tên" nào trong cùng tỉnh có mã này không
  const fallback = await prisma.ward.findFirst({
    where: {
      provinceId: w.provinceId,
      name: w.name,
      vtpDistrictId: { not: null },
    },
    select: { vtpDistrictId: true },
  });
  if (fallback?.vtpDistrictId != null) return fallback.vtpDistrictId;

  // Nếu vẫn không có, thử lấy district_id của bản ghi hệ cũ
  const fallbackOld = await prisma.ward.findFirst({
    where: {
      provinceId: w.provinceId,
      name: w.name,
      districtId: { not: null },
    },
    select: { districtId: true },
  });
  if (fallbackOld?.districtId) {
    const d = parseInt(fallbackOld.districtId, 10);
    if (!Number.isNaN(d) && d > 0) return d;
  }

  return null;
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
  
  let pDist: number | null = null;
  if (wh.districtId && wh.district) {
    const d = parseInt(String(wh.district.id).trim(), 10);
    if (!Number.isNaN(d) && d > 0) pDist = d;
  }
  
  if (pDist === null) {
    pDist = await getWardVtpDistrictId(wh.wardId);
  }

  if (pDist === null || pDist <= 0) {
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

