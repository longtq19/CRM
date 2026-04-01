import { Decimal } from '@prisma/client/runtime/library';
import { CUSTOMER_FIELD_LABELS, formatValueForHistory } from '../constants/customerFieldLabels';
import { formatICTDate } from './dateFormatter';

/** Hiển thị giá trị một trường trong nhật ký (tiếng Việt khi có thể) */
export function formatAuditDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '(trống)';
  if (value instanceof Decimal) {
    const n = value.toNumber();
    return Number.isFinite(n) ? String(n) : value.toString();
  }
  if (value instanceof Date) return formatICTDate(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(trống)';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Decimal && b instanceof Decimal) return a.equals(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * So sánh hai bản ghi (cùng tập khóa), mỗi thay đổi một dòng: Đổi [nhãn] từ "cũ" sang "mới".
 */
export function describeChangesVi(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
  keys?: string[],
): string {
  const lines: string[] = [];
  const keyList = keys ?? [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const k of keyList) {
    if (!labels[k]) continue;
    const oldV = before[k];
    const newV = after[k];
    if (valuesEqual(oldV, newV)) continue;
    const o = formatAuditDisplayValue(oldV);
    const n = formatAuditDisplayValue(newV);
    if (o === n) continue;
    lines.push(`Đổi ${labels[k]} từ "${o}" sang "${n}"`);
  }
  return lines.join('\n');
}

/** Khách hàng: hiển thị địa chỉ hành chính + NV + nguồn/chiến dịch bằng tên khi có quan hệ */
export function describeCustomerAuditDiff(
  oldC: Record<string, any>,
  newC: Record<string, any>,
): string {
  const lines: string[] = [];

  const geo = (c: any, level: 'province' | 'district' | 'ward') => {
    if (level === 'province') return c.province?.name || formatValueForHistory(c.provinceId);
    if (level === 'district') return c.district?.name || formatValueForHistory(c.districtId);
    return c.ward?.name || formatValueForHistory(c.wardId);
  };

  for (const key of Object.keys(CUSTOMER_FIELD_LABELS)) {
    const label = CUSTOMER_FIELD_LABELS[key];
    let oldDisp: string;
    let newDisp: string;

    if (key === 'provinceId') {
      oldDisp = geo(oldC, 'province');
      newDisp = geo(newC, 'province');
    } else if (key === 'districtId') {
      oldDisp = geo(oldC, 'district');
      newDisp = geo(newC, 'district');
    } else if (key === 'wardId') {
      oldDisp = geo(oldC, 'ward');
      newDisp = geo(newC, 'ward');
    } else if (key === 'employeeId') {
      oldDisp = oldC.employee?.fullName || formatValueForHistory(oldC.employeeId);
      newDisp = newC.employee?.fullName || formatValueForHistory(newC.employeeId);
    } else if (key === 'leadSourceId') {
      oldDisp = oldC.leadSource?.name || formatValueForHistory(oldC.leadSourceId);
      newDisp = newC.leadSource?.name || formatValueForHistory(newC.leadSourceId);
    } else if (key === 'campaignId') {
      oldDisp = oldC.campaign?.name || formatValueForHistory(oldC.campaignId);
      newDisp = newC.campaign?.name || formatValueForHistory(newC.campaignId);
    } else {
      oldDisp = formatValueForHistory(oldC[key]);
      newDisp = formatValueForHistory(newC[key]);
    }

    if (oldDisp === newDisp) continue;
    if (valuesEqual(oldC[key], newC[key])) continue;
    lines.push(`Đổi ${label} từ "${oldDisp}" sang "${newDisp}"`);
  }

  return lines.join('\n');
}
