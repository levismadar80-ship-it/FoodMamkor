import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

// MEH-3059: «כל בתי העסק» (/producers) renders per request, so with
// prefetch={false} a tap painted the site-wide brand loader. The footer link now
// prefetches on intent — hover, touch, focus — which fetches only down to
// producers/loading.js (the page-shaped skeleton). Every other footer link
// stays prefetch-free (MEH-2850). Mocks copied from FooterNavGroups.test.jsx.
const mockPrefetch = vi.fn();

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
  useRouter: () => ({ prefetch: mockPrefetch }),
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

const link = (container, href) => container.querySelector(`a[href="${href}"]`);

describe("MEH-3059: footer «כל בתי העסק» prefetches on intent", () => {
  for (const [name, fire] of [
    ["pointerenter", (el) => fireEvent.pointerEnter(el)],
    ["touchstart", (el) => fireEvent.touchStart(el)],
    ["focus", (el) => fireEvent.focus(el)],
  ]) {
    it(`${name} on the /producers link prefetches /producers`, () => {
      mockPrefetch.mockClear();
      const { container } = render(<Footer />);
      fire(link(container, "/producers"));
      expect(mockPrefetch).toHaveBeenCalledWith("/producers");
    });
  }

  it("rendering alone prefetches nothing, and other footer links never do", () => {
    mockPrefetch.mockClear();
    const { container } = render(<Footer />);
    expect(mockPrefetch).not.toHaveBeenCalled();
    const others = Array.from(container.querySelectorAll("a[href]")).filter((a) => a.getAttribute("href") !== "/producers");
    expect(others.length).toBeGreaterThan(3);
    for (const a of others) {
      fireEvent.pointerEnter(a);
      fireEvent.touchStart(a);
      fireEvent.focus(a);
    }
    expect(mockPrefetch).not.toHaveBeenCalled();
  });
});
