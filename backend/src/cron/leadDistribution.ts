import cron from 'node-cron';
import { prisma } from '../config/database';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import { pickNextResalesEmployeeId, pickNextSalesEmployeeId } from '../services/leadRoutingService';
import { sendPushToEmployee } from '../services/pushNotificationService';
import { formatICTDateTime } from '../utils/dateFormatter';

async function getIntConfig(key: string, fallback: number): Promise<number> {
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key } });
    if (!cfg) return fallback;
    const n = parseInt(cfg.value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Sales deadline: hết ngày giữ số → phân lại sales (ưu tiên khối) hoặc CSKH (luồng sau CS) hoặc kho thả nổi.
 * Chạy mỗi giờ
 */
async function salesDeadlineRecall() {
  try {
    const now = new Date();
    const salesKeepDays = await getIntConfig('data_pool_auto_recall_days', 3);
    const maxRepartitionRounds = await getIntConfig('max_repartition_rounds', 5);
    const cskhMaxNoteDays = await getIntConfig('cskh_max_note_days', 15);
    const cskhFirstHoldDays = await getIntConfig('customer_recycle_days', 180);
    const cskhSecondHoldDays = await getIntConfig('resales_hold_days', 90);

    const expiredLeads = await prisma.dataPool.findMany({
      where: {
        poolType: 'SALES',
        status: 'ASSIGNED',
        deadline: { lt: now },
      },
      include: { assignedTo: { select: { id: true } } },
    });

    if (expiredLeads.length === 0) return;

    for (const lead of expiredLeads) {
      const prevAssignees = lead.assignedToId
        ? [...lead.previousAssignees, lead.assignedToId]
        : lead.previousAssignees;

      if (lead.assignedToId) {
        await prisma.leadDistributionHistory.updateMany({
          where: { customerId: lead.customerId, employeeId: lead.assignedToId, revokedAt: null },
          data: { revokedAt: now, revokeReason: `Quá hạn ${salesKeepDays} ngày (tự động)` },
        });
      }

      const excludeSales = [...new Set([...prevAssignees, ...(lead.assignedToId ? [lead.assignedToId] : [])])];

      if (lead.awaitingSalesAfterCskh) {
        const holdDays = (lead.cskhStage ?? 1) >= 2 ? cskhSecondHoldDays : cskhFirstHoldDays;
        const anchorForCs =
          lead.previousAssignees.length > 0
            ? lead.previousAssignees[lead.previousAssignees.length - 1]!
            : lead.assignedToId;
        const nextResalesId = await pickNextResalesEmployeeId({
          seed: `${lead.customerId}:after-sales:${now.toISOString()}`,
          excludeIds: excludeSales,
          anchorEmployeeId: anchorForCs,
        });

        await prisma.dataPool.update({
          where: { id: lead.id },
          data: {
            status: 'ASSIGNED',
            poolType: 'CSKH',
            assignedToId: nextResalesId,
            assignedAt: now,
            deadline: null,
            holdUntil: new Date(now.getTime() + holdDays * 24 * 60 * 60 * 1000),
            interactionDeadline: new Date(now.getTime() + cskhMaxNoteDays * 24 * 60 * 60 * 1000),
            roundCount: 0,
            maxRounds: maxRepartitionRounds,
            previousAssignees: prevAssignees,
            source: 'RECALL',
            processingStatus: null,
            awaitingSalesAfterCskh: false,
            note: 'Sales sau CSKH không chốt trong hạn → phân lại CSKH (ưu tiên đơn vị/khối)',
          },
        });

        if (nextResalesId) {
          await prisma.leadDistributionHistory.create({
            data: {
              customerId: lead.customerId,
              employeeId: nextResalesId,
              method: 'AUTO',
            },
          });
          await prisma.customer.update({
            where: { id: lead.customerId },
            data: { employeeId: nextResalesId },
          });
        }
        continue;
      }

      const newRound = (lead.roundCount || 0) + 1;

      if (newRound >= maxRepartitionRounds) {
        await prisma.dataPool.update({
          where: { id: lead.id },
          data: {
            status: 'AVAILABLE',
            poolType: 'SALES',
            poolQueue: DATA_POOL_QUEUE.FLOATING,
            assignedToId: null,
            assignedAt: null,
            deadline: null,
            holdUntil: null,
            interactionDeadline: null,
            roundCount: 0,
            maxRounds: maxRepartitionRounds,
            previousAssignees: prevAssignees,
            source: 'RECALL',
            processingStatus: 'RELEASED',
            awaitingSalesAfterCskh: false,
            note: `Hết ${maxRepartitionRounds} vòng Sales → trả về kho thả nổi`,
          },
        });
        await prisma.customer.update({
          where: { id: lead.customerId },
          data: { employeeId: null },
        });
        continue;
      }

      const nextSalesId = await pickNextSalesEmployeeId({
        seed: `${lead.customerId}:${newRound}:${now.toISOString()}`,
        excludeIds: excludeSales,
        anchorEmployeeId: lead.assignedToId,
      });

      await prisma.dataPool.update({
        where: { id: lead.id },
        data: {
          status: 'ASSIGNED',
          poolType: 'SALES',
          assignedToId: nextSalesId,
          assignedAt: now,
          deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
          holdUntil: null,
          interactionDeadline: null,
          processingStatus: null,
          roundCount: newRound,
          maxRounds: maxRepartitionRounds,
          previousAssignees: prevAssignees,
          source: 'RECALL',
          awaitingSalesAfterCskh: false,
          note: `Thu hồi tự động: quá hạn ${salesKeepDays} ngày (vòng ${newRound})`,
        },
      });

      if (nextSalesId) {
        await prisma.leadDistributionHistory.create({
          data: {
            customerId: lead.customerId,
            employeeId: nextSalesId,
            method: 'AUTO',
          },
        });
        await prisma.customer.update({
          where: { id: lead.customerId },
          data: { employeeId: nextSalesId },
        });
      }
    }

    console.log(`[Cron] Sales deadline: recalled ${expiredLeads.length} expired leads`);
  } catch (error) {
    console.error('[Cron] Sales deadline recall error:', error);
  }
}

/**
 * CSKH interaction check: quá hạn ghi chú → chuyển Sales (đánh dấu luồng sau CSKH)
 */
async function cskhInteractionCheck() {
  try {
    const now = new Date();
    const salesKeepDays = await getIntConfig('data_pool_auto_recall_days', 3);
    const maxRepartitionRounds = await getIntConfig('max_repartition_rounds', 5);

    const expiredLeads = await prisma.dataPool.findMany({
      where: {
        poolType: 'CSKH',
        status: 'ASSIGNED',
        interactionDeadline: { lt: now },
      },
    });

    for (const lead of expiredLeads) {
      if (lead.assignedToId) {
        await prisma.leadDistributionHistory.updateMany({
          where: { customerId: lead.customerId, employeeId: lead.assignedToId, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'Quá hạn ghi chú CSKH (tự động)' },
        });
      }

      const nextStage = lead.cskhStage === 1 ? 2 : lead.cskhStage ?? 2;
      const nextSalesId = await pickNextSalesEmployeeId({
        seed: `${lead.customerId}:cskh-int:${nextStage}:${now.toISOString()}`,
        excludeIds: lead.assignedToId ? [...lead.previousAssignees, lead.assignedToId] : lead.previousAssignees,
        anchorEmployeeId: lead.assignedToId,
      });

      await prisma.dataPool.update({
        where: { id: lead.id },
        data: {
          status: 'ASSIGNED',
          poolType: 'SALES',
          assignedToId: nextSalesId,
          assignedAt: now,
          deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
          holdUntil: null,
          interactionDeadline: null,
          processingStatus: null,
          roundCount: 0,
          maxRounds: maxRepartitionRounds,
          note: 'Thu hồi CSKH: quá hạn ghi chú, chuyển Sales',
          cskhStage: nextStage,
          previousAssignees: lead.assignedToId ? [...lead.previousAssignees, lead.assignedToId] : lead.previousAssignees,
          awaitingSalesAfterCskh: true,
        },
      });

      if (nextSalesId) {
        await prisma.leadDistributionHistory.create({
          data: {
            customerId: lead.customerId,
            employeeId: nextSalesId,
            method: 'AUTO',
          },
        });
        await prisma.customer.update({
          where: { id: lead.customerId },
          data: { employeeId: nextSalesId },
        });
      }
    }

    if (expiredLeads.length > 0) {
      console.log(`[Cron] CSKH interaction check: recalled ${expiredLeads.length} leads`);
    }
  } catch (error) {
    console.error('[Cron] CSKH interaction check error:', error);
  }
}

/**
 * CSKH hold limit: quá hạn giữ khách → chuyển Sales (luồng sau CSKH)
 */
async function cskhHoldLimitCheck() {
  try {
    const now = new Date();
    const salesKeepDays = await getIntConfig('data_pool_auto_recall_days', 3);
    const maxRepartitionRounds = await getIntConfig('max_repartition_rounds', 5);

    const expiredLeads = await prisma.dataPool.findMany({
      where: {
        poolType: 'CSKH',
        status: 'ASSIGNED',
        holdUntil: { lt: now },
      },
    });

    for (const lead of expiredLeads) {
      if (lead.assignedToId) {
        await prisma.leadDistributionHistory.updateMany({
          where: { customerId: lead.customerId, employeeId: lead.assignedToId, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'Quá hạn giữ khách (CSKH)' },
        });
      }

      const nextStage = lead.cskhStage === 1 ? 2 : lead.cskhStage ?? 2;
      const nextSalesId = await pickNextSalesEmployeeId({
        seed: `${lead.customerId}:cskh-hold:${nextStage}:${now.toISOString()}`,
        excludeIds: lead.assignedToId ? [...lead.previousAssignees, lead.assignedToId] : lead.previousAssignees,
        anchorEmployeeId: lead.assignedToId,
      });

      await prisma.dataPool.update({
        where: { id: lead.id },
        data: {
          status: 'ASSIGNED',
          poolType: 'SALES',
          assignedToId: nextSalesId,
          assignedAt: now,
          deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
          holdUntil: null,
          interactionDeadline: null,
          processingStatus: null,
          roundCount: 0,
          maxRounds: maxRepartitionRounds,
          note: 'Thu hồi CSKH: quá hạn giữ khách, chuyển Sales',
          cskhStage: nextStage,
          previousAssignees: lead.assignedToId ? [...lead.previousAssignees, lead.assignedToId] : lead.previousAssignees,
          awaitingSalesAfterCskh: true,
        },
      });

      if (nextSalesId) {
        await prisma.leadDistributionHistory.create({
          data: {
            customerId: lead.customerId,
            employeeId: nextSalesId,
            method: 'AUTO',
          },
        });
        await prisma.customer.update({
          where: { id: lead.customerId },
          data: { employeeId: nextSalesId },
        });
      }
    }

    if (expiredLeads.length > 0) {
      console.log(`[Cron] CSKH hold limit: recalled ${expiredLeads.length} leads`);
    }
  } catch (error) {
    console.error('[Cron] CSKH hold limit error:', error);
  }
}

async function deadlineReminder() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayEnd = new Date(tomorrow);
    todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(0, 0, 0, 0);

    const expiringLeads = await prisma.dataPool.findMany({
      where: {
        status: 'ASSIGNED',
        assignedToId: { not: null },
        deadline: { gte: tomorrowStart, lte: todayEnd },
      },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    for (const lead of expiringLeads) {
      if (!lead.assignedToId) continue;
      try {
        await prisma.userNotification.create({
          data: {
            employeeId: lead.assignedToId,
            title: 'Nhắc nhở: Lead sắp hết hạn',
            content: `Lead ${lead.customer?.name || lead.customer?.phone || 'N/A'} sẽ hết hạn xử lý trong 1 ngày.`,
            type: 'REMINDER',
            category: 'LEAD',
            link: `/customers/${lead.customerId}`,
          },
        });
      } catch {
        // ignore
      }
    }

    if (expiringLeads.length > 0) {
      console.log(`[Cron] Deadline reminder: sent ${expiringLeads.length} notifications`);
    }
  } catch (error) {
    console.error('[Cron] Deadline reminder error:', error);
  }
}

/** Nhắc NV được gán khi tới thời điểm (hẹn − phút nhắc trước). */
async function callbackReminders() {
  try {
    const now = new Date();
    const leads = await prisma.dataPool.findMany({
      where: {
        callbackNotifyEnabled: true,
        callbackAt: { not: null },
        callbackReminderSentAt: null,
        status: 'ASSIGNED',
        assignedToId: { not: null },
      },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    let sent = 0;
    for (const lead of leads) {
      if (!lead.callbackAt || !lead.assignedToId) continue;
      const minutesBefore = lead.callbackNotifyMinutesBefore ?? 0;
      const notifyAt = new Date(lead.callbackAt.getTime() - minutesBefore * 60_000);
      if (now < notifyAt) continue;

      const name = lead.customer?.name || lead.customer?.phone || 'Khách';
      const timeStr = formatICTDateTime(lead.callbackAt);
      const title = 'Nhắc: Hẹn gọi lại khách';
      const content = `${name} — hẹn gọi lại lúc ${timeStr}`;

      try {
        await prisma.userNotification.create({
          data: {
            employeeId: lead.assignedToId,
            title,
            content,
            type: 'CALLBACK_REMINDER',
            category: 'LEAD',
            link: `/customers/${lead.customerId}`,
            metadata: { customerId: lead.customerId, dataPoolId: lead.id },
          },
        });
      } catch {
        // ignore
      }

      sendPushToEmployee(lead.assignedToId, {
        title,
        body: content,
        link: `/customers/${lead.customerId}`,
        data: { type: 'CALLBACK_REMINDER', customerId: lead.customerId },
      }).catch(() => {});

      await prisma.dataPool.update({
        where: { id: lead.id },
        data: { callbackReminderSentAt: now },
      });
      sent += 1;
    }

    if (sent > 0) {
      console.log(`[Cron] Callback reminders: sent ${sent} notification(s)`);
    }
  } catch (error) {
    console.error('[Cron] Callback reminders error:', error);
  }
}

async function marketingAttributionReset() {
  try {
    const now = new Date();
    const expiredCustomers = await prisma.customer.findMany({
      where: {
        marketingOwnerId: { not: null },
        attributionExpiredAt: { lt: now },
      },
      select: { id: true },
    });

    if (expiredCustomers.length === 0) return;

    await prisma.customer.updateMany({
      where: { id: { in: expiredCustomers.map((c) => c.id) } },
      data: { marketingOwnerId: null, attributionExpiredAt: null },
    });

    console.log(`[Cron] Marketing attribution reset: cleared ${expiredCustomers.length} customers`);
  } catch (error) {
    console.error('[Cron] Marketing attribution reset error:', error);
  }
}

export const initLeadDistributionCron = () => {
  cron.schedule('0 * * * *', salesDeadlineRecall);
  cron.schedule('0 8 * * *', cskhInteractionCheck);
  cron.schedule('0 9 * * *', cskhHoldLimitCheck);
  cron.schedule('0 8 * * *', deadlineReminder);
  cron.schedule('*/5 * * * *', callbackReminders);
  cron.schedule('0 7 * * *', marketingAttributionReset);

  console.log('[Cron] Lead distribution cron jobs initialized (new operational flow)');
};
