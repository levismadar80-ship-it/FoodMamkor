/**
 * MEH-1428 chunk 2 (MEH-2330) — the dashboard «בקשו ביקורת מלקוחה» card.
 *
 * Asserts behaviour at the render boundary (ADR-032 §3.6): what the owner can
 * copy, for each outcome of GET /producers/me/review-link, and on which
 * businesses the tools tab shows the card at all.
 *
 * DISCRIMINATION: against origin/staging (no card mounted on the tools tab)
 * the "approved → card" case fails; the "pending → no card" case passes in
 * both worlds and is the control that rules out "the card always renders".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import RequestReviewCard from "@/components/producer/RequestReviewCard";
import ToolsPage from "@/app/[locale]/producer/dashboard/tools/page";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const stableUser = { id: 1, role: "producer" };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: stableUser, loading: false }) }));
const stableRouter = { push: vi.fn() };
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => stableRouter,
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

const LINK = "https://mehamakor.co.il/p/meshek?rt=eyJhbGciOiJIUzI1NiJ9.x.y";
const copy = he.dashboard.producer.request_review;

function renderWithIntl(node) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {node}
    </NextIntlClientProvider>,
  );
}

let writeText;
beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("RequestReviewCard", () => {
  it("renders the approved copy verbatim", async () => {
    api.get.mockResolvedValue({ data: { url: LINK } });
    renderWithIntl(<RequestReviewCard />);
    expect(screen.getByText("בקשו ביקורת מלקוחה")).toBeInTheDocument();
    expect(
      screen.getByText("שלחו את הקישור בשיחת הוואטסאפ עם לקוחה — היא תוכל להשאיר ביקורת מאומתת."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("שלחו לכל לקוחה שקנתה — לא רק למי שבטוח תפרגן. ככה הביקורות נשארות אמינות."),
    ).toBeInTheDocument();
    expect(await screen.findByText("העתקת קישור")).toBeInTheDocument();
  });

  it("copies exactly the URL the server minted, then confirms", async () => {
    api.get.mockResolvedValue({ data: { url: LINK } });
    renderWithIntl(<RequestReviewCard />);
    const btn = screen.getByTestId("request-review-copy");
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(api.get).toHaveBeenCalledWith("/producers/me/review-link");
    expect(await screen.findByText(copy.cta_copied)).toBeInTheDocument();
  });

  it("the button is disabled until the link has arrived", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<RequestReviewCard />);
    const btn = screen.getByTestId("request-review-copy");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("a malformed payload (rule 19) never reaches the clipboard", async () => {
    api.get.mockResolvedValue({ data: { url: "" } });
    renderWithIntl(<RequestReviewCard />);
    expect(await screen.findByTestId("request-review-error")).toBeInTheDocument();
    expect(screen.queryByTestId("request-review-copy")).not.toBeInTheDocument();
  });

  it("a rejected fetch (e.g. 403 for a business that is not approved) shows the error", async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    renderWithIntl(<RequestReviewCard />);
    expect(await screen.findByTestId("request-review-error")).toHaveTextContent(he.error.generic);
  });

  it("a rejected clipboard write is surfaced, not swallowed", async () => {
    api.get.mockResolvedValue({ data: { url: LINK } });
    writeText.mockRejectedValue(new Error("denied"));
    renderWithIntl(<RequestReviewCard />);
    const btn = screen.getByTestId("request-review-copy");
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith(he.error.generic));
    expect(screen.queryByText(copy.cta_copied)).not.toBeInTheDocument();
  });

  it("no clipboard API (insecure context / some in-app WebViews) → the error toast, not a throw", async () => {
    api.get.mockResolvedValue({ data: { url: LINK } });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    renderWithIntl(<RequestReviewCard />);
    const btn = screen.getByTestId("request-review-copy");
    await waitFor(() => expect(btn).toBeEnabled());
    expect(() => fireEvent.click(btn)).not.toThrow();
    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith(he.error.generic));
  });
});

describe("Dashboard tools tab — where the card appears", () => {
  const dashboard = (status) => ({
    data: { producer: { id: "p-1", name: "משק", status }, favorites_count: 0, whatsapp_clicks_week: 0 },
  });

  it("approved business → the card is on the tools tab", async () => {
    api.get.mockImplementation((url) =>
      url === "/producers/me/dashboard"
        ? Promise.resolve(dashboard("approved"))
        : Promise.resolve({ data: { url: LINK } }),
    );
    renderWithIntl(<ToolsPage />);
    expect(await screen.findByTestId("request-review-card")).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/producers/me/review-link"));
  });

  it.each(["pending", "draft", "rejected"])(
    "%s business → no card, and the link endpoint is never called",
    async (status) => {
      api.get.mockImplementation((url) =>
        url === "/producers/me/dashboard"
          ? Promise.resolve(dashboard(status))
          : Promise.reject(new Error(`unexpected GET ${url}`)),
      );
      renderWithIntl(<ToolsPage />);
      expect(await screen.findByTestId("tools-grid")).toBeInTheDocument();
      expect(screen.queryByTestId("request-review-card")).not.toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalledWith("/producers/me/review-link");
    },
  );
});
