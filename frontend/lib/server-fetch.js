import "server-only";

/**
 * Module:   server-fetch
 * Purpose:  Resilient wrapper around `fetch` for server-side App Router data
 *           loads (generateMetadata / RSC page fetches) against the Railway
 *           backend. Adds an explicit timeout and a bounded backoff retry on
 *           transient socket errors.
 * Touches:  Railway backend over HTTP (no DB, no third party).
 * Does NOT: handle client/browser requests — that's `lib/api.js` (axios).
 *           This file is `server-only`; importing it from a client bundle is
 *           a build error.
 * Related:  app/[locale]/[slug]/page.js, app/[locale]/map/page.js,
 *           app/sitemap.js — the call-sites routed through serverFetch.
 * History:  MEH-977 (creation) — Vercel→Railway "fetch failed" resilience.
 */

// MEH-977: Vercel→Railway server fetches intermittently throw
// `TypeError: fetch failed` whose `cause.code` is one of these — a dropped
// connection (Railway cold-start) or a stale undici keep-alive socket the
// Railway edge already closed. Both clear on an immediate retry against a
// warm container / fresh socket. We retry ONLY these; a non-transient error
// (DNS, TLS, abort) and any HTTP response (incl. 4xx/5xx) are NOT retried.
const TRANSIENT_CODES = new Set(["ECONNRESET", "UND_ERR_SOCKET"]);

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250; // 250ms → 500ms (≈2x backoff between attempts)

function transientCode(err) {
  // undici wraps the low-level error in `cause`; some paths set `code` directly.
  return err?.code ?? err?.cause?.code;
}

function isTransient(err) {
  return TRANSIENT_CODES.has(transientCode(err));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drop-in replacement for `fetch` on the server. Returns the `Response` (so
 * callers keep their existing `res.ok` / `res.json()` handling). Throws on a
 * timeout (AbortError) or after retries are exhausted — callers already wrap
 * in try/catch and fall back to null, so behaviour on permanent failure is
 * unchanged; the win is bounding the hang and absorbing transient blips.
 *
 * @param {string|URL} url
 * @param {RequestInit} [init]                fetch options (e.g. next.revalidate);
 *                                            a caller `signal` is composed with
 *                                            the internal timeout via AbortSignal.any
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=8000]      per-attempt timeout
 * @param {number} [opts.retries=2]           retries AFTER the first attempt
 * @param {number} [opts.backoffMs=250]       base backoff, doubled per retry
 * @returns {Promise<Response>}
 */
export async function serverFetch(
  url,
  init = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, backoffMs = DEFAULT_BACKOFF_MS } = {},
) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // MEH-977 (review): compose the timeout signal with any caller-provided
      // signal so serverFetch stays a true drop-in for fetch (a caller can
      // still cancel). AbortSignal.any is available on Node 18.17+ / 20+.
      const signal = init.signal
        ? AbortSignal.any([controller.signal, init.signal])
        : controller.signal;
      return await fetch(url, { ...init, signal });
    } catch (err) {
      lastErr = err;
      // Only transient socket errors are worth retrying, and only if we have
      // attempts left. Everything else (incl. our own timeout AbortError)
      // propagates immediately.
      if (attempt < retries && isTransient(err)) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  // Unreachable (the loop either returns or throws), but keeps control-flow honest.
  throw lastErr;
}
