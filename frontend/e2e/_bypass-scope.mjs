/**
 * Get past Vercel Deployment Protection without sending the bypass secret to
 * any other host (MEH-3607).
 *
 * Why not a header: `extraHTTPHeaders` on a browser context goes to EVERY host
 * the page loads (map tiles, Cloudinary, fonts, analytics). A header added by
 * `route.fallback({ headers })` is safer but still follows a redirect to
 * another origin (review on #5085, reproduced with two local servers).
 *
 * What this does instead, as Vercel documents: one API request, with
 * `redirects: 0`, sends the secret plus `x-vercel-set-bypass-cookie` to the
 * target's canonical origin. Vercel answers with a host-only `_vercel_jwt`
 * cookie, which lands in the context's cookie jar (`context.request` shares it).
 * The browser never sees the secret. It sends the cookie to that host only.
 * Then a guard ends the run if any browser request still carries a bypass
 * header, for example from a stray `extraHTTPHeaders`.
 *
 * The canonical origin: staging.mehamakor.online answers 307 to
 * staging.mehamakor.co.il (measured 21/11), and sets no cookie itself. Root
 * redirects are followed WITHOUT the secret, at most 3 hops, stopping at the
 * protection wall (a redirect to vercel.com); the secret goes to the origin
 * where they stop.
 *
 * A local target (localhost, 127.0.0.1, ::1) or empty headers = no-op.
 *
 * @param {import("playwright").BrowserContext} context
 * @param {string} targetUrl  any URL on the target
 * @param {Record<string, string>} headers  must hold x-vercel-protection-bypass
 * @returns {Promise<string>} the origin the cookie was set for ("" if no-op)
 */
export async function scopeBypassToOrigin(context, targetUrl, headers) {
  const secret = headers?.["x-vercel-protection-bypass"];
  if (!secret) return "";
  const origin = await fetchBypassCookie(context.request, targetUrl, secret);
  if (!origin) return "";

  const names = [...new Set(["x-vercel-protection-bypass", ...Object.keys(headers).map((h) => h.toLowerCase())])];
  context.on("request", (req) => {
    req.allHeaders().then((sent) => {
      const leaked = names.filter((n) => n in sent && /bypass/.test(n));
      if (leaked.length) {
        console.error(`ABORT: ${leaked.join(", ")} was sent by the browser to ${new URL(req.url()).host} (MEH-3607).`);
        process.exit(3);
      }
    }, () => {});
  });
  return origin;
}

/**
 * The cookie half on its own, for a bare APIRequestContext (global-setup.ts
 * writes its storageState for every spec, MEH-3629). Resolves the canonical
 * origin without the secret, sends the secret there once with no redirects,
 * and throws if Vercel set no `_vercel_jwt`. Local target or no secret = "".
 *
 * @param {import("playwright").APIRequestContext} api
 * @param {string} targetUrl
 * @param {string} secret
 * @returns {Promise<string>} the origin the cookie was set for
 */
export async function fetchBypassCookie(api, targetUrl, secret) {
  if (!secret) return "";
  let origin = new URL(targetUrl).origin;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(origin).hostname)) return "";

  for (let hop = 0; hop < 3; hop++) {
    const r = await api.get(`${origin}/`, { maxRedirects: 0, failOnStatusCode: false });
    const loc = r.headers().location;
    if (r.status() < 300 || r.status() >= 400 || !loc) break;
    const next = new URL(loc, origin);
    // A protected origin answers 302 to vercel.com/sso-api: that is the wall,
    // not an alias, so the origin before it is the canonical one.
    if (next.origin === origin || /(^|\.)vercel\.com$/.test(next.hostname)) break;
    origin = next.origin;
  }

  const r = await api.get(`${origin}/`, {
    headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const { cookies } = await api.storageState();
  const host = new URL(origin).hostname;
  const forHost = (d) => host === d || host.endsWith(`.${d}`);
  if (!cookies.some((c) => c.name === "_vercel_jwt" && forHost(c.domain.replace(/^\./, "")))) {
    throw new Error(
      `[bypass] ${origin} set no _vercel_jwt cookie (HTTP ${r.status()}). ` +
        "Check that VERCEL_AUTOMATION_BYPASS_SECRET is the current secret.",
    );
  }
  return origin;
}
