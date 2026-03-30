import type { Warehouse } from '@prisma/client';

/** Kho kèm tên địa phương để hiển thị nhật ký */
export type WarehouseAuditShape = Warehouse & {
  province?: { name: string } | null;
  district?: { name: string } | null;
  ward?: { name: string } | null;
};

const WAREHOUSE_TYPE_VI: Record<string, string> = {
  MAIN: 'Kho chính',
  BRANCH: 'Chi nhánh',
  CONSIGNMENT: 'Ký gửi',
};

function displayText(v: string | null | undefined): string {
  const t = v == null ? '' : String(v).trim();
  return t || '—';
}

function placeName(
  w: WarehouseAuditShape,
  level: 'province' | 'district' | 'ward',
): string {
  if (level === 'province') return w.province?.name?.trim() || '—';
  if (level === 'district') return w.district?.name?.trim() || '—';
  return w.ward?.name?.trim() || '—';
}

/**
 * Mô tả thay đổi kho hàng bằng câu tiếng Việt (trước → sau).
 */
export function describeWarehouseChanges(before: WarehouseAuditShape, after: WarehouseAuditShape): string {
  const lines: string[] = [];

  const push = (label: string, oldVal: string, newVal: string) => {
    if (oldVal === newVal) return;
    lines.push(`Đổi ${label} từ "${oldVal}" sang "${newVal}"`);
  };

  push('tên kho', displayText(before.name), displayText(after.name));
  push('mã kho', displayText(before.code), displayText(after.code));
  push('địa chỉ', displayText(before.address), displayText(after.address));
  push('người quản lý', displayText(before.manager), displayText(after.manager));
  push(
    'loại kho',
    WAREHOUSE_TYPE_VI[before.type] || String(before.type),
    WAREHOUSE_TYPE_VI[after.type] || String(after.type),
  );
  push('tên người liên hệ', displayText(before.contactName), displayText(after.contactName));
  push('SĐT liên hệ', displayText(before.contactPhone), displayText(after.contactPhone));
  push('địa chỉ chi tiết', displayText(before.detailAddress), displayText(after.detailAddress));
  push('Tỉnh/TP', placeName(before, 'province'), placeName(after, 'province'));
  push('Quận/Huyện', placeName(before, 'district'), placeName(after, 'district'));
  push('Phường/Xã', placeName(before, 'ward'), placeName(after, 'ward'));

  if (lines.length === 0) {
    return `Cập nhật kho "${after.name}" (mã ${after.code}) — không phát hiện thay đổi nội dung so với bản ghi trước.`;
  }

  return lines.join('\n');
}
