import type { Prisma } from '@prisma/client';

/**
 * Loại nhân viên «Vận đơn» — seed dùng `SHP`; một số DB có bản ghi `logistics` hoặc tên tiếng Việt.
 * @see seed `employee_types` và HR lọc theo `employeeTypeId`.
 */
export function employeeTypeRecordIsLogistics(et: { code: string; name: string } | null | undefined): boolean {
  if (!et) return false;
  const c = (et.code || '').trim().toLowerCase();
  if (c === 'shp' || c === 'logistics') return true;
  return (et.name || '').toLowerCase().includes('vận đơn');
}

/** Điều kiện Prisma trên quan hệ `employee.employeeType` (optional). */
export function prismaEmployeeTypeLogisticsWhere(): Prisma.EmployeeTypeWhereInput {
  return {
    OR: [
      { code: { equals: 'SHP', mode: 'insensitive' } },
      { code: { equals: 'logistics', mode: 'insensitive' } },
      { name: { contains: 'Vận đơn', mode: 'insensitive' } },
    ],
  };
}
