import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * MEH-1227 — the /about founder portrait wrapper used to carry an aria-label
 * on a role-less div. axe's `aria-prohibited-attr` (impact: serious) fires on
 * that, and it is what fails
 * `e2e/flows/12-axe-a11y.spec.ts:183 › /about` on BOTH projects.
 *
 * Measured on run 31268202950 (staging, 0e652c32):
 *   aria-label attribute cannot be used on a div with no valid role attribute.
 *   <div class="relative w-full aspect-[3/4] ..." aria-label="תמונה של ספיר, מייסדת מהמקור">
 *
 * The fix removes the wrapper's name and lets the Image's own `alt` carry it,
 * matching ImageWithFallback.jsx:37-56 and ProducerCard.jsx:288-310, which
 * scope role="img" to the NO-PHOTO branch and leave the loaded branch a bare
 * Image. Naming the wrapper instead was tried and rejected: this fallback
 * renders `null`, so a name there announces a photo over an empty box — and
 * that empty state is the live one while the Cloudinary images 401.
 *
 * The assertions go through the ACCESSIBILITY TREE (getByRole / accessible
 * name), not through attributes. A test asserting "role=img is present" would
 * pass on any diff that applied a prescribed edit, including one that broke
 * the name; these can only pass if a screen reader would actually reach the
 * right thing — which is the property axe is checking.
 *
 * ── MEH-1130 ────────────────────────────────────────────────────────────────
 * The founder portrait this file was written around is GONE: the editorial
 * image layer replaced it with a market photograph, and there is no photo of
 * the founder anywhere on /about any more ("face-not-focal").
 *
 * The MEH-1227 property did NOT go with it, and that is why this file was
 * repointed rather than deleted. The shape it guards — a fill-Image inside a
 * wrapper, with an onError branch rendering `null` — is exactly the shape the
 * new story image has, so the same three assertions still discriminate; only
 * the image they hold on to changed. Deleting the file because "the portrait
 * is gone" would have retired a live a11y guard on the element that replaced
 * it, which is the outcome the guard exists to prevent.
 *
 * The fourth test is new and is MEH-1130's own absence assertion, stated as
 * behaviour rather than as a grep: no image on this page announces itself as
 * the founder. It fails against the pre-MEH-1130 component (demonstrated in
 * the PR body), which is what makes it a check rather than a decoration.
 */

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => {
    const full = ns ? `${ns}.${key}` : key;
    const map = {
      "about.consumer.story.image_aria": "תמונה של ספיר, מייסדת מהמקור",
      "about.consumer.story.image_alt": "ספיר, מייסדת מהמקור",
      // MEH-1130: the alt of the market photograph that replaced the
      // portrait. Verbatim from the asset's Cloudinary context.alt.
      "about.img.story_alt": "תוצרת צבעונית בסלים בשוק איכרים",
    };
    return map[full] ?? full;
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// MEH-2193: `get` must resolve to a promise. A bare `vi.fn()` returns
// undefined, which no real client does — and once AboutClient gained the
// HowWeChoose child (which calls `api.get(...).then(...)` in an effect), the
// under-specified mock crashed the whole tree during commit, reddening three
// assertions that have nothing to do with fetching. The shape below is what
// axios actually returns.
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

// Real <img> so the component's own onError path can be exercised (below),
// rather than simulating the failed state with a second mock.
vi.mock("next/image", () => ({
  default: ({ alt, src, onError }) => (
    <img alt={alt} src={typeof src === "string" ? src : ""} onError={onError} />
  ),
}));

// jsdom doesn't implement IntersectionObserver — FadeInSection (framer-motion
// whileInView) needs it. Same stub as PaginationCounter.test.jsx.
beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

import AboutClient from "@/app/[locale]/about/AboutClient";

const WRAPPER_NAME = "תמונה של ספיר, מייסדת מהמקור";
// The name the STORY IMAGE carries today (MEH-1130 — the market photograph).
const ALT_NAME = "תוצרת צבעונית בסלים בשוק איכרים";
// The name the founder portrait used to carry. Nothing may answer to it now.
const PORTRAIT_NAME = "ספיר, מייסדת מהמקור";

/** Every element carrying aria-label whose role cannot accept a name. */
function prohibitedLabelHolders(container) {
  const IMPLICIT_ROLE_OK = [
    "a", "button", "input", "select", "textarea", "img",
    "nav", "form", "section", "dialog", "summary",
  ];
  return [...container.querySelectorAll("[aria-label]")]
    .filter((el) => !el.hasAttribute("role") && !IMPLICIT_ROLE_OK.includes(el.tagName.toLowerCase()))
    .map((el) => `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute("aria-label")}"]`);
}

describe("MEH-1227 / MEH-1130 — /about story image: no name stranded on a role-less wrapper", () => {
  it("leaves no aria-label on an element whose role cannot carry one (the axe rule)", () => {
    const { container } = render(<AboutClient />);
    expect(prohibitedLabelHolders(container)).toEqual([]);
  });

  it("still exposes the story image as a named image — via the Image's own alt", () => {
    render(<AboutClient />);
    expect(screen.getByRole("img", { name: ALT_NAME })).toBeTruthy();
  });

  it("announces nothing over the empty plate when the image fails to load", () => {
    // The live state today: the Cloudinary image 401s, onError fires, and the
    // component renders `null` inside the wrapper. Naming the wrapper would
    // announce a photo that is not there.
    const { container } = render(<AboutClient />);
    fireEvent.error(screen.getByRole("img", { name: ALT_NAME }));

    expect(screen.queryByRole("img", { name: ALT_NAME })).toBeNull();
    expect(screen.queryByRole("img", { name: WRAPPER_NAME })).toBeNull();
    expect(screen.queryByLabelText(WRAPPER_NAME)).toBeNull();
    // and the failed state must not reintroduce the violation either
    expect(prohibitedLabelHolders(container)).toEqual([]);
  });

  // MEH-1130 — "face-not-focal", asserted as behaviour: whatever the markup
  // does, nothing on this page announces itself as a picture of the founder.
  // Stated over the accessibility tree for the same reason as the three above:
  // an assertion on the asset URL would pass on a diff that swapped the src
  // and left the name, and the name is the part a reader actually meets.
  it("no longer exposes any image of the founder (MEH-1130 absence assertion)", () => {
    render(<AboutClient />);
    expect(screen.queryByRole("img", { name: PORTRAIT_NAME })).toBeNull();
    expect(screen.queryByRole("img", { name: WRAPPER_NAME })).toBeNull();
    expect(screen.queryByLabelText(PORTRAIT_NAME)).toBeNull();
  });
});
