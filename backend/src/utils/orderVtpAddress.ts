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
