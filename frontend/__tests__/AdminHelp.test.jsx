import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminHelpPage from "@/app/[locale]/admin/help/page";

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
    // MEH-1022: icons for the 7 admin surfaces added to the help page.
    Megaphone: Stub,
    Package: Stub,
    Bread: Stub,
    Seal: Stub,
    Tag: Stub,
    ChatCircleSlash: Stub,
    ChartLineUp: Stub,
  };
});

// MEH-475 PR-B: help/page.jsx reads useTranslations("admin.help") and uses
// t.rich() for paragraphs with embedded <strong>/<code>/<em>/<placeholder>
// markup. Map only the keys this test asserts on; everything else falls
// through to the key path. Plain string lookups cover section titles + the
// page heading; t.rich is supported by tag-stripping the same string so
// .textContent substring assertions still match the Hebrew copy.
vi.mock("next-intl", () => {
  const flat = {
    "admin.help.title": "עזרה לאדמין",
    "admin.help.toc.dashboard": "סקירת לוח המחוונים",
    "admin.help.toc.producers": "אישור ודחיית בתי עסק",
    "admin.help.toc.users": "ניהול משתמשים",
    "admin.help.toc.reviews": "ביקורות",
    "admin.help.toc.reports": "דיווחים",
    "admin.help.toc.experiences": "חוויות",
    "admin.help.toc.outreach": "גיוס בתי עסק",
    "admin.help.toc.group_buys": "קבוצות רכש",
    "admin.help.toc.recipes": "מתכונים",
    "admin.help.toc.kashrut": "בקשות כשרות",
    "admin.help.toc.category_requests": "בקשות קטגוריה",
    "admin.help.toc.whatsapp_failures": "הודעות שלא נמסרו",
    "admin.help.toc.analytics": "אנליטיקס",
    "admin.help.toc.emergency": "תקלות חירום",
    "admin.help.toc.urls": "כתובות חשובות",
    "admin.help.sections.dashboard.title": "סקירת לוח המחוונים",
    "admin.help.sections.producers.title": "אישור ודחיית בתי עסק",
    "admin.help.sections.users.title": "ניהול משתמשים",
    "admin.help.sections.reviews.title": "ביקורות",
    "admin.help.sections.reports.title": "דיווחים",
    "admin.help.sections.experiences.title": "חוויות",
    "admin.help.sections.outreach.title": "גיוס בתי עסק",
    "admin.help.sections.group_buys.title": "קבוצות רכש",
    "admin.help.sections.recipes.title": "מתכונים",
    "admin.help.sections.kashrut.title": "בקשות כשרות",
    "admin.help.sections.category_requests.title": "בקשות קטגוריה",
    "admin.help.sections.whatsapp_failures.title": "הודעות שלא נמסרו",
    "admin.help.sections.analytics.title": "אנליטיקס",
    "admin.help.sections.emergency.title": "תקלות חירום",
    "admin.help.sections.urls.title": "כתובות חשובות",
    "admin.help.sections.emergency.site_down_title": "האתר לא עולה",
    "admin.help.sections.emergency.migration_title": "Migration נכשלה אחרי deploy",
    "admin.help.sections.emergency.login_broken_title": "Login שבור לכולם",
    "admin.help.sections.emergency.spam_title": "סופת ספאם / רישומים מזויפים",
    "admin.help.sections.emergency.ai_silent_title": "AI features מחזירים שגיאות silent",
    "admin.help.sections.urls.github_text": "GitHub",
  };
  return {
    useTranslations: (scope) => {
      const t = (key) => {
        const fullKey = scope ? `${scope}.${key}` : key;
        return flat[fullKey] ?? fullKey;
      };
      // t.rich(key, components) — for our test purposes, return the raw
      // string verbatim so .textContent substring assertions still match.
      // Real next-intl renders a React node; here we return a plain string
      // (which React renders as text, tags included). Test assertions on
      // emergency content use textContent.contains() which still matches.
      t.rich = (key) => {
        const fullKey = scope ? `${scope}.${key}` : key;
        return flat[fullKey] ?? fullKey;
      };
      return t;
    },
  };
});

describe("AdminHelp page", () => {
  it("renders the header + all 15 sections (heading + TOC link for each)", () => {
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
      // MEH-1022: the 7 admin surfaces added to the help page.
      "גיוס בתי עסק",
      "קבוצות רכש",
      "מתכונים",
      "בקשות כשרות",
      "בקשות קטגוריה",
      "הודעות שלא נמסרו",
      "אנליטיקס",
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
      "#outreach",
      "#group_buys",
      "#recipes",
      "#kashrut",
      "#category_requests",
      "#whatsapp_failures",
      "#analytics",
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
      "outreach",
      "group_buys",
      "recipes",
      "kashrut",
      "category_requests",
      "whatsapp_failures",
      "analytics",
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
