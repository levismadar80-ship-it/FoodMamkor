import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

/**
 * MEH-3489 — the chat on a business page. businessOnly: no launcher; the
 * page's button (BusinessChatPrompt → openBusinessChat) opens the panel for
 * that business, and the question carries producer_id.
 */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { post } }));
const { trackPrimaryCtaClick } = vi.hoisted(() => ({ trackPrimaryCtaClick: vi.fn() }));
vi.mock("@/lib/contact-tracking", () => ({ trackPrimaryCtaClick }));

import ChatWidget from "@/components/ChatWidget";
import BusinessChatPrompt from "@/app/[locale]/producer/[id]/components/BusinessChatPrompt";
import { PreviewModeProvider } from "@/lib/preview-mode";

const B = he.chat.business;
// MEH-3505: the page's data decides the questions — this one has a vegan
// product, delivery and hours, and no featured product.
const PRODUCER = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "מאפיית הדגמה",
  status: "approved",
  offers_delivery: true,
  delivery_nationwide: true,
  opening_hours: "א׳-ה׳ 08:00-14:00",
  products: [{ id: "p1", name: "חלה", is_vegan: true }],
};

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

function renderPage(props = { businessOnly: true }) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <BusinessChatPrompt producer={PRODUCER} />
      <ChatWidget {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { reply: "תשובה" } });
  localStorage.setItem("chatWasOpened", "true");
});
afterEach(cleanup);

describe.each([["desktop", true], ["phone", false]])("business page chat (%s)", (_label, desktop) => {
  beforeEach(() => mockMatchMedia(desktop));

  it("shows no floating launcher and no panel until the page's button is tapped", () => {
    renderPage();
    expect(screen.getByTestId("business-chat-prompt")).toHaveTextContent(B.page_title.replace("{name}", PRODUCER.name));
    // Sapir 20/11 «האם יבינו שזה עוזרת»: the card says in words it is an AI.
    expect(screen.getByTestId("business-chat-ai-note")).toHaveTextContent(B.page_ai_note);
    expect(B.page_ai_note).toContain("AI");
    expect(screen.queryByTestId("chat-launcher")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens scoped to the business: title, opening line, the questions its page can answer", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("business-chat-open"));
    const dialog = screen.getByRole("dialog");
    expect(screen.queryByTestId("chat-launcher")).not.toBeInTheDocument(); // the X lives in the panel
    expect(dialog).toHaveTextContent(B.panel_title.replace("{name}", PRODUCER.name));
    expect(dialog).toHaveTextContent(B.opening.replace("{name}", PRODUCER.name));
    for (const q of [B.prompts.diet_vegan, B.prompts.delivery, B.prompts.hours]) {
      expect(within(dialog).getByRole("button", { name: q })).toBeInTheDocument();
    }
    // MEH-3505: no gluten-free product on this page → no gluten question.
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: B.prompts.diet_gluten_free })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: he.chat.prompts.register })).not.toBeInTheDocument();
  });

  it("sends the question with producer_id and without the opening line", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("business-chat-open"));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: B.prompts.delivery }));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/chat", {
      messages: [{ role: "user", content: B.prompts.delivery }],
      producer_id: PRODUCER.id,
    });
  });

  it("closing the panel leaves no launcher behind and returns focus to the page's button", () => {
    renderPage();
    const trigger = screen.getByTestId("business-chat-open");
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: B.panel_title.replace("{name}", PRODUCER.name) })).toBeInTheDocument();
    screen.getByLabelText(he.chat.input_label).focus(); // focus is inside the panel now
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.click(screen.getByRole("button", { name: he.chat.panel_close_label }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-launcher")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("a tap before the lazy widget has mounted still opens it", () => {
    const withIntl = (ui) => <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>{ui}</NextIntlClientProvider>;
    const { rerender } = render(withIntl(<BusinessChatPrompt producer={PRODUCER} />));
    fireEvent.click(screen.getByTestId("business-chat-open"));
    rerender(withIntl(<><BusinessChatPrompt producer={PRODUCER} /><ChatWidget businessOnly /></>));
    expect(screen.getByRole("dialog")).toHaveTextContent(B.opening.replace("{name}", PRODUCER.name));
  });
});

describe("MEH-3505: the questions differ per business", () => {
  beforeEach(() => mockMatchMedia(false));
  const withIntl = (ui) => <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>{ui}</NextIntlClientProvider>;

  it("a page with nothing to answer from opens with no suggested questions, and typing still works", async () => {
    const bare = { id: PRODUCER.id, name: PRODUCER.name, status: "approved" };
    render(withIntl(<><BusinessChatPrompt producer={bare} /><ChatWidget businessOnly /></>));
    fireEvent.click(screen.getByTestId("business-chat-open"));
    // Only the panel's own controls remain: close + send, no suggested chip.
    const names = within(screen.getByRole("dialog")).getAllByRole("button").map((b) => b.getAttribute("aria-label") || b.textContent);
    expect(names.sort()).toEqual([he.chat.panel_close_label, he.chat.send_label].sort());
    fireEvent.change(screen.getByLabelText(he.chat.input_label), { target: { value: "יש חניה?" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: he.chat.send_label }));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1].producer_id).toBe(PRODUCER.id);
  });

  it("reopening the same business shows the page's current questions", () => {
    const { rerender } = render(withIntl(<><BusinessChatPrompt producer={PRODUCER} /><ChatWidget businessOnly /></>));
    fireEvent.click(screen.getByTestId("business-chat-open"));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: B.prompts.hours })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: he.chat.panel_close_label }));
    rerender(withIntl(<><BusinessChatPrompt producer={{ ...PRODUCER, opening_hours: null }} /><ChatWidget businessOnly /></>));
    fireEvent.click(screen.getByTestId("business-chat-open"));
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: B.prompts.hours })).not.toBeInTheDocument();
  });

  it("the featured product is named in its question", () => {
    const cake = { id: "p2", name: "עוגת שמרים", ingredients: "קמח, חמאה" };
    render(withIntl(<><BusinessChatPrompt producer={{ ...PRODUCER, products: [cake] }} signatureProduct={cake} /><ChatWidget businessOnly /></>));
    fireEvent.click(screen.getByTestId("business-chat-open"));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: B.prompts.signature.replace("{product}", "עוגת שמרים") })).toBeInTheDocument();
  });
});

describe("MEH-3505: the business's questions on the page itself", () => {
  beforeEach(() => mockMatchMedia(false));

  it("shows the page's own questions, no generic lead, and «שאלה אחרת»", () => {
    renderPage();
    const section = screen.getByTestId("business-chat-prompt");
    for (const q of [B.prompts.diet_vegan, B.prompts.delivery, B.prompts.hours]) {
      expect(within(section).getByRole("button", { name: q })).toBeInTheDocument();
    }
    expect(within(section).getByTestId("business-chat-open")).toHaveTextContent(B.page_other);
  });

  it("tapping a question on the page opens the panel and sends it with producer_id", async () => {
    renderPage();
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("business-chat-prompt")).getByRole("button", { name: B.prompts.delivery }));
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/chat", {
      messages: [{ role: "user", content: B.prompts.delivery }],
      producer_id: PRODUCER.id,
    });
  });

  it("a page with one question shows that question and «שאלה אחרת», two buttons", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <BusinessChatPrompt producer={{ ...PRODUCER, products: [], opening_hours: null }} />
      </NextIntlClientProvider>,
    );
    const section = screen.getByTestId("business-chat-prompt");
    expect(within(section).getAllByRole("button").map((b) => b.textContent)).toEqual([B.prompts.delivery, B.page_other]);
  });

  it("«שאלה אחרת» opens the panel and sends nothing", async () => {
    renderPage();
    await act(async () => { fireEvent.click(screen.getByTestId("business-chat-open")); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("a question tapped while the last reply is still on its way is sent when it lands", async () => {
    let answer;
    post.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    renderPage();
    const page = () => within(screen.getByTestId("business-chat-prompt"));
    await act(async () => { fireEvent.click(page().getByRole("button", { name: B.prompts.hours })); });
    fireEvent.click(screen.getByRole("button", { name: he.chat.panel_close_label }));
    await act(async () => { fireEvent.click(page().getByRole("button", { name: B.prompts.delivery })); });
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => { answer({ data: { reply: "תשובה ראשונה" } }); });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1].messages.at(-1)).toEqual({ role: "user", content: B.prompts.delivery });
  });

  it("a page with no questions keeps one button, the question field", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <BusinessChatPrompt producer={{ id: PRODUCER.id, name: PRODUCER.name, status: "approved" }} />
      </NextIntlClientProvider>,
    );
    const section = screen.getByTestId("business-chat-prompt");
    expect(within(section).queryByTestId("business-chat-questions")).not.toBeInTheDocument();
    expect(within(section).getAllByRole("button")).toHaveLength(1);
    expect(within(section).getByTestId("business-chat-open")).toHaveTextContent(B.page_other);
  });
});

it("the site chat (not businessOnly) still sends no producer_id", async () => {
  mockMatchMedia(true);
  renderPage({});
  fireEvent.click(screen.getByTestId("chat-launcher"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: he.chat.prompts.what_is }));
  });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0][1]).not.toHaveProperty("producer_id");
});

describe("where the page's button is not shown", () => {
  const withIntl = (ui) => <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>{ui}</NextIntlClientProvider>;

  it.each(["pending", "rejected", undefined])("a page whose status is %s (not live)", (status) => {
    render(withIntl(<BusinessChatPrompt producer={{ ...PRODUCER, status }} />));
    expect(screen.queryByTestId("business-chat-prompt")).not.toBeInTheDocument();
  });

  it("the owner's preview (draft link, dashboard)", () => {
    render(withIntl(<PreviewModeProvider><BusinessChatPrompt producer={PRODUCER} /></PreviewModeProvider>));
    expect(screen.queryByTestId("business-chat-prompt")).not.toBeInTheDocument();
  });
});

describe("MEH-3513: after an answer — follow-ups and «ask the business»", () => {
  beforeEach(() => { mockMatchMedia(true); trackPrimaryCtaClick.mockReset(); });

  async function askFromPage(producer, label) {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <BusinessChatPrompt producer={producer} />
        <ChatWidget businessOnly />
      </NextIntlClientProvider>,
    );
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("business-chat-prompt")).getByRole("button", { name: label }));
    });
    await waitFor(() => expect(screen.getByText("תשובה")).toBeInTheDocument());
    return within(screen.getByRole("dialog"));
  }

  it("shows only the questions not yet asked, and a WhatsApp link carrying the question", async () => {
    const producer = { ...PRODUCER, phone: "050-1234567" };
    const dialog = await askFromPage(producer, B.prompts.delivery);
    const after = within(dialog.getByTestId("business-chat-after-answer"));
    expect(after.queryByRole("button", { name: B.prompts.delivery })).not.toBeInTheDocument();
    expect(after.getByRole("button", { name: B.prompts.hours })).toBeInTheDocument();
    expect(after.getByRole("button", { name: B.prompts.diet_vegan })).toBeInTheDocument();
    const link = after.getByTestId("business-chat-handoff");
    expect(link).toHaveTextContent(B.ask_business.replace("{name}", producer.name));
    const text = decodeURIComponent(new URL(link.getAttribute("href")).searchParams.get("text"));
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/972501234567\?/);
    expect(text.startsWith(`שלום ${producer.name}, ${B.prompts.delivery}`)).toBe(true);
    expect(text.endsWith(he.whatsapp.question_chips.source_line)).toBe(true);
    fireEvent.click(link);
    expect(trackPrimaryCtaClick).toHaveBeenCalledWith(producer.id, "whatsapp");
  });

  it("a follow-up tap sends it with producer_id, hides the block while waiting, then drops it from the list", async () => {
    const producer = { ...PRODUCER, phone: "050-1234567" };
    const dialog = await askFromPage(producer, B.prompts.delivery);
    let answer;
    post.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    await act(async () => {
      fireEvent.click(within(dialog.getByTestId("business-chat-after-answer")).getByRole("button", { name: B.prompts.hours }));
    });
    expect(post).toHaveBeenCalledTimes(2);
    const sent = post.mock.calls[1][1];
    expect(sent.producer_id).toBe(producer.id);
    expect(sent.messages.at(-1)).toEqual({ role: "user", content: B.prompts.hours });
    expect(dialog.queryByTestId("business-chat-after-answer")).not.toBeInTheDocument();
    await act(async () => { answer({ data: { reply: "תשובה שנייה" } }); });
    const after = within(dialog.getByTestId("business-chat-after-answer"));
    expect(after.queryByRole("button", { name: B.prompts.hours })).not.toBeInTheDocument();
    expect(after.getAllByRole("button").map((b) => b.textContent)).toEqual([B.prompts.diet_vegan]);
  });

  it("one question left and no contact channel: that question and no link", async () => {
    const producer = { ...PRODUCER, products: [] };
    const dialog = await askFromPage(producer, B.prompts.delivery);
    const after = within(dialog.getByTestId("business-chat-after-answer"));
    expect(after.getAllByRole("button").map((b) => b.textContent)).toEqual([B.prompts.hours]);
    expect(after.queryByTestId("business-chat-handoff")).not.toBeInTheDocument();
  });

  it("every question asked: only the link stays", async () => {
    const producer = { ...PRODUCER, phone: "050-1234567", products: [], opening_hours: null };
    const dialog = await askFromPage(producer, B.prompts.delivery);
    const after = within(dialog.getByTestId("business-chat-after-answer"));
    expect(after.queryAllByRole("button")).toHaveLength(0);
    expect(after.getByTestId("business-chat-handoff")).toBeInTheDocument();
  });

  it("a business with no contact channel and nothing left to ask shows nothing under the answer", async () => {
    const producer = { ...PRODUCER, products: [], opening_hours: null };
    const dialog = await askFromPage(producer, B.prompts.delivery);
    expect(dialog.queryByTestId("business-chat-after-answer")).not.toBeInTheDocument();
  });

  it("a non-WhatsApp channel links to the contact button's own href, without the question", async () => {
    const producer = { ...PRODUCER, primary_contact_method: "website", website: "example.com" };
    const dialog = await askFromPage(producer, B.prompts.delivery);
    const link = dialog.getByTestId("business-chat-handoff");
    expect(link).toHaveAttribute("href", "https://example.com");
    fireEvent.click(link);
    expect(trackPrimaryCtaClick).toHaveBeenCalledWith(producer.id, "website");
  });
});
