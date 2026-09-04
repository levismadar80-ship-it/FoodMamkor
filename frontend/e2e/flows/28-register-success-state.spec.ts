import { test, expect } from "./_cloudinary-stub";

/**
 * Module:   28-register-success-state
 * Purpose:  MEH-1814 — the post-submit screen must OWN the render. After a
 *           successful producer upgrade the auth role flips to "producer";
 *           the MEH-1489 mount-gate ("כבר יש לך עמוד עסק במהמקור") must not
 *           replace the success screen the seller just earned.
 * Does NOT: exercise the non-upgrade (guest) path — that lands on the
 *           inbox-check screen and is covered by
 *           flows/18-producer-register-wizard.spec.ts.
 * Touches:  no backend. GET /auth/me, GET /categories and
 *           POST /auth/register/producer are all route-mocked, and the session
 *           token is seeded via addInitScript — so this spec runs on the
 *           DEFAULT CI E2E target (localhost:3000, no storageState fixtures),
 *           unlike flows/25 which needs DEMO_* provisioning.
 * Related:  RegisterProducerClient.jsx (`submitted` gate guard + the
 *           STEP.CONFIRM success screen), __tests__/RegisterProducerClient.test.jsx
 *           (same invariant at the vitest layer, with mocks)
 * History:  MEH-1814 (creation)
 *
 * Locators are data-testid per docs/E2E-LOCATORS.md (MEH-495) so the locked
 * Hebrew copy can change without silently disarming the spec.
 */

// MEH-2239: screenshots go under Playwright's gitignored output tree
// (`frontend/.gitignore` → `test-results/`), NOT under the git-managed
// `qa-artifacts/`. Every local run used to leave a raw 557KB PNG untracked
// next to the compressed .webp evidence that already sits in
// qa-artifacts/MEH-1814/ — and frontend/qa-artifacts/ is exactly the
// half the size-cap gate cannot see (MEH-2184), so a stray commit there
// would have passed green. The evidence workflow is unchanged: copy the
// PNG out and compress it (scripts/compress-qa-screenshots.mjs) when a PR
// needs it.
const SHOT_DIR = "test-results/qa-artifacts/MEH-1814";

// 375px — the narrowest phone we design for; the ticket pins self-QA to it.
test.use({ viewport: { width: 375, height: 812 } });

/**
 * Seeds a logged-in session and mocks every endpoint the page touches.
 * `roleRef.current` is what GET /auth/me reports, so a test can flip the role
 * mid-flight exactly the way the real upgrade does.
 */
async function stubSession(page, roleRef: { current: string }) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
  });
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        email: "seller@mehamakor.online",
        name: "בעלת עסק",
        role: roleRef.current,
      }),
    }),
  );
  // Auth boot calls ensureFavoritesLoaded(); keep it from hitting the network.
  await page.route("**/favorites**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/categories", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // id 1 mirrors flows/18: a license-required category, so the MEH-952
      // inline license gate is exercised rather than bypassed.
      body: JSON.stringify([
        // MEH-2139: CategorySelector keys the POPULAR grid by `slug`, not by the
        // Hebrew name — a slug-less stub renders no chip at all.
        { id: 1, name: "חלב וגבינות", slug: "dairy" },
        { id: 2, name: "לחמים ואפייה", slug: "bread" },
      ]),
    }),
  );
}

/**
 * Walks the wizard from the pre-flight screen to a STORY step that is ready to
 * submit — every field filled, submit NOT clicked. Extracted verbatim under
 * MEH-2138 chunk F so the scroll test below drives the identical path; the
 * click stays at each call site because the MEH-1814 test arms a response
 * waiter immediately before it.
 */
async function driveWizardToStorySubmitReady(page) {
  await page.goto("/register/producer");
  await page.getByTestId("register-preflight-start").click();

  // Upgrade path skips ACCOUNT — the token puts step at DETAILS.
  await expect(page.getByTestId("register-frame-details")).toBeVisible();
  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
  await page.getByTestId("register-details-address").fill("הרצל 1");
  await page.getByTestId("register-details-next").click();

  await expect(page.getByTestId("register-frame-category")).toBeVisible();
  await page.getByTestId("category-chip-1").click();
  await page.getByTestId("register-category-license").fill("1234567");
  await page.getByTestId("register-category-next").click();

  await expect(page.getByTestId("register-frame-story")).toBeVisible();
  await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
  await page.getByTestId("register-referral-source").selectOption("instagram");
  for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
    await cb.check();
  }
}

/** Mocks a successful upgrade and flips the role, exactly as the real one does. */
async function stubUpgradeSubmit(page, roleRef: { current: string }) {
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

test.describe("MEH-1814 — post-submit success state owns the render", () => {
  test("upgrade submit lands on the success screen, not the early gate", async ({ page }) => {
    // Starts as a consumer: the wizard is legitimately reachable.
    const roleRef = { current: "consumer" };
    await stubSession(page, roleRef);

    await page.route("**/auth/register/producer", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      // THE REGRESSION CONDITION: a successful upgrade flips the role, and the
      // component's refreshUser() re-reads /auth/me. Without the `submitted`
      // guard the gate then outranks the success screen on the next render.
      roleRef.current = "producer";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "upgraded-token", whatsapp_sent: true }),
      });
    });

    await driveWizardToStorySubmitReady(page);
    // The bug produced a *later* render — the one after refreshUser() lands the
    // flipped role — so an assertion that fires the instant CONFIRM mounts could
    // pass on broken code. Arm the waiter BEFORE the click so it resolves on the
    // refreshUser() call specifically (the boot /auth/me has long since
    // resolved), giving a deterministic "the role has now flipped" signal
    // instead of an arbitrary sleep.
    const roleFlipped = page.waitForResponse(
      (r) => r.url().includes("/auth/me") && r.request().method() === "GET",
      { timeout: 15_000 },
    );
    await page.getByTestId("register-story-submit").click();

    // ── The assertion this spec exists for ──
    const success = page.getByTestId("register-success-pending");
    await expect(success).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("register-success-dashboard-cta")).toBeVisible();
    // The gate must be absent, not merely "behind" the success screen.
    await expect(page.getByTestId("register-producer-gate")).toHaveCount(0);

    // Re-assert once the flipped role is provably in the auth context.
    await roleFlipped;
    await expect(success).toBeVisible();
    await expect(page.getByTestId("register-producer-gate")).toHaveCount(0);

    await page.screenshot({ path: `${SHOT_DIR}/success-375.png`, fullPage: true });
  });

  test("existing producer hits the gate at mount and cannot reach the form", async ({ page }) => {
    const roleRef = { current: "producer" };
    await stubSession(page, roleRef);

    await page.goto("/register/producer");

    await expect(page.getByTestId("register-producer-gate")).toBeVisible();
    // Form unreachable: no pre-flight CTA, no wizard frame, no hero pitch.
    await expect(page.getByTestId("register-preflight-start")).toHaveCount(0);
    await expect(page.getByTestId("register-frame-details")).toHaveCount(0);
    await expect(page.getByTestId("register-hero-heading")).toHaveCount(0);

    await page.screenshot({ path: `${SHOT_DIR}/gate-375.png`, fullPage: true });
  });
});

/**
 * MEH-2138 chunk F — the success screen must be ON SCREEN, not merely rendered.
 *
 * The wizard is one long page, so CONFIRM mounts at whatever scroll offset the
 * seller left behind. Measured on staging at 1440: docH 1493, viewport 900,
 * scrollY 539 — she lands on the footer and never sees what she just earned.
 * (It is also why MEH-2136's hierarchy fix produced visually identical desktop
 * before/after captures: the screen was corrected and out of frame.)
 *
 * This assertion CANNOT live in vitest. jsdom does no layout, so every
 * geometric claim there passes against the broken code too — the exact trap the
 * MEH-2148 harness fell into. __tests__/RegisterProducerClient.test.jsx carries
 * the complementary half (that the call is made, on BOTH confirm branches);
 * this file carries the only half that can observe a viewport.
 *
 * ── Why this runs twice, and it is not thoroughness for its own sake ──
 * `playwright.config.ts:97` pins `reducedMotion: "reduce"` for the whole suite.
 * `SmoothScrollProvider.jsx:25` returns early under exactly that preference, so
 * the default configuration never mounts Lenis — and Lenis is the one thing in
 * this app that could plausibly fight a programmatic `window.scrollTo`, since
 * it owns the scroll position on desktop for every user who has NOT asked for
 * reduced motion. A single run under the suite default would therefore have
 * measured the easy half and reported it as the whole answer.
 */
const F_CASES = [
  // The measured case, and the one the ticket pins the claim to.
  { w: 1440, h: 900, motion: "reduce" as const, label: "1440 · reduced-motion (suite default, no Lenis)" },
  // Same viewport, Lenis LIVE — fine pointer and no reduced-motion preference
  // is exactly the gate at SmoothScrollProvider.jsx:25-26.
  { w: 1440, h: 900, motion: "no-preference" as const, label: "1440 · Lenis live" },
  // Mobile. `reduce` and not `no-preference` on purpose: a real phone is
  // `pointer: coarse`, and SmoothScrollProvider.jsx:26 returns early on that —
  // so Lenis never mounts on a phone regardless of the motion preference, and
  // this run is the representative one rather than the lenient one.
  { w: 375, h: 812, motion: "reduce" as const, label: "375 · mobile" },
];

for (const c of F_CASES) {
  test.describe(`MEH-2138 chunk F — lands ON the success screen (${c.label})`, () => {
    test.use({ viewport: { width: c.w, height: c.h }, reducedMotion: c.motion });

    test("submitting from a scrolled page lands the success heading in the viewport", async ({ page }) => {
      const roleRef = { current: "consumer" };
      await stubSession(page, roleRef);
      await stubUpgradeSubmit(page, roleRef);

      await driveWizardToStorySubmitReady(page);

      // Reproduce the condition: the seller has scrolled down to reach submit.
      const before = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return {
          y: window.scrollY,
          docH: document.documentElement.scrollHeight,
          vh: window.innerHeight,
          lenis: document.documentElement.classList.contains("lenis"),
        };
      });

      // ── CONTROL, and the whole spec rests on it ──
      // If the page does not actually scroll at this viewport, "the heading is
      // in view" is true no matter what the component does, and this test would
      // report green against the bug it exists to catch. Assert the
      // precondition rather than assume the measured docH still holds.
      expect(
        before.y,
        `CONTROL FAILED: the page did not scroll (docH ${before.docH}, viewport ${before.vh}). ` +
          "Every assertion below is vacuous in that state — fix the control before reading the result.",
      ).toBeGreaterThan(100);

      await page.getByTestId("register-story-submit").click();

      const success = page.getByTestId("register-success-pending");
      await expect(success).toBeVisible({ timeout: 10_000 });

      // The heading, not the container: the container opens with a `py-8` block,
      // so a container-based check is satisfied a little too easily.
      await expect(success.getByRole("heading")).toBeInViewport({ ratio: 1 });

      const after = await page.evaluate(() => window.scrollY);
      expect(
        after,
        `the document itself must be back at the top, not merely the heading in frame (lenis mounted: ${before.lenis})`,
      ).toBe(0);

      await page.screenshot({ path: `test-results/qa-artifacts/MEH-2138f/success-${c.w}-${c.motion}.png` });
    });
  });
}
