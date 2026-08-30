/**
 * Module:   qa-meh1876-cache-window
 * Purpose:  MEH-1876 DoD — measure the STACKED catalog cache window on live
 *           staging, in BOTH directions (PUT an offer / PUT null), and record
 *           timestamps. The code change (#2790) is already merged; this is the
 *           measurement the card makes the completion criterion and that no
 *           session has been able to run from inside CI.
 * Touches:  live staging — registers ONE throwaway producer, approves it via
 *           the demo admin, mutates only that producer's offer, and returns it
 *           to `inactive` in a finally block. Touches no existing business.
 * Does NOT: change any cache value. producers.py:96 and producers/page.jsx:31
 *           are read here, never written — the numbers under test shipped in
 *           #2790 and this run only observes what they compose to.
 * Related:  backend/app/routers/producers.py:96 (_PUBLIC_CATALOG_CACHE,
 *           s-maxage=30 + swr=30) · frontend/app/[locale]/producers/page.jsx:31
 *           (CATALOG_REVALIDATE_SECONDS = 30) · the comment at producers.py:87
 *           that claims the sum is <= 90s. THAT SENTENCE IS WHAT THIS MEASURES.
 * History:  MEH-1876 (this measurement, under MEH-2221 chunk 4 item 2).
 *
 * WHY IT POLLS THE PAGE AND NOT THE API
 * -------------------------------------
 * The API carries ONE of the two layers (the CDN header). The window a reader
 * experiences is the page, because Next's data cache sits on top of it. Polling
 * /api/producers would measure half the stack and report a number ~3x too good.
 *
 * CONTROLS, RUN BEFORE ANY NUMBER IS BELIEVED
 * -------------------------------------------
 * C1  the approved producer's NAME must appear in the page HTML before the
 *     clock starts. Without it, "chip absent" has two causes — fresh cache, or
 *     a producer that was never on this page — and they are indistinguishable.
 * C2  each direction is the other's control: absent -> present, then present ->
 *     absent. A poller that always says "absent" cannot produce the first, and
 *     one that always says "present" cannot produce the second.
 * C3  every request asserts its status code. A 401 parsed as an empty list is
 *     how an earlier run of this kind produced three confident zeros.
 *
 * Run: DEMO_ADMIN_PASSWORD=... VERCEL_AUTOMATION_BYPASS_SECRET=... \
 *      node qa-meh1876-cache-window.mjs
 */
import fs from "node:fs";

const BASE = "https://staging.mehamakor.online";
const OUT = new URL("./qa-artifacts/MEH-1876/close-out/", import.meta.url).pathname;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const ADMIN_EMAIL = "demo-admin@example.com";
const ADMIN_PW = process.env.DEMO_ADMIN_PASSWORD;
const POLL_MS = 5000;
const CAP_MS = 300000; // 300s. The claim under test is <= 90s; the cap exists
                       // so an over-window result is a NUMBER, not a timeout.

const stamp = Date.now().toString(36).slice(-6);
const EMAIL = `cc-meh1876-${stamp}@example.com`;
const PW = `Qa!${stamp}Aa9`;
const BIZ = `בדיקת מטמון ${stamp}`;
const HEADLINE = `הטבת בדיקה ${stamp}`;

const log = [];
let failed = 0;
const say = (line) => { log.push(line); console.log(line); };
const rec = (ok, id, msg) => { if (!ok) failed++; say(`${ok ? "PASS" : "FAIL"}  ${id} — ${msg}`); };

// A cookie jar, because the access token alone does not authenticate.
// `_check_fingerprint` (auth.py:211-230) compares a `userFingerprint` claim
// against the `__Secure-Fgp` cookie the login response sets, so a bearer token
// replayed without that cookie is a 401 — which is exactly what this harness's
// first run got, and it reads like a bad password rather than a missing cookie.
//
// ONE JAR PER SESSION, not one global jar. The owner and the admin are logged
// in at the same time, and a single jar lets the second login overwrite the
// first's `__Secure-Fgp` — after which the FIRST session's bearer token 401s
// with the same "אסימון לא תקין" a wrong password gives. Measured 15:57Z.
const ownerJar = new Map();
const adminJar = new Map();
const absorb = (jar, res) => {
  if (!jar) return;
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const cookieHeader = (jar) =>
  jar && jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {};

const H = (jar, extra = {}) => ({ "x-vercel-protection-bypass": BYPASS, ...cookieHeader(jar), ...extra });

async function call(method, path, { token, body, jar, expect: exp = [200] } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: H(jar, {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
  });
  absorb(jar, res);
  const text = await res.text();
  if (!exp.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status} (expected ${exp.join("/")}) :: ${text.slice(0, 300)}`);
  }
  let json = null;
  try { json = JSON.parse(text); } catch { /* page HTML, not JSON */ }
  return { status: res.status, text, json };
}

/**
 * The page exactly as an anonymous reader gets it. Asserts 200 — C3.
 *
 * Deliberately NOT `H()`: no cookie jar and no `cache-control: no-cache`. Both
 * would make this request unlike a reader's, and both bias the SAME way — a
 * no-cache header asks the edge to revalidate and a session cookie can opt the
 * request out of the shared cache, so either one would report a window SHORTER
 * than the one being measured. The bypass header is the single unavoidable
 * deviation (staging is behind Vercel protection) and it is not a cache
 * directive.
 */
async function pageHtml() {
  const res = await fetch(`${BASE}/producers`, {
    headers: { "x-vercel-protection-bypass": BYPASS },
  });
  if (res.status !== 200) throw new Error(`GET /producers -> ${res.status}`);
  return res.text();
}

/**
 * Poll until `want(html)` holds. Returns seconds elapsed, or null at the cap.
 * The elapsed clock starts at the caller's t0 (the moment the write returned),
 * not at the first poll, so poll latency cannot flatter the number.
 */
async function waitUntil(t0, want, label) {
  for (;;) {
    const html = await pageHtml();
    const elapsed = Date.now() - t0;
    if (want(html)) return elapsed / 1000;
    if (elapsed > CAP_MS) {
      say(`      ${label}: still not satisfied at the ${CAP_MS / 1000}s cap`);
      return null;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

let adminToken = null;
let producerId = null;

async function main() {
  if (!BYPASS || !ADMIN_PW) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET and DEMO_ADMIN_PASSWORD are both required");

  say(`MEH-1876 stacked-cache window — measured on live staging — ${new Date().toISOString()}`);
  say(`target: ${BASE}/producers (the PAGE — both layers; the API carries only the CDN half)`);
  say(`under test: s-maxage=30 + stale-while-revalidate=30 (producers.py:96) stacked under`);
  say(`            next revalidate 30 (producers/page.jsx:31) — the comment claims the sum is <= 90s`);
  say("");

  // --- the header itself, as the card's verification step 2 asks -------------
  // Cache-bust the probe. On an edge HIT Vercel returns a REWRITTEN
  // `cache-control: public` and the origin directives are gone — measured
  // 15:56Z, and it reads exactly like a regression in the header. A unique
  // query forces a MISS, so what is asserted is the header the ORIGIN sets.
  const apiRes = await fetch(`${BASE}/api/producers?limit=1&_cb=${stamp}`, { headers: H(null) });
  const cc = apiRes.headers.get("cache-control");
  const hit = apiRes.headers.get("x-vercel-cache");
  rec(
    cc === "public, s-maxage=30, stale-while-revalidate=30",
    "H1:cdn-header-live",
    `Cache-Control: ${cc} (x-vercel-cache: ${hit} — asserted on a MISS; a HIT reports only "public")`,
  );

  // --- the admin session FIRST, before anything exists to clean up ----------
  // Order matters, and the reviewer on #3189 is why it is stated: the finally
  // block can only undo the subject if it holds an admin token, so acquiring
  // that token AFTER creating the subject leaves a window where a failure
  // strands a registered business AND reports "nothing to undo".
  adminToken = (await call("POST", "/api/auth/login", { jar: adminJar, body: { email: ADMIN_EMAIL, password: ADMIN_PW } })).json.access_token;

  // --- register the throwaway subject ---------------------------------------
  await call("POST", "/api/auth/register/producer", {
    body: {
      email: EMAIL, name: "בדיקת CC", password: PW,
      producer_name: BIZ, city: "תל אביב",
      short_description: "בית עסק זמני למדידת חלון מטמון — MEH-1876",
      phone: "0501112233", primary_contact_method: "whatsapp",
      category_ids: [14],
      declaration_accepted: true,
    },
    expect: [200, 201],
  });
  const login = await call("POST", "/api/auth/login", { jar: ownerJar, body: { email: EMAIL, password: PW } });
  const ownerToken = login.json.access_token;
  rec(Boolean(ownerToken), "S1:owner-logged-in", `token for ${EMAIL}`);

  const me = await call("GET", "/api/producers/me", { token: ownerToken, jar: ownerJar });
  producerId = me.json.id;
  say(`      subject producer ${producerId} — "${BIZ}"`);

  // Publish via the admin PUT rather than submit-for-review -> approve. The
  // submit gate requires `phone_verified` (submission_gate.py:159), which needs
  // a real WhatsApp OTP and is not reachable from here. The admin PUT sets
  // `status` directly (ProducerUpdate carries it) and is the shortest path to
  // the ONE precondition this measurement needs: a business on the public page.
  //
  // NOTE: never send `active_offer` to THIS endpoint. `Producer.active_offer` is
  // a read-only property (models.py:532) and the handler bulk-setattrs its
  // payload (admin.py:784), so an admin PUT carrying an offer raises rather than
  // writing one. That is a real latent 500 and is reported as a finding, not
  // worked around silently — the offer writes below all go through the OWNER
  // route, which is the only one with `_sync_active_offer` (producer_me.py:718).
  await call("PUT", `/api/admin/producers/${producerId}`, {
    token: adminToken, jar: adminJar, body: { status: "approved" }, expect: [200],
  });
  rec(true, "S2:subject-published", "status -> approved via the admin PUT");

  // --- C1: the subject must actually be ON the page ---------------------------
  const seeded = await waitUntil(Date.now(), (h) => h.includes(BIZ), "C1");
  rec(
    seeded !== null,
    "C1-control:subject-is-on-the-page",
    seeded === null
      ? "the approved business never appeared — every 'absent' below would be meaningless, so no window is reported"
      : `business name present after ${seeded}s (this is also the approve->visible window, incidentally)`,
  );
  if (seeded === null) return;

  // --- direction 1: PUT an offer -> chip appears -------------------------------
  const expires = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const before = await pageHtml();
  rec(!before.includes(HEADLINE), "D1-pre:chip-absent-before-the-write", "the headline is not on the page yet");

  await call("PUT", "/api/producers/me", {
    token: ownerToken,
    jar: ownerJar,
    body: { active_offer: { offer_type: "custom", headline: HEADLINE, expires_at: expires } },
  });
  const tPut = Date.now();
  say(`      PUT offer at ${new Date(tPut).toISOString()}`);
  const appear = await waitUntil(tPut, (h) => h.includes(HEADLINE), "D1");
  rec(appear !== null, "D1:offer-appears", appear === null ? `NOT within the ${CAP_MS / 1000}s cap` : `${appear}s`);

  // --- direction 2: PUT null -> chip disappears --------------------------------
  await call("PUT", "/api/producers/me", { token: ownerToken, jar: ownerJar, body: { active_offer: null } });
  const tNull = Date.now();
  say(`      PUT null at ${new Date(tNull).toISOString()}`);
  const vanish = await waitUntil(tNull, (h) => !h.includes(HEADLINE), "D2");
  rec(vanish !== null, "D2:offer-disappears", vanish === null ? `STILL VISIBLE at the ${CAP_MS / 1000}s cap` : `${vanish}s`);

  // --- the verdict, stated against the claim in the comment ---------------------
  const worst = Math.max(appear ?? Infinity, vanish ?? Infinity);
  rec(worst <= 90, "V:worst-direction-within-the-90s-the-comment-claims",
    Number.isFinite(worst) ? `worst = ${worst}s (appear ${appear}s · remove ${vanish}s)` : "one direction never resolved");
}

main()
  .catch((error) => { failed++; say(`FAIL  fatal — ${error.message}`); })
  .finally(async () => {
    // Cleanup is unconditional: the subject never stays on a public surface.
    try {
      if (producerId && adminToken) {
        const t = await call("POST", `/api/admin/producers/${producerId}/toggle-status`, { token: adminToken, jar: adminJar, expect: [200] });
        say(`CLEANUP  subject -> ${t.json.status}`);
        const gone = await waitUntil(Date.now(), (h) => !h.includes(BIZ), "CLEANUP");
        rec(gone !== null, "C4:subject-off-the-public-page", gone === null ? "STILL VISIBLE — needs a manual sweep" : `gone after ${gone}s`);
      } else if (producerId) {
        // Reachable only if the admin token was lost between the login above
        // and here. Say what is actually true — a `draft` producer exists and
        // nobody cleaned it up — rather than the reassuring line, which is the
        // exact null-that-lies this repo keeps finding.
        failed++;
        say(`FAIL  CLEANUP  producer ${producerId} ("${BIZ}") WAS created and could not be undone — no admin token. It is NOT public (draft), but it needs a manual sweep.`);
      } else {
        say("CLEANUP  nothing to undo (no producer was created)");
      }
    } catch (error) { failed++; say(`FAIL  cleanup — ${error.message}`); }
    say("");
    say(`${log.filter((l) => l.startsWith("PASS") || l.startsWith("FAIL")).length} assertions, ${failed} failed.`);
    fs.writeFileSync(`${OUT}assertions.log`, log.join("\n") + "\n", "utf8");
    process.exitCode = failed ? 1 : 0;
  });
