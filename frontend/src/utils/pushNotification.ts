import { apiClient, API_URL } from '../api/client';

/**
 * Bật thông báo push (hiển thị khi màn hình khóa / app nền).
 * Gọi khi user bấm "Bật thông báo trên điện thoại".
 */
export async function enablePushNotifications(): Promise<{ success: boolean; message: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, message: 'Trình duyệt không hỗ trợ thông báo push' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, message: 'Bạn chưa cho phép thông báo' };
  }

  const reg = await navigator.serviceWorker.ready;
  let publicKey: string;
  try {
    const res = await apiClient.get<{ publicKey: string }>('/user-notifications/push-vapid-key');
    publicKey = res.publicKey;
  } catch (e) {
    return { success: false, message: 'Hệ thống chưa cấu hình thông báo push (VAPID)' };
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const subscription = sub.toJSON();
  await apiClient.post('/user-notifications/push-subscribe', {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys?.p256dh,
      auth: subscription.keys?.auth,
    },
  });

  return { success: true, message: 'Đã bật thông báo. Bạn sẽ nhận thông báo ngay cả khi màn hình khóa.' };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
