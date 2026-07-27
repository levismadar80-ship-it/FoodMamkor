import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

// MEH-1410 — ChatWidget is desktop-only (>= 768px). It gates its entire
// render on the `isDesktop` matchMedia state and returns null on mobile.
//  A) mobile (matchMedia "(min-width: 768px)" → false): renders nothing
//  B) desktop (matchMedia → true): renders the launcher FAB
// The widget imports `@/lib/api`; stub it so these render-only tests stay
// offline and deterministic.
//
// MEH-1617 — the widget's copy moved to the `chat.*` namespace, so it now
// needs a real NextIntlClientProvider (same harness as the EditTab* cards).
// The Hebrew assertions below are unchanged: the values in he.json are the
// same strings that used to be hardcoded, which is the point of a move.
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import api from "@/lib/api";
import ChatWidget from "@/components/ChatWidget";

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderWidget(locale = "he") {
  const messages = locale === "he" ? he : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={() => {}}>
      <ChatWidget />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatWidget desktop-only (MEH-1410)", () => {
  it("renders nothing on mobile (< 768px)", () => {
    mockMatchMedia(false);
    const { container } = renderWidget();
    expect(container).toBeEmptyDOMElement();
    // The launcher aria-label must not exist anywhere on mobile.
    expect(screen.queryByLabelText("שאלו אותנו")).not.toBeInTheDocument();
  });

  it("renders the launcher FAB on desktop (>= 768px)", () => {
    mockMatchMedia(true);
    renderWidget();
    // The effect flips isDesktop → true (flushed inside render's act()), so the
    // launcher button (aria-label "שאלו אותנו" while closed) is present.
    expect(screen.getByLabelText("שאלו אותנו")).toBeInTheDocument();
  });
});

describe("ChatWidget i18n (MEH-1617)", () => {
  it("renders in English under the en locale", () => {
    mockMatchMedia(true);
    renderWidget("en");
    // The launcher label resolves from en.json, not the old hardcoded Hebrew.
    expect(screen.getByLabelText("Ask us")).toBeInTheDocument();
    expect(screen.queryByLabelText("שאלו אותנו")).not.toBeInTheDocument();
  });

  it.each([
    ["he", "שאלו אותנו", he.chat.prompts.register, he.chat.answers.register],
    ["en", "Ask us", en.chat.prompts.register, en.chat.answers.register],
  ])(
    "answers a suggested prompt from the message file without an API call (%s)",
    (locale, launcherLabel, promptText, answerText) => {
      // The regression this locks: HARDCODED_ANSWERS used to be keyed by the
      // Hebrew question string and matched byte-for-byte. Once the prompts
      // became translation keys, that lookup would miss on /en — the click
      // would fall through to POST /chat, losing the instant answer and paying
      // for it. Keying on a locale-independent id is what keeps this green in
      // BOTH locales; a text-keyed lookup reds the en row.
      mockMatchMedia(true);
      renderWidget(locale);

      fireEvent.click(screen.getByLabelText(launcherLabel));
      fireEvent.click(screen.getByRole("button", { name: promptText }));

      // Asserted against the log region's raw textContent rather than
      // getByText: the answers carry embedded newlines (rendered via
      // whitespace-pre-line), and getByText's whitespace normalisation will
      // not match a multi-line string.
      expect(screen.getByRole("log").textContent).toContain(answerText);
      expect(api.post).not.toHaveBeenCalled();
    },
  );
});
