/**
 * Static Web Push service worker (MEH-1326).
 *
 * Push-only: `push` + `notificationclick` handlers. Deliberately NO `fetch`
 * handler, NO caching, NO precache — this SW never touches the network for
 * page loads, so there is zero cache-poisoning surface. It is served
 * statically from /public (no bundler plugin), which is why it survives the
 * Turbopack migration that killed next-pwa (MEH-372).
 *
 * Registered on-demand from frontend/lib/push.js (subscribeToPush →
 * navigator.serviceWorker.register('/sw.js')), only after the user enables
 * push and the backend returns a VAPID key.
 *
 * Ported from the retired frontend/worker/index.js — WITHOUT the MEH-50
 * "שוק שישי" setTimeout block (unreliable: only fires while the SW is alive;
 * server-side push replaces it).
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "מהמקור", body: event.data.text(), url: "/" };
  }

  const { title = "מהמקור", body = "", url = "/" } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      dir: "rtl",
      lang: "he",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
