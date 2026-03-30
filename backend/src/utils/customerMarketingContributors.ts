import { prisma } from '../config/database';

/** Ghi nhận NV marketing liên quan tới khách (idempotent). */
export async function upsertMarketingContributor(customerId: string, employeeId: string): Promise<void> {
  if (!customerId || !employeeId) return;
  await prisma.customerMarketingContributor.upsert({
    where: {
      customerId_employeeId: { customerId, employeeId },
    },
    create: { customerId, employeeId },
    update: {},
  });
}
