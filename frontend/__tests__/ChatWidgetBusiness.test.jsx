import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
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

import ChatWidget from "@/components/ChatWidget";
import BusinessChatPrompt from "@/app/[locale]/producer/[id]/components/BusinessChatPrompt";
import { PreviewModeProvider } from "@/lib/preview-mode";

const B = he.chat.business;
const PRODUCER = { id: "11111111-2222-3333-4444-555555555555", name: "מאפיית הדגמה", status: "approved" };

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
    expect(screen.getByTestId("business-chat-prompt")).toHaveTextContent(B.page_lead);
    expect(screen.queryByTestId("chat-launcher")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens scoped to the business: title, opening line, three business questions", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("business-chat-open"));
    const dialog = screen.getByRole("dialog");
    expect(screen.queryByTestId("chat-launcher")).not.toBeInTheDocument(); // the X lives in the panel
    expect(dialog).toHaveTextContent(B.panel_title.replace("{name}", PRODUCER.name));
    expect(dialog).toHaveTextContent(B.opening.replace("{name}", PRODUCER.name));
    for (const q of Object.values(B.prompts)) expect(screen.getByRole("button", { name: q })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: he.chat.prompts.register })).not.toBeInTheDocument();
  });

  it("sends the question with producer_id and without the opening line", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("business-chat-open"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: B.prompts.delivery }));
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
