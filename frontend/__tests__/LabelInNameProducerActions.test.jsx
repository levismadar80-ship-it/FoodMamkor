import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import he from "@/messages/he.json";

// WCAG 2.5.3 Label in Name (axe `label-content-name-mismatch`, serious).
// @axe-core/playwright 4.14 flagged two nodes on /producer/[id] (PR #3927):
//   - FavoriteButton quiet — visible «שמירה», aria-label «הוסיפו למועדפים»
//   - ShareButton quiet    — visible «שיתוף», aria-label «שתפו לינק לעסק»
// A speech-input user says what they SEE; the accessible name has to contain
// it. Real he.json strings, not a fixture copy, so a copy change that
// re-breaks the rule goes red here.

function resolve(ns) {
  let node = he;
  for (const part of (ns || "").split(".").filter(Boolean)) node = node?.[part];
  return node;
}

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    let s = resolve(ns)?.[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  },
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});
vi.mock("@phosphor-icons/react", () => {
  const Icon = (props) => <span data-testid="icon" {...props} />;
  const names = ["HeartStraight", "ShareNetwork", "X", "Bell", "BellSlash", "Check", "Confetti", "Handbag", "Truck", "CookingPot", "ChatCircle"];
  return Object.fromEntries(names.map((n) => [n, Icon]));
});

import FavoriteButton from "@/components/FavoriteButton";
import ShareButton from "@/components/ShareButton";

afterEach(cleanup);

function expectLabelInName(btn) {
  const visible = btn.textContent.trim();
  expect(visible.length, "button has visible text").toBeGreaterThan(0);
  const name = btn.getAttribute("aria-label") ?? visible;
  // Starts-with is the WCAG 2.5.3 best practice (and implies contains).
  expect(name.startsWith(visible), `name «${name}» must start with visible «${visible}»`).toBe(true);
}

describe("Label in Name — producer header actions (WCAG 2.5.3)", () => {
  it.each(["quiet", "inline"])("FavoriteButton %s: accessible name starts with the visible label", (variant) => {
    render(<FavoriteButton producerId={1} variant={variant} />);
    const btn = screen.getByRole("button", { pressed: false });
    expectLabelInName(btn);
    // Keeps the descriptive half (e2e locators match /הוסיפו למועדפים/).
    expect(btn.getAttribute("aria-label")).toContain(he.favorites.button.add_aria);
  });

  const subjects = ["business", "event", "experience", "recipe"];
  const cases = ["quiet", "outline", "default"].flatMap((v) => subjects.map((s) => [v, s]));
  it.each(cases)("ShareButton %s / %s: accessible name starts with the visible label", (variant, subject) => {
    render(<ShareButton url="https://x/y" title="חוות השקמה" variant={variant} subject={subject} />);
    const btn = screen.getByRole("button");
    expectLabelInName(btn);
  });

  it("ShareButton keeps the subject in the name (MEH-2465 follow-up)", () => {
    render(<ShareButton url="https://x/e/1" variant="quiet" subject="event" />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain(he.share.modal_title_event);
  });
});
