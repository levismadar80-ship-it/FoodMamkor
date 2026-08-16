/**
 * MEH-1843 — the verified-badge popover body is derived from what was actually
 * checked, instead of one absolute sentence for every verified business.
 *
 * The retired copy ("כל עסק במהמקור עובר אישור ידני ופועל ברישיון") was FALSE for
 * two of the three doc types: an `exemption` business operates lawfully with no
 * licence at all, and `cosmetics` fell through to the same claim. It also
 * contradicted /terms §5, which disclaims any guarantee about licences.
 *
 * WHY THIS FILE EXISTS RATHER THAN AN EXTENSION OF BadgeRow.test.jsx:
 * that file mocks next-intl with a naive `{param}` string replace, which does
 * NOT implement ICU. Every assertion below would pass under that mock whether
 * or not the ICU `select` actually works — a green with two causes. These
 * render under the REAL NextIntlClientProvider + the REAL he.json, so the
 * formatter under test is the one that ships.
 * Harness mirrors EditTabDescriptionCard.test.jsx.
 *
 * Discrimination: against the pre-fix code every case below rendered the single
 * retired sentence, so each doc-type assertion fails on it. The title/link
 * assertions pass in both worlds — they are the CONTROL for "we changed only
 * the body", and are labelled as such rather than counted as evidence.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import BadgeRow from "@/components/BadgeRow";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const RETIRED = "כל עסק במהמקור עובר אישור ידני ופועל ברישיון.";

/**
 * The hero surface is the one carrying the rich popover (BadgeRow.jsx).
 * ui/Popover mounts its content only once open, so the chip is clicked here —
 * without that every assertion below would fail on an empty DOM rather than on
 * the copy, which is exactly how the first run of this file failed.
 */
function renderHero(producer) {
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <BadgeRow producer={{ verification_tier: "verified", ...producer }} surface="hero" />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /מאומת/ }));
  return utils;
}

/** The popover renders inline; read its container by the locked testid. */
function body() {
  return screen.getByTestId("badge-tooltip-verified").textContent;
}

describe("MEH-1843 — popover body follows verification_doc_type", () => {
  it("license → names the licence check, with the date", () => {
    renderHero({ verification_doc_type: "license", verified_at: "2026-06-05" });
    expect(body()).toContain("אחרי בדיקת רישיון בתוקף");
    expect(body()).toContain("5.6.2026");
  });

  it("exemption → names the exemption documents, NOT a licence", () => {
    renderHero({ verification_doc_type: "exemption", verified_at: "2026-06-05" });
    expect(body()).toContain("מסמכי פטור מרישיון");
    // The whole point of the ticket: an exemption business must not be
    // described as operating under a licence.
    expect(body()).not.toContain("רישיון בתוקף");
  });

  it("cosmetics → names the cosmetics documents (closes the MEH-758 gap here)", () => {
    renderHero({ verification_doc_type: "cosmetics", verified_at: "2026-06-05" });
    expect(body()).toContain("בתחום התמרוקים");
  });

  it("null doc_type → defensive generic sentence, no licence claim", () => {
    renderHero({ verification_doc_type: null, verified_at: "2026-06-05" });
    expect(body()).toContain("אישרנו את העסק באופן ידני");
    expect(body()).not.toContain("רישיון");
    expect(body()).toContain("5.6.2026");
  });
});

describe("MEH-1843 — the date clause is dropped, not emptied", () => {
  // This is what the ICU select buys. A naive concatenation would leave a
  // dangling "נבדק ב-." here, and the mock in BadgeRow.test.jsx could not
  // tell the difference.
  it("verified_at null → sentence ends cleanly with no date and no stub", () => {
    renderHero({ verification_doc_type: "license", verified_at: null });
    const text = body();
    expect(text).toContain("אחרי בדיקת רישיון בתוקף.");
    expect(text).not.toContain("נבדק ב");
    expect(text).not.toMatch(/\{date\}|undefined|null/);
  });
});

describe("MEH-1843 — the absolute sentence is retired", () => {
  it.each(["license", "exemption", "cosmetics", null])(
    "doc_type %s never renders the retired copy",
    (docType) => {
      renderHero({ verification_doc_type: docType, verified_at: "2026-06-05" });
      expect(body()).not.toContain(RETIRED);
      expect(body()).not.toContain("ופועל ברישיון");
    },
  );
});

describe("MEH-1843 — CONTROL: everything except the body is untouched", () => {
  // Passes before AND after the change. Not evidence for the fix — it is the
  // guard that the fix stayed inside the body.
  it("title and link keys are unchanged", () => {
    renderHero({ verification_doc_type: "license", verified_at: "2026-06-05" });
    expect(screen.getByText("עסק מאומת")).toBeInTheDocument();
    const link = screen.getByText("איך אנחנו מאמתים?").closest("a");
    expect(link).toHaveAttribute("href", "/about/process");
  });
});
