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

// MEH-1285: terms/privacy links now use Link from @/i18n/navigation
// (locale-aware); stub it so next-intl's createNavigation isn't loaded
// under jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
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

// MEH-1471: the attribution dropdown is a REQUIRED field on the STORY step —
// every submit flow must pick a key or the submit gate blocks with
// referral_source_required. The <select> stores English keys (labels come from
// i18n, mocked to key paths), so change the value directly.
function selectReferral(value = "instagram") {
  fireEvent.change(screen.getByTestId("register-referral-source"), {
    target: { value },
  });
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
    selectReferral(); // MEH-1471: required attribution key
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
      // MEH-1471: attribution key rides along; no free text (not "other").
      referral_source: "instagram",
      referral_source_other: "",
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
    // MEH-1471: pick the required attribution so the gate reaches the ToS check.
    selectReferral();
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

// MEH-1176 F10 — the MEH-328 didUpgrade CONFIRM split had zero coverage,
// exactly the branch the anti-enumeration smoke checklist calls LOAD-BEARING
// (Test D failure signal). didUpgrade is derived from the RESPONSE SHAPE
// ("access_token" in res.data), not the frontend isUpgrade flag — the third
// test pins that guard (token expired between mount and submit → backend
// takes the non-upgrade path → inbox screen, never a false "הצטרפת!").
describe("RegisterProducerClient — didUpgrade CONFIRM split (MEH-328 chunk D)", () => {
  async function fillStoryAndSubmit() {
    fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
      target: { value: "הכי טרי שיש" },
    });
    selectReferral(); // MEH-1471: required field on STORY
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  }

  it("non-upgrade ack (no access_token) renders the inbox-check screen, not הצטרפת!", async () => {
    api.post.mockResolvedValue({ data: {} }); // RegisterAck — anti-enumeration
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    await fillStoryAndSubmit();

    expect(await screen.findByTestId("register-frame-confirm")).toBeInTheDocument();
    expect(screen.getByText(`${K}.success.inbox_title`)).toBeInTheDocument();
    // The upgrade success UI must NOT leak into the anonymous path.
    expect(screen.queryByText(`${K}.success.heading`)).not.toBeInTheDocument();
    expect(screen.queryByText(`${K}.success.dashboard_cta`)).not.toBeInTheDocument();
    // No token was returned, so none may be stored and auth isn't refreshed.
    expect(localStorage.getItem("token")).toBeNull();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it("upgrade response (access_token present) renders הצטרפת! with the dashboard CTA and stores the token", async () => {
    authState.user = { email: "p@example.com" }; // upgrade path skips ACCOUNT
    api.post.mockResolvedValue({ data: { access_token: "tok-123", whatsapp_sent: true } });
    await renderWizard();
    await screen.findByText(`${K}.steps.business.title`); // auto-advanced to DETAILS
    await fillDetailsToStory();
    await fillStoryAndSubmit();

    expect(await screen.findByText(`${K}.success.heading`)).toBeInTheDocument();
    expect(screen.getByText(`${K}.success.dashboard_cta`)).toBeInTheDocument();
    expect(screen.getByText(`${K}.success.body_with_whatsapp`)).toBeInTheDocument();
    expect(screen.queryByText(`${K}.success.inbox_title`)).not.toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("tok-123");
    expect(refreshUser).toHaveBeenCalled();
  });

  it("authenticated user whose token lapsed server-side falls back to the inbox screen (response-shape guard)", async () => {
    authState.user = { email: "p@example.com" }; // frontend thinks upgrade…
    api.post.mockResolvedValue({ data: {} }); // …backend took the non-upgrade path
    await renderWizard();
    await screen.findByText(`${K}.steps.business.title`);
    await fillDetailsToStory();
    await fillStoryAndSubmit();

    expect(await screen.findByTestId("register-frame-confirm")).toBeInTheDocument();
    expect(screen.queryByText(`${K}.success.heading`)).not.toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
  });
});

// MEH-1422 (MEH-1388 chunk 4b): the informational multi-location intake toggle
// on DETAILS. Renders the approved referral copy only on "yes", and — critically
// — is UI-only: its value must never leak into the /auth/register/producer body
// (no backend field). The next-intl mock returns key paths, so assertions key off
// the locked-copy i18n KEYS, not the Hebrew strings.
describe("RegisterProducerClient — multi-location intake toggle (MEH-1422)", () => {
  it("shows the referral copy only when the toggle is on", async () => {
    await renderWizard();
    await fillAccountToDetails();
    const toggle = screen.getByTestId("register-multi-location-toggle");
    expect(toggle).toBeInTheDocument();
    expect(screen.getByText(`${K}.fields.multi_location_label`)).toBeInTheDocument();
    expect(screen.queryByTestId("register-multi-location-copy")).not.toBeInTheDocument();
    fireEvent.click(toggle); // yes
    expect(screen.getByTestId("register-multi-location-copy")).toHaveTextContent(
      `${K}.fields.multi_location_yes_copy`,
    );
    fireEvent.click(toggle); // no
    expect(screen.queryByTestId("register-multi-location-copy")).not.toBeInTheDocument();
  });

  it("is informational only — its value is NOT in the submit payload", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fireEvent.click(screen.getByTestId("register-multi-location-toggle")); // yes
    await fillDetailsToStory();
    fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
      target: { value: "הכי טרי שיש" },
    });
    selectReferral(); // MEH-1471: required field on STORY
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = api.post.mock.calls[0];
    expect(Object.keys(body).some((k) => k.toLowerCase().includes("multi"))).toBe(false);
  });
});

// MEH-1471: self-reported attribution ("מאיפה שמעת עלינו?") — a REQUIRED dropdown
// on the final (STORY) step, directly above the ToS checkbox. Default has no
// preselection, so the submit gate blocks until a key is chosen; "other" reveals
// an optional free-text input, and both values ride the submit body.
describe("RegisterProducerClient — referral source (MEH-1471)", () => {
  it("blocks submit while no attribution is selected (required)", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
      target: { value: "הכי טרי שיש" },
    });
    // consent boxes checked, but the attribution dropdown left empty
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    expect(screen.getByRole("alert")).toHaveTextContent(
      `${K}.validation.referral_source_required`,
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("selecting 'other' reveals the free-text input and submits both values", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    // no free-text input until 'other' is chosen
    expect(
      screen.queryByTestId("register-referral-source-other"),
    ).not.toBeInTheDocument();
    selectReferral("other");
    fireEvent.change(screen.getByTestId("register-referral-source-other"), {
      target: { value: "שמעתי עליכם בשוק" },
    });
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = api.post.mock.calls[0];
    expect(body).toMatchObject({
      referral_source: "other",
      referral_source_other: "שמעתי עליכם בשוק",
    });
  });

  it("switching away from 'other' hides the free-text input and sends no other text", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    selectReferral("other");
    fireEvent.change(screen.getByTestId("register-referral-source-other"), {
      target: { value: "טקסט זמני" },
    });
    selectReferral("google"); // switch to a non-other key
    expect(
      screen.queryByTestId("register-referral-source-other"),
    ).not.toBeInTheDocument();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = api.post.mock.calls[0];
    expect(body).toMatchObject({
      referral_source: "google",
      referral_source_other: "",
    });
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

// MEH-1489 chunk A — early auth-state gate. A logged-in producer/admin can never
// complete the wizard (409 already_has_producer / 403 admin at submit), so they
// see a terminal screen instead of the preflight+wizard. Guests + logged-in
// consumers (MEH-143 upgrade path) are unchanged — the two upgrade-path tests
// above (user without a role) already pin that the preflight still renders.
describe("RegisterProducerClient — logged-in producer/admin gate (MEH-1489)", () => {
  it("producer sees the gate (dashboard CTA), never the preflight or wizard", async () => {
    authState.user = { email: "p@example.com", role: "producer" };
    render(<RegisterProducerClient />);
    expect(await screen.findByTestId("register-producer-gate")).toBeInTheDocument();
    expect(screen.getByText(`${K}.gate.producer_heading`)).toBeInTheDocument();
    // CTA reuses the account-menu dashboard label (no new i18n key).
    expect(screen.getByText("account.menu.dashboard")).toBeInTheDocument();
    // No wizard entry surfaces leak past the gate.
    expect(screen.queryByTestId("register-preflight")).not.toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-account")).not.toBeInTheDocument();
  });

  it("admin sees the gate with NO dashboard CTA (separate-account message)", async () => {
    authState.user = { email: "a@example.com", role: "admin" };
    render(<RegisterProducerClient />);
    expect(await screen.findByTestId("register-producer-gate-admin")).toBeInTheDocument();
    expect(screen.getByText(`${K}.gate.admin_heading`)).toBeInTheDocument();
    expect(screen.queryByText("account.menu.dashboard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("register-preflight")).not.toBeInTheDocument();
  });

  it("logged-in consumer (role consumer) still sees the preflight — no gate", async () => {
    authState.user = { email: "c@example.com", role: "consumer" };
    render(<RegisterProducerClient />);
    expect(await screen.findByTestId("register-preflight")).toBeInTheDocument();
    expect(screen.queryByTestId("register-producer-gate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("register-producer-gate-admin")).not.toBeInTheDocument();
  });
});
