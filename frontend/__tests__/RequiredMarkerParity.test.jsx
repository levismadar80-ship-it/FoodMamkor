/**
 * Module:   RequiredMarkerParity
 * Purpose:  MEH-2015 chunk A — ONE asterisk mechanism, and every marker
 *           load-bearing at the render layer. Three guards:
 *           (1) no label-semantic i18n value carries a baked asterisk,
 *           (2) ui/Input renders exactly one marker when `required` and none
 *               otherwise, with aria-required on the input,
 *           (3) EventForm's category field — the "קטגוריה * *" bug — renders
 *               exactly ONE asterisk.
 * Does NOT: police required/optional VERDICTS (which field gates) — that is
 *           chunk B, gated on Sapir's sign-off over the audit table.
 * Related:  frontend/components/ui/Input.jsx (the mechanism);
 *           frontend/components/EventForm.jsx:452 (Field twin);
 *           docs/DESIGN.md § Required-field marking.
 * History:  MEH-2015 (creation).
 *
 * The i18n guard is a TREE WALK, not the DoD's literal
 * `grep '\*"' he.json | grep -E '(label|field_)'`. MEASURED on the pre-fix
 * he.json (590be5b6), not asserted: the walk finds 25 offenders; the literal
 * grep finds 21 — it silently misses the 4 whose LEAF key carries neither
 * token (`auth.register.consumer.fields.{name,email,password}` and
 * `admin.producers.form.fields.name`: a JSON line holds only the leaf key,
 * and "name"/"email"/"password" match nothing). A guard that under-reports
 * by exactly the keys most likely to regress is the two-causes green this
 * repo documents. After the fix both report 0 — which is why the walk, whose
 * 25→0 was demonstrated, is the one that gates.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import he from "../messages/he.json";
import en from "../messages/en.json";
import Input from "@/components/ui/Input";

// Keys whose values are form-surface labels. Placeholders are exempt by
// design (a placeholder is a string attribute — no JSX layer to carry the
// marker) and guide prose uses markdown ** which is not a marker.
const LABEL_KEY = /(^|[._])(label|fields?)([._]|$)|_label$/;

function starredLabelValues(tree, path = []) {
  const hits = [];
  for (const [k, v] of Object.entries(tree)) {
    const p = [...path, k];
    if (v && typeof v === "object") hits.push(...starredLabelValues(v, p));
    else if (
      typeof v === "string" &&
      v.trimEnd().endsWith("*") &&
      !v.trimEnd().endsWith("**") && // markdown bold in guide prose
      LABEL_KEY.test(p.join("."))
    )
      hits.push(`${p.join(".")} = ${JSON.stringify(v)}`);
  }
  return hits;
}

describe("MEH-2015 — the asterisk is a mechanism, not a string", () => {
  it("control: the walk finds a planted offender (a dead walk prints the reassuring 0)", () => {
    const planted = { a: { deep: { field_city_label: "עיר *" } } };
    expect(starredLabelValues(planted)).toHaveLength(1);
  });

  it("no label-semantic value in he.json ends with a baked asterisk", () => {
    expect(starredLabelValues(he)).toEqual([]);
  });

  it("no label-semantic value in en.json ends with a baked asterisk", () => {
    expect(starredLabelValues(en)).toEqual([]);
  });

  it("the deleted mechanism-3 key stays deleted in both locales", () => {
    expect(he.group_buys?.dashboard?.form?.required_marker).toBeUndefined();
    expect(en.group_buys?.dashboard?.form?.required_marker).toBeUndefined();
  });

  it("ui/Input with required renders exactly ONE asterisk and keeps the NATIVE attribute", () => {
    render(<Input id="rm-a" label="שם מלא" required onChange={() => {}} value="" />);
    const input = screen.getByLabelText(/שם מלא/);
    // The native attribute MUST survive — before MEH-2015 it reached the
    // input via ...rest, and ContactClient + the group-buys form have no JS
    // required-validation: the browser gate IS their empty-field gate. An
    // earlier shape of this change intercepted the attribute and that was a
    // measured regression; this assertion is what keeps it from returning.
    expect(input).toHaveAttribute("required");
    const label = document.querySelector('label[for="rm-a"]');
    expect((label.textContent.match(/\*/g) || []).length).toBe(1);
  });

  it("ui/Input without required renders NO asterisk and no required attribute", () => {
    render(<Input id="rm-b" label="כתובת" onChange={() => {}} value="" />);
    expect(screen.getByLabelText("כתובת")).not.toHaveAttribute("required");
    const label = document.querySelector('label[for="rm-b"]');
    expect(label.textContent).not.toContain("*");
  });
});

describe("MEH-2015 — no label prop smuggles a literal asterisk (the RecipeForm regression)", () => {
  // The adversarial review caught RecipeForm passing
  //   label={<>{t("title_label")} <span>*</span></>}
  // to Input WITH required — reproducing the double-asterisk bug through the
  // new mechanism itself. The unit test above cannot see it (its corpus is a
  // plain-string label), so this scans the source for the shape directly.
  const SRC_DIRS = ["components", "app"];
  // Scan stays INSIDE the fragment (the (?!<\/>) guard stops at </>) so an
  // asterisk later in the file cannot false-positive. First draft used
  // [^}]* and the planted control caught it: the `}` inside {t("...")}
  // ended the match before the asterisk was ever reached.
  const LITERAL_MARKER_IN_LABEL = /label=\{<>(?:(?!<\/>)[\s\S]){0,200}\*/;

  it("control: the scan matches the exact line that shipped the regression", () => {
    const shipped = 'label={<>{t("title_label")} <span className="text-red-500">*</span></>}';
    expect(LITERAL_MARKER_IN_LABEL.test(shipped)).toBe(true);
  });

  it("no JSX label prop under frontend/ carries a literal asterisk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(jsx?|tsx?)$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (LITERAL_MARKER_IN_LABEL.test(src)) hits.push(p);
        }
      }
    };
    for (const d of SRC_DIRS) walk(path.resolve(__dirname, "..", d));
    expect(hits).toEqual([]);
  });

  // Third shape, caught by the CI reviewer on this PR AFTER the scan above
  // shipped: a bare text-node asterisk directly inside a <label> ELEMENT
  // (settings page.jsx `pw-new`: `<label …>{tReset("password_aria")} *</label>`).
  // That is outside the label-PROP corpus above — screen readers announce
  // "star", the exact thing the invariant bans. [^<]* keeps the match inside
  // the label's own text node; the fixed form (`{" "}<span aria-hidden>`)
  // cannot match because `<span` interposes before the asterisk.
  const LITERAL_MARKER_IN_LABEL_ELEMENT = /<label\b[^>]*>[^<]*\}\s*\*/;

  it("control: the element scan matches the exact pw-new line the reviewer caught", () => {
    const shipped =
      '<label htmlFor="pw-new" className="block text-sm font-medium mb-1">{tReset("password_aria")} *</label>';
    expect(LITERAL_MARKER_IN_LABEL_ELEMENT.test(shipped)).toBe(true);
  });

  it("no <label> element under frontend/ carries a bare text-node asterisk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(jsx?|tsx?)$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (LITERAL_MARKER_IN_LABEL_ELEMENT.test(src)) hits.push(p);
        }
      }
    };
    for (const d of SRC_DIRS) walk(path.resolve(__dirname, "..", d));
    expect(hits).toEqual([]);
  });
});

describe("MEH-2015 — the קטגוריה * * bug stays dead", () => {
  it("EventForm's category label renders exactly one asterisk", async () => {
    // doUnmock rides a try/finally (CI reviewer catch): an assertion throw
    // must not leave the mock active for later files in the same worker.
    try {
    vi.doMock("next-intl", () => ({
      // Return the real he.json value for the event-form namespace so this
      // exercises the actual string the screen shows, not a synthetic key.
      useTranslations: () => (k) => {
        const leaf = he.sweep_tail.event_new[k];
        return typeof leaf === "string" ? leaf : k;
      },
      useLocale: () => "he",
    }));
    const { default: EventForm } = await import("@/components/EventForm");
    const { render: r } = await import("@testing-library/react");
    r(<EventForm mode="create" onSubmit={() => {}} categories={[]} />);
    const label = document.querySelector('label[for="category"]');
    expect(label, "category label must exist").not.toBeNull();
    expect(
      (label.textContent.match(/\*/g) || []).length,
      `category label reads: ${JSON.stringify(label.textContent)}`,
    ).toBe(1);
    } finally {
      vi.doUnmock("next-intl");
    }
  });
});
