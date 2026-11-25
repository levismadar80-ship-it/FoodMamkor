import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-3847: the «גלו» list reserves its full height from the first paint.
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
  // MEH-3059: Footer prefetches «כל בתי העסק» on intent via router.prefetch.
  useRouter: () => ({ prefetch: () => {} }),
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

// MEH-3847: «גלו» gets its data-gated links (חוויות, …) only after a count
// read answers, and each one pushed the footer down at 1280 (CLS on
// /recommend, MEH-3809 load guard). The list now reserves the height of all
// six rows from the first render. The read above never settles, so this is
// the first-paint state: the gated links are absent and the reserve is what
// keeps the column's height.
describe("Footer «גלו» height reserve (MEH-3847)", () => {
  it("reserves the full column height on «גלו» while the gated links are still unknown", () => {
    const { container } = render(<Footer />);
    const discover = container.querySelector("#footer-group-discover");
    expect(discover).not.toBeNull();
    expect(discover.className).toContain("md:min-h-[11.5rem]");
  });

  it("reserves nothing on the other groups, whose links never arrive late", () => {
    const { container } = render(<Footer />);
    const others = [...container.querySelectorAll("ul[id^='footer-group-']")].filter(
      (ul) => ul.id !== "footer-group-discover",
    );
    expect(others.length).toBeGreaterThan(0);
    for (const ul of others) expect(ul.className).not.toContain("min-h-");
  });
});
