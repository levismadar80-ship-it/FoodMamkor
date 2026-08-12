/**
 * MEH-217 — Admin panel, tab reachability + panel chrome.
 *
 * Converted from a manual QA checklist by Sapir's ruling of 08/08/2026
 * ("כל המשימות שכתובות QA ידני — אני לא עושה, רק קלוד קוד עושה QA").
 *
 * SCOPE, and why it is narrower than the card's checklist:
 *
 * - **Non-destructive only.** The card's §2F (delete producer) and §3C
 *   (delete user / promote-to-admin) stay OUT of CI, and there is deliberately
 *   no skipped placeholder for them — a `test.skip` reads as coverage in the
 *   report while proving nothing. The card's own reasoning was never reversed
 *   by the 08/08 ruling: *"פעולות destructive — לא רוצים Playwright שירוץ בCI
 *   בטעות על data אמיתי"*. That ruling changed WHO does QA, not WHICH actions
 *   may run unattended against a shared seeded backend.
 * - **Role gating is not re-tested here.** `flows/25-role-reachability.spec.ts`
 *   owns admin-vs-owner-vs-consumer-vs-guest. One concern per spec.
 * - The card says "6 tabs". The panel now renders considerably more than that
 *   across 5 sections (`admin/layout.js:57-104`); the card was written 22/04.
 *   The six below are the ones it names, all still live routes. No count is
 *   quoted: this comment said "18 items", the real figure was 17
 *   (`grep -c 'href: "/admin'`), and a hand-counted number in a comment is the
 *   "artifact that asserts coverage" defect .claude/rules/testing.md warns
 *   about — nobody re-derives it, and it rots on the next nav change.
 *
 * SELECTORS: href + `aria-current`, the house pattern from spec 25
 * (`ADMIN_NAV = 'a[href$="/admin/producers"]'`). No `data-testid` is added to
 * `frontend/app/**` for this suite — the admin pages carry none today, and the
 * structural selectors below are stable against Hebrew copy changes, which is
 * what the testid rule is actually protecting.
 *
 * `toBeAttached` rather than `toBeVisible` for nav links: the desktop sidebar is
 * in the DOM but CSS-hidden on the mobile project, and the CI suite runs the
 * `[mobile]` project. Spec 25 made the same call for the same reason.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(__dirname, "..", ".auth");

/**
 * Copied from `flows/25-role-reachability.spec.ts` — the stricter of the two
 * guards in the repo. Skips ONLY "provisioning was skipped by design" (fixture
 * absent AND password unset). A missing fixture WITH the password set is real
 * breakage and must fail loud rather than hide behind a skip.
 *
 * Note what this gate consults: a fixture file and an env var. It never asks
 * the admin panel whether the admin panel is there — a `count() === 0 → skip`
 * on the subject under test converts "the thing is gone" into "nothing to
 * check", which is the failure `.claude/rules/testing.md` documents at length.
 */
function skipUnlessProvisioned(): void {
  const exists = fs.existsSync(path.join(AUTH_DIR, "admin.json"));
  test.skip(
    !exists && !process.env.DEMO_ADMIN_PASSWORD,
    "no e2e/.auth/admin.json and DEMO_ADMIN_PASSWORD is unset — global-setup " +
      "skips QA auth provisioning on an unseeded localhost target " +
      "(global-setup.ts:72-80). Runs against a seeded target; see " +
      "frontend/e2e/CLAUDE.md.",
  );
}

const DENIED = "access-denied";

/** The six tabs the card enumerates, in its own order. */
const TABS = [
  { href: "/admin", name: "dashboard" },
  { href: "/admin/producers", name: "producers" },
  { href: "/admin/users", name: "users" },
  { href: "/admin/reports", name: "reports" },
  { href: "/admin/content", name: "content" },
  { href: "/admin/settings", name: "settings" },
] as const;

const urlFor = (href: string) => new RegExp(`${href.replace(/\//g, "\\/")}(\\/|$|\\?)`);

/**
 * A provisioned storageState injects the JWT into localStorage["token"]
 * (lib/auth-context.js). Asserting it proves this is a REAL authenticated
 * session rather than a page that merely happened to render.
 */
async function assertAuthenticated(page: Page): Promise<void> {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token, "storageState must carry an authenticated JWT").toBeTruthy();
}

test.describe("MEH-217 — admin panel tabs", () => {
  skipUnlessProvisioned();
  test.use({ storageState: "e2e/.auth/admin.json" });

  for (const tab of TABS) {
    test(`${tab.name} — reachable, not denied, and the nav knows which tab it is`, async ({
      page,
    }) => {
      await page.goto(tab.href);
      await assertAuthenticated(page);

      // 1. We landed where we asked. Catches a redirect or a bounce back to
      //    /admin, which is how a broken route presents.
      await expect(page).toHaveURL(urlFor(tab.href));

      // 2. The role gate did NOT fire. `layout.js:156` renders this testid for
      //    a non-admin; for an admin session it must be absent. Counting 0 is
      //    the assertion — a presence-only check could not tell an admin
      //    session from a denied one.
      await expect(page.getByTestId(DENIED)).toHaveCount(0);

      // 3. The panel chrome rendered — we are inside the admin layout, not on
      //    a bare error page that merely has the right URL.
      await expect(page.locator('a[href$="/admin/producers"]').first()).toBeAttached();

      // 4. The nav's active computation agrees with the route. This is the
      //    assertion that discriminates: 1-3 all pass on a page that renders
      //    the panel while believing it is a different tab, which is exactly
      //    what `isActive()`'s prefix matching (layout.js:176-179) can get
      //    wrong — `/admin` must NOT light up while on `/admin/users`.
      await expect(
        page.locator(`a[href$="${tab.href}"][aria-current="page"]`).first(),
        `${tab.href} must be the tab marked aria-current="page"`,
      ).toBeAttached();

      // 5. The tab rendered content of its own.
      await expect(page.locator("main")).toBeVisible();
    });
  }

  test("the dashboard link does not stay active on a child tab (prefix-match guard)", async ({
    page,
  }) => {
    // `isActive("/admin")` is special-cased to an exact match precisely because
    // every other route starts with "/admin" (layout.js:177). If that special
    // case is ever dropped, the dashboard link lights up on all six tabs and
    // the breadcrumb-by-highlight becomes a lie. Asserted on the tab furthest
    // from the root so a partial regression still trips it.
    await page.goto("/admin/settings");
    await expect(page.getByTestId(DENIED)).toHaveCount(0);
    await expect(
      page.locator('a[href$="/admin"][aria-current="page"]'),
      'the "/admin" dashboard link must not be aria-current while on /admin/settings',
    ).toHaveCount(0);
  });

  test("every tab the card enumerates is present in the panel nav", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId(DENIED)).toHaveCount(0);
    for (const tab of TABS) {
      await expect(
        page.locator(`a[href$="${tab.href}"]`).first(),
        `nav must expose ${tab.href}`,
      ).toBeAttached();
    }
  });
});
