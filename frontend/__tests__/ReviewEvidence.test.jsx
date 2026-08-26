import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReviewEvidence from "@/app/[locale]/admin/producers/ReviewEvidence";
import { instagramHandle, instagramUrl } from "@/lib/social-links";

/**
 * MEH-2174 — the «תיק בדיקה» links.
 *
 * Both assertions here were shown RED against the pre-fix component (which
 * passed the raw DB column straight to `href`), and the red is the point:
 *
 *   • instagram — measured pre-fix output: `href="someaccount"`, verbatim.
 *     (`toHaveAttribute` reads the raw attribute, so the relative value is
 *     what the failure prints; the browser is where it resolves — under
 *     /he/admin/producers — and 404s in a new tab.)
 *   • website — `javascript:alert(1)` rendered as a live <a href>. After the
 *     fix there is no anchor for it at all.
 *
 * The instagram case is deliberately asserted on the ABSOLUTE string rather
 * than on `toContain("instagram.com")`: a relative href containing the word
 * would satisfy the loose form, so the loose form is green in a world where
 * the bug is still present.
 *
 * Two cases here are CONTROLS and pass on both sides — the valid https website
 * and the google fallback. They exist so a guard that refused every href could
 * not pass the three above; they are not evidence of the fix.
 */

const base = {
  id: "p1",
  name: "מאפיית בדיקה",
  city: "תל אביב",
  images: [],
  kashrut_badges: [],
};

const linkTo = (text) => screen.queryByRole("link", { name: new RegExp(text) });

describe("ReviewEvidence — external hrefs (MEH-2174)", () => {
  it("renders a bare instagram handle as an absolute instagram.com URL", () => {
    // What _normalize_instagram (schemas.py:259) actually stores: no @, no
    // scheme, no host — just the handle.
    render(<ReviewEvidence producer={{ ...base, instagram: "someaccount" }} />);

    expect(linkTo("אינסטגרם")).toHaveAttribute(
      "href",
      "https://instagram.com/someaccount",
    );
  });

  it("still strips a legacy leading @ before composing the URL", () => {
    render(<ReviewEvidence producer={{ ...base, instagram: "@legacy" }} />);

    expect(linkTo("אינסטגרם")).toHaveAttribute(
      "href",
      "https://instagram.com/legacy",
    );
  });

  it("does not render a non-http(s) website as a link", () => {
    render(
      <ReviewEvidence
        producer={{ ...base, website: "javascript:alert(1)" }}
      />,
    );

    expect(linkTo("^אתר$")).toBeNull();
    // …and the section says so rather than rendering an empty row.
    expect(screen.getByText("אין אתר או אינסטגרם")).toBeInTheDocument();
  });

  it("renders an http(s) website unchanged", () => {
    render(
      <ReviewEvidence producer={{ ...base, website: "https://example.com" }} />,
    );

    expect(linkTo("^אתר$")).toHaveAttribute("href", "https://example.com");
  });

  it("keeps the google fallback link even when both channels are unusable", () => {
    render(<ReviewEvidence producer={{ ...base, website: "ftp://x.test" }} />);

    expect(linkTo("חיפוש בגוגל")).toBeInTheDocument();
  });
});

/**
 * The helper itself. MEH-2174 replaced THREE copies of this rule (the
 * outreach table's module-local one, ContactCard's inline channel entry and
 * contact-method's switch arm) with this module rather than adding a fourth,
 * so its contract is asserted once here.
 */
describe("social-links helper", () => {
  it("returns null when there is no handle to link to", () => {
    expect(instagramUrl("")).toBeNull();
    expect(instagramUrl("   ")).toBeNull();
    expect(instagramUrl(null)).toBeNull();
    expect(instagramUrl(undefined)).toBeNull();
    expect(instagramUrl("@")).toBeNull();
  });

  it("exposes the bare handle for surfaces that display it", () => {
    // The outreach table renders "@{handle}" next to the link, so it needs the
    // handle and not only the URL.
    expect(instagramHandle("@@double")).toBe("double");
    expect(instagramHandle("  spaced  ")).toBe("spaced");
    expect(instagramHandle(null)).toBe("");
  });
});
