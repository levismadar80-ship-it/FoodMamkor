import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewsSection from "@/components/ReviewsSection";
// MEH-1426: mocked so the form-open re-ping is observable without a real beacon.
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";

// MEH-1039: business-owner reply UI. These tests cover CHUNK C (display +
// owner affordance). The PUT endpoint lands in CHUNK B (reviews.py, blocked
// on MEH-1001); here api.put is mocked, so the UI contract is exercised
// independently of the backend.

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const flat = {
      reply_heading: "תגובת בית העסק",
      reply_add: "הוספת תגובה",
      reply_edit: "עריכת תגובה",
      reply_placeholder: "כתבו תגובה ללקוח…",
      reply_save: "שמירה",
      cancel: "ביטול",
      submit_saving: "בשמירה...",
      owner_only_eyebrow: "מוצג רק לך",
    };
    const t = (key) => flat[key] || key;
    // guest login-prompt path: render the `login` chunk so its href is testable
    t.rich = (key, tags) => (tags && tags.login ? <>{key} {tags.login("login")}</> : key);
    return t;
  },
  useLocale: () => "he",
}));

const { apiMock, authState } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  authState: { user: null },
}));

vi.mock("@/lib/api", () => ({ default: apiMock }));
// MEH-1285: the login prompt now uses Link from @/i18n/navigation
// (locale-aware); stub it so next-intl's createNavigation isn't loaded
// under jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/errors", () => ({ detailToMessage: (d) => (typeof d === "string" ? d : null) }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "7.7.2026" }));
vi.mock("@/components/ui/EmptyState", () => ({ default: () => <div data-testid="empty-state" /> }));
vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));
vi.mock("@phosphor-icons/react", () => ({
  Star: (props) => <span data-testid="icon-star" {...props} />,
  Leaf: (props) => <span data-testid="icon-leaf" {...props} />,
  EyeSlash: (props) => <span data-testid="icon-eyeslash" {...props} />,
  CaretDown: (props) => <span {...props} />,
  ArrowLeft: (props) => <span {...props} />,
  ArrowRight: (props) => <span {...props} />,
}));

// Lazy-load gate: fire the IntersectionObserver callback immediately.
beforeEach(() => {
  authState.user = null;
  apiMock.get.mockReset();
  apiMock.put.mockReset();
  global.IntersectionObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ isIntersecting: true }]);
    }
    disconnect() {}
  };
});

const withReply = {
  id: "rev-1",
  user_id: "u-1",
  user_name: "לקוחה טובה",
  stars: 5,
  body: "מוצרים מעולים",
  created_at: "2026-07-01T10:00:00",
  reply: "תודה רבה על המילים החמות!",
  reply_at: "2026-07-02T09:00:00",
};

const noReply = {
  id: "rev-2",
  user_id: "u-2",
  user_name: "לקוח נוסף",
  stars: 4,
  body: "טעים",
  created_at: "2026-07-01T11:00:00",
  reply: null,
  reply_at: null,
};

function mockReviews(reviews) {
  apiMock.get.mockResolvedValue({
    data: { reviews, total: reviews.length, page: 1, pages: 1 },
  });
}

describe("ReviewsSection — business reply (MEH-1039)", () => {
  it("renders the reply block + heading when review.reply is present", async () => {
    mockReviews([withReply]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText("תודה רבה על המילים החמות!")).toBeInTheDocument();
    expect(screen.getByText("תגובת בית העסק")).toBeInTheDocument();
  });

  it("renders nothing for an empty reply (no heading, no owner button as guest)", async () => {
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText("טעים")).toBeInTheDocument();
    expect(screen.queryByText("תגובת בית העסק")).not.toBeInTheDocument();
    expect(screen.queryByText("הוספת תגובה")).not.toBeInTheDocument();
  });

  it("shows the owner affordance: edit for a replied review, add for an empty one", async () => {
    mockReviews([withReply, noReply]);
    render(<ReviewsSection producerId="p-1" isOwner={true} />);
    expect(await screen.findByText("עריכת תגובה")).toBeInTheDocument();
    expect(screen.getByText("הוספת תגובה")).toBeInTheDocument();
  });

  it("owner add flow: opens textarea and PUTs the reply", async () => {
    mockReviews([noReply]);
    apiMock.put.mockResolvedValue({ data: { ...noReply, reply: "שמחנו לשרת!", reply_at: "2026-07-07T00:00:00" } });
    render(<ReviewsSection producerId="p-1" isOwner={true} />);

    fireEvent.click(await screen.findByText("הוספת תגובה"));
    const textarea = screen.getByPlaceholderText("כתבו תגובה ללקוח…");
    fireEvent.change(textarea, { target: { value: "שמחנו לשרת!" } });
    fireEvent.click(screen.getByText("שמירה"));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith("/reviews/rev-2/reply", { reply: "שמחנו לשרת!" }),
    );
  });

  it("disables Save until the draft has at least 2 chars", async () => {
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" isOwner={true} />);
    fireEvent.click(await screen.findByText("הוספת תגובה"));
    const saveBtn = screen.getByText("שמירה");
    expect(saveBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("כתבו תגובה ללקוח…"), { target: { value: "ok" } });
    expect(saveBtn).not.toBeDisabled();
  });
});

describe("ReviewsSection — owner-only eyebrow (MEH-1114)", () => {
  it("shows the 'מוצג רק לך' eyebrow above the owner empty state", async () => {
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={true} />);
    expect(await screen.findByText("מוצג רק לך")).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("does NOT show the owner eyebrow on the consumer empty state", async () => {
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    // consumer path renders the Leaf empty message, never the owner eyebrow
    await waitFor(() => expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument());
    expect(screen.queryByText("מוצג רק לך")).not.toBeInTheDocument();
  });
});

describe("ReviewsSection — single empty-state box with merged gate hint (MEH-1139)", () => {
  // Unmapped keys fall through the next-intl mock as raw key strings, so
  // assertions below target key names (wa_gate_message / empty_message / …).
  it("empty + logged-in non-gated viewer: ONE box — gate box gone, hint merged into empty state", async () => {
    authState.user = { id: "u-9", producer_id: null };
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText(/empty_message/)).toBeInTheDocument();
    expect(screen.getByText(/empty_gate_hint/)).toBeInTheDocument();
    expect(screen.queryByText("wa_gate_message")).not.toBeInTheDocument();
  });

  it("reviews exist + logged-in non-gated viewer: standalone gate box still renders", async () => {
    authState.user = { id: "u-9", producer_id: null };
    mockReviews([
      {
        id: "rev-9", user_id: "u-2", user_name: "לקוח", stars: 4, body: "טעים",
        created_at: "2026-07-01T11:00:00", reply: null, reply_at: null,
      },
    ]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText("wa_gate_message")).toBeInTheDocument();
    expect(screen.queryByText(/empty_gate_hint/)).not.toBeInTheDocument();
  });

  it("empty + guest: empty message only, no gate hint", async () => {
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText(/empty_message/)).toBeInTheDocument();
    expect(screen.queryByText(/empty_gate_hint/)).not.toBeInTheDocument();
  });
});

// MEH-1233 B1: the rating summary must render a fractional 5th star for a 4.7
// average — the pre-fix Math.round painted five FULL stars, reading as a faked
// 5.0. Each star position clips a filled star to `fill*100%`; here we assert the
// 5th wrapper is 70% wide and exactly four are 100%.
describe("ReviewsSection — B1 fractional star fill (MEH-1233)", () => {
  it("avg 4.7 → four full stars + one 70%-filled star (never five full)", async () => {
    apiMock.get.mockResolvedValue({ data: { reviews: [], total: 3, page: 1, pages: 1 } });
    const { container } = render(
      <ReviewsSection producerId="p-1" avgRating={4.7} reviewCount={3} isOwner={false} />,
    );
    // Summary appears once the fetch resolves (total>=3 && avg>0).
    await screen.findByText("4.7");
    const fills = [...container.querySelectorAll("span[style]")]
      .map((el) => el.style.width)
      .filter((w) => w.endsWith("%"));
    expect(fills.filter((w) => w === "100%")).toHaveLength(4);
    expect(fills).toContain("70%");
  });
});

describe("ReviewsSection — WA re-ping on form open (MEH-1426)", () => {
  const PID = "prod-1426";

  beforeEach(() => {
    pingWhatsAppBeacon.mockClear();
    localStorage.clear();
  });

  it("logged-in + wa_clicked flag → opening the form fires ONE authenticated ping (once per mount)", async () => {
    authState.user = { id: "u-9", producer_id: null };
    localStorage.setItem(`wa_clicked_${PID}`, "1");
    mockReviews([]);
    render(<ReviewsSection producerId={PID} />);
    const btn = await screen.findByText("write_cta");
    fireEvent.click(btn);
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(1);
    expect(pingWhatsAppBeacon).toHaveBeenCalledWith(PID);
    // Close and reopen — the re-ping must not fire a second time (once per mount).
    fireEvent.click(await screen.findByText("ביטול"));
    fireEvent.click(await screen.findByText("write_cta"));
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(1);
  });

  it("no wa_clicked flag → gated (no write CTA), no ping", async () => {
    authState.user = { id: "u-9", producer_id: null };
    mockReviews([]);
    render(<ReviewsSection producerId={PID} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(screen.queryByText("write_cta")).not.toBeInTheDocument();
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
  });

  it("guest (not logged in) → no ping even if the local flag is set", async () => {
    authState.user = null;
    localStorage.setItem(`wa_clicked_${PID}`, "1");
    mockReviews([]);
    render(<ReviewsSection producerId={PID} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
  });
});

// MEH-1428 chunk 2 (MEH-2330): the owner's "request a review" link carries a
// signed `rt` token. It is an alternative to the WhatsApp-click gate — the
// server verifies it (reviews.py `_invited_by_token`); the client only has to
// keep it per producer, unlock the form, and forward it as `review_token`.
describe("ReviewsSection — review-invite token (MEH-1428 chunk 2)", () => {
  const PID = "prod-1428";

  const submitReview = async () => {
    fireEvent.click(await screen.findByText("write_cta"));
    fireEvent.click(screen.getAllByLabelText("star_aria")[4]);
    fireEvent.change(screen.getByLabelText("body_label"), {
      target: { value: "מוצרים טעימים מאוד, ממליצה" },
    });
    fireEvent.click(screen.getByText("submit"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    return apiMock.post.mock.calls[0];
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiMock.post.mockReset();
    apiMock.post.mockResolvedValue({
      data: { id: "rev-new", user_id: "u-9", stars: 5, body: "x", created_at: "2026-10-25T10:00:00" },
    });
    authState.user = { id: "u-9", producer_id: null };
    window.history.replaceState({}, "", "/");
  });

  it("?rt= on the page unlocks the form with no WhatsApp click, and the submit forwards it", async () => {
    window.history.replaceState({}, "", `/p/meshek?rt=tok-abc`);
    mockReviews([]);
    render(<ReviewsSection producerId={PID} />);
    const [url, payload] = await submitReview();
    expect(url).toBe(`/producers/${PID}/reviews`);
    expect(payload).toEqual({ stars: 5, body: "מוצרים טעימים מאוד, ממליצה", review_token: "tok-abc" });
  });

  it("keeps the token per producer in sessionStorage, so it survives the login detour", async () => {
    window.history.replaceState({}, "", `/p/meshek?rt=tok-abc`);
    mockReviews([]);
    const first = render(<ReviewsSection producerId={PID} />);
    await waitFor(() => expect(sessionStorage.getItem(`review_invite_${PID}`)).toBe("tok-abc"));
    first.unmount();

    // Back from /login: the query string is gone, the token is not.
    window.history.replaceState({}, "", `/p/meshek`);
    render(<ReviewsSection producerId={PID} />);
    const [, payload] = await submitReview();
    expect(payload.review_token).toBe("tok-abc");
  });

  it("a token stored for ANOTHER producer does not unlock this one", async () => {
    sessionStorage.setItem("review_invite_some-other-producer", "tok-other");
    mockReviews([]);
    render(<ReviewsSection producerId={PID} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(screen.queryByText("write_cta")).not.toBeInTheDocument();
  });

  it("WhatsApp-click path unchanged: no token in storage → no review_token key in the body", async () => {
    localStorage.setItem(`wa_clicked_${PID}`, "1");
    mockReviews([]);
    render(<ReviewsSection producerId={PID} />);
    const [, payload] = await submitReview();
    expect(payload).toEqual({ stars: 5, body: "מוצרים טעימים מאוד, ממליצה" });
  });

  it("the owner never gets the form, token or not", async () => {
    authState.user = { id: "u-owner", producer_id: PID };
    window.history.replaceState({}, "", `/p/meshek?rt=tok-abc`);
    mockReviews([]);
    render(<ReviewsSection producerId={PID} isOwner />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(screen.queryByText("write_cta")).not.toBeInTheDocument();
  });

  it("guest with the link: the login prompt returns to this page's reviews, token in the URL", async () => {
    authState.user = null;
    window.history.replaceState({}, "", `/p/meshek?rt=tok-abc`);
    mockReviews([]);
    // The guest prompt is a t.rich() chunk; render the link so its href is observable.
    render(<ReviewsSection producerId={PID} />);
    await waitFor(() => expect(sessionStorage.getItem(`review_invite_${PID}`)).toBe("tok-abc"));
    const link = await screen.findByTestId("reviews-login-link");
    expect(link.getAttribute("href")).toBe(
      `/login?redirect=${encodeURIComponent("/p/meshek?rt=tok-abc#reviews")}`,
    );
  });

  it("storage blocked (SecurityError): the token in the URL still unlocks and is sent", async () => {
    window.history.replaceState({}, "", `/p/meshek?rt=tok-abc`);
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    try {
      mockReviews([]);
      render(<ReviewsSection producerId={PID} />);
      const [, payload] = await submitReview();
      expect(payload.review_token).toBe("tok-abc");
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });

  it("an empty ?rt= stores nothing and unlocks nothing", async () => {
    window.history.replaceState({}, "", `/p/meshek?rt=`);
    mockReviews([]);
    render(<ReviewsSection producerId={PID} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(sessionStorage.getItem(`review_invite_${PID}`)).toBeNull();
    expect(screen.queryByText("write_cta")).not.toBeInTheDocument();
  });
});

// MEH-2592 — the reviews look: one-line summary, initial + name + date with the
// stars under the name, the business reply as a side rule, the write-a-review
// gate as a quiet line UNDER the list, and a full-width "show more".
describe("ReviewsSection — reviews look (MEH-2592)", () => {
  const following = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("summary is one row (number · stars · count), not a centred box", async () => {
    apiMock.get.mockResolvedValue({ data: { reviews: [], total: 3, page: 1, pages: 1 } });
    render(<ReviewsSection producerId="p-1" avgRating={4.7} reviewCount={3} />);
    const number = await screen.findByText("4.7");
    const summary = screen.getByTestId("reviews-summary");
    expect(summary).toContainElement(number);
    expect(summary).toContainElement(screen.getByRole("img"));
    expect(summary).toContainElement(screen.getByText("summary_count"));
    expect(summary.className).toContain("flex");
    expect(summary.className).not.toContain("text-center");
  });

  it("each review: initial circle, then name; its stars sit under the name", async () => {
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" />);
    const name = await screen.findByText(/^לקוח/);
    const initial = screen.getByTestId("review-initial");
    expect(initial).toHaveTextContent("ל");
    expect(following(initial, name)).toBe(true);
    const stars = screen.getByRole("img");
    expect(following(name, stars)).toBe(true);
    // the stars share the name's column, not a far-edge sibling of it
    expect(name.parentElement).toContainElement(stars);
  });

  it("business reply is a side rule, not a green box", async () => {
    mockReviews([withReply]);
    render(<ReviewsSection producerId="p-1" />);
    await screen.findByText("תודה רבה על המילים החמות!");
    const reply = screen.getByTestId("review-reply");
    expect(reply.className).toContain("border-s-2");
    expect(reply.className).not.toContain("bg-green-50");
  });

  it("guest: the login line sits UNDER the reviews, as plain text", async () => {
    authState.user = null;
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" />);
    const body = await screen.findByText("טעים");
    const hint = screen.getByTestId("reviews-write-hint");
    expect(hint).toContainElement(screen.getByTestId("reviews-login-link"));
    expect(following(body, hint)).toBe(true);
    expect(hint.className).not.toContain("border");
  });

  it("logged-in, not gated, reviews exist: the WhatsApp-gate line sits UNDER the reviews", async () => {
    authState.user = { id: "u-9", producer_id: null };
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" />);
    const body = await screen.findByText("טעים");
    const hint = screen.getByTestId("reviews-write-hint");
    expect(hint).toHaveTextContent("wa_gate_message");
    expect(following(body, hint)).toBe(true);
  });

  it("owner: no write hint at all", async () => {
    authState.user = { id: "u-o", producer_id: "p-1" };
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" isOwner />);
    await screen.findByText("טעים");
    expect(screen.queryByTestId("reviews-write-hint")).toBeNull();
  });

  it("show more is a full-width button", async () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ ...noReply, id: `r${i}`, user_id: `u${i}` }));
    apiMock.get.mockResolvedValue({ data: { reviews: many, total: 4, page: 1, pages: 1 } });
    render(<ReviewsSection producerId="p-1" />);
    const more = await screen.findByRole("button", { name: /show_more/ });
    expect(more.className).toContain("w-full");
  });
});
