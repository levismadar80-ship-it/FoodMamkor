/**
 * MEH-2033 — the four remaining file inputs leave display:none for sr-only,
 * so the control is reachable by keyboard (WCAG 2.1.1, Level A), closing the
 * sweep MEH-2031 started (EventForm shipped in #2824; ExperienceForm under
 * MEH-2012).
 *
 * Three legs:
 *   1. render: RecipeForm — input class contract + the upload preview's alt
 *      (the preview appearing IS the success state; alt="" announced nothing).
 *   2. render: ImagesCard (dashboard gallery) — dropzone input class contract
 *      + thumb alt.
 *   3. source scan over the three fixed files: every type="file" input rides
 *      sr-only, zero className="hidden" file inputs remain. Scanner validated
 *      against a planted old-shape fixture AND a real known-good repo file
 *      (EventForm) per the MEH-1909 rule — synthetic-only self-tests pass on
 *      shapes the repo never uses.
 *
 * 🔴 HONEST LIMIT (same as EventFormImageAccessibility, stated not glossed):
 * jsdom loads no Tailwind, so `hidden` and `sr-only` compute identically here.
 * The render legs assert the CLASS CONTRACT — enough to discriminate on this
 * change — not rendered behaviour. The behavioural probe (computed display +
 * .focus() landing) lives in e2e/qa-meh2033-file-inputs.mjs against a real
 * browser.
 *
 * REUSES: __tests__/EventFormImageAccessibility.test.jsx (harness + cases).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import fs from "node:fs";
import path from "node:path";
import he from "../messages/he.json";
import RecipeForm from "@/components/RecipeForm";
import { ImagesCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn() },
}));
// REUSES: __tests__/EditTabDescriptionCard.test.jsx harness — cards.jsx pulls
// @/i18n/navigation, whose next/navigation import does not resolve in jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function withIntl(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const fileInput = () => document.querySelector('input[type="file"]');

describe("RecipeForm upload control (MEH-2033)", () => {
  it("the file input is sr-only (in the tab order), not hidden, inside a focus-ring label", () => {
    withIntl(<RecipeForm />);
    const input = fileInput();
    expect(input).not.toBeNull();
    expect(input.className).toContain("sr-only");
    expect(input.className).not.toContain("hidden");
    expect(input.closest("label").className).toContain("focus-within:ring-2");
  });

  it("the uploaded preview carries the field label as alt, not silence", () => {
    withIntl(
      <RecipeForm mode="edit" initial={{ image_url: "https://res.cloudinary.com/x/r.jpg" }} />,
    );
    const preview = document.querySelector('img[src="https://res.cloudinary.com/x/r.jpg"]');
    expect(preview).not.toBeNull();
    expect(preview.getAttribute("alt")).toBe(he.recipes.form.image_label);
  });
});

describe("dashboard ImagesCard gallery (MEH-2033)", () => {
  it("the dropzone input is sr-only inside a focus-ring label; thumbs are announced", () => {
    withIntl(<ImagesCard profile={{ id: 1, images: ["https://res.cloudinary.com/x/a.jpg"] }} onSave={() => {}} />);
    const input = fileInput();
    expect(input).not.toBeNull();
    expect(input.className).toContain("sr-only");
    expect(input.className).not.toContain("hidden");
    expect(input.closest("label").className).toContain("focus-within:ring-2");

    const thumb = document.querySelector('img[src*="a.jpg"]');
    expect(thumb).not.toBeNull();
    // Heading + 1-based index — N thumbs announce distinctly (CI reviewer).
    expect(thumb.getAttribute("alt")).toBe(`${he.dashboard.producer.images.heading} 1`);
  });
});

// ---------------------------------------------------------------------------
// Leg 3 — source contract over the three fixed files. Catches ProductsSection
// (whose UploadZone is not exported) and any regression that re-introduces a
// hidden file input in these files.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "..");
const FIXED_FILES = [
  "components/ProductsSection.jsx",
  "components/RecipeForm.jsx",
  "app/[locale]/producer/dashboard/edit/cards.jsx",
];

/** Return the {srOnly, hidden} counts of type="file" input tags in a source. */
function scanFileInputs(source) {
  // Each <input ...> opening tag containing type="file". THESE inputs'
  // attributes never contain '>' (plain strings + reference callbacks — no
  // inline arrows with comparisons), so a lazy match to the closing bracket
  // bounds the tag; an attribute carrying '>' would silently truncate the
  // match (CI reviewer wording fix — the guarantee is per-site, not JSX-wide).
  const tags = source.match(/<input\b[^>]*type="file"[^>]*>/gs) ?? [];
  // Word-boundary regexes, not literal `className="sr-only"` substrings — the
  // closing-quote form would score a future `className="sr-only focus:…"` as
  // srOnly:0 and red the guard on compliant code (CI reviewer catch).
  return {
    total: tags.length,
    srOnly: tags.filter((tag) => /className="sr-only[\s"]/.test(tag)).length,
    hidden: tags.filter((tag) => /className="hidden[\s"]/.test(tag)).length,
  };
}

describe("source contract — no hidden file inputs remain (MEH-2033)", () => {
  it("scanner self-test: red on the old shape, green on a real known-good file (MEH-1909)", () => {
    // Synthetic old shape — the exact pre-fix idiom:
    const oldShape = '<label><input\n  type="file"\n  accept="image/*"\n  className="hidden"\n/></label>';
    expect(scanFileInputs(oldShape)).toEqual({ total: 1, srOnly: 0, hidden: 1 });
    // Real repo file with the known-good shape (EventForm, fixed in #2824) —
    // anchors the scanner to the shape the repo actually uses:
    const eventForm = fs.readFileSync(path.join(ROOT, "components/EventForm.jsx"), "utf8");
    const ev = scanFileInputs(eventForm);
    expect(ev.total).toBeGreaterThan(0);
    expect(ev.hidden).toBe(0);
    expect(ev.srOnly).toBe(ev.total);
  });

  it.each(FIXED_FILES)("%s: every file input is sr-only, none hidden", (rel) => {
    const scan = scanFileInputs(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    expect(scan.total).toBeGreaterThan(0);
    expect(scan.hidden).toBe(0);
    expect(scan.srOnly).toBe(scan.total);
  });
});
