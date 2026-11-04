import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

// ChatWidget renders on every viewport (MEH-2499; it was desktop-only under
// MEH-1410, 21/07–28/10). The mobile block below pins the launcher, which stays
// put through scrolling (4/11; MEH-2499 hid it on scroll-down); desktop pins the pill/aria states.
// The widget imports `@/lib/api`; stub it so these render-only tests stay
// offline and deterministic.
//
// MEH-1617 — the widget's copy moved to the `chat.*` namespace, so it now
// needs a real NextIntlClientProvider (same harness as the EditTab* cards).
// The Hebrew assertions below are unchanged: the values in he.json are the
// same strings that used to be hardcoded, which is the point of a move.
// MEH-1981: the surface now renders CollectionNotice, whose privacy link is
// the next-intl Link — stubbed like the register/EventForm suites do, so the
// key-echo next-intl mock above/below does not drag next/navigation in.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import api from "@/lib/api";
import ChatWidget from "@/components/ChatWidget";

// MEH-2308: the launcher's accessible name is the visible pill text on a first
// desktop visit and the aria-label once it is icon-only (WCAG 2.5.3). Tests that
// only need "the launcher" match either; the MEH-2308 block below pins each state.
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const launcherName = (m) =>
  new RegExp(`^(${reEsc(m.chat.launcher_open_label)}|${reEsc(m.chat.launcher_pill)})$`);

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

// MEH-2499 — reverses MEH-1410: the launcher is back on mobile (< 768px) as an
// icon-only circle above the BottomNav pill. It hid on scroll-down until 4/11;
// it now stays put (see "stays visible" below).
// DISCRIMINATION: on the MEH-1410 code the first case reds (empty DOM), and
// the scroll cases red because there is no launcher to query at all.
function setScrollY(y) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
  window.dispatchEvent(new Event("scroll"));
}

describe("ChatWidget on mobile (MEH-2499, was desktop-only MEH-1410)", () => {
  // rAF runs synchronously so each scroll event settles before the assertion.
  const realRaf = window.requestAnimationFrame;
  beforeEach(() => {
    window.requestAnimationFrame = (cb) => { cb(0); return 0; };
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
    localStorage.setItem("chatWasOpened", "true");
  });
  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    localStorage.removeItem("chatWasOpened");
  });

  it("renders the icon-only launcher on mobile (< 768px), even on a first visit", () => {
    // First visit: on desktop this state shows the pill text, so its absence
    // here is evidence of the mobile branch, not of chatWasOpened.
    localStorage.removeItem("chatWasOpened");
    mockMatchMedia(false);
    renderWidget();
    const btn = screen.getByRole("button", { name: he.chat.launcher_open_label });
    expect(btn).toBeInTheDocument();
    // Mobile is always icon-only — no pill text.
    expect(screen.queryByText(he.chat.launcher_pill)).not.toBeInTheDocument();
  });

  // MEH-2512: form pages pass hideOnMobile — nothing on a phone, desktop keeps it.
  it("renders nothing on mobile when hideOnMobile is set (form pages)", () => {
    mockMatchMedia(false);
    const { container } = render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ChatWidget hideOnMobile />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("still renders on desktop when hideOnMobile is set", () => {
    mockMatchMedia(true);
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ChatWidget hideOnMobile />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("chat-launcher")).toBeInTheDocument();
  });

  // Sapir 4/11: the launcher stays put on phones. The MEH-2499 hide-on-scroll
  // read as a button that "does not stay in place" — it is now always shown.
  const expectShown = (btn) => {
    expect(btn).not.toHaveAttribute("aria-hidden");
    expect(btn).not.toHaveAttribute("tabindex");
    expect(btn.style.opacity).not.toBe("0");
    expect(btn.style.pointerEvents).not.toBe("none");
  };

  it.each([
    ["mobile", false],
    ["desktop", true],
  ])("%s: stays visible through a scroll down and back up", (_label, desktop) => {
    mockMatchMedia(desktop);
    renderWidget();
    const btn = () => screen.getByTestId("chat-launcher");
    expectShown(btn());
    act(() => setScrollY(400));
    expectShown(btn());
    act(() => setScrollY(900));
    expectShown(btn());
    act(() => setScrollY(250));
    expectShown(btn());
  });

  it("stays visible while the panel is open and after it closes", () => {
    mockMatchMedia(false);
    renderWidget();
    const btn = () => screen.getByTestId("chat-launcher");
    fireEvent.click(btn());
    act(() => setScrollY(400));
    expectShown(btn());
    fireEvent.click(btn());
    expectShown(btn());
  });

  it("renders the launcher FAB on desktop (>= 768px)", () => {
    mockMatchMedia(true);
    renderWidget();
    expect(screen.getByRole("button", { name: launcherName(he) })).toBeInTheDocument();
  });
});

describe("ChatWidget copy lock (MEH-1617)", () => {
  // The assertions above read their expected text from he.json, which keeps
  // them alive across a key rename but makes them blind to a copy CHANGE. This
  // is the one place that pins the literal, because "the copy does not change"
  // is the whole claim of the MEH-1617 move: these are the exact strings that
  // were hardcoded in ChatWidget.jsx before it. Changing the Hebrew copy is a
  // product decision and should red this test, not slip through an i18n edit.
  it("keeps the pre-move Hebrew copy byte-for-byte", () => {
    expect(he.chat.launcher_open_label).toBe("שאלו אותנו");
    expect(he.chat.launcher_pill).toBe("שאלה? שאלו אותי");
    expect(he.chat.input_placeholder).toBe("הקלידו שאלה...");
    expect(he.chat.prompts.register).toBe("איך נרשמים כבית עסק?");
    // MEH-2100: the answer is ONE line now (the register flow gained a step,
    // and the copy was rewritten as a single sentence), so the embedded-newline
    // assertion no longer applies. The half that still matters is kept: a
    // LITERAL backslash-n must never appear — that was the actual
    // escape-decoding bug this move shipped and then fixed, and it is
    // orthogonal to how many lines the string has.
    expect(he.chat.answers.register).not.toContain("\\n");
  });
});

describe("ChatWidget i18n (MEH-1617)", () => {
  it("renders in English under the en locale", () => {
    mockMatchMedia(true);
    renderWidget("en");
    // The launcher label resolves from en.json, not the old hardcoded Hebrew.
    expect(screen.getByRole("button", { name: launcherName(en) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: launcherName(he) })).not.toBeInTheDocument();
  });

  it.each([
    ["he", launcherName(he), he.chat.prompts.register, he.chat.answers.register],
    ["en", launcherName(en), en.chat.prompts.register, en.chat.answers.register],
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

      fireEvent.click(screen.getByRole("button", { name: launcherLabel }));
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

// MEH-2308 — WCAG 2.5.3 Label in Name (axe 4.14 label-content-name-mismatch).
// DISCRIMINATION: before the fix the pill state carried aria-label «שאלו אותנו»
// over visible text «שאלה? שאלו אותי», so the first case fails on both of its
// assertions. The second case passes before and after — it is the control that
// stops "drop the aria-label everywhere" from satisfying the block.
describe("ChatWidget launcher — the accessible name contains the visible text (MEH-2308)", () => {
  it("with the pill text showing, the pill text IS the name — no aria-label over it", () => {
    localStorage.removeItem("chatWasOpened");
    mockMatchMedia(true);
    renderWidget();
    const btn = screen.getByRole("button", { name: he.chat.launcher_pill });
    expect(btn).not.toHaveAttribute("aria-label");
  });

  it("icon-only (after first use) keeps its aria-label — there is no visible text to contradict", () => {
    localStorage.setItem("chatWasOpened", "true");
    try {
      mockMatchMedia(true);
      renderWidget();
      expect(screen.getByRole("button", { name: he.chat.launcher_open_label })).toHaveAttribute(
        "aria-label",
        he.chat.launcher_open_label,
      );
    } finally {
      localStorage.removeItem("chatWasOpened");
    }
  });
});
