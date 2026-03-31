import { prisma } from '../config/database';
import { createUserNotification } from '../controllers/userNotificationController';
import { getIO } from '../socket';
import { sendPushToEmployee } from '../services/pushNotificationService';

/**
 * Sau khi lead được phân tự động từ Marketing → Sales (data_pool ASSIGNED): thông báo + socket + web push.
 */
export async function notifySalesMarketingLeadAssigned(poolIds: string[]): Promise<void> {
  if (!poolIds.length) return;
  const rows = await prisma.dataPool.findMany({
    where: {
      id: { in: poolIds },
      status: 'ASSIGNED',
      assignedToId: { not: null },
      poolType: 'SALES',
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, code: true } },
    },
  });
  for (const row of rows) {
    if (!row.assignedToId) continue;
    const name = row.customer?.name || row.customer?.phone || 'Khách hàng';
    const phone = row.customer?.phone || '';
    const title = 'Bạn có lead mới từ Marketing';
    const content = `${name}${phone ? ` — ${phone}` : ''}. Lead đã được phân cho bạn.`;
    const link = `/customers/${row.customerId}`;
    let notif: { id: string } | null = null;
    try {
      notif = await createUserNotification(
        row.assignedToId,
        title,
        content,
        'NEW_LEAD',
        link,
        { customerId: row.customerId, source: 'MARKETING_AUTO_ASSIGN' }
      );
    } catch (e) {
      console.warn('[notifySalesMarketingLeadAssigned] createUserNotification:', e);
    }
    try {
      const io = getIO();
      io.to(row.assignedToId).emit('new_lead', {
        type: 'new_lead',
        id: notif?.id,
        title,
        content,
        customerId: row.customerId,
        customerName: row.customer?.name,
        customerPhone: row.customer?.phone,
        link,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // socket optional
    }
    sendPushToEmployee(row.assignedToId, {
      title,
      body: content,
      link,
      data: { type: 'NEW_LEAD', customerId: row.customerId },
    }).catch(() => {});
  }
}
