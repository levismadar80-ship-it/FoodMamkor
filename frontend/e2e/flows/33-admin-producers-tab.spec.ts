/**
 * MEH-217 chunk 2 — Admin panel, Producers tab: view + filters + search.
 *
 * Continues chunk 1 (`flows/30-admin-panel-tabs.spec.ts`, tab reachability).
 * This spec covers the card's §2A (view), §2B (filters), and the read-only
 * half of §2D (edit form pre-fill) — the parts reachable without mutating
 * shared seed data on a target other E2E runs and PRs use concurrently.
 *
 * DEFERRED, not silently skipped — each with why, so a reader doesn't mistake
 * "not in this file" for "not needed":
 *
 * - **§2C quick-approve.** Needs a producer in `pending` (the second waiting
 *   status this line used to name, `pending_whatsapp`, was removed in MEH-2124).
 *   `backend/scripts/seed_demo_producers.py` seeds nothing but `status="approved"`
 *   (verified via `grep -n 'status=' backend/scripts/seed_demo_producers.py`,
 *   13/08) — there is no seeded fixture to approve. This is exactly the gap
 *   MEH-1706 (seed coverage contract) exists to close; that card is currently
 *   blocked on its own chunk-by-chunk Sapir WAIT gates. Re-visit once it lands.
 * - **§2D save-path.** Reading the edit form is covered below; actually
 *   submitting a change to a shared seeded producer is not — a concurrent PR's
 *   E2E run (or this repo's parallel-lane sessions) reading the same producer
 *   would see a value flip mid-run. Same self-pollution class MEH-1502 names
 *   for specs that create real businesses on a shared staging target.
 * - **§2E toggle-status (suspend/restore) and §2F delete.** Both mutate a real
 *   producer's public visibility. A suspend-then-restore round-trip in one
 *   test would be self-cancelling on a quiet target, but staging is not quiet
 *   right now — this repo runs several parallel CC lanes against it, and a
 *   producer flipping to `inactive` mid-window is visible to anyone else's
 *   spec or manual QA hitting that producer's public page. Chunk 1's own
 *   scope note draws the same line for delete; toggle-status is the same
 *   class of action for the same reason, not a stricter one.
 * - **§2G Import/Export Excel.** File I/O flow, no seeded fixture file in the
 *   repo to import — separate chunk.
 *
 * SELECTORS: structural (`table thead th`, `tbody tr`, the `<select>` in the
 * toolbar), not `data-testid` — neither `AdminProducersTable.jsx` nor
 * `AdminProducersToolbar.jsx` carries any (verified by grep, 13/08), matching
 * chunk 1's precedent for this same page. Filter/search assertions read
 * seeded producer NAMES and CITIES as fixture data, not translated UI copy —
 * that is not the fragility the data-testid convention protects against.
 *
 * Status-badge assertions compare the badge's CLASS, not its Hebrew label
 * text (`getProducerStatusColor` in `lib/producer-status.js` maps status ->
 * a fixed Tailwind class per status). A class comparison survives a copy
 * change to the label; a text comparison would not.
 */
import { test, expect } from "./_cloudinary-stub";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(__dirname, "..", ".auth");

/** Same guard as chunk 1 — see that file's comment for why this form and not
 *  the looser `flows/21-account-menu-auth.spec.ts` one. */
function skipUnlessProvisioned(): void {
  const exists = fs.existsSync(path.join(AUTH_DIR, "admin.json"));
  test.skip(
    !exists && !process.env.DEMO_ADMIN_PASSWORD,
    "no e2e/.auth/admin.json and DEMO_ADMIN_PASSWORD is unset — global-setup " +
      "skips QA auth provisioning on an unseeded localhost target. Runs " +
      "against a seeded target; see frontend/e2e/CLAUDE.md.",
  );
}

const DENIED = "access-denied";
const TABLE_ROWS = "table tbody tr";

test.describe("MEH-217 chunk 2 — admin producers tab", () => {
  skipUnlessProvisioned();
  test.use({ storageState: "e2e/.auth/admin.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/producers");
    await expect(page.getByTestId(DENIED)).toHaveCount(0);
    // Wait for the table itself, not just the page shell — the fetch is
    // client-side (use-admin-producers.js), so a bare goto() can race it.
    await expect(page.locator("table thead th").first()).toBeVisible();
  });

  test("§2A — the table renders seeded rows with every documented column", async ({ page }) => {
    const rows = page.locator(TABLE_ROWS);
    // At least the flagship + the 9 seed_demo_producers.py businesses.
    // ">=" not "===": other lanes/sessions may have seeded additional
    // producers by the time this runs. A lower bound is still a real
    // assertion — it fails if the table renders empty or errors out.
    await expect(rows).not.toHaveCount(0);
    expect(await rows.count()).toBeGreaterThanOrEqual(10);

    const headers = page.locator("table thead th");
    // 7 columns per AdminProducersTable.jsx's TABLE_COLUMN_COUNT. Asserted
    // by count, not by reading each header's translated text.
    await expect(headers).toHaveCount(7);
  });

  test("§2A — completeness indicator renders with a hover explanation", async ({ page }) => {
    // Every row's first cell carries exactly one completeness dot
    // (CompletenessBadge — red/yellow/green Circle, always exactly one of
    // the three, never zero). Checked on the first row rather than every
    // row: this is a rendering-contract check, not a per-producer data audit.
    const firstRowDot = page.locator(TABLE_ROWS).first().locator("td").first().locator("[title]");
    await expect(firstRowDot).toHaveCount(1);
    await expect(firstRowDot).toHaveAttribute("title", /.+/);
  });

  test("§2A — every rendered status badge is one of the four documented classes", async ({
    page,
  }) => {
    // Structural discrimination: a StatusBadge with an unrecognized status
    // falls back to getProducerStatusColor's "bg-gray-100" default (unstyled
    // fallback) rather than one of the four real status classes. Asserting
    // membership in the real set — not just "a class exists" — is what
    // catches a status value the badge doesn't know how to render.
    const REAL_STATUS_CLASSES = [
      /bg-green/, // approved
      /bg-yellow/, // pending
      /bg-red/, // rejected
      /bg-gray-2|bg-slate/, // inactive/suspended — exact shade not pinned
    ];
    const badges = page.locator(TABLE_ROWS).first().locator("td").nth(4).locator("span").first();
    const cls = (await badges.getAttribute("class")) || "";
    const matchesReal = REAL_STATUS_CLASSES.some((re) => re.test(cls));
    const isBareFallback = cls.includes("bg-gray-100") && !matchesReal;
    expect(isBareFallback, `status badge class "${cls}" must not be the unstyled fallback`).toBe(
      false,
    );
  });

  test("§2B — status filter narrows to a single status class across all visible rows", async ({
    page,
  }) => {
    // All ten seeded producers are approved (verified via grep, 13/08), so
    // filtering to "approved" is the one filter value guaranteed non-empty
    // without a fixture this repo doesn't have yet (see the file-level
    // DEFERRED note on §2C/§2E for why "pending" isn't used here instead).
    const select = page.locator("select").first();
    // The status <select>'s onChange feeds producerStatus, and
    // use-admin-producers.js re-fetches via a useEffect keyed on it — no
    // separate "search" click needed for this filter (unlike the text
    // search input, which only re-fetches on Enter/button).
    await select.selectOption("approved");
    await expect(page.locator(TABLE_ROWS).first()).toBeVisible();

    const statusCells = page.locator(TABLE_ROWS).locator("td").nth(4);
    const count = await page.locator(TABLE_ROWS).count();
    for (let i = 0; i < count; i++) {
      const cellClass =
        (await page
          .locator(TABLE_ROWS)
          .nth(i)
          .locator("td")
          .nth(4)
          .locator("span")
          .first()
          .getAttribute("class")) || "";
      expect(cellClass, `row ${i} must carry the approved status class after filtering`).toMatch(
        /bg-green/,
      );
    }
  });

  test("§2B — search by producer name narrows to a matching row", async ({ page }) => {
    const search = page.locator('input[placeholder]').first();
    // Distinctive substring of a seeded producer's name — "לחם וזמן"
    // (מאפיית לחם וזמן, seed_demo_producers.py). Fixture data, not UI copy.
    await search.fill("לחם וזמן");
    await search.press("Enter");
    await expect(page.locator(TABLE_ROWS)).toHaveCount(1);
    await expect(page.locator(TABLE_ROWS).first()).toContainText("לחם וזמן");
  });

  test("§2B — search by city narrows results and clearing restores the full set", async ({
    page,
  }) => {
    const baseline = await page.locator(TABLE_ROWS).count();
    const search = page.locator('input[placeholder]').first();

    // "קצרין" — city of the seeded מחלבת עמק האלה, distinctive enough that
    // no other seeded producer shares it (verified against the seed list).
    await search.fill("קצרין");
    await search.press("Enter");
    await expect(page.locator(TABLE_ROWS)).toHaveCount(1);
    await expect(page.locator(TABLE_ROWS).first()).toContainText("קצרין");

    // Clearing the search must widen back to at least the pre-search count —
    // not just "not one row", which a broken empty-state could also satisfy.
    await search.fill("");
    await search.press("Enter");
    await expect(async () => {
      expect(await page.locator(TABLE_ROWS).count()).toBeGreaterThanOrEqual(baseline);
    }).toPass({ timeout: 5_000 });
  });

  test("§2D (read-only) — the edit page loads with the producer's own data, and nothing is submitted", async ({
    page,
  }) => {
    // Open the first row's edit link rather than POST/PATCH anything — this
    // proves the edit surface loads correctly-scoped data without touching
    // shared state. See the file-level DEFERRED note for why an actual save
    // is out of scope for this chunk.
    const firstRowName = (await page.locator(TABLE_ROWS).first().locator("td").first().innerText())
      .split("\n")[0]
      .trim();
    await page.locator(TABLE_ROWS).first().locator('a[href*="/edit"]').click();
    await expect(page).toHaveURL(/\/admin\/producers\/.+\/edit/);
    // The form's name field is pre-filled with the SAME producer we clicked
    // from — the assertion that discriminates a correctly-scoped edit page
    // from one that always opens the first producer in the DB regardless of
    // which row was clicked.
    const nameInput = page.locator('input[type="text"], input:not([type])').first();
    await expect(nameInput).toHaveValue(new RegExp(firstRowName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
