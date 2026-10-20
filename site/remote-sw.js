// The phone remote's service worker (remote.html registers it): what our server pushes when the PC finds a match
// (server/push.js) shows as a notification, even with the phone's screen off or the remote closed, and a tap on it
// opens the remote. The pushes carry nothing, so the text is always the same.
self.addEventListener('push', (e) => e.waitUntil(self.registration.showNotification('Match found!', {
  body: 'Tap to open the phone remote.', tag: 'match', renotify: true, requireInteraction: true, icon: 'icon-192.png',
})));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => {
    const w = open.find((c) => new URL(c.url).pathname.endsWith('/remote.html'));
    return w ? w.focus() : self.clients.openWindow('remote.html');
  }));
});
