/**
 * MEH-1981 — the five approved notice-at-collection lines, rendered verbatim.
 *
 * CollectionNotice.test.jsx guards the MECHANISM and deliberately pins no copy,
 * because none was approved when it landed (#3255). On 02/09 Sapir approved
 * the five lines verbatim (rule 22 — the approval block is on the MEH-1981
 * card), so THIS file pins them: the exact string, on the exact surface, with
 * the exact link label the registration pages already use.
 *
 * Why the literal Hebrew is in the test and not read from he.json: reading the
 * expectation from the same file that provides the value cannot detect a copy
 * change (the ChatWidget copy-lock test makes the same argument). Changing one
 * of these strings is a rule-22 decision and must red this test, not slip
 * through an i18n edit.
 *
 * The surface assertions use the REAL NextIntlClientProvider + he.json, not a
 * key-echo mock: with `onError` muted, a missing key renders as its key path,
 * which the verbatim assertion rejects — so a green here has one cause.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
    put: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/use-focus-return", () => ({ useFocusReturn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "producer" }, loading: false }),
}));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));
// MEH-1981 residual: Footer renders next/image + the experiences nav gate
// (GET /experiences/count — the never-settling api.get above keeps it closed).
vi.mock("next/image", () => ({
  default: (props) => <img alt={props.alt ?? ""} {...props} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import ChatWidget from "@/components/ChatWidget";
import CategoryRequestModal from "@/components/CategoryRequestModal";
import ExperienceForm from "@/components/ExperienceForm";
import EventForm from "@/components/EventForm";
import ForgotPasswordClient from "@/app/[locale]/forgot-password/ForgotPasswordClient";
import Footer from "@/components/Footer";
import ContactClient from "@/app/[locale]/contact/ContactClient";

// The five lines, byte-for-byte as approved on the MEH-1981 card (02/09) —
// plus the two residual surfaces (footer newsletter, contact form), whose lines
// are derived from the five: `newsletter` mirrors `password_reset`,
// `contact` mirrors `category_request`. Sapir can change a word; that is a
// one-string edit in he.json AND here (this file pins copy on purpose).
const APPROVED = {
  chat: "מה שנכתב כאן נשלח ל-Anthropic כדי לנסח את התשובה.",
  password_reset: "האימייל משמש לשליחת קישור האיפוס בלבד.",
  experience: "מה שנשלח כאן מיועד לפרסום באתר, אחרי בדיקה.",
  event: "מה שנשלח כאן מיועד לפרסום באתר, אחרי בדיקה.",
  category_request: "הבקשה נשלחת אלינו לעיון ואינה מתפרסמת באתר.",
  newsletter: "האימייל משמש לשליחת העדכונים בלבד.",
  contact: "ההודעה נשלחת אלינו כדי לחזור אלייך, ואינה מתפרסמת באתר.",
};
// The link label is a REUSE of the registration pages' string, per the card —
// one privacy-link label site-wide, not a sixth approved string.
const LINK_LABEL = "למדיניות הפרטיות";

function renderHe(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

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

/** The shared assertion: verbatim line + the reused link label + /privacy. */
function expectNotice(testId, expectedLine) {
  const el = screen.getByTestId(testId);
  expect(el.textContent).toContain(expectedLine);
  expect(el.textContent).toContain(LINK_LABEL);
  const link = screen.getByTestId(`${testId}-link`);
  // Exact "/privacy" holds only because @/i18n/navigation's Link is mocked
  // above to pass a string href through verbatim; the real next-intl Link
  // would render the locale-prefixed "/he/privacy". The mock is the contract
  // this assertion depends on — if it goes, use toMatch(/\/privacy$/).
  expect(link.getAttribute("href")).toBe("/privacy");
  expect(link.textContent).toBe(LINK_LABEL);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MEH-1981 — the approved lines live in the message files", () => {
  it("he.json carries exactly these keys, each byte-for-byte as approved", () => {
    const block = he.privacy.collection_notice;
    expect(Object.keys(block).sort()).toEqual(Object.keys(APPROVED).sort());
    for (const [key, line] of Object.entries(APPROVED)) {
      expect(block[key], key).toBe(line);
    }
  });

  it("en.json carries a twin for every key — a translation, not Hebrew and not empty (MEH-978)", () => {
    const block = en.privacy.collection_notice;
    expect(Object.keys(block).sort()).toEqual(Object.keys(APPROVED).sort());
    for (const key of Object.keys(APPROVED)) {
      expect(typeof block[key]).toBe("string");
      expect(block[key].trim().length).toBeGreaterThan(0);
      expect(block[key]).not.toMatch(/[א-ת]/);
    }
    // The one name that must survive translation untouched: Anthropic is the
    // "to whom" of §11 and is named on the chat line in both locales.
    expect(block.chat).toContain("Anthropic");
  });

  it("the link label is the registration pages' existing string, reused", () => {
    expect(he.auth.register.consumer.terms.privacy_link).toBe(LINK_LABEL);
  });
});

describe("MEH-1981 — each of the five surfaces renders its line verbatim", () => {
  it("ChatWidget names Anthropic on the line itself, under the composer", () => {
    mockMatchMedia(true);
    renderHe(<ChatWidget />);
    fireEvent.click(screen.getByLabelText(he.chat.launcher_open_label));
    expectNotice("chat-collection-notice", APPROVED.chat);
  });

  it("ForgotPasswordClient states the one purpose of the email field", () => {
    renderHe(<ForgotPasswordClient />);
    expectNotice("forgot-collection-notice", APPROVED.password_reset);
  });

  it("ExperienceForm says the content is for publication, after review", () => {
    renderHe(<ExperienceForm />);
    expectNotice("experience-collection-notice", APPROVED.experience);
  });

  it("EventForm says the content is for publication, after review", () => {
    renderHe(<EventForm />);
    expectNotice("event-collection-notice", APPROVED.event);
  });

  it("CategoryRequestModal says the request is reviewed and not published", () => {
    renderHe(<CategoryRequestModal open onClose={() => {}} />);
    expectNotice("category-request-collection-notice", APPROVED.category_request);
  });
});

describe("MEH-1981 residual — the last two audited collection points", () => {
  it("Footer newsletter states the one purpose of the email, directly under the field, in the on-dark inks", () => {
    renderHe(<Footer />);
    expectNotice("newsletter-collection-notice", APPROVED.newsletter);

    // Placement: the notice is a sibling that follows the newsletter <form>
    // inside the #newsletter column — under the input/button row, not in the
    // copyright bar and not in another column.
    const notice = screen.getByTestId("newsletter-collection-notice");
    const column = document.getElementById("newsletter");
    expect(column.contains(notice)).toBe(true);
    expect(notice.previousElementSibling.tagName).toBe("FORM");

    // Legibility on bg-primary-dark: the default primary-green link would be
    // #2e6853 on #2e4a2e. The on-dark tone must be in effect on BOTH the line
    // and the link, and the resting underline must survive the tone swap.
    expect(notice.className.split(/\s+/)).toContain("text-green-100");
    const link = screen.getByTestId("newsletter-collection-notice-link");
    const linkClasses = link.className.split(/\s+/);
    expect(linkClasses).toContain("text-green-50");
    expect(linkClasses).toContain("underline");
    expect(linkClasses).not.toContain("text-primary");
  });

  it("ContactClient states purpose + recipient under the message field, and keeps the consent line", () => {
    renderHe(<ContactClient />);
    expectNotice("contact-collection-notice", APPROVED.contact);

    // Placement: right after the message field's wrapper, before the submit.
    const notice = screen.getByTestId("contact-collection-notice");
    const textarea = document.getElementById("contact-message");
    expect(notice.previousElementSibling.contains(textarea)).toBe(true);

    // The pre-existing consent line is NOT replaced by the purpose line: both
    // /privacy links render — the notice's and the consent line's.
    const privacyLinks = document.querySelectorAll('a[href="/privacy"]');
    expect(privacyLinks.length).toBe(2);
    const consentText = he.contact.privacy_notice.replace(/<\/?link>/g, "");
    expect(document.body.textContent).toContain(consentText);
  });
});
