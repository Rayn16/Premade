// The phone remote's service worker (remote.html registers it): what our server pushes (server/push.js) shows as a
// notification, even with the phone's screen off or the remote closed. A match found carries nothing, so its text is
// always the same, and a tap opens the remote. A squad's call or ping (server/squad.js) carries { t, title, body, sq,
// call, api, to }: a call has In 10 and Not tonight on it (where the phone shows such buttons, like Android), which
// answer straight to our server, and a tap opens the remote with the call on it.
self.addEventListener('push', (e) => {
  let m = null;
  try { m = e.data && e.data.json(); } catch {}
  const call = !!m && m.t === 'call';
  e.waitUntil(m && typeof m.title === 'string'
    ? self.registration.showNotification(m.title, { body: String(m.body || ''), tag: call ? 'call' : 'ping', renotify: true, icon: 'icon-192.png', data: m,
      actions: call ? [{ action: 'in10', title: 'In 10' }, { action: 'no', title: 'Not tonight' }] : [] })
    : self.registration.showNotification('Match found!', { body: 'Tap to open the phone remote.', tag: 'match', renotify: true, requireInteraction: true, icon: 'icon-192.png' }));
});
self.addEventListener('notificationclick', (e) => {
  const m = e.notification.data, call = !!m && m.t === 'call';
  e.notification.close();
  if (call && (e.action === 'in10' || e.action === 'no')) {
    return e.waitUntil(fetch(`${m.api}/squad/${m.sq}/answer`, { method: 'POST', body: JSON.stringify({ id: m.to, call: m.call, a: e.action }) }).catch(() => {}));
  }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => {
    const w = !call && open.find((c) => new URL(c.url).pathname.endsWith('/remote.html'));
    return w ? w.focus() : self.clients.openWindow(call ? `remote.html?sq=${m.sq}&call=${m.call}&to=${m.to}` : 'remote.html');
  }));
});
