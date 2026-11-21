/**
 * Send the Vercel protection-bypass headers to the target origin only (MEH-3607).
 *
 * `extraHTTPHeaders` on a browser context goes to EVERY host the page loads
 * (map tiles, Cloudinary, fonts, analytics), so the secret ends up in other
 * companies' logs. This adds the headers through a route on the target origin
 * instead, and ends the run if any request to another origin still carries
 * one of them (a stray `extraHTTPHeaders`, a redirect, a popup).
 *
 * Request contexts (`request.newContext({ baseURL })`) only call the target and
 * do not need this.
 *
 * @param {import("playwright").BrowserContext} context
 * @param {string} targetUrl  any URL on the target origin
 * @param {Record<string, string>} headers  the bypass headers; empty = no-op
 */
export async function scopeBypassToOrigin(context, targetUrl, headers) {
  const names = Object.keys(headers || {}).map((h) => h.toLowerCase());
  if (names.length === 0) return;
  const origin = new URL(targetUrl).origin;
  context.on("request", (req) => {
    let url;
    try { url = new URL(req.url()); } catch { return; }
    if (url.origin === origin || !/^https?:$/.test(url.protocol)) return;
    const sent = req.headers();
    const leaked = names.filter((n) => n in sent);
    if (leaked.length) {
      console.error(`ABORT: ${leaked.join(", ")} was sent to ${url.host}, not only to ${origin} (MEH-3607).`);
      process.exit(3);
    }
  });
  await context.route(
    (url) => url.origin === origin,
    (route) => route.fallback({ headers: { ...route.request().headers(), ...headers } }),
  );
}
