/**
 * MEH-54: Web Push subscription utility.
 * Handles the browser-side push subscription flow.
 */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function getVapidPublicKey() {
  try {
    // MEH-1431: relative path through the Next.js /api/* rewrite proxy —
    // the browser must not hit the absolute Railway backend URL directly.
    const r = await fetch(`/api/push-vapid-key`);
    const { public_key } = await r.json();
    return public_key || "";
  } catch {
    return "";
  }
}

export async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return null;

  try {
    // MEH-1326: register the static /public/sw.js explicitly. next-pwa was
    // removed in MEH-372, so nothing registers a SW anymore — without this
    // `navigator.serviceWorker.ready` never resolves and subscribe hangs.
    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing.toJSON();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    return sub.toJSON();
  } catch {
    return null;
  }
}

export async function requestPushPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}
