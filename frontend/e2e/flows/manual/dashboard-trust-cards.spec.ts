import { test, expect, type Page, type Route } from "../_cloudinary-stub";
import { LICENSE_REQUIRED_CATEGORIES, PRODUCER_LICENSE_REGEX } from "../../../lib/license-required-categories";

/**
 * Spec:     manual/dashboard-trust-cards — MEH-1249 chunk 11g of 12
 * Purpose:  Convert the CONVERT-verdict rows of three edit-tab cards:
 *             MT:MEH-1258   "רישיון יצרן" — save, format warning, required
 *                           hint, server 422 inline, deep link
 *             MT:MEH-1167   "תעודת כשרות" — form, submit, 409 inline, upload
 *                           rejection surface, request statuses
 *             MT:MEH-1872b  "שינוי שם העסק" — the OWNER half of the second
 *                           section (rows 1-4, 6-7); MT:MEH-1872:7 — row 7 of
 *                           the first section (no direct name field)
 * Touches:  NO real backend. Reads are route-fulfilled as chunks 11a–11f do;
 *           the GET answers with the last captured PUT merged in. POSTs to
 *           /producers/me/kashrut-request, /upload/kashrut-cert and
 *           /producers/me/name-change-requests are captured and answered with
 *           whatever status a test asks for. No byte reaches a server.
 * Does NOT: cover the admin halves (MT:MEH-1167:6 approve path, :5 freemium
 *           gate — backend; MT:MEH-1872 first section rows 1-6 and the admin
 *           queue — /admin + backend), or the public page's name staying put
 *           (second section row 5 — /producer/[id]). The upload-rejection and
 *           409 rows assert the client SURFACE of a server answer; the rules
 *           live in backend/tests.
 * Related:  app/[locale]/producer/dashboard/edit/cards.jsx (LicenseCard :1154,
 *           KashrutCard :1288, BusinessNameCard :2292) ·
 *           lib/license-required-categories.js
 * History:  MEH-1249 chunk 11g.
 *
 * ─── MEH-1968 three conditions, stated because the rule requires it ────────
 *   1. No backend BEHAVIOUR is asserted — what renders for a given list, what
 *      the client sends, and which message it shows for a given status.
 *   2. Every intercepted endpoint has a Pydantic model; the 422/409 bodies are
 *      the `{detail}` envelope `detailToMessage` reads.
 *   3. Reaching "a pending kashrut request" or "a pending name change" honestly
 *      means writing moderation rows to shared staging — forbidden (13/07).
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 * D1 · MT:MEH-1167:1 lists a "צילום התעודה" control; the live label is
 *      «צילום התעודה (JPG/PNG, עד 5MB)» and the input carries accept="image/*".
 *      The PDF rejection in :4 is therefore a SERVER answer the client surfaces
 *      — the browser's own accept filter is bypassable and not what the row
 *      relies on.
 * D2 · MANUAL_TESTING.md carries TWO `## MEH-1872` sections (lines ~101 and
 *      ~3325). Markers here name the first as MT:MEH-1872:N and the second as
 *      MT:MEH-1872b:N so the marker cross-check can tell them apart; the owner
 *      rows live in the second one.
 * D3 · MT:MEH-1258 and MT:MEH-1167 describe TWO cards ("רישיון יצרן", then
 *      "תעודת כשרות" after it). The trust group renders ONE card,
 *      «אישורים ותעודות» (anchorId="trust", page.js:975-1030), composing the
 *      licence and kashrut bodies as stacked sections; `#license` and
 *      `#kashrut` both resolve to it (page.js:233). Its summary carries the
 *      masked licence («•••4567») and the kashrut state. Asserted as merged.
 * D4 · `#business-name` is a DEAD deep link. ANCHOR_TO_KEY maps it to
 *      `businessName` (page.js:102), but KEY_TO_GROUP (page.js:202-231) has no
 *      such key, so the hash resolver (page.js:392, :479) finds no group and the
 *      hub stays on screen — while the mount comment (page.js:955-963) calls the
 *      anchor an unchanged "deep-link contract (MEH-1106)". Filed; the deep-link
 *      test below asserts the correct behaviour under test.fail(). Every other
 *      business-name test opens the card through `?group=profile`, which works.
 * D5 · The second MT:MEH-1872 section's row 1 says the card is FIRST in the
 *      profile group. MEH-2063 moved it LAST (page.js:955-963 explains why:
 *      rare administrative action below weekly content). Asserted as last.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
const REQUIRED_CAT = LICENSE_REQUIRED_CATEGORIES[0] as string;
const PLAIN_CAT = "פרחים ועציצים";

const BASE = {
  id: 7, name: "מאפיית שקד", city: "חיפה", phone: "050-1234567", primary_contact_method: "whatsapp", whatsapp: "050-1234567",
  phone_verified: true, has_physical_location: true, offers_delivery: false, delivery_nationwide: false, delivery_areas: [],
  categories: [{ id: 2, name: PLAIN_CAT }], images: [{ id: 1, url: IMG }], products: [{ id: 1, name: "חלה" }],
  short_description: "מאפייה שכונתית", description: "מאפייה שכונתית קטנה בלב חיפה",
  locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" }],
  producer_license_number: null as string | null,
};

type Rec = { method: string; url: string; body: unknown };
type Answer = { status: number; body: unknown };
type Opts = {
  profile?: Record<string, unknown>;
  kashrutRequests?: unknown[];
  nameRequests?: unknown[];
  putAnswer?: Answer;
  kashrutPostAnswer?: Answer;
  uploadAnswer?: Answer;
  namePostAnswer?: Answer;
  writes?: Rec[];
};

async function stubEdit(page: Page, opts: Opts = {}): Promise<void> {
  const p = opts.profile ?? BASE; const writes = opts.writes; let lastPut: Record<string, unknown> = {};
  const json = (r: Route, status: number, body: unknown) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const rec = (r: Route) => { const req = r.request(); const path = new URL(req.url()).pathname.replace(/^.*\/api/, ""); let body: unknown = null; try { body = req.postDataJSON(); } catch { body = req.postData(); } writes?.push({ method: req.method(), url: path, body }); };
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/favorites**", (r) => json(r, 200, []));
  for (const sub of ["products", "locations"]) await page.route(`**/producers/me/${sub}**`, (r) => json(r, 200, []));
  await page.route("**/producers/me/kashrut-requests**", (r) => json(r, 200, opts.kashrutRequests ?? []));
  await page.route("**/producers/me/kashrut-request", (r: Route) => { rec(r); const a = opts.kashrutPostAnswer ?? { status: 201, body: { id: 9, status: "pending" } }; return json(r, a.status, a.body); });
  await page.route("**/upload/kashrut-cert", (r: Route) => { rec(r); const a = opts.uploadAnswer ?? { status: 200, body: { url: IMG } }; return json(r, a.status, a.body); });
  await page.route("**/producers/me/name-change-requests**", (r: Route) => {
    if (r.request().method() === "POST") { rec(r); const a = opts.namePostAnswer ?? { status: 201, body: { id: 3, status: "pending" } }; return json(r, a.status, a.body); }
    return json(r, 200, opts.nameRequests ?? []);
  });
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: BASE.name, slug: null, status: "approved", availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) =>
    json(r, 200, { profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
      average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  await page.route("**/producers/me", (r: Route) => {
    if (r.request().method() === "PUT") {
      rec(r);
      if (opts.putAnswer) return json(r, opts.putAnswer.status, opts.putAnswer.body);
      lastPut = { ...lastPut, ...(r.request().postDataJSON() as Record<string, unknown>) };
      return json(r, 200, { ...p, status: "approved", ...lastPut });
    }
    return json(r, 200, { ...p, status: "approved", ...lastPut });
  });
}

/** Deep-link anchor → the accordion that actually opens for it (drift D3). */
const CARD_OF: Record<string, string> = { license: "trust", kashrut: "trust", "business-name": "business-name" };
const card = (page: Page, anchor: string) => page.getByTestId(`accordion-${CARD_OF[anchor]}`);
/** The section the anchor names: the merged card's licence/kashrut sub-blocks carry their own ids. */
const body = (page: Page, anchor: string) => (CARD_OF[anchor] === anchor ? page.locator(`#${anchor} [role="region"]`) : page.locator(`#${anchor}`));
async function openAt(page: Page, anchor: string): Promise<void> {
  if (anchor === "business-name") {
    // `#business-name` does not resolve (drift D4): open the profile group and the card by hand.
    await page.goto("/producer/dashboard/edit?group=profile");
    await expect(page.getByTestId("group-profile"), "control: the profile group never rendered").toBeVisible({ timeout: 15_000 });
    await card(page, anchor).click();
    await expect(body(page, anchor), `control: the #${anchor} section never became visible`).toBeVisible();
    return;
  }
  await page.goto(`/producer/dashboard/edit#${anchor}`);
  await expect(card(page, anchor), `control: the card for #${anchor} never came on screen — every assertion here is void`).toBeVisible({ timeout: 15_000 });
  await expect(body(page, anchor), `control: the #${anchor} section never became visible`).toBeVisible();
}
/** Exact alternation — a bare `name: "שמירה"` is a substring match blind to the other labels (chunk 11d). */
const saveBtn = (page: Page, anchor: string) => body(page, anchor).getByRole("button", { name: /^(שמירה|בשמירה…|נשמר ✓)$/ });

// ── MT:MEH-1258 — the licence card ─────────────────────────────────────────

test.describe("licence card", () => {
  const field = (page: Page) => body(page, "license").getByLabel("מספר רישיון יצרן (משרד הבריאות)");
  const WARNING = "מספר רישיון יצרן הוא 7-10 ספרות";
  const HINT = "אחת הקטגוריות שבחרתם דורשת רישיון יצרן. מילוי המספר נדרש לאישור העסק.";

  // MT:MEH-1258:1 — a valid number saves, confirms, and re-seeds after a reload.
  test("a 7-10 digit number saves, confirms, and comes back after a reload", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "license");
    expect(PRODUCER_LICENSE_REGEX.test("1234567"), "control: the fixture number must satisfy the code's own regex").toBe(true);
    await field(page).fill("1234567");
    await expect(body(page, "license").getByText(WARNING)).toHaveCount(0);
    await saveBtn(page, "license").click();
    await expect.poll(() => writes.filter((w) => w.method === "PUT").length, { message: "the PUT never left the browser" }).toBe(1);
    expect(writes[0].body).toEqual({ producer_license_number: "1234567" });
    await expect(page.getByTestId("license-save-success")).toHaveText("מספר הרישיון נשמר");

    await page.reload();
    await openAt(page, "license");
    await expect(field(page)).toHaveValue("1234567");
    // The card header previews the masked number (page.js:568 — last four digits).
    await expect(card(page, "license")).toContainText("•••4567");
  });

  // MT:MEH-1258:2 — the format warning is advisory: it shows, and the save stays enabled.
  test("a short number shows the format warning without disabling the save", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "license");
    await field(page).fill("123");
    await expect(body(page, "license").getByText(WARNING)).toBeVisible();
    await expect(saveBtn(page, "license")).toBeEnabled();
  });

  // MT:MEH-1258:3 — the hint follows the category set, both ways.
  test("the required-licence hint appears only for a licence-requiring category", async ({ page }) => {
    expect(LICENSE_REQUIRED_CATEGORIES, "control: the code's list must not contain the plain fixture category").not.toContain(PLAIN_CAT);
    await stubEdit(page);
    await openAt(page, "license");
    await expect(body(page, "license").getByText(HINT)).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubEdit(page, { profile: { ...BASE, categories: [{ id: 3, name: REQUIRED_CAT }] } });
    await openAt(page, "license");
    await expect(body(page, "license").getByText(HINT)).toBeVisible();
  });

  // MT:MEH-1258:4 — a server 422 renders inline, not as a vanishing toast.
  test("a Hebrew 422 from the server renders inline in the card", async ({ page }) => {
    const DETAIL = "לא ניתן להסיר את מספר הרישיון כשקטגוריה בפרופיל דורשת אותו";
    await stubEdit(page, { profile: { ...BASE, producer_license_number: "1234567" }, putAnswer: { status: 422, body: { detail: DETAIL } } });
    await openAt(page, "license");
    await field(page).fill("");
    await saveBtn(page, "license").click();
    await expect(body(page, "license").getByRole("alert")).toHaveText(DETAIL);
    await expect(page.getByTestId("license-save-success")).toHaveCount(0);
  });

  // MT:MEH-1258:5 — the deep link opens this card.
  test("#license opens the merged «אישורים ותעודות» card at its licence section", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit#license");
    await expect(card(page, "license")).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
    await expect(card(page, "license")).toContainText("אישורים ותעודות");
    await expect(body(page, "license")).toBeVisible();
    await expect(page.locator("#kashrut"), "the kashrut section shares the same card").toBeVisible();
  });
});

// ── MT:MEH-1167 — the kashrut card ─────────────────────────────────────────

test.describe("kashrut card", () => {
  const select = (page: Page) => page.getByTestId("kashrut-badge-select");
  const submit = (page: Page) => body(page, "kashrut").getByRole("button", { name: "שליחת בקשה לאישור" });
  const SUCCESS = "הבקשה נשלחה — נעדכן אחרי הבדיקה";
  async function firstCode(page: Page): Promise<string> {
    const codes = await select(page).locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    expect(codes.length, "control: the select must carry at least one badge code").toBeGreaterThan(0);
    return codes[0];
  }

  // MT:MEH-1167:1 — drift D1: the form's three controls, submit disabled with nothing chosen.
  test("the card shows the intro, a type select, an upload control, and a disabled submit", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "kashrut");
    const b = body(page, "kashrut");
    await expect(b.getByText(/יש לעסק תעודת כשרות בתוקף\?/)).toBeVisible();
    await expect(select(page)).toHaveValue("");
    await expect(select(page).locator("option").first()).toHaveText("בחרו סוג כשרות");
    await expect(b.getByText("צילום התעודה (JPG/PNG, עד 5MB)")).toBeVisible();
    await expect(page.getByTestId("kashrut-cert-input")).toHaveAttribute("accept", "image/*");
    await expect(submit(page)).toBeDisabled();
    await expect(b.getByText("עוד אין תג כשרות לעסק. אפשר לבקש אחד כאן.")).toBeVisible();
  });

  // MT:MEH-1167:2 — a submit posts the code, keeps the success line up, and resets the form.
  test("submitting a request posts the badge code, shows the persistent success line, and resets the form", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "kashrut");
    const code = await firstCode(page);
    await select(page).selectOption(code);
    await expect(submit(page)).toBeEnabled();
    await submit(page).click();
    await expect.poll(() => writes.filter((w) => w.url.endsWith("/kashrut-request")).length, { message: "the POST never left the browser" }).toBe(1);
    expect(writes[0].body).toEqual({ badge_code: code, cert_url: null });
    const success = page.getByTestId("kashrut-submit-success");
    await expect(success).toHaveText(SUCCESS);
    await expect(success).toHaveAttribute("role", "status");
    await expect(select(page), "the form resets after a successful submit").toHaveValue("");
    // Persistence: still there after a bounded wait, not a toast that fades.
    const gone = await expect(success).toBeHidden({ timeout: 3_000 }).then(() => true).catch(() => false);
    expect(gone, "the success line must not fade on its own").toBe(false);
  });

  // MT:MEH-1167:3 — a 409 renders inline with the server's Hebrew.
  test("a duplicate request's 409 renders inline, and no success line appears", async ({ page }) => {
    const DETAIL = "בקשה לbadge זה כבר ממתינה לאישור";
    await stubEdit(page, { kashrutPostAnswer: { status: 409, body: { detail: DETAIL } } });
    await openAt(page, "kashrut");
    await select(page).selectOption(await firstCode(page));
    await submit(page).click();
    await expect(body(page, "kashrut").getByRole("alert")).toHaveText(DETAIL);
    await expect(page.getByTestId("kashrut-submit-success")).toHaveCount(0);
  });

  // MT:MEH-1167:4 — drift D1: the rejection is the server's; the client surfaces it inline.
  test("a rejected certificate upload surfaces the server's message inline", async ({ page }) => {
    const DETAIL = "רק תמונות JPG/PNG/WebP/GIF/HEIC מותרות";
    const writes: Rec[] = [];
    await stubEdit(page, { uploadAnswer: { status: 400, body: { detail: DETAIL } }, writes });
    await openAt(page, "kashrut");
    await page.getByTestId("kashrut-cert-input").setInputFiles({ name: "cert.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 not an image") });
    await expect.poll(() => writes.filter((w) => w.url.endsWith("/upload/kashrut-cert")).length, { message: "the upload never left the browser" }).toBe(1);
    await expect(body(page, "kashrut").getByRole("alert")).toHaveText(DETAIL);
  });

  // MT:MEH-1167:7 — a rejected request shows the chip and the admin's note.
  test("a rejected request shows «נדחתה» and the admin's note beside it", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "kashrut");
    const code = await firstCode(page);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubEdit(page, { kashrutRequests: [{ id: 5, badge_code: code, status: "rejected", notes: "התעודה לא קריאה — נא לצלם שוב" }] });
    await openAt(page, "kashrut");
    const list = page.getByTestId("kashrut-requests");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByText("נדחתה")).toBeVisible();
    await expect(list.getByText("התעודה לא קריאה — נא לצלם שוב")).toBeVisible();
    await expect(list.getByText("ממתינה לאישור")).toHaveCount(0);
  });
});

// ── MT:MEH-1872 — the business-name card (owner half) ──────────────────────

test.describe("business-name card", () => {
  const cardRoot = (page: Page) => page.getByTestId("name-change-card");
  const input = (page: Page) => page.getByTestId("name-change-input");
  const submit = (page: Page) => page.getByTestId("name-change-submit");

  // MT:MEH-1872b:1 — drift D5: the card is LAST in the profile group, not first.
  test("the card is the last in the profile group", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit?group=profile");
    const group = page.getByTestId("group-profile");
    await expect(group, "control: the profile group never rendered").toBeVisible({ timeout: 15_000 });
    const headers = group.locator('[data-testid^="accordion-"]');
    expect(await headers.count(), "control: the group must hold more than one card").toBeGreaterThan(1);
    await expect(headers.last()).toHaveAttribute("data-testid", "accordion-business-name");
    await expect(headers.first()).toHaveAttribute("data-testid", "accordion-images");
  });

  // The deep-link contract the mount comment asserts (page.js:955-963). KEY_TO_GROUP
  // (page.js:202-231) carries no `businessName`, so the resolver returns early and
  // the hub stays on screen. Correct behaviour asserted; expected to fail until fixed.
  test("#business-name opens the card through the profile group", async ({ page }) => {
    test.fail(true, "MEH-2262 — `businessName` is missing from KEY_TO_GROUP, so #business-name never resolves");
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit#business-name");
    await expect(card(page, "business-name")).toBeVisible({ timeout: 15_000 });
    await expect(card(page, "business-name")).toHaveAttribute("aria-expanded", "true");
  });

  // MT:MEH-1872b:2 · MT:MEH-1872:7 — empty state; the current name is text, never an input.
  test("the empty state shows the current name read-only, a requested-name field, and an optional reason", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "business-name");
    const current = page.getByTestId("name-change-current");
    await expect(current).toHaveText(BASE.name);
    expect(await current.evaluate((el) => el.tagName)).not.toBe("INPUT");
    await expect(cardRoot(page).locator(`input[value="${BASE.name}"]`), "the old direct name field must not be back").toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(page.getByTestId("name-change-reason")).toBeVisible();
    await expect(page.getByTestId("name-change-pending")).toHaveCount(0);
  });

  // MT:MEH-1872b:3 — disabled when empty and when unchanged, with the hint.
  test("submit is disabled when empty and when the requested name equals the current one", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "business-name");
    await expect(submit(page)).toBeDisabled();
    await input(page).fill(BASE.name);
    await expect(submit(page)).toBeDisabled();
    await expect(cardRoot(page).getByText("השם המבוקש זהה לשם הנוכחי.")).toBeVisible();
    await input(page).fill("מאפיית שקד ובנות");
    await expect(cardRoot(page).getByText("השם המבוקש זהה לשם הנוכחי.")).toHaveCount(0);
    await expect(submit(page)).toBeEnabled();
  });

  // MT:MEH-1872b:4 — the request goes out and the confirmation renders.
  test("submitting posts the requested name and shows the sent confirmation", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "business-name");
    await input(page).fill("מאפיית שקד ובנות");
    await submit(page).click();
    await expect.poll(() => writes.filter((w) => w.method === "POST").length, { message: "the POST never left the browser" }).toBe(1);
    expect(writes[0].body).toEqual({ requested_name: "מאפיית שקד ובנות", reason: null });
    await expect(page.getByTestId("name-change-sent")).toHaveText("הבקשה נשלחה. נעדכן אותך כשהשם החדש יאושר.");
  });

  // MT:MEH-1872b:6 — a pending request replaces the form.
  test("with a pending request the card shows the pending block and no form", async ({ page }) => {
    await stubEdit(page, { nameRequests: [{ id: 3, status: "pending", requested_name: "מאפיית שקד ובנות" }] });
    await openAt(page, "business-name");
    const pending = page.getByTestId("name-change-pending");
    await expect(pending).toContainText("בקשה לשינוי שם ממתינה לאישור");
    await expect(pending).toContainText("ביקשת לשנות את השם ל«מאפיית שקד ובנות»");
    await expect(page.getByTestId("name-change-form")).toHaveCount(0);
    await expect(page.getByTestId("name-change-current")).toHaveText(BASE.name);
  });

  // MT:MEH-1872b:7 — /en carries no Hebrew and no raw key.
  test("/en renders the card without Hebrew and without a raw key", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/en/producer/dashboard/edit?group=profile");
    await expect(page.getByTestId("group-profile")).toBeVisible({ timeout: 15_000 });
    await card(page, "business-name").click();
    await expect(cardRoot(page)).toBeVisible();
    const text = (await cardRoot(page).innerText()).replace(BASE.name, "");
    expect(text, "the card's own copy must not contain Hebrew on /en").not.toMatch(/[֐-׿]/);
    expect(text).not.toMatch(/name_change\.|\bdashboard\.producer\./);
    await expect(submit(page)).toBeVisible();
  });
});
