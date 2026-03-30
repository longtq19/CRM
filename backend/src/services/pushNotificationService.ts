import webpush from 'web-push';
import { prisma } from '../config/database';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    webpush.setVapidDetails(
      process.env.VAPID_MAILTO || 'mailto:support@kagri.tech',
      publicKey,
      privateKey
    );
    vapidConfigured = true;
  }
}

export interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
}

/**
 * Gửi Web Push đến tất cả subscription của một nhân viên (hiển thị cả khi màn hình khóa)
 */
export async function sendPushToEmployee(
  employeeId: string,
  payload: PushPayload
): Promise<void> {
  ensureVapid();
  if (!vapidConfigured) {
    console.warn('Push: VAPID chưa cấu hình, bỏ qua gửi push');
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { employeeId }
  });

  const body = payload.body || payload.title;
  const pushPayload = JSON.stringify({
    title: payload.title,
    body,
    link: payload.link || '/',
    ...payload.data
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        pushPayload,
        {
          TTL: 3600,
          urgency: 'high'
        }
      );
    } catch (e: any) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
      console.warn('Push send failed for subscription', sub.id, (e as Error).message);
    }
  }
}
