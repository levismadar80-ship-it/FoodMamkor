/**
 * MEH-2207 — the questions card says out loud that custom questions only reach
 * the public page while WhatsApp is the primary contact channel.
 *
 * Since the question chips started following the declared channel, a
 * non-WhatsApp business renders none of its custom questions publicly. The
 * dashboard card said nothing about it, so an owner who wrote five questions
 * and later switched her primary channel to phone watched them disappear with
 * no explanation anywhere in the product.
 *
 * THE DISCRIMINATING CASE IS THE THIRD ONE, and it is the reason this file
 * mounts the whole edit page instead of the card alone. Cases 1 and 2 only
 * prove the notice is conditional — they pass equally against an implementation
 * that reads `profile.primary_contact_method`, i.e. the SAVED value. Case 3
 * changes the radio and never saves: it can only pass if the notice is wired to
 * the contact card's live form state, which is what the ticket asks for and the
 * moment the owner actually needs the warning. Without case 3 this suite is
 * green against the wrong implementation.
 *
 * The two cards are siblings under the same accordion group and
 * EditAccordionCard toggles its body with `hidden` rather than unmounting it
 * (EditAccordionCard.jsx:10, :198-200), so the contact card's unsaved radio
 * state stays alive while the questions card is on screen.
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
const NOTICE = "questions-channel-notice";

/** Every backing field filled, so no radio is disabled by the MEH-1093 guard. */
const BASE = {
  id: 1,
  name: "מאפיית השקמה",
  city: "זכרון יעקב",
  images: [],
  categories: [{ name: "לחמים ואפייה" }],
  has_physical_location: false,
  delivery_nationwide: true,
  custom_questions: ["יש חלה לשבת?"],
  phone: "0501234567",
  instagram: "shikma",
  website: "https://shikma.example.com",
  contact_email: "hi@shikma.example.com",
  facebook: "https://facebook.com/shikma",
  external_order_form: "https://order.shikma.example.com",
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

/** Waits for the page to hydrate, then opens the questions accordion. */
async function openQuestionsCard() {
  await waitFor(() => expect(screen.getByPlaceholderText(Q.placeholder_1)).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("accordion-questions"));
}

function pickChannel(container, method) {
  const radio = container.querySelector(
    `input[name="primary_contact_method"][value="${method}"]`,
  );
  expect(radio, `the ${method} radio must exist and be reachable`).not.toBeNull();
  expect(radio.disabled, `the ${method} radio must not be disabled in this fixture`).toBe(false);
  fireEvent.click(radio);
}

beforeEach(() => {
  vi.clearAllMocks();
  params = {};
  api.put.mockResolvedValue({ data: {} });
});

describe("MEH-2207 — custom-questions channel notice", () => {
  it("whatsapp-primary → the notice is NOT rendered", async () => {
    mount(BASE);
    await openQuestionsCard();

    // The card itself rendered — otherwise the absence below proves nothing.
    expect(screen.getByPlaceholderText(Q.placeholder_1)).toBeInTheDocument();
    expect(screen.queryByTestId(NOTICE)).not.toBeInTheDocument();
  });

  it("phone-primary → the notice is rendered, with the locked copy", async () => {
    mount({ ...BASE, primary_contact_method: "phone" });
    await openQuestionsCard();

    const notice = screen.getByTestId(NOTICE);
    expect(notice).toBeInTheDocument();
    // Reads the shipped string, so the assertion moves if the copy moves.
    expect(notice).toHaveTextContent(Q.channel_notice);
    // MEH-1116 helper-text idiom, same as the guidance line above it.
    expect(notice.className).toContain("text-xs");
    expect(notice.className).toContain("text-fg-muted");
  });

  it("switching the channel in the form toggles the notice WITHOUT saving", async () => {
    const { container } = mount(BASE);
    await openQuestionsCard();

    // Starts hidden: the saved value is whatsapp.
    expect(screen.queryByTestId(NOTICE)).not.toBeInTheDocument();

    // Pick phone in the contact card and DO NOT save.
    pickChannel(container, "phone");
    await waitFor(() => expect(screen.getByTestId(NOTICE)).toBeInTheDocument());

    // Nothing was persisted — this is the whole point of the case.
    expect(api.put).not.toHaveBeenCalled();

    // …and back again, so the notice is genuinely following the value and not
    // just latching on the first change.
    pickChannel(container, "whatsapp");
    await waitFor(() => expect(screen.queryByTestId(NOTICE)).not.toBeInTheDocument());
    expect(api.put).not.toHaveBeenCalled();
  });
});
