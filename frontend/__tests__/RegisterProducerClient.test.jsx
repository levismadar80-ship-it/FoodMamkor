import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RegisterProducerClient from "@/app/[locale]/register/producer/RegisterProducerClient";
import api from "@/lib/api";

// MEH-866: wizard coverage for the B/C/D wirings that shipped with zero tests —
// 5-frame nav (MEH-847), city/address payload (MEH-853), short_description
// tagline payload + char-count (MEH-860). Layer 1 of 2 (vitest, runs green
// locally). The rendered flow is covered by 18-producer-register-wizard.spec.ts
// (Playwright, verify-on-preview — MEH-360). NO overlap with MEH-830's
// CategorySelector.test.jsx (the selector is mocked here, not under test).

// next-intl: no scope is used by the component (useTranslations()), so t(key)
// returns the literal key path — assertions key off the i18n KEY, not copy.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

// The component reads useRouter + useSearchParams (Suspense-wrapped body).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Anonymous (non-upgrade) flow by default: user null, auth resolved.
// MEH-994: authState is a mutable ref so the pre-flight upgrade-variant test
// can flip `user` without a second mock module (reset in beforeEach).
const refreshUser = vi.fn();
const authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading, refreshUser }),
}));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

// CitySearch stub — emits a string via onChange (MEH-853 contract), so the test
// can set `city` without the real /cities fetch. Mirrors ModalFocusReturn:62.
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, id }) => (
    <input data-testid="city" id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

// CategorySelector stub — clicking selects id 1 (non-agricultural name below →
// no farmer declaration). Not under test (MEH-830 owns the real component).
vi.mock("@/components/CategorySelector", () => ({
  default: ({ onChange }) => (
    <button type="button" data-testid="pick-category" onClick={() => onChange(1)}>
      category
    </button>
  ),
}));

// OAuth widget has GSI side effects + is frozen — stub it out.
vi.mock("@/components/ProducerOAuthButtons", () => ({ default: () => <div data-testid="oauth" /> }));

const K = "auth.register.producer";
const ph = (key) => screen.getByPlaceholderText(`${K}.fields.${key}`);
const nextBtn = () => screen.getByText(`${K}.actions.next`);

beforeEach(() => {
  vi.clearAllMocks();
  // GET /categories — one license-neutral, non-agricultural category (no farmer
  // declaration, and not in LICENSE_REQUIRED_CATEGORIES) so the shared walk
  // reaches STORY without tripping the MEH-952 license gate. The license-required
  // path is exercised in its own describe block below with an overriding mock.
  api.get.mockResolvedValue({ data: [{ id: 1, name: "ביצים" }] });
  // Non-upgrade ack: no access_token in the response → CONFIRM (non-upgrade).
  api.post.mockResolvedValue({ data: {} });
  authState.user = null; // MEH-994: upgrade-variant test mutates this
  try { localStorage.clear(); } catch { /* jsdom */ }
});

// MEH-994: the wizard now opens on the pre-flight screen. Real click-through
// of "מתחילים" (not an auto-skip-under-test flag) so every walk exercises the
// production entry path before reaching frame 01.
async function renderWizard() {
  render(<RegisterProducerClient />);
  fireEvent.click(await screen.findByTestId("register-preflight-start"));
}

// Fill ACCOUNT and walk to a target frame. Returns once the target marker shows.
async function fillAccountToDetails() {
  fireEvent.change(ph("name"), { target: { value: "טסט" } });
  fireEvent.change(ph("email"), { target: { value: "t@example.com" } });
  fireEvent.change(ph("password"), { target: { value: "Abcdefgh1234" } }); // ≥12 (passwordValid)
  fireEvent.click(nextBtn());
  await screen.findByText(`${K}.steps.business.title`); // DETAILS marker
}

async function fillDetailsToStory() {
  fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
  fireEvent.change(ph("phone"), { target: { value: "0501234567" } }); // valid IL
  fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
  fireEvent.change(ph("address"), { target: { value: "הרצל 1" } });
  fireEvent.click(nextBtn()); // → CATEGORY
  fireEvent.click(await screen.findByTestId("pick-category")); // select category id 1
  fireEvent.click(nextBtn()); // → STORY
  await screen.findByPlaceholderText(`${K}.fields.tagline_placeholder`); // STORY marker
}

describe("RegisterProducerClient — wizard nav + submit body (MEH-866)", () => {
  it("ACCOUNT validation gates the first advance (invalid email blocks)", async () => {
    await renderWizard();
    expect(await screen.findByText(`${K}.steps.account.title`)).toBeInTheDocument();
    fireEvent.change(ph("name"), { target: { value: "טסט" } });
    fireEvent.change(ph("email"), { target: { value: "not-an-email" } });
    fireEvent.change(ph("password"), { target: { value: "Abcdefgh1234" } });
    fireEvent.click(nextBtn());
    // Still on ACCOUNT — invalid email surfaces the validation message.
    expect(screen.getByText(`${K}.steps.account.title`)).toBeInTheDocument();
    expect(screen.getByText(`${K}.validation.email_invalid`)).toBeInTheDocument();
  });

  it("advances ACCOUNT → DETAILS → CATEGORY → STORY, and back DETAILS → ACCOUNT", async () => {
    await renderWizard();
    await fillAccountToDetails();
    expect(screen.getByText(`${K}.steps.business.title`)).toBeInTheDocument(); // DETAILS
    // back → ACCOUNT
    fireEvent.click(screen.getByText(`${K}.actions.back`));
    expect(await screen.findByText(`${K}.steps.account.title`)).toBeInTheDocument();
    // forward again, all the way to STORY
    await fillAccountToDetails();
    await fillDetailsToStory();
    expect(screen.getByText(`${K}.story_card.title`)).toBeInTheDocument(); // reassurance card present
  });

  it("char-count updates N/160 as the tagline is typed", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    expect(screen.getByText("0/160")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
      target: { value: "חמישה" }, // 5 chars
    });
    expect(screen.getByText("5/160")).toBeInTheDocument();
  });

  it("submit body carries city, address, short_description (+ producer_name, category_ids, declaration_accepted) on the new-registration path", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    // tagline (short_description)
    fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
      target: { value: "הכי טרי שיש" },
    });
    // declarations gate: ToS + binding declaration (non-agri → no farmer checkbox)
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/auth/register/producer");
    // Chunk C + D fields ride along, plus the pre-existing frozen fields.
    expect(body).toMatchObject({
      producer_name: "העסק שלי",
      city: "תל אביב",
      address: "הרצל 1",
      short_description: "הכי טרי שיש",
      category_ids: [1],
    });
    expect(body).toHaveProperty("declaration_accepted", true);
    // Non-upgrade path also carries the account fields.
    expect(body).toMatchObject({ email: "t@example.com", name: "טסט" });
  });
});

// MEH-886: assert the 4 MEH-883 error-state a11y wirings so a silent ARIA-drop
// is caught — phone aria-invalid + aria-describedby (inline as-you-type), and
// role="alert" on the ACCOUNT stepError + STORY submit error (form-level).
describe("RegisterProducerClient — error-state a11y (MEH-883/886)", () => {
  it("ACCOUNT validation error is exposed as role=alert", async () => {
    await renderWizard();
    await screen.findByText(`${K}.steps.account.title`);
    fireEvent.change(ph("name"), { target: { value: "טסט" } });
    fireEvent.change(ph("email"), { target: { value: "not-an-email" } });
    fireEvent.change(ph("password"), { target: { value: "Abcdefgh1234" } });
    fireEvent.click(nextBtn());
    expect(screen.getByRole("alert")).toHaveTextContent(`${K}.validation.email_invalid`);
  });

  it("phone field exposes aria-invalid + aria-describedby only when invalid", async () => {
    await renderWizard();
    await fillAccountToDetails();
    const phone = screen.getByTestId("register-details-phone");
    // valid number → no error wiring
    fireEvent.change(phone, { target: { value: "0501234567" } });
    expect(phone).not.toHaveAttribute("aria-invalid");
    expect(phone).not.toHaveAttribute("aria-describedby");
    // invalid number → aria-invalid="true" + describedby → the error id.
    // (phone validation is synchronous on onChange — no debounce — so the
    // assertions below need no waitFor; mirrors the production RPC condition.)
    fireEvent.change(phone, { target: { value: "12" } });
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAttribute("aria-describedby", "register-phone-error");
    expect(document.getElementById("register-phone-error")).toBeInTheDocument();
  });

  it("STORY submit validation error is exposed as role=alert", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    // submit without checking the declaration boxes → blocked at the ToS gate
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    expect(screen.getByRole("alert")).toHaveTextContent(`${K}.validation.terms_required`);
    expect(api.post).not.toHaveBeenCalled();
  });
});

// MEH-914: the photo-to-publish disclosure is copy on a critical flow (register).
// Assert it renders on the STORY step so the line can't be silently dropped;
// testid mirrors E2E-LOCATORS for future Playwright reuse (data-testid contract).
describe("RegisterProducerClient — photo-to-publish disclosure (MEH-914)", () => {
  it("renders the photo disclosure on the STORY step", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    const note = screen.getByTestId("photo-disclosure-story");
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(`${K}.photo_disclosure`);
  });
});

// MEH-994: pre-flight entry screen — must render BEFORE frame 01 on both auth
// states; the upgrade (logged-in) variant hides the account-creation checklist
// line because those users never see the ACCOUNT frame.
describe("RegisterProducerClient — pre-flight entry screen (MEH-994)", () => {
  it("renders the pre-flight first; frame 01 mounts only after מתחילים", async () => {
    render(<RegisterProducerClient />);
    expect(await screen.findByTestId("register-preflight")).toBeInTheDocument();
    // wizard not mounted yet — no ACCOUNT frame, no stepper walk possible
    expect(screen.queryByTestId("register-frame-account")).not.toBeInTheDocument();
    // anonymous path → account-creation prep line present
    expect(screen.getByTestId("register-preflight-account-item")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("register-preflight-start"));
    expect(await screen.findByText(`${K}.steps.account.title`)).toBeInTheDocument();
    expect(screen.queryByTestId("register-preflight")).not.toBeInTheDocument();
  });

  it("upgrade path shows the pre-flight too, minus the account-creation line", async () => {
    authState.user = { email: "p@example.com" };
    render(<RegisterProducerClient />);
    expect(await screen.findByTestId("register-preflight")).toBeInTheDocument();
    expect(screen.queryByTestId("register-preflight-account-item")).not.toBeInTheDocument();
  });
});

// MEH-952: the producer-license required-error must surface next to the field on
// CATEGORY (not only as the generic backend-422 line two frames later on STORY).
// These tests use an OVERRIDING /categories mock with a license-required name
// ("חלב וגבינות" ∈ LICENSE_REQUIRED_CATEGORIES) — the shared beforeEach seeds a
// license-neutral one. The backend stays the unchanged backstop (not under test).
describe("RegisterProducerClient — license-required error placement (MEH-952)", () => {
  // Walk ACCOUNT → DETAILS → CATEGORY and select the (license-required) category.
  async function reachCategoryAndPick() {
    await fillAccountToDetails();
    fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
    fireEvent.change(ph("address"), { target: { value: "הרצל 1" } });
    fireEvent.click(nextBtn()); // → CATEGORY
    fireEvent.click(await screen.findByTestId("pick-category")); // license-required id 1
  }

  it("blocks the advance and shows the error at the field when license is blank", async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, name: "חלב וגבינות" }] });
    await renderWizard();
    await reachCategoryAndPick();
    // license left blank → next is blocked
    fireEvent.click(screen.getByTestId("register-category-next"));
    // still on CATEGORY (did NOT advance to STORY)
    expect(screen.getByTestId("register-frame-category")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(`${K}.fields.tagline_placeholder`),
    ).not.toBeInTheDocument();
    // blocking error surfaced inline (role=alert, the verbatim backend-mirror key)
    expect(screen.getByRole("alert")).toHaveTextContent(`${K}.validation.license_required`);
  });

  it("clears the error and advances once a license number is entered", async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, name: "חלב וגבינות" }] });
    await renderWizard();
    await reachCategoryAndPick();
    fireEvent.click(screen.getByTestId("register-category-next")); // blocked
    expect(screen.getByRole("alert")).toHaveTextContent(`${K}.validation.license_required`);
    // typing a number clears the blocking error (onChange), then advance succeeds
    fireEvent.change(screen.getByLabelText(`${K}.fields.license_required_label`), {
      target: { value: "1234567" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("register-category-next"));
    expect(
      await screen.findByPlaceholderText(`${K}.fields.tagline_placeholder`),
    ).toBeInTheDocument(); // STORY reached
  });

  it("does not resurface the error when the category is deselected and re-selected", async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, name: "חלב וגבינות" }] });
    await renderWizard();
    await reachCategoryAndPick();
    fireEvent.click(screen.getByTestId("register-category-next")); // blocked → error shown
    expect(screen.getByRole("alert")).toHaveTextContent(`${K}.validation.license_required`);
    // deselect (licenseRequired → false, branch unmounts) then re-select (remounts):
    // toggleCategory clears the flag, so no phantom error before the next click.
    fireEvent.click(screen.getByTestId("pick-category")); // deselect id 1
    fireEvent.click(screen.getByTestId("pick-category")); // re-select id 1
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
