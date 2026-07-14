import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     manual/content-pages
 * Purpose:  Converted from docs/MANUAL_TESTING.md §§ "MEH-534 /about/process",
 *           "MEH-995 /join", "MEH-1160 /share" (MEH-1171 conversion stage).
 *           These editorial/static pages had zero e2e coverage; the checklist
 *           rows are load + key-content + CTA-route + footer-link assertions.
 * Touches:  static SSG routes only — no API writes. Clipboard is granted for
 *           the /share copy test.
 * Does NOT: assert pixel layout / Cormorant digit clipping (visual/VRT
 *           territory) or the native share-sheet (OS-level, DEVICE-ONLY).
 * History:  MEH-1171 (creation).
 */

const initConsent = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));

test.describe("/about/process — MEH-534 (MEH-1171 § content pages)", () => {
  // item 1 — route renders (SSG) with the per-locale tab title
  test("renders with the תהליך הקבלה tab title", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    await expect(page).toHaveTitle(/תהליך הקבלה/);
  });

  // item 2 — hero H1 carries the gold-italic "היכרות אישית"
  test("hero H1 carries היכרות אישית", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("היכרות אישית");
  });

  // item 4 — the "מה נבדק אצל כל בית עסק" section shows the 3 cards
  test("what's-checked section lists זהות · סיפור · שיחה", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    await expect(page.getByRole("heading", { name: "מה נבדק אצל כל בית עסק" })).toBeVisible();
    for (const card of ["זהות", "סיפור", "שיחה"]) {
      await expect(page.getByRole("heading", { name: card, exact: true })).toBeVisible();
    }
  });

  // item 9 — CTA "ספרו לנו על העסק" links to /register/producer
  test("CTA links to /register/producer", async ({ page }) => {
    await initConsent(page);
    await page.goto("/about/process");
    const cta = page.getByRole("link", { name: "ספרו לנו על העסק" });
    await expect(cta).toHaveAttribute("href", /\/register\/producer$/);
  });
});

test.describe("/join — MEH-995 (MEH-1171 § content pages)", () => {
  // item 1 — hero renders with the locked headline + single מצטרפים CTA
  test("renders the hero headline and a single join CTA to the wizard", async ({ page }) => {
    await initConsent(page);
    await page.goto("/join");
    await expect(page.getByRole("heading", { name: "העסק שלכם. עמוד משלו." })).toBeVisible();
    // item 6 — the CTA lands on the producer wizard
    const cta = page.getByRole("link", { name: "מצטרפים", exact: true });
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveAttribute("href", /\/register\/producer$/);
  });

  // item 2 — the 4 "how it works" steps + the link to the full process
  test("shows the 4 how-it-works steps and links to the acceptance process", async ({ page }) => {
    await initConsent(page);
    await page.goto("/join");
    for (const title of ["נרשמים", "שיחה אישית", "העמוד עולה", "לקוחות פונים ישירות"]) {
      await expect(page.getByText(title, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    }
    await expect(page.getByRole("link", { name: "לתהליך הקבלה המלא" })).toHaveAttribute(
      "href",
      /\/about\/process$/,
    );
  });

  // item 3 — the FAQ teaser ("כמה זה עולה?" + the free/no-fees answer) links to
  // the businesses FAQ; the no-fees line is a BRAND lock
  test("FAQ teaser shows the cost question + free answer and links to the businesses FAQ", async ({ page }) => {
    await initConsent(page);
    await page.goto("/join");
    // the page renders responsive twins of each section — scope to the visible one
    const faq = page.getByTestId("join-faq").locator("visible=true").first();
    await expect(faq.getByText("כמה זה עולה?")).toBeVisible();
    await expect(faq.getByText("חינם להצטרף ולהופיע. אין עמלות על עסקאות — לעולם.")).toBeVisible();
    await expect(faq.getByRole("link", { name: "לכל השאלות" })).toHaveAttribute(
      "href",
      /\/about\/for-businesses$/,
    );
  });

  // item 8 — the testimonial slot is a SELF-EXPLAINING placeholder ("בקרוב —
  // עדות ראשונה" + a "here a real testimonial will appear" line), never a fake
  // testimonial presented as genuine
  test("the testimonial slot is a labeled placeholder, not a fake testimonial", async ({ page }) => {
    await initConsent(page);
    await page.goto("/join");
    const slot = page.getByTestId("join-testimonial").locator("visible=true").first();
    await expect(slot.getByText("בקרוב — עדות ראשונה")).toBeVisible();
    await expect(
      slot.getByText("כאן תופיע עדות אמיתית של בעלת עסק — מילה במילה, באישורה."),
    ).toBeVisible();
  });
});

test.describe("/share — MEH-1160 (MEH-1171 § content pages)", () => {
  // item 1 — page loads with the 4 share actions
  test("renders ספרו עלינו with all four share actions", async ({ page }) => {
    await initConsent(page);
    await page.goto("/share");
    await expect(page.getByRole("heading", { name: "ספרו עלינו" }).locator("visible=true")).toBeVisible();
    // the page renders responsive desktop+mobile action rows — scope to visible
    for (const id of ["share-whatsapp", "share-copy", "share-native", "share-email"]) {
      await expect(page.getByTestId(id).locator("visible=true")).toBeVisible();
    }
  });

  // item 2 — WhatsApp action is a wa.me link with a prefilled message
  test("the WhatsApp action is a wa.me link with a prefilled message", async ({ page }) => {
    await initConsent(page);
    await page.goto("/share");
    const wa = page.getByTestId("share-whatsapp").locator("visible=true").first();
    const href = await wa.getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(href || "")).toContain("מהמקור");
  });

  // item 5 — email action is a mailto with the subject "מכירים את מהמקור?"
  test("the email action is a mailto with the expected subject", async ({ page }) => {
    await initConsent(page);
    await page.goto("/share");
    const href = await page.getByTestId("share-email").locator("visible=true").first().getAttribute("href");
    expect(href).toMatch(/^mailto:\?subject=/);
    expect(decodeURIComponent(href || "")).toContain("מכירים את מהמקור?");
  });

  // item 3 — copy-link shows the "הקישור הועתק" toast
  test("copy link shows the copied toast", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await initConsent(page);
    await page.goto("/share");
    await page.getByTestId("share-copy").locator("visible=true").first().click();
    await expect(page.getByText("הקישור הועתק").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("footer cross-links (MEH-534/995/1160 footer rows)", () => {
  // MEH-534 item 10, MEH-995 item 7, MEH-1160 item 6 — the footer surfaces
  // links to all three pages (asserted once, on the homepage footer)
  test("the footer links to /about/process, /join and /share", async ({ page }) => {
    await initConsent(page);
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "תהליך הקבלה" })).toHaveAttribute(
      "href",
      /\/about\/process$/,
    );
    await expect(footer.getByRole("link", { name: "הוסיפו את העסק שלכם" })).toHaveAttribute(
      "href",
      /\/join$/,
    );
    await expect(footer.getByRole("link", { name: "ספרו עלינו" })).toHaveAttribute("href", /\/share$/);
  });
});
