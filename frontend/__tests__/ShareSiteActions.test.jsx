import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * MEH-2827 PR 5 — one «שתפו» everywhere the site asks a reader to share.
 *
 * Sapir 08/11: no WhatsApp-only share button; the generic share sheet carries
 * WhatsApp, Instagram, Facebook… itself. next-intl reads the REAL he.json so a
 * label assertion fails if the button stops rendering, instead of matching a
 * key that would be there either way.
 */

vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  const make = (ns) => {
    const fn = (key, vals) => {
      let s = lookup(ns ? `${ns}.${key}` : key) ?? (ns ? `${ns}.${key}` : key);
      if (typeof s === "string" && vals) for (const [k, v] of Object.entries(vals)) s = s.replace(`{${k}}`, v);
      return s;
    };
    fn.rich = (key) => fn(key);
    fn.raw = fn;
    return fn;
  };
  return { useTranslations: make, useLocale: () => "he" };
});
vi.mock("@/i18n/navigation", () => ({
  // MEH-3059: Footer prefetches «כל בתי העסק» on intent via router.prefetch.
  useRouter: () => ({ prefetch: () => {} }),
  Link: ({ href, children, prefetch, ...p }) => <a href={typeof href === "string" ? href : href?.pathname} {...p}>{children}</a>,
  getPathname: ({ href, locale }) => (locale === "he" ? href : `/${locale}${href}`),
}));
vi.mock("next/image", () => ({ default: ({ priority, ...p }) => <img alt="" {...p} /> }));
const authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ SITE_URL: "https://mehamakor.co.il" }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock("@/components/CitySearch", () => ({ default: () => <input data-testid="city" /> }));
vi.mock("@/lib/use-experiences-nav-gate", () => ({ useExperiencesNavGate: () => false }));
vi.mock("@/lib/use-events-nav-gate", () => ({ useEventsNavGate: () => false }));

import ShareSiteActions from "@/components/ShareSiteActions";
import RecommendClient from "@/app/[locale]/recommend/RecommendClient";
import { GET as shareRedirect } from "@/app/[locale]/share/route";
import Footer from "@/components/Footer";
import RegistrationCta from "@/components/RegistrationCta";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

const SHARE = "שתפו";
const SITE = "https://mehamakor.co.il";

let shareSpy;
beforeEach(() => {
  shareSpy = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "share", { configurable: true, value: shareSpy });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.user = null;
});

const noWhatsApp = (root = document.body) => {
  expect(root.querySelector('a[href*="wa.me"]')).toBeNull();
  expect(root.textContent).not.toContain("וואטסאפ");
};

describe("ShareSiteActions", () => {
  it("full: «שתפו» + copy link + email — and no WhatsApp action", () => {
    render(<ShareSiteActions layout="full" />);
    expect(screen.getByTestId("share-native")).toHaveTextContent(SHARE);
    expect(screen.getByTestId("share-copy")).toHaveTextContent("העתיקו קישור");
    expect(screen.getByTestId("share-email")).toHaveTextContent("שתפו במייל");
    noWhatsApp();
  });

  it("compact: the single «שתפו» button only", () => {
    render(<ShareSiteActions layout="compact" />);
    expect(screen.getByTestId("share-native")).toHaveTextContent(SHARE);
    expect(screen.queryByTestId("share-copy")).toBeNull();
    expect(screen.queryByTestId("share-email")).toBeNull();
  });

  it("«שתפו» opens the native sheet with the site URL", async () => {
    render(<ShareSiteActions layout="compact" />);
    fireEvent.click(screen.getByTestId("share-native"));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    // MEH-2827 PR 6: title + the URL ONLY as url — no text carrying the URL.
    expect(shareSpy.mock.calls[0][0]).toEqual({ title: expect.any(String), url: SITE });
  });

  it("no native sheet → copies the link with the existing toast", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ShareSiteActions layout="compact" />);
    fireEvent.click(screen.getByTestId("share-native"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SITE));
    expect(showToast.success).toHaveBeenCalledWith("הקישור הועתק", expect.anything());
  });
});

describe("/recommend carries «ספרו עלינו»", () => {
  it("under the form: heading, intro, full layout", () => {
    render(<RecommendClient />);
    const section = screen.getByTestId("recommend-share");
    expect(section.id).toBe("share");
    expect(section).toHaveTextContent("ספרו עלינו");
    expect(section.querySelector('[data-testid="share-copy"]')).not.toBeNull();
    expect(screen.getByTestId("recommend-form")).toBeInTheDocument();
    noWhatsApp(section);
  });

  it("after a send: the thank-you panel AND the same section under it", async () => {
    render(<RecommendClient />);
    fireEvent.change(document.getElementById("recommend-name"), { target: { value: "מאפייה" } });
    fireEvent.change(document.getElementById("recommend-instagram"), { target: { value: "bakery" } });
    fireEvent.submit(screen.getByTestId("recommend-form"));
    await waitFor(() => expect(screen.getByTestId("recommend-success")).toBeInTheDocument());
    expect(screen.queryByTestId("recommend-form")).toBeNull();
    expect(screen.getByTestId("recommend-share")).toBeInTheDocument();
  });

  it("owner line: a guest sees «יש לכם עסק? בואו אלינו» + «מצטרפים» to /join (MEH-2983)", () => {
    render(<RecommendClient />);
    const line = screen.getByTestId("recommend-owner-line");
    expect(line).toHaveTextContent("יש לכם עסק? בואו אלינו");
    const link = screen.getByTestId("recommend-owner-link");
    expect(link).toHaveTextContent("מצטרפים");
    expect(link.getAttribute("href")).toBe("/join");
  });

  it("owner line: a producer is sent to the dashboard, an admin sees no link", () => {
    authState.user = { role: "producer" };
    render(<RecommendClient />);
    expect(screen.getByTestId("recommend-owner-line").querySelector('a[href="/producer/dashboard"]')).not.toBeNull();
    cleanup();
    authState.user = { role: "admin" };
    render(<RecommendClient />);
    expect(screen.getByTestId("recommend-owner-line").querySelector("a")).toBeNull();
  });
});

describe("/share", () => {
  it("answers a real 308 to /recommend#share, per locale", async () => {
    const he = await shareRedirect(new Request("https://mehamakor.co.il/share"), { params: Promise.resolve({ locale: "he" }) });
    expect(he.status).toBe(308);
    expect(he.headers.get("location")).toBe("https://mehamakor.co.il/recommend#share");
    const en = await shareRedirect(new Request("https://mehamakor.co.il/en/share"), { params: Promise.resolve({ locale: "en" }) });
    expect(en.headers.get("location")).toBe("https://mehamakor.co.il/en/recommend#share");
  });
});

describe("Footer", () => {
  it("the «ספרו עלינו» link points at /recommend#share", () => {
    render(<Footer />);
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent === "ספרו עלינו");
    expect(link?.getAttribute("href")).toBe("/recommend#share");
  });

  it("newsletter: no share box before joining, a compact «שתפו» after", async () => {
    render(<Footer />);
    expect(screen.queryByTestId("newsletter-share")).toBeNull();
    fireEvent.change(document.getElementById("footer-newsletter-email"), { target: { value: "a@example.com" } });
    fireEvent.submit(document.getElementById("footer-newsletter-email").closest("form"));
    const box = await screen.findByTestId("newsletter-share");
    expect(box).toHaveTextContent("ספרו עלינו");
    expect(box.querySelector('[data-testid="share-native"]')).toHaveTextContent(SHARE);
    expect(box.querySelector('[data-testid="share-copy"]')).toBeNull();
    noWhatsApp(box);
  });
});

describe("event registration success", () => {
  const props = { itemId: "e1", title: "סדנת מחמצת", method: "site_form", phone: null, url: null, isFull: false };

  async function signUp(kind) {
    window.history.replaceState({}, "", "/events/e1");
    render(<RegistrationCta kind={kind} {...props} />);
    fireEvent.click(screen.getByTestId("registration-open"));
    for (const input of document.querySelectorAll("#registration-form-panel input:not([type=hidden]):not([tabindex='-1'])")) {
      const type = input.getAttribute("type");
      fireEvent.change(input, { target: { value: type === "email" ? "a@example.com" : type === "tel" ? "0521234567" : type === "number" ? "1" : "נועה" } });
    }
    fireEvent.click(screen.getByTestId("registration-submit"));
    await screen.findByTestId("registration-success");
  }

  it("events: a compact «שתפו» that shares THIS event page", async () => {
    await signUp("events");
    fireEvent.click(screen.getByTestId("share-native"));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const payload = shareSpy.mock.calls[0][0];
    expect(payload.url).toBe(`${window.location.origin}/events/e1`);
    expect(payload.title).toBe("סדנת מחמצת");
    expect(payload.text).toBeUndefined();
    expect(api.post).toHaveBeenCalled();
  });

  it("experiences: the plain confirmation, no share", async () => {
    await signUp("experiences");
    expect(screen.queryByTestId("share-native")).toBeNull();
  });
});
