/**
 * MEH-54 push notification handlers — currently DEAD CODE.
 * next-pwa was removed in MEH-372 because it doesn't support
 * Next 16 Turbopack. PWA features stayed disabled since launch
 * (VAPID keys never set in production). This file is preserved
 * for future re-enable when @serwist/next or successor adds
 * Turbopack support.
 *
 * To re-enable: open new ticket, choose PWA package with
 * Turbopack support, restore withPWA wrapping in next.config.js
 * with customWorkerDir pointing here, set VAPID_PRIVATE_KEY +
 * VAPID_PUBLIC_KEY in Railway production env vars.
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

// MEH-50: שוק שישי scheduled notifications.
// Uses setTimeout to fire at the next Thu 19:00 and Fri 07:00 (Israel time).
// Limitation: only fires while the SW is active. Server-side push (v2) is
// the reliable alternative for users who close the app.

function israelDayHour() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    return {
      day: dayNames.indexOf(weekday),
      hour: parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10),
      min: parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10),
    };
  } catch {
    return { day: -1, hour: 0, min: 0 };
  }
}

function msUntilNext(targetDay, targetHour) {
  const { day, hour, min } = israelDayHour();
  if (day === -1) return 24 * 60 * 60 * 1000;
  let daysAhead = targetDay - day;
  if (daysAhead < 0 || (daysAhead === 0 && (hour > targetHour || (hour === targetHour && min > 0)))) {
    daysAhead += 7;
  }
  const totalMin = daysAhead * 24 * 60 + (targetHour - hour) * 60 - min;
  return Math.max(0, totalMin * 60 * 1000);
}

function showFridayNotification(title, body) {
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: "/?friday=1" },
    dir: "rtl",
    lang: "he",
    tag: "friday-market",
    renotify: false,
  });
}

function scheduleFridayNotifications() {
  // Thu = 4, Fri = 5
  const msToThu19 = msUntilNext(4, 19);
  const msToFri7 = msUntilNext(5, 7);

  setTimeout(() => {
    showFridayNotification("🛒 מחר שישי", "5 יצרניות חדשות בשוק שלך — תכנני מראש");
    // Re-schedule for next Thu 19:00 (7 days from now)
    setTimeout(scheduleFridayNotifications, msUntilNext(4, 19));
  }, msToThu19);

  setTimeout(() => {
    showFridayNotification("☀️ בוקר טוב! שוק שישי", "יצרניות עם משלוח היום — כנסי לראות");
    // Re-schedule handled by Thu setTimeout above
  }, msToFri7);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration.pushManager
      ? self.registration.pushManager.permissionState({ userVisibleOnly: true }).then((state) => {
          if (state === "granted") scheduleFridayNotifications();
        }).catch(() => {})
      : Promise.resolve()
  );
});
