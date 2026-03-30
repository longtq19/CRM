import { prisma } from '../config/database';
import { getSubordinateIds, getVisibleEmployeeIds } from './viewScopeHelper';

type UserLike = { id: string };

/** Sales/Telesales: xem/sửa khách trên list lead (NV được gán data pool Sales hoặc NV phụ trách khách trong phạm vi). */
export async function userCanAccessCustomerForSalesModule(
  user: UserLike,
  customerId: string,
): Promise<boolean> {
  const visibleIds = await getVisibleEmployeeIds(user as any, 'CUSTOMER');
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { employeeId: true },
  });
  if (!customer) return false;

  if (visibleIds?.length) {
    if (customer.employeeId && visibleIds.includes(customer.employeeId)) return true;
    const dp = await prisma.dataPool.findFirst({
      where: {
        customerId,
        poolType: 'SALES',
        assignedToId: { in: visibleIds },
      },
    });
    return !!dp;
  }

  if (customer.employeeId === user.id) return true;
  const dpMine = await prisma.dataPool.findFirst({
    where: { customerId, poolType: 'SALES', assignedToId: user.id },
  });
  return !!dpMine;
}

/** CSKH: cùng logic danh sách resales (NV phụ trách trong cây). */
export async function userCanAccessCustomerForResalesModule(
  user: UserLike,
  customerId: string,
): Promise<boolean> {
  const subordinates = await getSubordinateIds(user.id);
  const allowed = [user.id, ...subordinates];
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, employeeId: { in: allowed } },
    select: { id: true },
  });
  return !!customer;
}
