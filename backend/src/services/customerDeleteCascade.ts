import type { Prisma } from '@prisma/client';

/**
 * Xóa một khách hàng và mọi bản ghi phụ thuộc (đơn, lead, bảo hành, hóa đơn nháp, v.v.).
 * Gọi trong transaction Prisma.
 */
export async function deleteCustomerCascade(
  tx: Prisma.TransactionClient,
  customerId: string
): Promise<void> {
  await tx.leadOpportunity.deleteMany({ where: { customerId } });
  await tx.leadAssignment.deleteMany({ where: { customerId } });

  const orders = await tx.order.findMany({
    where: { customerId },
    select: { id: true, orderDate: true },
  });
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length > 0) {
    await tx.inventoryLog.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderShippingLog.deleteMany({
      where: { order: { customerId } },
    });
    await tx.shippingLog.deleteMany({
      where: {
        OR: orders.map((o) => ({ orderId: o.id, orderDate: o.orderDate })),
      },
    });
    await tx.returnedOrder.deleteMany({ where: { orderId: { in: orderIds } } });
  }

  await tx.order.deleteMany({ where: { customerId } });

  await tx.leadDistributionHistory.deleteMany({ where: { customerId } });
  await tx.warrantyClaim.deleteMany({ where: { customerId } });
  await tx.draftInvoice.deleteMany({ where: { customerId } });
  await tx.internalNote.deleteMany({ where: { customerId } });
  await tx.customerInteraction.deleteMany({ where: { customerId } });
  await tx.customerAggregate.deleteMany({ where: { customerId } });
  await tx.customerTagAssignment.deleteMany({ where: { customerId } });
  await tx.customerFarm.deleteMany({ where: { customerId } });
  await tx.customerAddress.deleteMany({ where: { customerId } });
  await tx.dataPool.deleteMany({ where: { customerId } });

  await tx.customer.updateMany({
    where: { duplicateOfCustomerId: customerId },
    data: { duplicateOfCustomerId: null },
  });

  await tx.customer.delete({ where: { id: customerId } });
}
