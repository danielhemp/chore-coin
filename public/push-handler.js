/**
 * Chore Coin push handler — injected into the workbox-generated service worker
 * via vite.config.ts (workbox.importScripts).
 *
 * Shows a native notification when a push arrives. Payload shape (from the
 * webpush sidecar): { title, message, url?, tag? }
 */
self.addEventListener('push', (event) => {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Chore Coin', message: event.data.text() }
  }
  const title = data.title || 'Chore Coin'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.message || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'chore-coin',
      renotify: true,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const clients = await self.clientsMatchAll({ type: 'window', includeUncontrolled: true })
      // Focus an existing tab if we have one, otherwise open a new window.
      for (const client of clients) {
        if ('focus' in client) {
          try {
            await client.navigate(target)
          } catch {
            /* ignore */
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })(),
  )
})
