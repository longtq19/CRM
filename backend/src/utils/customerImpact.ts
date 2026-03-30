import { prisma } from '../config/database';

/** Ghi dòng lịch sử tác động (hệ thống / người dùng có vai trò ghi nhận thay đổi). */
export async function appendCustomerImpactNote(params: {
  customerId: string;
  employeeId: string;
  contentVi: string;
  /** Mã loại tương tác hiển thị (vd. SYSTEM_UPDATE). */
  interactionType?: string;
}): Promise<void> {
  const { customerId, employeeId, contentVi } = params;
  if (!contentVi?.trim()) return;
  const count = await prisma.customerInteraction.count();
  const code = `IMP-${String(count + 1).padStart(6, '0')}`;
  await prisma.customerInteraction.create({
    data: {
      code,
      customerId,
      employeeId,
      type: params.interactionType ?? 'SYSTEM_UPDATE',
      content: contentVi.trim(),
      kind: 'SYSTEM_CHANGE',
    },
  });
}
