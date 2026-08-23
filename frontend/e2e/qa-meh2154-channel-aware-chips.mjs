/**
 * MEH-2154 self-QA — the question chips follow the declared channel.
 *
 * Drives the REAL producer page (local `next start` → local FastAPI → local
 * Postgres, three seeded fixtures) at 375 and 1440, and writes a screenshot per
 * fixture per viewport into qa-artifacts/MEH-2154/.
 *
 * WHY THIS HARNESS HAS A CONTROL, AND WHY THE CONTROL RUNS FIRST
 * ─────────────────────────────────────────────────────────────
 * The finding this ticket wants evidence for is a NEGATIVE: "zero wa.me links
 * for a non-WhatsApp-primary business". A probe that cannot see hrefs at all —
 * wrong selector, block never rendered, page showed an error boundary — reports
 * exactly that same zero. Nothing in the output distinguishes the two.
 *
 * So the whatsapp-primary fixture is the control: it MUST report a non-zero
 * wa.me count and a non-empty chips block. If it does not, the run aborts and
 * every zero it would have printed afterwards is declared void, rather than
 * being read as a pass. (Precedent, the hard way: a 21/08 harness reported four
 * PASS lines against 0x0 boxes on a hidden desktop pane.)
 *
 * The block is located by the testids the component owns, never by a Tailwind
 * class chain — and the located block is required to be non-empty before any
 * assertion about its contents is trusted.
 *
 * NOT a Playwright spec and not run by CI: `playwright.config.ts:35` matches
 * only `e2e/flows/**\/*.spec.ts` and `e2e/visual/**\/*.spec.ts`, and this is an
 * `.mjs` one-off in the shape of the other `qa-meh*.mjs` probes. It is
 * committed so the evidence in the MEH-2154 PR is reproducible rather than
 * asserted.
 *
 * USAGE — three fixtures, one per channel under test, seeded into a local DB:
 *
 *   createdb mehamakor_qa
 *   # schema:  Base.metadata.create_all(bind=engine) against DATABASE_URL
 *   # seed:    one approved producer per primary_contact_method
 *   #          (whatsapp / email / external_order) with slugs qa-wa / qa-mail /
 *   #          qa-form, EVERY backing field populated and a phone on all three
 *   #          — so a hidden WhatsApp row can only be the channel gate.
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:5432/mehamakor_qa \
 *     JWT_SECRET_KEY=dev uvicorn app.main:app --port 8000     # from backend/
 *   BACKEND_URL=http://127.0.0.1:8000 npx next start -p 3000  # from frontend/
 *   node e2e/qa-meh2154-channel-aware-chips.mjs               # from frontend/
 *
 * The sandbox has no Playwright browser download, so the launch is pinned to
 * the pre-installed binary at /opt/pw-browsers/chromium.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const OUT = "../qa-artifacts/MEH-2154";

const VIEWPORTS = [
  { name: "375", width: 375, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];

const FIXTURES = [
  {
    slug: "qa-wa",
    method: "whatsapp",
    isControl: true,
    expect: { waLinks: "> 0", recipe: true },
  },
  {
    slug: "qa-mail",
    method: "email",
    expect: { waLinks: 0, recipe: false, escalationStartsWith: "mailto:hi@shikma.example.com" },
  },
  {
    slug: "qa-form",
    method: "external_order",
    expect: { waLinks: 0, recipe: false, escalationStartsWith: "https://order.shikma.example.com" },
  },
];

/** Read every question-chips block on the page, located by its own testids. */
function readBlocks() {
  const OWNED = [
    "[data-testid='escalation-link']",
    "[data-testid='question-link']",
    "[data-testid='quick-answer-toggle']",
    "[data-testid='recipe-idea-link']",
  ].join(",");
  const blocks = [...document.querySelectorAll("div")].filter(
    (d) => d.querySelector(OWNED) && !d.querySelector("div:has([data-testid='escalation-link'])"),
  );
  // Fall back to any ancestor carrying an owned testid — the :has() filter above
  // narrows to the innermost wrapper, and older engines may not support it.
  const scopes = blocks.length
    ? blocks
    : [...document.querySelectorAll(OWNED)].map((el) => el.closest("div"));
  const seen = new Set();
  const out = [];
  for (const scope of scopes) {
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    const anchors = [...scope.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    out.push({
      anchors,
      escalation:
        scope.querySelector("[data-testid='escalation-link']")?.getAttribute("href") ?? null,
      recipe: !!scope.querySelector("[data-testid='recipe-idea-link']"),
      questionLinks: scope.querySelectorAll("[data-testid='question-link']").length,
      toggles: scope.querySelectorAll("[data-testid='quick-answer-toggle']").length,
    });
  }
  return out;
}

const isWa = (href) => href.includes("wa.me") || href.includes("web.whatsapp.com");

const failures = [];
const ran = [];

function check(label, ok, detail) {
  ran.push(label);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
mkdirSync(OUT, { recursive: true });

let controlOk = false;

for (const vp of VIEWPORTS) {
  for (const fx of FIXTURES) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const label = `${fx.slug}@${vp.name}`;
    // `/producer/[id]` resolves by ID, not slug (useProducerData.js:56 →
    // `/producers/${params.id}`), so resolve the seeded slug through the API
    // the app itself proxies. A slug in the path renders the "we couldn't find
    // this business" page — which has no chips block, i.e. it would have
    // produced the reassuring zero this harness exists to distrust.
    const id = await page.evaluate(
      async (slug) => (await (await fetch(`/api/producers/by-slug/${slug}`)).json()).id,
      fx.slug,
    ).catch(() => null);
    if (!id) {
      check(`${label} — fixture resolved`, false, "by-slug lookup returned no id");
      await page.close();
      continue;
    }
    await page.goto(`${BASE}/producer/${id}`, { waitUntil: "domcontentloaded" });
    // Gate on the component's own output, never on the network going quiet
    // (MEH-215 bans networkidle in specs; the same reasoning applies here).
    await page
      .waitForSelector("[data-testid='quick-answer-toggle'],[data-testid='escalation-link']", {
        timeout: 20_000,
      })
      .catch(() => {});

    const blocks = await page.evaluate(readBlocks);

    // The cookie banner (z-1100) sits over exactly the strip the chips render
    // in, so the first pass produced screenshots in which the escalation row —
    // the thing this ticket changed — was hidden behind it. Dismissing it is
    // not cosmetic: an artifact that does not show the subject is not evidence.
    await page
      .getByRole("button", { name: /קבלו הכל|קבל הכל/ })
      .first()
      .click({ timeout: 3_000 })
      .catch(() => {});
    // The page mounts the contact card TWICE — an inline copy (`lg:hidden`) and
    // the desktop sidebar — so `.first()` picks the hidden one at 1440 and the
    // element screenshot silently fails. Take the visible one. (Same family as
    // the 21/08 harness that photographed a hidden desktop pane and reported
    // PASS against 0x0 boxes.)
    const card = page.locator("[data-testid='contact-card']:visible").first();
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${OUT}/${fx.slug}-${vp.name}.png`, fullPage: true });
    // A tight shot of the contact card as well: the full-page image is ~3600px
    // tall, and the chips are ~200px of it.
    await card
      .screenshot({ path: `${OUT}/${fx.slug}-${vp.name}-card.png` })
      .catch(() => {});

    console.log(`\n[${label}] blocks=${blocks.length}`);
    if (blocks.length === 0) {
      check(`${label} — chips block located`, false, "no block found; every count below is void");
      await page.close();
      continue;
    }
    check(`${label} — chips block located`, true, `${blocks.length} block(s)`);

    const anchors = blocks.flatMap((b) => b.anchors);
    const waCount = anchors.filter(isWa).length;
    const escalations = [...new Set(blocks.map((b) => b.escalation).filter(Boolean))];
    const recipe = blocks.some((b) => b.recipe);
    const questionLinks = Math.max(...blocks.map((b) => b.questionLinks));

    if (fx.isControl) {
      // THE CONTROL. Not "a whatsapp case that also passes" — the run is void
      // without it, so it is asserted as such and gates everything after.
      const ok = waCount > 0 && anchors.length > 0;
      check(
        `CONTROL ${label} — the probe can see WhatsApp hrefs`,
        ok,
        `${waCount} wa link(s) of ${anchors.length} anchor(s)`,
      );
      check(`${label} — recipe chip present`, recipe);
      check(`${label} — stock/custom chips present`, questionLinks > 0, `${questionLinks}`);
      check(
        `${label} — escalation is a WhatsApp deep-link`,
        escalations.length > 0 && escalations.every(isWa),
        escalations.join(" | "),
      );
      if (ok) controlOk = true;
    } else {
      check(
        `${label} — zero WhatsApp links in the block`,
        waCount === 0,
        `${waCount} of ${anchors.length} anchor(s)`,
      );
      check(`${label} — recipe chip hidden`, recipe === false);
      check(`${label} — stock/custom chips hidden`, questionLinks === 0, `${questionLinks}`);
      check(
        `${label} — escalation points at the primary channel`,
        escalations.length === 1 && escalations[0].startsWith(fx.expect.escalationStartsWith),
        escalations.join(" | "),
      );
    }
    await page.close();
  }
}

await browser.close();

console.log(`\n${ran.length} assertion(s) ran, ${failures.length} failed.`);
if (!controlOk) {
  console.log(
    "\n⛔ CONTROL DID NOT PASS. The probe never proved it can see a WhatsApp href, " +
      "so every 'zero WhatsApp links' line above is void — do NOT quote them as evidence.",
  );
  process.exit(2);
}
if (failures.length) {
  console.log(`\nFAILED: ${failures.join(" · ")}`);
  process.exit(1);
}
console.log("\nAll assertions passed, control included.");
