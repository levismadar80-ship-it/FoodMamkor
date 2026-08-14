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
// MEH-1808: interpolation values are appended to the key so a test can assert
// WHAT was substituted, not merely that some string rendered. Keys called
// without values are byte-identical to before, so every pre-existing assertion
// is untouched — verified: no test in this file asserts on a value-carrying key.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values) => {
    const path = scope ? `${scope}.${key}` : key;
    return values ? `${path} ${Object.values(values).join(" ")}` : path;
  },
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

// MEH-1808: MiniMap pulls in Leaflet, which needs a real window/canvas. The
// component under test here is the register step's STATE MACHINE — which of the
// three address states renders — so the map is stubbed down to the two props
// that carry meaning across the boundary. MiniMap's own behaviour (including
// that these two props exist and default correctly) is pinned separately in
// MiniMap.test.jsx.
vi.mock("@/components/MiniMap", () => ({
  default: ({ lat, lng, zoom, showNavigation }) => (
    <div
      data-testid="mini-map"
      data-lat={String(lat)}
      data-lng={String(lng)}
      data-zoom={String(zoom)}
      data-show-navigation={String(showNavigation)}
    />
  ),
}));

// AddressSearch is stubbed so a test can drive BOTH paths deterministically:
// free typing (onChange only — no coordinates) and picking a suggestion
// (onSelect with a full payload). The real component's network debounce is not
// under test here; its contract is AddressSearch.jsx:39.
vi.mock("@/components/AddressSearch", () => ({
  default: ({ value, onChange, onSelect, inputTestId, id, placeholder }) => (
    <div>
      <input
        id={id}
        data-testid={inputTestId}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        data-testid="address-pick"
        onClick={() =>
          onSelect({
            street: "דרך שרה",
            city: "זכרון יעקב",
            displayName: "דרך שרה, זכרון יעקב",
            lat: 32.5731,
            lng: 34.9512,
          })
        }
      >
        pick
      </button>
      {/* A second suggestion in a DIFFERENT town — the case self-QA caught. */}
      <button
        type="button"
        data-testid="address-pick-other-town"
        onClick={() =>
          onSelect({
            street: "דרך שרה אהרונסון",
            city: "חיפה",
            displayName: "דרך שרה אהרונסון, חיפה",
            lat: 32.794,
            lng: 34.9896,
          })
        }
      >
        pick other
      </button>
    </div>
  ),
}));

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
  // MEH-1814: clearAllMocks() clears call history but NOT implementations, so
  // the role-flipping refreshUser below would leak into every later test in
  // this file. Reset restores the inert default (returns undefined).
  refreshUser.mockReset();
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
    expect(screen.queryByText(`${K}.success.title`)).not.toBeInTheDocument();
    expect(screen.queryByText(`${K}.success.cta`)).not.toBeInTheDocument();
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

    expect(await screen.findByText(`${K}.success.title`)).toBeInTheDocument();
    expect(screen.getByText(`${K}.success.cta`)).toBeInTheDocument();
    expect(screen.getByText(`${K}.success.body`)).toBeInTheDocument();
    expect(screen.queryByText(`${K}.success.inbox_title`)).not.toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("tok-123");
    expect(refreshUser).toHaveBeenCalled();
  });

  // MEH-1814: the regression test. The two tests above pass on the BROKEN code
  // too, because `refreshUser` is a bare vi.fn() that never mutates authState —
  // so user.role never becomes "producer" and the MEH-1489 gate never fires.
  // That is a green with two causes (.claude/rules/testing.md): it reports
  // "success screen renders" when what it actually proves is "the role never
  // flipped". This test removes the second cause by making refreshUser do what
  // the real one does — re-read the upgraded role into context.
  it("upgrade success survives the role flip to producer — gate must not replace it (MEH-1814)", async () => {
    authState.user = { email: "p@example.com" };
    // The real refreshUser() re-reads /auth/me, which after a successful
    // upgrade returns role: "producer". Reproduce that here.
    refreshUser.mockImplementation(async () => {
      authState.user = { email: "p@example.com", role: "producer" };
    });
    api.post.mockResolvedValue({ data: { access_token: "tok-123", whatsapp_sent: true } });
    await renderWizard();
    await screen.findByText(`${K}.steps.business.title`);
    await fillDetailsToStory();
    await fillStoryAndSubmit();

    // The success screen owns the render...
    expect(await screen.findByTestId("register-success-pending")).toBeInTheDocument();
    expect(screen.getByText(`${K}.success.title`)).toBeInTheDocument();
    expect(screen.getByTestId("register-success-dashboard-cta")).toBeInTheDocument();
    // ...and the "כבר יש לך עמוד עסק" gate is nowhere on it.
    expect(screen.queryByTestId("register-producer-gate")).not.toBeInTheDocument();
    expect(screen.queryByText(`${K}.gate.producer_heading`)).not.toBeInTheDocument();
  });

  // MEH-1814: the other half of the invariant — `submitted` must not disarm the
  // gate for a genuine mount-time visit. Without this, a fix that simply deleted
  // the gate would also pass the test above.
  it("existing producer visiting /register/producer still hits the gate at mount (MEH-1814)", async () => {
    authState.user = { email: "p@example.com", role: "producer" };
    // NOT renderWizard() — that helper clicks the pre-flight CTA, and the whole
    // point is that the gate short-circuits before any pre-flight renders.
    render(<RegisterProducerClient />);

    expect(await screen.findByTestId("register-producer-gate")).toBeInTheDocument();
    expect(screen.getByText(`${K}.gate.producer_heading`)).toBeInTheDocument();
    // The wizard/preflight tree must be unreachable — no form to fill.
    expect(screen.queryByTestId("register-preflight")).not.toBeInTheDocument();
    expect(screen.queryByTestId("register-hero-heading")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("authenticated user whose token lapsed server-side falls back to the inbox screen (response-shape guard)", async () => {
    authState.user = { email: "p@example.com" }; // frontend thinks upgrade…
    api.post.mockResolvedValue({ data: {} }); // …backend took the non-upgrade path
    await renderWizard();
    await screen.findByText(`${K}.steps.business.title`);
    await fillDetailsToStory();
    await fillStoryAndSubmit();

    expect(await screen.findByTestId("register-frame-confirm")).toBeInTheDocument();
    // MEH-1814: was `success.heading`, which no longer renders anywhere — the
    // assertion would have been vacuously true against any implementation.
    expect(screen.queryByText(`${K}.success.title`)).not.toBeInTheDocument();
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

// MEH-1807: cross-step validation. Before this, producer_name / phone /
// category_ids were checked ONLY in the submit handler, so a blank business
// name surfaced as "יש למלא שם עסק" next to "הצטרפו" on STORY — two frames from
// the field, with no navigation, no focus and no marking on the field itself.
//
// Failing-by-construction (workflow: every new guard test is shown failing, and
// the construction has to DISCRIMINATE — the pre-1807 code must fail it):
//  · revert the DETAILS gate to `onClick={() => setStep(STEP.CATEGORY)}` and
//    tests 1+2 fail on `register-frame-details` being gone (the wizard advanced
//    with an empty name). The old code could not pass them: it never blocked.
//  · revert the submit gate to the three `setError(...)` returns and tests 4+5
//    fail on `register-frame-details` never appearing — the old code painted a
//    message and left `step` on STORY, which is the reported defect verbatim.
//  · drop the `submitBounced` guard and test 6 fails: the summary would appear
//    on a same-step block, where nobody was moved.
// None of these assertions can be satisfied by rendering a message alone, which
// is exactly what the pre-1807 behaviour did.
describe("RegisterProducerClient — cross-step validation (MEH-1807)", () => {
  // Walk to DETAILS and fill everything EXCEPT the business name.
  async function reachDetailsWithoutName() {
    await fillAccountToDetails();
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
  }

  it("blocks the DETAILS advance when the business name is empty, inline + focused", async () => {
    await renderWizard();
    await reachDetailsWithoutName();
    fireEvent.click(screen.getByTestId("register-details-next"));

    // did NOT advance
    expect(screen.getByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-category")).not.toBeInTheDocument();
    // inline at the field, via the ui/Input error slot (MEH-602 a11y wiring)
    const nameInput = screen.getByTestId("register-details-name");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    const describedBy = nameInput.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy)).toHaveTextContent(
      `${K}.validation.producer_name_required`,
    );
    // focus landed on the offending field
    expect(document.activeElement).toBe(nameInput);
  });

  it("clears the inline error as soon as the field is corrected (Baymard)", async () => {
    await renderWizard();
    await reachDetailsWithoutName();
    fireEvent.click(screen.getByTestId("register-details-next"));
    const nameInput = screen.getByTestId("register-details-name");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(nameInput, { target: { value: "העסק שלי" } });
    expect(nameInput).not.toHaveAttribute("aria-invalid");
    // and the advance now succeeds
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });

  it("blocks the CATEGORY advance when nothing is selected, at the selector", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.click(screen.getByTestId("register-details-next"));
    await screen.findByTestId("register-frame-category");
    // advance with zero categories picked
    fireEvent.click(screen.getByTestId("register-category-next"));
    expect(screen.getByTestId("register-frame-category")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-story")).not.toBeInTheDocument();
    expect(screen.getByTestId("register-category-error")).toHaveTextContent(
      `${K}.validation.category_required`,
    );
    expect(document.activeElement).toBe(
      document.getElementById("register-category-selector"),
    );
    // picking one clears it and unblocks (Baymard on-change clear)
    fireEvent.click(screen.getByTestId("pick-category"));
    expect(screen.queryByTestId("register-category-error")).not.toBeInTheDocument();
  });

  // The reachable route to a submit bounce. With the per-step gates in place the
  // seller cannot WALK to STORY with a blank earlier field, so the submit check
  // is a backstop — but it is not a dead branch: `restoreDraft` merges the
  // stored draft over the live form (RegisterProducerClient.jsx:~294) without
  // re-running any gate, and the draft key is shared across tabs of the same
  // origin. A second tab open on the wizard rewrites that key on its own first
  // keystroke, so tab 1's banner — raised at mount and still on screen through
  // STORY (`step < STEP.CONFIRM`) — restores a form the seller never typed.
  // `seedForeignDraft` below is that other tab's write, placed at the moment it
  // would land; seeding before render only sets up the banner, because this
  // tab's own setAndSave overwrites the key on every keystroke.
  const DRAFT_KEY = "producer_registration_draft";
  const seedForeignDraft = (draft) =>
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));

  it("final submit with a blanked earlier field navigates to that step, focuses it, and explains why", async () => {
    // non-empty city → hasDraftContent() raises the banner at mount
    seedForeignDraft({ city: "חיפה" });
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    expect(screen.getByTestId("register-frame-story")).toBeInTheDocument();

    // the other tab writes; keys absent from the draft are left untouched
    seedForeignDraft({ producer_name: "", city: "חיפה" });
    fireEvent.click(screen.getByTestId("register-draft-continue")); // producer_name → ""
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));

    // navigated back to the step that owns the field — no request went out
    expect(api.post).not.toHaveBeenCalled();
    expect(await screen.findByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-story")).not.toBeInTheDocument();
    // focused, marked, and explained
    const nameInput = screen.getByTestId("register-details-name");
    expect(document.activeElement).toBe(nameInput);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(
      document.getElementById(nameInput.getAttribute("aria-describedby")),
    ).toHaveTextContent(`${K}.validation.producer_name_required`);
    expect(screen.getByTestId("register-submit-gate-notice")).toHaveTextContent(
      `${K}.validation.cross_step_notice`,
    );
    // fixing the field retires the summary too (it is derived, not stored)
    fireEvent.change(nameInput, { target: { value: "העסק שלי" } });
    expect(screen.queryByTestId("register-submit-gate-notice")).not.toBeInTheDocument();
  });

  it("two missing fields render the GOV.UK summary list, and land on the first", async () => {
    seedForeignDraft({ city: "חיפה" });
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    seedForeignDraft({ producer_name: "", phone: "", city: "חיפה" });
    fireEvent.click(screen.getByTestId("register-draft-continue"));
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));

    await screen.findByTestId("register-frame-details");
    const notice = screen.getByTestId("register-submit-gate-notice");
    expect(notice).toHaveTextContent(`${K}.validation.cross_step_summary`);
    expect(notice).toHaveTextContent(`${K}.validation.producer_name_required`);
    expect(notice).toHaveTextContent(`${K}.validation.phone_required`);
    // wizard order decides the landing field: producer_name precedes phone
    expect(document.activeElement).toBe(screen.getByTestId("register-details-name"));
  });

  // Adversarial review (MEH-1807): submitBounced latched true after a bounce and
  // nothing lowered it, so the NEXT same-step block re-raised "הועברתם לשדה"
  // while nobody had been moved. The state only looked self-clearing because the
  // render also requires a non-empty fieldErrors, and fixing the field emptied
  // it — the flag itself survived and the very next per-step block resurrected
  // the false sentence.
  it("clears the bounce flag, so a later same-step block does not re-raise the summary", async () => {
    seedForeignDraft({ city: "חיפה" });
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    seedForeignDraft({ producer_name: "", city: "חיפה" });
    fireEvent.click(screen.getByTestId("register-draft-continue"));
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`)); // bounce
    await screen.findByTestId("register-frame-details");
    expect(screen.getByTestId("register-submit-gate-notice")).toBeInTheDocument();

    // fix the bounced field, then trip a PER-STEP block on a different one
    fireEvent.change(screen.getByTestId("register-details-name"), {
      target: { value: "העסק שלי" },
    });
    fireEvent.change(screen.getByTestId("register-details-phone"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("register-details-next"));

    // blocked at the field, but nobody was navigated — no bounce sentence
    expect(screen.getByTestId("register-details-phone")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByTestId("register-submit-gate-notice")).not.toBeInTheDocument();
  });

  // A per-step block moves nobody, so the "הועברתם לשדה" summary must NOT appear
  // there. Without the submitBounced guard this test goes red — the inline error
  // alone would raise it.
  it("does not show the bounce summary for a same-step block", async () => {
    await renderWizard();
    await reachDetailsWithoutName();
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(screen.getByTestId("register-details-name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByTestId("register-submit-gate-notice")).not.toBeInTheDocument();
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

// MEH-1808 — post-select location confirmation on the register address field.
//
// Phase 0 turned up a defect wider than the ticket described: picking a
// suggestion DID produce coordinates (AddressSearch.jsx:39) but the register
// handler wrote only the address text and the submit body carried no lat/lng at
// all, so every business registering through the public form landed with NULL
// coordinates and never appeared on the map — whether or not the seller picked
// from the list. The backend has accepted and stored both the whole time
// (schemas.py:549-550, auth.py:515-516). Without the payload fix the two locked
// strings here would be false, which is why it is in this change and not a
// follow-up: "✓ המיקום זוהה" would confirm a location thrown away seconds later,
// and "so your business shows on the map" would promise something the product
// does not do.
//
// Failing-by-construction: revert the onSelect handler to the pre-1808 form
// (address text only) and tests 1, 2 and 4 go red — no coordinates means no
// confirmation row, no map, and no lat/lng in the body. Drop the onChange
// null-out and test 3 goes red, because stale coordinates would keep the
// confirmation showing for an address the seller has typed over.
describe("RegisterProducerClient — address location confirmation (MEH-1808)", () => {
  async function reachDetails() {
    await renderWizard();
    await fillAccountToDetails();
  }

  it("picking a suggestion shows the friendly confirmation line + a street-zoom map", async () => {
    await reachDetails();
    // nothing before a pick
    expect(screen.queryByTestId("register-address-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mini-map")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("address-pick"));

    const confirm = await screen.findByTestId("register-address-confirm");
    // the CITY the picker resolved is named, not coordinates (MEH-1242 is the
    // admin pattern this deliberately does not copy)
    expect(confirm).toHaveTextContent("זכרון יעקב");
    expect(confirm).toHaveTextContent("דרך שרה");
    const map = screen.getByTestId("mini-map");
    expect(map.dataset.lat).toBe("32.5731");
    expect(map.dataset.lng).toBe("34.9512");
    expect(map.dataset.zoom).toBe("16"); // street level, not MiniMap's default 14
    expect(map.dataset.showNavigation).toBe("false"); // no "navigate to yourself"
    // the no-pick nudge is the OTHER state — never both at once
    expect(screen.queryByTestId("register-address-no-pick-hint")).not.toBeInTheDocument();
  });

  it("typed text with no pick shows a soft, non-blocking nudge and never blocks the step", async () => {
    await reachDetails();
    fireEvent.change(screen.getByTestId("register-details-address"), {
      target: { value: "דרך שרה" },
    });
    const hint = screen.getByTestId("register-address-no-pick-hint");
    expect(hint).toBeInTheDocument();
    // soft: not an alert, not error-red — the address is optional
    expect(hint).not.toHaveAttribute("role", "alert");
    expect(hint.className).not.toMatch(/text-error|text-red/);
    expect(screen.queryByTestId("register-address-confirm")).not.toBeInTheDocument();

    // and the step still advances with the address left unpicked (MEH-1807 gate
    // covers producer_name + phone only — address is NOT required)
    fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });

  it("typing over a confirmed address retires the confirmation (stale coords never survive)", async () => {
    await reachDetails();
    fireEvent.click(screen.getByTestId("address-pick"));
    expect(await screen.findByTestId("register-address-confirm")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("register-details-address"), {
      target: { value: "רחוב אחר לגמרי" },
    });
    // the pin must NOT keep pointing at the previous place
    expect(screen.queryByTestId("register-address-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mini-map")).not.toBeInTheDocument();
    expect(screen.getByTestId("register-address-no-pick-hint")).toBeInTheDocument();
  });

  it("the selected coordinates reach the submit payload", async () => {
    await reachDetails();
    // Fill the rest of DETAILS FIRST and pick last: fillDetailsToStory() types
    // into the address field, and typing correctly nulls the coordinates, so
    // picking before it would be testing the clear-on-type path by accident.
    fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.click(screen.getByTestId("address-pick"));
    await screen.findByTestId("register-address-confirm");
    fireEvent.click(nextBtn()); // → CATEGORY
    fireEvent.click(await screen.findByTestId("pick-category"));
    fireEvent.click(nextBtn()); // → STORY
    await screen.findByPlaceholderText(`${K}.fields.tagline_placeholder`);
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = api.post.mock.calls[0];
    expect(body).toMatchObject({ lat: 32.5731, lng: 34.9512 });
  });

  it("sends null coordinates when the seller never picked one", async () => {
    await reachDetails();
    fireEvent.change(screen.getByTestId("register-details-address"), {
      target: { value: "דרך שרה" },
    });
    await fillDetailsToStory();
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = api.post.mock.calls[0];
    expect(body.lat).toBeNull();
    expect(body.lng).toBeNull();
  });

  // Found by the browser self-QA, not by the unit tests — the first version
  // wrote the picked town into `form.city` with `prev.city || picked.city`, so
  // a SECOND pick in a different town kept the FIRST town's name and the line
  // confirmed a place the pin was no longer on. Failing-by-construction:
  // restore that `prev.city ||` form and this test reds on "זכרון יעקב"
  // surviving a Haifa pick.
  it("a second pick in another town replaces the town in the confirmation", async () => {
    await reachDetails();
    fireEvent.click(screen.getByTestId("address-pick"));
    expect(await screen.findByTestId("register-address-confirm")).toHaveTextContent(
      "זכרון יעקב",
    );

    fireEvent.click(screen.getByTestId("address-pick-other-town"));
    const confirm = screen.getByTestId("register-address-confirm");
    expect(confirm).toHaveTextContent("חיפה");
    expect(confirm).not.toHaveTextContent("זכרון יעקב");
    const map = screen.getByTestId("mini-map");
    expect(map.dataset.lat).toBe("32.794");
    expect(map.dataset.lng).toBe("34.9896");
  });

  // MEH-213 forbids free-text towns — `city` is CitySearch's canonical value and
  // a raw Nominatim string must never land in it (nor in the payload).
  it("picking an address never overwrites the canonical city field", async () => {
    await reachDetails();
    fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
    fireEvent.click(screen.getByTestId("address-pick-other-town")); // resolves חיפה
    await screen.findByTestId("register-address-confirm");
    expect(screen.getByTestId("city")).toHaveValue("תל אביב");

    fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByTestId("pick-category"));
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(`${K}.fields.tagline_placeholder`);
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = api.post.mock.calls[0];
    expect(body.city).toBe("תל אביב");
    expect(body).not.toHaveProperty("address_city");
  });
});

// MEH-1815: draft lifecycle across the two response shapes.
//
// The non-upgrade 200 is anti-enumeration output (MEH-328): byte-identical
// whether the email was free or already registered. On a collision the backend
// discards the entire Producer payload, so that 200 is NOT proof the business
// was saved — and the wizard used to clear the draft on it anyway, which is the
// silent data loss. Only a response carrying access_token proves persistence.
//
// These assert the observable end state (what is in localStorage after submit),
// not that a particular line moved — ADR-032 §3.6.
const DRAFT_KEY = "producer_registration_draft";

async function fillWizardAndSubmit() {
  await renderWizard();
  await fillAccountToDetails();
  await fillDetailsToStory();
  fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
    target: { value: "הכי טרי שיש" },
  });
  selectReferral();
  screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
  fireEvent.click(screen.getByText(`${K}.actions.submit`));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
}

describe("RegisterProducerClient — draft survives the anti-enum ack (MEH-1815)", () => {
  it("keeps the draft after a non-upgrade ack, because that 200 may be a collision", async () => {
    api.post.mockResolvedValue({ data: {} }); // no access_token
    await fillWizardAndSubmit();
    await screen.findByText(`${K}.steps.confirm.check_inbox_title`).catch(() => {});

    const saved = localStorage.getItem(DRAFT_KEY);
    expect(saved).toBeTruthy();
    // MEH-1977: the stored value is now an envelope — `{v, savedAt, step, form}`
    // — so the seller's fields moved one level down. Every assertion below is
    // the one this test already made; only the path to the value changed.
    const parsed = JSON.parse(saved);
    // The expensive part of the fill is what has to come back.
    expect(parsed.form.producer_name).toBe("העסק שלי");
    expect(parsed.form.city).toBe("תל אביב");
    // packDraft strips the password — extending the draft's lifetime must not
    // extend a stored credential's lifetime. Asserted on the WHOLE serialised
    // value, not just `form`: a password that leaked into the envelope's own
    // keys would pass a `form`-scoped check while sitting on disk all the same.
    expect(parsed.form).not.toHaveProperty("password");
    expect(saved).not.toContain("Abcdefgh1234"); // the value fillAccountToDetails types
    // MEH-1977: the draft that survives must also be one that can expire.
    expect(typeof parsed.savedAt).toBe("number");
  });

  it("clears the draft on the upgrade path, where access_token proves the write landed", async () => {
    api.post.mockResolvedValue({
      data: { access_token: "tok-123", whatsapp_sent: true },
    });
    await fillWizardAndSubmit();
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
  });
});

// MEH-1977: where a resumed draft is allowed to LAND.
//
// The card asks for "restore lands on step 3 with data". That is safe with a
// token and unsafe without one, and the reason is the other half of the same
// feature: the password is deliberately never persisted. Dropped straight onto
// STORY, a signed-out seller carries an empty password into the submit body —
// and `password` is absent from CROSS_STEP_REQUIRED, so nothing bounces her
// back to the account frame. She gets a rejection pointing at no field.
//
// These assert the frame the wizard ends up on, not that safeResumeStep was
// called — the same end-state discipline as the MEH-1815 pair above.
describe("RegisterProducerClient — resumed drafts land where they can finish (MEH-1977)", () => {
  const seedDraftAtStep = (step) =>
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        step,
        form: { producer_name: "העסק שלי", city: "תל אביב", category_ids: [1] },
      }),
    );

  it("signed out: restores the data but stays on ACCOUNT, because the password is gone", async () => {
    seedDraftAtStep(4); // STORY — the furthest frame, the worst case
    await renderWizard();
    fireEvent.click(await screen.findByTestId("register-draft-continue"));

    expect(screen.getByTestId("register-frame-account")).toBeTruthy();
    expect(screen.queryByTestId("register-frame-story")).toBeNull();

    // The restore still has to be WORTH something. Cross the account gate on
    // foot and the restored business name is waiting on the next frame — so
    // what she re-types is the three account fields, not the whole wizard.
    // (Asserted by walking, not by reading state: a test that only checked the
    // frame would pass identically if the restore had merged nothing at all.)
    await fillAccountToDetails();
    expect(ph("producer_name").value).toBe("העסק שלי");
  });

  it("signed in: lands on the stored frame, where the account fields are not submitted at all", async () => {
    localStorage.setItem("token", "tok-123");
    authState.user = { role: "user" };
    seedDraftAtStep(4);
    await renderWizard();
    fireEvent.click(await screen.findByTestId("register-draft-continue"));

    expect(await screen.findByTestId("register-frame-story")).toBeTruthy();
  });

  it("never lands on CONFIRM — that frame is only reachable from a 200", async () => {
    localStorage.setItem("token", "tok-123");
    authState.user = { role: "user" };
    seedDraftAtStep(5); // CONFIRM
    await renderWizard();
    fireEvent.click(await screen.findByTestId("register-draft-continue"));

    expect(screen.queryByTestId("register-frame-confirm")).toBeNull();
  });

  it("drops an expired draft instead of offering it back", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        step: 2,
        form: { producer_name: "העסק שלי", category_ids: [] },
      }),
    );
    await renderWizard();
    expect(screen.queryByTestId("register-draft-banner")).toBeNull();
    // Not merely hidden — gone. A stale draft holding a name, phone and address
    // must not sit on a shared machine because nobody came back for it.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
