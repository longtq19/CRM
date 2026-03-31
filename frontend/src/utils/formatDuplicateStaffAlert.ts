/** Phần hiển thị thêm khi API trả `responsibleStaff` (trùng SĐT). */
export function formatDuplicateStaffForAlert(staff: {
  salesOrCareResponsible: { fullName: string; phone: string | null } | null;
  marketingResponsible: { fullName: string; phone: string | null } | null;
}): string {
  const lines: string[] = [];
  if (staff.salesOrCareResponsible) {
    lines.push(
      `NV phụ trách (Sales/CSKH): ${staff.salesOrCareResponsible.fullName}${staff.salesOrCareResponsible.phone ? ` — ${staff.salesOrCareResponsible.phone}` : ''}`,
    );
  }
  if (staff.marketingResponsible) {
    lines.push(
      `NV Marketing: ${staff.marketingResponsible.fullName}${staff.marketingResponsible.phone ? ` — ${staff.marketingResponsible.phone}` : ''}`,
    );
  }
  return lines.length ? `\n\n${lines.join('\n')}` : '';
}
