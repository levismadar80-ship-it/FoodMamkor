/**
 * MEH-2155 — the dashboard questions card stops contradicting the page.
 *
 * The card was titled "שאלות שמופיעות בדף שלך" and rendered
 * "עוד אין שאלות מותאמות" over a public page that was serving a full set of
 * category defaults. Both statements were literally true — one about the custom
 * field, one about the page — and together they told a new owner that her
 * profile showed no questions while it showed several.
 *
 * Mounts the FULL edit page (the EditUnsavedGuard harness, MEH-1100) rather
 * than the card in isolation, because two of the three things under test —
 * the accordion summary and the save button's enabled state — are produced by
 * the page around the card, not by the card alone.
 *
 * The parity between this live list and the public page's own render is a
 * different claim with a different owner: __tests__/ResolvedQuestionsParity.test.jsx.
 * This file only asserts that the card renders what the resolver returns, and
 * that nothing here writes to the inputs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditPage from "@/app/[locale]/producer/dashboard/edit/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
const authStub = { user: { id: 1, role: "producer" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authStub }));
const routerStub = { push: vi.fn(), replace: vi.fn() };
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => routerStub,
  usePathname: () => "/producer/dashboard/edit",
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
let params = {};
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

const Q = he.dashboard.producer.custom_questions;

/** whatsapp-primary with a phone and a category → the page serves defaults. */
const BASE = {
  id: 1,
  name: "מאפיית השקמה",
  city: "זכרון יעקב",
  images: [],
  categories: [{ name: "לחמים ואפייה" }],
  has_physical_location: false,
  delivery_nationwide: true,
  custom_questions: [],
  phone: "0501234567",
  instagram: "",
  website: "",
  contact_email: "",
  facebook: "",
  external_order_form: "",
  primary_contact_method: "whatsapp",
};

function mount(profile) {
  params.group = "contact";
  api.get.mockImplementation((url) =>
    url === "/producers/me" ? Promise.resolve({ data: profile }) : Promise.resolve({ data: [] }),
  );
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditPage />
    </NextIntlClientProvider>,
  );
}

async function openQuestionsCard() {
  await waitFor(() => expect(screen.getByPlaceholderText(Q.placeholder_1)).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("accordion-questions"));
}

beforeEach(() => {
  vi.clearAllMocks();
  params = {};
  api.put.mockResolvedValue({ data: {} });
});

describe("live list — what the page is actually showing", () => {
  it("lists the default questions, and does NOT say there are none", async () => {
    mount(BASE);
    await openQuestionsCard();

    const items = await screen.findAllByTestId("live-question-item");
    expect(items.length).toBeGreaterThan(0);
    // The stock question the category actually contributes (MEH-2154 Phase 0:
    // exactly one survives the Q1/Q2 de-duplication).
    expect(screen.getByTestId("live-questions-list").textContent).toContain(
      "אילו לחמים יש השבוע?",
    );
    // The empty state that used to lie is not rendered at all.
    expect(screen.queryByTestId("live-questions-empty")).not.toBeInTheDocument();
  });

  it("annotates a data-answered row and a channel row differently", async () => {
    mount(BASE);
    await openQuestionsCard();

    const list = await screen.findByTestId("live-questions-list");
    // Q1 is answered from her own delivery data…
    expect(list.textContent).toContain(Q.live_answered);
    // …and the WhatsApp rows name the channel they open.
    expect(list.textContent).toContain(Q.live_channel.whatsapp);
  });

  it("mirrors her custom questions once she has some, replacing the defaults", async () => {
    mount({ ...BASE, custom_questions: ["יש חלה לשבת?"] });
    await openQuestionsCard();

    const list = await screen.findByTestId("live-questions-list");
    expect(list.textContent).toContain("יש חלה לשבת?");
    expect(list.textContent).not.toContain("אילו לחמים יש השבוע?");
  });

  it("shows the honest empty state only when the page really shows nothing", async () => {
    // No phone, no channel field → nothing resolves, on the page or here.
    mount({ ...BASE, phone: "", delivery_nationwide: false, primary_contact_method: "email" });
    await openQuestionsCard();

    expect(await screen.findByTestId("live-questions-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("live-questions-list")).not.toBeInTheDocument();
  });

  it("is read-only — it adds no inputs and never seeds the five below", async () => {
    // The forbidden-by-design case. Pre-filling the defaults into the inputs
    // would look helpful and would FREEZE them: saved as custom_questions, the
    // answer-first delivery/ordering rows become dumb WhatsApp chips and stop
    // tracking the details she edits later.
    mount(BASE);
    await openQuestionsCard();
    await screen.findByTestId("live-questions-list");

    const inputs = [1, 2, 3, 4, 5].map((n) => screen.getByPlaceholderText(Q[`placeholder_${n}`]));
    expect(inputs).toHaveLength(5);
    for (const input of inputs) expect(input.value).toBe("");
    // and the live list contributed no editable control of its own
    expect(
      screen.getByTestId("live-questions-list").querySelectorAll("input,textarea,select"),
    ).toHaveLength(0);
  });

  it("links to the public page", async () => {
    mount(BASE);
    await openQuestionsCard();
    const link = await screen.findByTestId("view-on-page-questions");
    expect(link).toHaveAttribute("href", "/producer/1#section-contact");
  });
});

describe("accordion summary", () => {
  it("counts the LIVE defaults when she has written no custom questions", async () => {
    mount(BASE);
    await waitFor(() => expect(screen.getByTestId("accordion-questions")).toBeInTheDocument());
    const header = screen.getByTestId("accordion-questions").textContent;

    // The misleading empty-state string is gone from the header…
    expect(header).not.toContain("עוד אין שאלות מותאמות");
    // …replaced by a count of what the page shows. Asserted by its stable
    // prefix rather than a rebuilt ICU string, so this cannot pass by
    // re-deriving the same formatting the component used.
    expect(header).toContain("מוצגות");
    expect(header).toContain("שאלות ברירת מחדל");
  });

  it("counts her custom questions once she has some", async () => {
    mount({ ...BASE, custom_questions: ["יש חלה לשבת?", "אפשר להזמין לאירוע?"] });
    await waitFor(() => expect(screen.getByTestId("accordion-questions")).toBeInTheDocument());
    const header = screen.getByTestId("accordion-questions").textContent;
    expect(header).toContain("שתי שאלות מותאמות");
    expect(header).not.toContain("ברירת מחדל");
  });
});

describe("save button", () => {
  it("is disabled when all five inputs are blank and nothing is saved", async () => {
    mount(BASE);
    await openQuestionsCard();
    expect(screen.getByTestId("questions-save")).toBeDisabled();
  });

  it("enables as soon as one input has content", async () => {
    mount(BASE);
    await openQuestionsCard();
    fireEvent.change(screen.getByPlaceholderText(Q.placeholder_1), {
      target: { value: "מה כשר אצלכם?" },
    });
    expect(screen.getByTestId("questions-save")).toBeEnabled();
  });

  it("stays ENABLED on a blank form when questions ARE saved — clearing is a real intent", async () => {
    // The discriminating case for the disabled rule: "the form is empty" and
    // "there is nothing to do" are different states, and only the second may
    // disable the button. A rule written as `disabled={currentPayload.length
    // === 0}` would pass every test above and trap her with no way to clear.
    mount({ ...BASE, custom_questions: ["יש חלה לשבת?"] });
    await openQuestionsCard();
    fireEvent.change(screen.getByPlaceholderText(Q.placeholder_1), { target: { value: "" } });
    expect(screen.getByTestId("questions-save")).toBeEnabled();
  });
});
