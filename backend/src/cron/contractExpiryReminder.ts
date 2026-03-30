import cron from 'node-cron';
import { prisma } from '../config/database';
import { createUserNotification } from '../controllers/userNotificationController';

const DEFAULT_DAYS_BEFORE = 15;
const DEFAULT_REPEAT_DAYS = 2;

/**
 * Nhắc hạn hợp đồng theo cấu hình riêng từng nhân sự (contractReminderDaysBefore, contractReminderRepeatDays).
 * Nếu nhân viên không cấu hình thì dùng mặc định 15 ngày và 2 ngày.
 */
export const runContractExpiryReminder = async () => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const maxEnd = new Date(now);
    maxEnd.setDate(maxEnd.getDate() + 365);
    maxEnd.setHours(23, 59, 59, 999);

    const contracts = await prisma.contract.findMany({
      where: {
        endDate: { gte: todayStart, lte: maxEnd }
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            contractReminderDaysBefore: true,
            contractReminderRepeatDays: true
          }
        }
      }
    });

    let sentCount = 0;
    for (const c of contracts) {
      const daysBefore = c.employee?.contractReminderDaysBefore ?? DEFAULT_DAYS_BEFORE;
      const repeatDays = c.employee?.contractReminderRepeatDays ?? DEFAULT_REPEAT_DAYS;

      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + daysBefore);
      windowEnd.setHours(23, 59, 59, 999);
      const cutoff = new Date(now.getTime() - repeatDays * 24 * 60 * 60 * 1000);

      const inWindow = c.endDate && new Date(c.endDate) <= windowEnd && new Date(c.endDate) >= todayStart;
      const shouldRemind = !c.lastExpiryReminderAt || (c.lastExpiryReminderAt <= cutoff);

      if (inWindow && shouldRemind) {
        const endDateStr = c.endDate ? new Date(c.endDate).toLocaleDateString('vi-VN') : '';
        const title = 'Nhắc hạn hợp đồng';
        const content = `Hợp đồng "${c.fileName || 'HĐ'}" của ${c.employee?.fullName || 'nhân viên'} sắp hết hạn vào ${endDateStr}.`;
        const link = `/hr/${c.employeeId}/edit`;

        if (c.uploadedBy) {
          await createUserNotification(c.uploadedBy, title, content, 'HR', link, { contractId: c.id });
        }
        await createUserNotification(c.employeeId, title, content, 'HR', link, { contractId: c.id });

        await prisma.contract.update({
          where: { id: c.id },
          data: { lastExpiryReminderAt: now }
        });
        sentCount++;
      }
    }

    if (sentCount > 0) {
      console.log(`Contract expiry reminder: sent ${sentCount} notification(s)`);
    }
  } catch (error) {
    console.error('Contract expiry reminder error:', error);
  }
};

export const initContractExpiryReminder = () => {
  cron.schedule('0 8 * * *', async () => {
    await runContractExpiryReminder();
  });
  console.log('Contract expiry reminder job scheduled (daily 08:00)');
};
