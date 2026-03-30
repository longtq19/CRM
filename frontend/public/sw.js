/* Service Worker: Web Push - hiển thị thông báo khi có lead mới (kể cả màn hình khóa) */
self.addEventListener('push', function (event) {
  if (!event.data) return;
  let data = { title: 'HCRM', body: '', link: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    data.body = event.data.text();
  }
  const options = {
    body: data.body || data.title,
    icon: '/plainLogo.png',
    badge: '/plainLogo.png',
    tag: data.type === 'NEW_LEAD' ? 'new-lead-' + (data.customerId || Date.now()) : 'notif-' + Date.now(),
    requireInteraction: false,
    data: { url: data.link || '/', ...data }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'HCRM', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url && 'focus' in clientList[i]) {
          clientList[i].navigate(url);
          return clientList[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
