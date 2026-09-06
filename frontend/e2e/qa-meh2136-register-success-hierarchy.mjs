/**
 * MEH-2136 self-QA — the register success screen's ACTION HIERARCHY.
 *
 * Drives the REAL /register/producer wizard (he is the unprefixed default
 * locale) through the upgrade path to STEP.CONFIRM in Chromium against a
 * `next start` server, then measures the success screen at 375 and 1440.
 *
 * What it measures, and why each is a measurement rather than a class read:
 *   - DOM ORDER of the five blocks (next-box → CTA → share → signature →
 *     tier_trust), via compareDocumentPosition. This is the thing the ticket
 *     is about; the pre-MEH-2136 markup put signature + tier_trust ABOVE the
 *     button row.
 *   - COMPUTED backgroundColor of the CTA. `bg-primary-dark` in the class
 *     attribute proves the token was typed, not that it resolves — a class
 *     that resolves to nothing reads as present in the DOM while painting
 *     transparent (.claude/rules/frontend.md — computed-style probe).
 *   - RENDERED WIDTH of both buttons against their container at 375. "Full
 *     width on mobile" is geometry; `w-full` is a hope.
 *
 * Case 0 is a self-test with known answers, run FIRST: if the ordering
 * predicate cannot sort three nodes whose order this file constructs, every
 * PASS after it is void. Stated in the failure message, not just implied.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2136-register-success-hierarchy.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2136";
const BASE = "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let failures = 0;
const ran = [];
const check = (label, ok, detail) => {
  ran.push(label);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

/** Seeds the logged-in consumer session + every endpoint the wizard touches. */
async function stubSession(page, roleRef) {
  await page.addInitScript(() => localStorage.setItem("token", "qa-token"));
  // Registered FIRST on purpose: Playwright matches routes in REVERSE
  // registration order, so the catch-all has to go in before the specific
  // handlers or it swallows them. (It did on run 1 — /auth/me returned `{}`,
  // the user read as unauthenticated, and the preflight never rendered.)
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, email: "seller@mehamakor.online", name: "בעלת עסק", role: roleRef.current }),
    })
  );
  await page.route("**/favorites**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/categories", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        // MEH-2139: CategorySelector keys the POPULAR grid by `slug`, not by the
        // Hebrew name — a slug-less stub renders no chip at all.
        { id: 1, name: "חלב וגבינות", slug: "dairy" },
        { id: 2, name: "לחמים ואפייה", slug: "bread" },
      ]),
    })
  );
  await page.route("**/auth/register/producer", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    roleRef.current = "producer";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "upgraded-token", whatsapp_sent: true }),
    });
  });
}

/** Walks the wizard to STEP.CONFIRM on the didUpgrade branch. */
async function reachSuccess(page) {
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-frame-details").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
  await page.getByTestId("register-details-address").fill("הרצל 1");
  await page.getByTestId("register-details-next").click();

  await page.getByTestId("register-frame-category").waitFor({ state: "visible" });
  await page.getByTestId("category-chip-1").click();
  await page.getByTestId("register-category-license").fill("1234567");
  await page.getByTestId("register-category-next").click();

  await page.getByTestId("register-frame-story").waitFor({ state: "visible" });
  await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
  await page.getByTestId("register-referral-source").selectOption("instagram");
  for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
    await cb.check();
  }
  await page.getByTestId("register-story-submit").click();
  await page.getByTestId("register-success-pending").waitFor({ state: "visible", timeout: 20_000 });
}

/** Reads order + geometry + computed paint off the live success screen. */
function probe(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="register-success-pending"]');
    if (!root) return { alive: false };
    const cta = root.querySelector('[data-testid="register-success-dashboard-cta"]');
    const share = root.querySelector('a[href^="https://wa.me/"]');
    // The green next box is the only .bg-green-50 on the screen; signature and
    // tier_trust are the last two <p> under the root.
    const nextBox = root.querySelector(".bg-green-50");
    const paras = [...root.querySelectorAll("p")];
    const signature = paras.at(-2) || null;
    const tierTrust = paras.at(-1) || null;
    const seq = [nextBox, cta, share, signature, tierTrust];
    if (seq.some((n) => !n)) {
      return {
        alive: true,
        missing: ["nextBox", "cta", "share", "signature", "tierTrust"].filter((_, i) => !seq[i]),
      };
    }
    // documentOrder[i] < documentOrder[i+1] iff the sequence is in DOM order.
    const inOrder = seq.every(
      (node, i) =>
        i === seq.length - 1 ||
        Boolean(node.compareDocumentPosition(seq[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
    const cs = getComputedStyle(cta);
    const shareCs = getComputedStyle(share);
    return {
      alive: true,
      missing: [],
      inOrder,
      ctaBg: cs.backgroundColor,
      ctaColor: cs.color,
      shareBg: shareCs.backgroundColor,
      ctaWidth: cta.getBoundingClientRect().width,
      shareWidth: share.getBoundingClientRect().width,
      containerWidth: cta.parentElement.getBoundingClientRect().width,
      // Vertical gap between the bottom of the green box and the top of the CTA:
      // "directly below" is a distance, and a big number means something got
      // between them.
      boxToCtaGap: Math.round(cta.getBoundingClientRect().top - nextBox.getBoundingClientRect().bottom),
      signatureBelowButtons:
        signature.getBoundingClientRect().top > share.getBoundingClientRect().bottom,
      // Presence in the DOM is not visibility. The fullPage capture at 1440
      // showed blank space where these two paragraphs sit, so the harness has
      // to measure them rather than infer them from `querySelector` returning
      // a node.
      signatureBox: (({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(
        signature.getBoundingClientRect()
      ),
      tierTrustBox: (({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(
        tierTrust.getBoundingClientRect()
      ),
      signatureColor: getComputedStyle(signature).color,
      cardBg: getComputedStyle(root.closest("div.bg-white") || root).backgroundColor,
      // Where the CTA sits on the page, in absolute terms. This is the ticket's
      // actual premise ("Sapir registered and did not find the dashboard"), so
      // it gets measured rather than told: below the fold at 375 means a seller
      // has to scroll past the founder signature to reach the only way in.
      ctaAbsTop: Math.round(cta.getBoundingClientRect().top + window.scrollY),
      viewportH: window.innerHeight,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  // ── case 0: self-test, run FIRST. If the ordering predicate cannot sort a
  // sequence whose order this file constructs, every reading below is VOID. ──
  const selfPage = await browser.newPage();
  await selfPage.setContent("<div><i id=a></i><i id=b></i><i id=c></i></div>");
  const selfTest = await selfPage.evaluate(() => {
    const ordered = (ids) => {
      const nodes = ids.map((i) => document.getElementById(i));
      return nodes.every(
        (n, i) =>
          i === nodes.length - 1 ||
          Boolean(n.compareDocumentPosition(nodes[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    };
    return { forward: ordered(["a", "b", "c"]), backward: ordered(["c", "b", "a"]), swapped: ordered(["a", "c", "b"]) };
  });
  await selfPage.close();
  check(
    "0. self-test: the order predicate separates in-order from out-of-order",
    selfTest.forward === true && selfTest.backward === false && selfTest.swapped === false,
    `forward=${selfTest.forward} backward=${selfTest.backward} swapped=${selfTest.swapped}` +
      (selfTest.forward && !selfTest.backward && !selfTest.swapped
        ? ""
        : " — ⛔ CONTROL FAILED: every ordering PASS below is void")
  );

  for (const width of [375, 1440]) {
    const roleRef = { current: "consumer" };
    const page = await browser.newPage({ viewport: { width, height: width === 375 ? 812 : 900 } });
    await stubSession(page, roleRef);
    await reachSuccess(page);
    await page.waitForTimeout(400); // settle transitions before geometry
    const r = await probe(page);

    check(`${width}: success screen is alive and all five blocks present`, r.alive && r.missing.length === 0, `missing=${JSON.stringify(r.missing)}`);
    if (!r.alive || r.missing.length) continue;
    console.log(`      [measure] ${width}: CTA absolute top = ${r.ctaAbsTop}px, viewport = ${r.viewportH}px`);

    check(`${width}: DOM order = next-box → CTA → share → signature → tier_trust`, r.inOrder === true);
    check(`${width}: signature renders BELOW both buttons`, r.signatureBelowButtons === true);
    check(
      `${width}: signature + tier_trust actually paint (non-zero box, not white-on-white)`,
      r.signatureBox.h > 0 && r.signatureBox.w > 0 && r.tierTrustBox.h > 0 && r.tierTrustBox.w > 0 &&
        r.signatureColor !== r.cardBg,
      `signature=${r.signatureBox.w}x${r.signatureBox.h} tier_trust=${r.tierTrustBox.w}x${r.tierTrustBox.h} color=${r.signatureColor} cardBg=${r.cardBg}`
    );
    check(
      `${width}: CTA paints a solid primary-dark fill (computed, not class)`,
      r.ctaBg !== "rgba(0, 0, 0, 0)" && r.ctaBg !== "transparent",
      `backgroundColor=${r.ctaBg} color=${r.ctaColor}`
    );
    check(
      `${width}: share stays secondary — not the same fill as the CTA`,
      r.shareBg !== r.ctaBg,
      `share=${r.shareBg} cta=${r.ctaBg}`
    );
    check(
      `${width}: gap between the green box and the CTA is a single stack gap (< 40px)`,
      r.boxToCtaGap >= 0 && r.boxToCtaGap < 40,
      `${r.boxToCtaGap}px`
    );
    if (width === 375) {
      check(
        "375: both buttons fill their container (mobile full-width)",
        Math.abs(r.ctaWidth - r.containerWidth) < 1 && Math.abs(r.shareWidth - r.containerWidth) < 1,
        `cta=${Math.round(r.ctaWidth)} share=${Math.round(r.shareWidth)} container=${Math.round(r.containerWidth)}`
      );
    }

    // Scroll to the top BEFORE capturing. Filling the wizard leaves the page
    // scrolled to the bottom, and `fullPage` repaints the sticky header at that
    // offset — which is what put a blank white band over the signature block in
    // the first 1440 capture. Not a rendering bug: the same run measured
    // signature = 576×24 and tier_trust = 576×39 with a non-background colour.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/success-${width}.png`, fullPage: true });
    // Viewport capture too — two captures agreeing is the page; disagreeing is
    // the capture.
    await page.screenshot({ path: `${OUT}/success-${width}-viewport.png` });
    console.log(`      screenshots → ${OUT}/success-${width}{,-viewport}.png`);
    await page.close();
  }

  await browser.close();
  // Derived, never stated: adding a check moves this number on its own.
  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${ran.length} assertions, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
