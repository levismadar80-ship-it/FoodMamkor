import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1177 (ADR-024): the footer nav split into two audience groups —
// "גלו" (readers) and "לבתי עסק" (producers) — each with a real <h3> heading.
// Return each translation key verbatim so we can assert on the group-heading
// keys and locate links by href.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props) => <img alt={props.alt ?? ""} {...props} />,
}));

// MEH-1981: the footer newsletter now carries a CollectionNotice whose /privacy
// link is the locale-aware Link from @/i18n/navigation, which needs an intl
// context the key-echo next-intl mock above does not provide. Same stub the
// CategoryRequestModal / EventForm suites use — the link's behaviour is
// CollectionNotice.test.jsx's job; this file is about the nav groups.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  InstagramLogo: () => <span data-testid="ig" />,
  FacebookLogo: () => <span />, // MEH-2311
  TiktokLogo: () => <span />,
  YoutubeLogo: () => <span />,
  CaretDown: () => <span />,
  ArrowRight: () => <span data-testid="arrow" />,
}));

vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span /> }));
// MEH-1918: the footer now asks GET /experiences/count to decide whether the
// data-gated "חוויות" link appears. A promise that never settles keeps the gate
// in its fail-closed state for this spec, so the link counts below stay about
// the MEH-1177 split and not about experience supply. The gate's own behaviour
// is asserted in ExperiencesNavGate.test.jsx.
// MEH-2554: Footer reads the signed-in user (the guest-only login link).
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));

import Footer from "@/components/Footer";
import { SEEDS_DARK } from "@/lib/brand-seeds";

/**
 * MEH-2833 PR 7 (seed layer, board 6) — above the © line the footer shows the
 * five seeds in the on-dark set, in logo order, then a hairline filling the
 * rest; decoration only (aria-hidden). It replaces the plain top border.
 */
describe("Footer seed row (MEH-2833)", () => {
  it("five 10×15 seeds, on-dark set in logo order, then a hairline; aria-hidden", () => {
    const { container } = render(<Footer />);
    const row = container.querySelector('[data-testid="footer-seed-row"]');
    expect(row).not.toBeNull();
    expect(row.getAttribute("aria-hidden")).toBe("true");
    const seeds = [...row.querySelectorAll("svg")];
    expect(seeds.map((s) => s.getAttribute("data-seed-color"))).toEqual(SEEDS_DARK.map((s) => s.fill));
    for (const s of seeds) expect([s.getAttribute("width"), s.getAttribute("height")]).toEqual(["10", "15"]);
    const line = row.lastElementChild;
    expect(line.tagName).toBe("SPAN");
    expect(line.className).toContain("flex-1");
    expect(line.className).toContain("bg-background/25");
  });

  it("sits directly above the © bar, which no longer draws its own top border", () => {
    const { container } = render(<Footer />);
    const row = container.querySelector('[data-testid="footer-seed-row"]');
    const bar = row.nextElementSibling;
    expect(bar.textContent).toContain("©");
    expect(bar.getAttribute("style") || "").not.toMatch(/border-top/);
  });
});
