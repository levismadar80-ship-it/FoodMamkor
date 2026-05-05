import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminHelpPage from "@/app/admin/help/page";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock Phosphor icons used by the page. Inline JSX inside factory
// because vi.mock is hoisted above any const declarations.
vi.mock("@phosphor-icons/react", () => {
  const Stub = (props) => <span data-testid="icon" {...props} />;
  return {
    Gauge: Stub,
    Storefront: Stub,
    Users: Stub,
    Star: Stub,
    Warning: Stub,
    Sparkle: Stub,
    Lifebuoy: Stub,
    LinkSimple: Stub,
    ArrowUpRight: Stub,
  };
});

describe("AdminHelp page", () => {
  it("renders the header + all 8 sections (heading + TOC link for each)", () => {
    render(<AdminHelpPage />);
    expect(screen.getByText("עזרה לאדמין")).toBeInTheDocument();
    // Each section heading is repeated as the TOC link text — assert
    // length 2 (one in TOC, one as section <h2>).
    for (const title of [
      "סקירת לוח המחוונים",
      "אישור ודחיית בתי עסק",
      "ניהול משתמשים",
      "ביקורות",
      "דיווחים",
      "חוויות",
      "תקלות חירום",
      "כתובות חשובות",
    ]) {
      expect(screen.getAllByText(title)).toHaveLength(2);
    }
  });

  it("TOC links point to the section anchors", () => {
    render(<AdminHelpPage />);
    const tocExpected = [
      "#dashboard",
      "#producers",
      "#users",
      "#reviews",
      "#reports",
      "#experiences",
      "#emergency",
      "#urls",
    ];
    const anchors = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && h.startsWith("#"));
    for (const expected of tocExpected) {
      expect(anchors).toContain(expected);
    }
  });

  it("section ids match the TOC anchors", () => {
    render(<AdminHelpPage />);
    const ids = [
      "dashboard",
      "producers",
      "users",
      "reviews",
      "reports",
      "experiences",
      "emergency",
      "urls",
    ];
    for (const id of ids) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
  });

  it("emergency section mentions key triage paths", () => {
    render(<AdminHelpPage />);
    const emergency = document.getElementById("emergency");
    expect(emergency).toBeInTheDocument();
    // Hit-test a few specific emergency bullet titles rather than the
    // full paragraphs — less brittle if copy is tweaked.
    expect(emergency.textContent).toContain("האתר לא עולה");
    expect(emergency.textContent).toContain("Migration נכשלה");
    expect(emergency.textContent).toContain("Login שבור");
    expect(emergency.textContent).toContain("ספאם");
  });

  it("URLs section points to the canonical site + GitHub externally", () => {
    render(<AdminHelpPage />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    // MEH-453: accept either canonical (.online today, .co.il post-Phase 2).
    expect(
      hrefs.some((h) => h && /^https:\/\/mehamakor\.(online|co\.il)$/.test(h)),
    ).toBe(true);
    expect(hrefs.some((h) => h?.includes("github.com"))).toBe(true);
  });

  it("does NOT leak placeholder values as real URLs", () => {
    render(<AdminHelpPage />);
    // Credentials-heavy rows are intentionally text placeholders,
    // not real anchors. Make sure we don't accidentally ship a
    // real Railway / Vercel / Anthropic URL here.
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") || "");
    expect(hrefs.some((h) => h.includes("railway.app"))).toBe(false);
    expect(hrefs.some((h) => h.includes("vercel.com"))).toBe(false);
    expect(hrefs.some((h) => h.includes("anthropic.com"))).toBe(false);
  });
});
