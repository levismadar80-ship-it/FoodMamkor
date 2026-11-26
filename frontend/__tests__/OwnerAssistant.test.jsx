/**
 * MEH-3902 — the dashboard assistant. Closed / open; the screen she is on and
 * the interface language travel with the question (a sub-page as its parent
 * screen); 0 / 1 / many messages; an answer's dashboard paths and edit-card
 * anchors become links and a made-up path stays text; a draft shows the
 * field-by-field review and only the ticked fields are written; product rows
 * open the menu review; a card the server names opens in the chat; the
 * conversation survives a reload and «שיחה חדשה» clears it; an unanswered
 * question is counted by screen only; the home nudge opens it on a question.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { contractRow } from "./helpers/contract-row";
import { GetMyProducerProducersMeGetResponse } from "@/lib/generated/api.zod";
import { ownerSectionFor, splitOwnerLinks } from "@/lib/owner-pages";

let pathname = "/producer/dashboard/edit";
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname,
  Link: ({ href, children, onClick, ...rest }) => <a href={href} onClick={onClick} {...rest}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
let authUser = { id: 7, role: "producer", producer_id: 3 };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: authUser }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
const { trackEvent } = await import("@/lib/analytics");
const { default: OwnerAssistantNudge } = await import("@/components/owner-assistant/OwnerAssistantNudge");

const { default: OwnerAssistant } = await import("@/components/owner-assistant/OwnerAssistant");

const A = he.owner_assistant;
const EMPTY_DRAFT = {
  description: null, category_ids: [], delivery_cities: [], opening_hours: null, phone: null,
  instagram: null, facebook: null, website: null, contact_email: null, primary_contact_method: null,
};
const PROFILE = contractRow(GetMyProducerProducersMeGetResponse, {
  description: null, phone: null, instagram: null, categories: [], delivery_areas: [], locations: [],
});

const renderIt = (extra = null) =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <OwnerAssistant />
      {extra}
    </NextIntlClientProvider>,
  );

const openPanel = () => fireEvent.click(screen.getByTestId("owner-assistant-open"));
const ask = (text) => {
  fireEvent.change(screen.getByTestId("owner-assistant-input"), { target: { value: text } });
  fireEvent.submit(screen.getByTestId("owner-assistant-input").closest("form"));
};

beforeEach(() => {
  vi.clearAllMocks();
  pathname = "/producer/dashboard/edit";
  localStorage.clear();
  authUser = { id: 7, role: "producer", producer_id: 3 };
});

describe("ownerSectionFor", () => {
  it("a screen is itself, a sub-page is its screen, anything else is null", () => {
    expect(ownerSectionFor("/producer/dashboard")).toBe("/producer/dashboard");
    expect(ownerSectionFor("/producer/dashboard/events/new")).toBe("/producer/dashboard/events");
    expect(ownerSectionFor("/producer/dashboard/recipes/0b8c1f7e-3a2d-4c5e-9f10-1a2b3c4d5e6f/edit")).toBe("/producer/dashboard/recipes");
    expect(ownerSectionFor("/admin")).toBeNull();
  });
});

describe("splitOwnerLinks", () => {
  it("links a screen, a card and a site page; leaves a made-up path as text", () => {
    const parts = splitOwnerLinks("ב- /producer/dashboard/edit#images ואז /producer/dashboard/nope ו- /join/pricing");
    const links = parts.filter((p) => p.type === "link");
    expect(links.map((l) => [l.ns, l.href])).toEqual([
      ["anchor", "/producer/dashboard/edit#images"],
      ["site", "/join/pricing"],
    ]);
    expect(parts.map((p) => (p.type === "text" ? p.value : "")).join("")).toContain("/producer/dashboard/nope");
  });

  it("an anchor that is not a real card is not a link", () => {
    expect(splitOwnerLinks("/producer/dashboard/edit#secret").some((p) => p.type === "link")).toBe(false);
  });
});

describe("OwnerAssistant", () => {
  it("closed: only the button; open: the opening line and three questions for this screen", () => {
    renderIt();
    expect(screen.queryByTestId("owner-assistant-panel")).toBeNull();
    openPanel();
    expect(screen.getByText(A.opening)).toBeTruthy();
    const prompts = screen.getByTestId("owner-assistant-prompts").querySelectorAll("button");
    expect([...prompts].map((b) => b.textContent)).toEqual([A.prompts.fill, A.prompts.add_products, A.prompts.this_screen]);
    fireEvent.click(screen.getByLabelText(A.close));
    expect(screen.queryByTestId("owner-assistant-panel")).toBeNull();
  });

  it("sends the screen with the question and links the answer", async () => {
    pathname = "/producer/dashboard/events/new";
    api.post.mockResolvedValue({ data: { reply: "חסרה תמונה: /producer/dashboard/edit#images", draft: null } });
    renderIt();
    openPanel();
    ask("מה חסר?");
    await screen.findByTestId("owner-assistant-link");
    expect(api.post).toHaveBeenCalledWith("/chat/owner", {
      messages: [{ role: "user", content: "מה חסר?" }],
      section: "/producer/dashboard/events",
      locale: "he",
    });
    expect(screen.getByTestId("owner-assistant-link").textContent).toBe(he.dashboard.producer.images.heading);
  });

  it("a question she already asked is not offered again", async () => {
    api.post.mockResolvedValue({ data: { reply: "תשובה" } });
    renderIt();
    openPanel();
    fireEvent.click(screen.getByText(A.prompts.fill));
    await screen.findByText("תשובה");
    const offered = [...screen.getByTestId("owner-assistant-prompts").querySelectorAll("button")].map((b) => b.textContent);
    expect(offered).toEqual([A.prompts.add_products, A.prompts.this_screen]);
  });

  it("many messages: the whole conversation goes with the next question", async () => {
    api.post
      .mockResolvedValueOnce({ data: { reply: "תשובה 1", draft: null } })
      .mockResolvedValueOnce({ data: { reply: "תשובה 2", draft: null } });
    renderIt();
    openPanel();
    ask("שאלה 1");
    await screen.findByText("תשובה 1");
    ask("שאלה 2");
    await screen.findByText("תשובה 2");
    expect(api.post.mock.calls[1][1].messages).toEqual([
      { role: "user", content: "שאלה 1" },
      { role: "assistant", content: "תשובה 1" },
      { role: "user", content: "שאלה 2" },
    ]);
  });

  it("a draft shows the review; only the ticked fields are saved, then the screen re-reads", async () => {
    api.post.mockResolvedValue({
      data: { reply: "הכנתי הצעה", draft: { ...EMPTY_DRAFT, description: "לחם מחמצת", phone: "0501234567" } },
    });
    api.get.mockResolvedValue({ data: PROFILE });
    api.put.mockResolvedValue({ data: {} });
    const updated = vi.fn();
    window.addEventListener("mehamakor:owner-page-updated", updated);
    renderIt();
    openPanel();
    ask("אנחנו מאפייה, הטלפון 0501234567");
    await screen.findByTestId("owner-assistant-card");
    expect(screen.getByTestId("page-fill-row-description")).toBeTruthy();
    // Untick the phone, keep the description.
    fireEvent.click(screen.getByLabelText(he.page_fill.fields.phone));
    fireEvent.click(screen.getByTestId("page-fill-save"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/producers/me", { description: "לחם מחמצת" }));
    expect((await screen.findByTestId("owner-assistant-saved")).textContent).toBe(A.done.fields);
    expect(updated).toHaveBeenCalledTimes(1);
    window.removeEventListener("mehamakor:owner-page-updated", updated);
  });

  it("an error keeps the panel and says so", async () => {
    api.post.mockRejectedValue({ response: { status: 429 } });
    renderIt();
    openPanel();
    ask("שאלה");
    expect(await screen.findByText(A.error_rate_limit)).toBeTruthy();
  });

  it("product rows from her text open the menu review, and publishing marks them added", async () => {
    api.post.mockImplementation((url) =>
      url === "/chat/owner"
        ? Promise.resolve({ data: { reply: "מצאתי", products: [
          { name: "לחם מחמצת", description: null, section: null, price_min: "28.00", price_max: null, price_unit: "unit", uncertain: [] },
        ] } })
        : Promise.resolve({ data: { created: 1 } }),
    );
    api.get.mockResolvedValue({ data: PROFILE });
    renderIt();
    openPanel();
    ask("לחם מחמצת 28");
    await screen.findByTestId("menu-review");
    fireEvent.click(screen.getByRole("button", { name: /הוספ|פרסו|publish/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/producers/me/menu-import/publish", {
      products: [{ name: "לחם מחמצת", description: null, price_min: 28, price_max: null, price_unit: "unit" }],
    }));
    expect((await screen.findByTestId("owner-assistant-saved")).textContent).toBe(A.done.products);
    expect(trackEvent).toHaveBeenCalledWith("owner_assistant_saved", { section: "/producer/dashboard/edit", kind: "products" });
  });

  it("a card the server names opens in the chat: send for review for a draft", async () => {
    api.post.mockResolvedValue({ data: { reply: "כאן שולחים", action: "send_for_review" } });
    api.get.mockResolvedValue({ data: { ...PROFILE, status: "draft" } });
    renderIt();
    openPanel();
    ask("לשלוח לבדיקה");
    expect(await screen.findByTestId("draft-submit-banner")).toBeTruthy();
  });

  it("no card when the server names none", async () => {
    api.post.mockResolvedValue({ data: { reply: "סתם תשובה" } });
    renderIt();
    openPanel();
    ask("שאלה");
    await screen.findByText("סתם תשובה");
    expect(screen.queryByTestId("owner-assistant-card")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("an unanswered question is counted by screen and topic only", async () => {
    api.post.mockResolvedValue({ data: { reply: "לא יודעת", unanswered: "orders" } });
    renderIt();
    openPanel();
    ask("שאלה אישית מאוד");
    await screen.findByText("לא יודעת");
    expect(trackEvent).toHaveBeenCalledWith("owner_assistant_unanswered", { section: "/producer/dashboard/edit", topic: "orders" });
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("שאלה אישית");
  });

  it("the conversation survives a reload; «שיחה חדשה» clears it", async () => {
    api.post.mockResolvedValue({ data: { reply: "תשובה שמורה" } });
    const first = renderIt();
    openPanel();
    ask("שאלה שמורה");
    await screen.findByText("תשובה שמורה");
    first.unmount();
    renderIt();
    openPanel();
    expect(screen.getByText("תשובה שמורה")).toBeTruthy();
    fireEvent.click(screen.getByTestId("owner-assistant-new-chat"));
    expect(screen.queryByText("תשובה שמורה")).toBeNull();
    expect(localStorage.getItem("mehamakor:owner-assistant:7")).toBeNull();
  });

  it("another user signing in on the same screen does not see or inherit the chat", async () => {
    api.post.mockResolvedValue({ data: { reply: "תשובה של 7" } });
    const view = renderIt();
    openPanel();
    ask("שאלה של 7");
    await screen.findByText("תשובה של 7");
    authUser = { id: 8, role: "producer", producer_id: 4 };
    view.rerender(
      <NextIntlClientProvider locale="he" messages={he}>
        <OwnerAssistant />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(screen.queryByText("תשובה של 7")).toBeNull());
    expect(localStorage.getItem("mehamakor:owner-assistant:8")).toBeNull();
  });

  it("an answer that arrives after «שיחה חדשה» is dropped", async () => {
    let answer;
    api.post.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    renderIt();
    openPanel();
    ask("שאלה ישנה");
    fireEvent.click(screen.getByTestId("owner-assistant-new-chat"));
    answer({ data: { reply: "תשובה ישנה" } });
    await waitFor(() => expect(screen.queryByTestId("owner-assistant-typing")).toBeNull());
    expect(screen.queryByText("תשובה ישנה")).toBeNull();
  });

  it("a card is still there after the panel is closed and opened again", async () => {
    api.post.mockResolvedValue({ data: { reply: "כאן שולחים", action: "send_for_review" } });
    api.get.mockResolvedValue({ data: { ...PROFILE, status: "draft" } });
    renderIt();
    openPanel();
    ask("לשלוח לבדיקה");
    await screen.findByTestId("draft-submit-banner");
    fireEvent.click(screen.getByTestId("owner-assistant-open")); // close
    openPanel();
    expect(await screen.findByTestId("draft-submit-banner")).toBeTruthy();
  });

  it("a failed page read keeps the answer", async () => {
    api.post.mockResolvedValue({ data: { reply: "כאן שולחים", action: "send_for_review" } });
    api.get.mockRejectedValue(new Error("down"));
    renderIt();
    openPanel();
    ask("לשלוח לבדיקה");
    expect(await screen.findByText("כאן שולחים")).toBeTruthy();
    expect(screen.queryByText(A.error_generic)).toBeNull();
  });
});

describe("OwnerAssistantNudge", () => {
  const draft = (extra) => contractRow(GetMyProducerProducersMeGetResponse, { status: "draft", images: [], products: [], categories: [], ...extra });

  it("none for a business that is not a draft", () => {
    renderIt(<OwnerAssistantNudge producer={{ ...draft(), status: "approved" }} />);
    expect(screen.queryByTestId("owner-assistant-nudge")).toBeNull();
  });

  it("a draft with items left: says how many and opens the assistant on the next step", async () => {
    api.post.mockResolvedValue({ data: { reply: "קודם תמונה" } });
    renderIt(<OwnerAssistantNudge producer={draft()} />);
    const nudge = screen.getByTestId("owner-assistant-nudge");
    expect(nudge.textContent).toMatch(/\d/);
    fireEvent.click(screen.getByText(A.nudge.cta));
    await screen.findByText("קודם תמונה");
    expect(api.post.mock.calls[0][1].messages).toEqual([{ role: "user", content: A.prompts.next_step }]);
  });
});

