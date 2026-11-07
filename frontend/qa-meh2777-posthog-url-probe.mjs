/**
 * MEH-2777 — RUNTIME probe: does posthog's event-property builder put the full
 * browser URL on an ordinary event?
 *
 * `__tests__/AnalyticsTokenScrub.test.js` derives this STATICALLY, by reading
 * `$current_url:` out of @posthog/browser-common's source. A static read proves
 * the line exists; it does not prove the runtime reaches it. This is the other
 * half: call the real `getEventProperties()` under a jsdom `location` and read
 * what comes back.
 *
 * Why it matters: `analytics.js` sets `autocapture: false` and
 * `capture_pageview: false`, which suppress automatic EVENTS. Those flags say
 * nothing about the PROPERTIES attached to a manual `capture()`. If the URL is
 * on every event, then a bearer token in the path (/claim/<jwt>,
 * /registration/<token>) leaves the browser the moment any trackEvent fires on
 * such a route — which is what `before_send: scrubEvent` now prevents.
 *
 * Deliberately does NOT init posthog. An earlier version of this probe did and
 * hung: jsdom plus posthog's own timers keep the event loop alive, and the run
 * never printed. Measuring the property builder alone needs no client, no key,
 * no network, and no teardown.
 *
 * Run:  node qa-meh2777-posthog-url-probe.mjs      (from frontend/)
 * Exits non-zero if the control fails, i.e. if the reading is void.
 */
import { JSDOM } from "jsdom";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EVENT_UTILS = path.resolve(
  import.meta.dirname,
  "node_modules/@posthog/browser-common/dist/utils/event-utils.mjs",
);

// The real cancel-token shape is secrets.token_urlsafe(32) → 43 url-safe
// chars. Spelled as an obvious placeholder: secrets-scan-guard.sh flags an
// opaque literal of that length, and an evidently-fake value is its sanctioned
// remedy. Unused by default — the path comes from argv — but kept as the
// documented shape to paste.
const REG_TOKEN = "EXAMPLE-not-a-real-token-0000000000000000000";

function installDom(pathname) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: `https://mehamakor.co.il${pathname}`,
  });
  // `navigator` is getter-only on globalThis in Node 22, so a plain assignment
  // throws. defineProperty is the form that works for every one of these.
  for (const k of ["document", "navigator", "location", "self"]) {
    Object.defineProperty(globalThis, k, {
      value: dom.window[k],
      configurable: true,
      writable: true,
    });
  }
  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
    writable: true,
  });
  return dom;
}

async function readOnce(pathname) {
  // The DOM must exist BEFORE the first import: event-utils reads `location`
  // through @posthog/browser-common's own globals module, which binds it at
  // import time and is cached per process. ONE path per process is therefore
  // the only honest way to read this — an earlier version of this probe
  // imported twice with a `?probe=` cache-bust and got the FIRST path back
  // both times, then confidently reported "no token in the URL". That reading
  // was an artifact of how it was asked, and it pointed at rewriting a correct
  // comment in lib/analytics.js. Hence the control below.
  installDom(pathname);
  const mod = await import(pathToFileURL(EVENT_UTILS).href);
  const props = mod.getEventProperties(false, [], false, false);
  return { url: props.$current_url, path: props.$pathname };
}

const pathname = process.argv[2];
if (!pathname) {
  console.error(
    "usage: node qa-meh2777-posthog-url-probe.mjs <pathname>\n\n" +
      "Run it TWICE, and read the pair together:\n" +
      "  node qa-meh2777-posthog-url-probe.mjs /he/producers                  # control\n" +
      "  node qa-meh2777-posthog-url-probe.mjs /he/registration/<43-char tok> # subject\n\n" +
      "The control must echo its own path back. If it does not, the builder was\n" +
      "never reached and the subject run means nothing.",
  );
  process.exit(2);
}

const { url, path: pname } = await readOnce(pathname);
console.log("requested :", pathname);
console.log("$current_url:", url);
console.log("$pathname  :", pname);

// Self-check: the builder must echo back the path it was given. This is what
// makes a "no token present" reading mean something.
if (!url || !url.endsWith(pathname)) {
  console.error(
    `\nVOID: the builder returned ${JSON.stringify(url)} for ${pathname}. ` +
      "It did not read this process's location, so nothing was measured.",
  );
  process.exit(1);
}

const token = pathname.split("/").pop();
if (token && token.length >= 40) {
  console.log(
    `\nVERDICT: the ${token.length}-char path segment IS present, verbatim, in ` +
      "both properties.\n  → an ordinary capture() on this route would ship a live " +
      "bearer credential,\n    which is why `before_send: scrubEvent` " +
      "(lib/analytics.js) is load-bearing.",
  );
} else {
  console.log("\nCONTROL OK: the builder echoes the real location. Now run the token path.");
}
process.exit(0);
