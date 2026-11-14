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
// MEH-2200: the collection notice calls t.rich(), which this mock did not
// expose — 30 tests here crashed on `t.rich is not a function` the moment the
// notice landed on the STORY frame. `.rich` renders the key path AND invokes
// every tag callback, so key-based assertions below are byte-identical while
// the real <Link>/<a> nodes still mount.
// MEH-3074: the STORY-step preview mounts the real ProducerCard, which this
// file's mocks do not feed; its wiring is covered in RegisterProducerClient.test.jsx.
vi.mock("@/components/RegisterCardPreview", () => ({
  default: () => <div data-testid="card-preview-stub" />,
}));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => {
    const t = (key, values) => {
      const path = scope ? `${scope}.${key}` : key;
      return values ? `${path} ${Object.values(values).join(" ")}` : path;
    };
    t.rich = (key, tags = {}) => {
      const path = scope ? `${scope}.${key}` : key;
      return [
        path,
        ...Object.entries(tags).map(([name, render]) => (
          <span key={name}>{render(name)}</span>
        )),
      ];
    };
    return t;
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
// MEH-2241 chunk B: the real component also emits `{ known }` (chunk A
// contract) and the wizard now gates on it, so the stub carries the verdict:
// every town is known EXCEPT the one sentinel below, which stands in for
// "typed, 0 suggestions, never picked" — the case C the card measured.
// Tests that fill "תל אביב" are therefore unaffected.
const FREE_TEXT_TOWN = "עיירה שאינה ברשימה";
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, onKnownChange, id, "aria-invalid": ariaInvalid }) => (
    <input
      data-testid="city"
      id={id}
      aria-invalid={ariaInvalid}
      value={value || ""}
      // Literal, not the constant: vi.mock() is hoisted above `const
      // FREE_TEXT_TOWN`, so the factory cannot reference it. MUST MATCH
      // FREE_TEXT_TOWN — the guard test below fails if the two drift.
      onChange={(e) => onChange(e.target.value, { known: e.target.value !== "עיירה שאינה ברשימה" })}
      // The async half: a test can flip the verdict for the current value
      // without re-emitting it (the real component fires this after a late
      // /cities response). Exposed as a button so no fetch is simulated.
      data-has-known-change={onKnownChange ? "1" : "0"}
      onBlur={() => onKnownChange && onKnownChange(true)}
      // …and the reverse flip (a late response REVOKING a match) rides
      // double-click, so both directions of the async verdict are drivable.
      onDoubleClick={() => onKnownChange && onKnownChange(false)}
    />
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
  // MEH-2182: the stub surfaces `draggableMarker` and exposes a button that
  // fires `onMarkerDragEnd`, so a test can drive the drag deterministically.
  // Leaflet's real drag is not the subject here — what the wizard DOES with the
  // resulting coordinates is. The prop passthrough itself is asserted against
  // the real component in MiniMap.test.jsx.
  default: ({ lat, lng, zoom, showNavigation, draggableMarker, onMarkerDragEnd }) => (
    <div
      data-testid="mini-map"
      data-lat={String(lat)}
      data-lng={String(lng)}
      data-zoom={String(zoom)}
      data-show-navigation={String(showNavigation)}
      data-draggable-marker={String(draggableMarker)}
    >
      {/* MEH-2182: mirrors the real component, which binds `dragend` ONLY when
          `draggableMarker` is set — so a consumer that stops opting in loses
          the affordance here too, and every test that drags goes red instead of
          quietly clicking a no-op button. */}
      {draggableMarker && onMarkerDragEnd ? (
        <button
          type="button"
          data-testid="mini-map-drag-pin"
          onClick={() => onMarkerDragEnd({ lat: 32.1111, lng: 34.2222 })}
        >
          drag
        </button>
      ) : null}
    </div>
  ),
}));

// AddressSearch is stubbed so a test can drive BOTH paths deterministically:
// free typing (onChange only — no coordinates) and picking a suggestion
// (onSelect with a full payload). The real component's network debounce is not
// under test here; its contract is AddressSearch.jsx:39.
vi.mock("@/components/AddressSearch", () => ({
  // MEH-2181: `city` is surfaced as a data attribute so a test can assert the
  // wizard opts into city-scoped lookup. The real scoping is proven at the
  // provider boundary in places.test.js; this only pins the wiring.
  default: ({ value, onChange, onSelect, inputTestId, id, placeholder, city }) => (
    <div data-testid="address-search-mock" data-city={city ?? ""}>
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

// MEH-2138 chunk F: jsdom DEFINES `window.scrollTo`, but its body only logs
// "Not implemented: Window's scrollTo() method" — so once STEP.CONFIRM scrolls
// to the top, EVERY test in this file that reaches CONFIRM prints that error
// (measured: 0 before the effect, 14 after). Replaced once, at module scope, so
// no test stacks a spy on a spy; `vi.clearAllMocks()` in beforeEach resets its
// history between tests. Environment shim, not a behavioural mock — the
// MEH-729 class already established in __tests__/setup.js. Scoped to this file
// rather than added to that setup because this is the only component that
// calls it, and a global override could mask a future assertion elsewhere.
const scrollToSpy = vi.fn();
window.scrollTo = scrollToSpy;
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
// MEH-2640 removed the step-2 organizer checkbox; the door is chosen before
// the wizard starts.
// MEH-2773: the door is now the ROUTE. /register/organizer renders the client
// with kind="organizer" and skips the business preflight; /register/producer
// renders it bare and the preflight CTA starts the business flow.
async function renderWizard({ as = "producer" } = {}) {
  if (as === "organizer") {
    render(<RegisterProducerClient kind="organizer" />);
    await screen.findByText(`${K}.steps.account.title`);
    return;
  }
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


// ---------------------------------------------------------------------------
// MEH-2460 — the organizer option. Harness above copied verbatim from
// RegisterProducerClient.test.jsx (same mocks, same entry path) so these cases
// exercise the real wizard state machine, not a re-implementation of it.
// ---------------------------------------------------------------------------

function fillDetailsFields() {
  fireEvent.change(ph("producer_name"), { target: { value: "שוק גלם" } });
  fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
  fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
}

const STORY_MARKER = `${K}.fields.tagline_placeholder`;

describe("MEH-2460 / MEH-2640 — registering as a markets / events organizer", () => {
  // MEH-2640 deleted five cells with the control they drove. The organizer
  // choice is no longer a checkbox that can be toggled on and off in the
  // middle of step 2, so "on → off restores the business path", "a category
  // picked BEFORE switching is not sent", "an address typed BEFORE switching
  // is not sent", "the delivery axis is shown/hidden by the toggle" and "the
  // address field is hidden when it is ticked" no longer describe anything
  // that can happen: the door is chosen before the wizard starts, and step 2
  // has neither an address field nor a delivery axis for either path.
  // What survives is the part that still decides behaviour — which door was
  // used, and what that does to the steps and to the POST body.

  // MEH-2917 (Sapir 11/11) puts the organizer door back on the business
  // preflight, but as a LINK to /register/organizer: the route decides the
  // kind (MEH-2773). What this guards is that the business page never again
  // switches the wizard in place — no old in-page entry control.
  it("MEH-2773 / MEH-2917: the business preflight's organizer door is a link to the organizer route, not an in-page switch", async () => {
    render(<RegisterProducerClient />);
    expect(await screen.findByTestId("register-preflight-start")).toBeInTheDocument();
    const door = screen.getByTestId("register-preflight-organizer-link");
    expect(door.tagName).toBe("A");
    expect(door.getAttribute("href")).toBe("/register/organizer");
    expect(screen.queryByText(`${K}.preflight.organizer_entry`)).toBeNull();
  });

  it("MEH-2773: the organizer route shows the organizer heading, line and step caption", async () => {
    render(<RegisterProducerClient kind="organizer" />);
    const h = await screen.findByTestId("register-hero-heading");
    expect(h).toHaveTextContent(`${K}.organizer_heading`);
    expect(screen.getByText(`${K}.fields.organizer_hint`)).toBeInTheDocument();
    expect(screen.getByText(`${K}.step_captions.details_organizer`)).toBeInTheDocument();
    expect(screen.queryByText(`${K}.step_captions.details`)).toBeNull();
  });

  it("MEH-2773: the business wizard keeps the business heading (control)", async () => {
    await renderWizard();
    const h = await screen.findByTestId("register-hero-heading");
    expect(h).toHaveTextContent(`${K}.heading`);
    expect(h).not.toHaveTextContent("organizer_heading");
    expect(screen.getByText(`${K}.step_captions.details`)).toBeInTheDocument();
  });

  it("MEH-2773: the organizer route skips the business preflight", async () => {
    render(<RegisterProducerClient kind="organizer" />);
    expect(await screen.findByText(`${K}.steps.account.title`)).toBeInTheDocument();
    expect(screen.queryByTestId("register-preflight")).toBeNull();
  });

  it("MEH-2773: a business draft restored on the organizer route stays an organizer", async () => {
    // Both routes share one draft key. The route decides the kind, not the draft.
    localStorage.setItem(
      "producer_registration_draft",
      JSON.stringify({ v: 2, savedAt: Date.now(), step: null, form: { producer_name: "מאפייה", kind: "producer" } }),
    );
    await renderWizard({ as: "organizer" });
    fireEvent.click(await screen.findByTestId("register-draft-continue"));
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(STORY_MARKER);
    expect(screen.queryByTestId("register-frame-category")).toBeNull();
  });

  it("MEH-2773: business-only answers in a restored draft never reach the organizer POST", async () => {
    localStorage.setItem(
      "producer_registration_draft",
      JSON.stringify({
        v: 2, savedAt: Date.now(), step: null,
        form: { producer_name: "מאפייה", kind: "producer", category_ids: [7], fulfilment: "delivery", producer_license_number: "12345" },
      }),
    );
    await renderWizard({ as: "organizer" });
    fireEvent.click(await screen.findByTestId("register-draft-continue"));
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(STORY_MARKER);
    fireEvent.change(screen.getByTestId("register-referral-source"), {
      target: { value: "instagram" },
    });
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const body = api.post.mock.calls[0][1];
    expect(body.kind).toBe("organizer");
    expect(body.category_ids).toEqual([]);
    // The organizer default shape, not the business's «delivery» answer.
    expect(body.offers_delivery).toBe(false);
    expect(body.has_physical_location).toBe(true);
    expect(body.producer_license_number).toBe("");
  });

  it("organizer door: DETAILS goes straight to STORY, and the stepper drops CATEGORY", async () => {
    await renderWizard({ as: "organizer" });
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(STORY_MARKER);
    expect(screen.queryByTestId("register-frame-category")).toBeNull();
    // MEH-3074: organizers are not in the business list, so they get no card preview.
    expect(screen.queryByTestId("card-preview-stub")).toBeNull();
  });

  it("business door: DETAILS goes to CATEGORY as before", async () => {
    // The control. Without it, an organizer-only assertion would pass against
    // a wizard that had lost the CATEGORY step for everyone.
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(nextBtn());
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });

  it("organizer door: back from STORY returns to DETAILS, not CATEGORY", async () => {
    await renderWizard({ as: "organizer" });
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(STORY_MARKER);
    fireEvent.click(screen.getByTestId("register-story-back"));
    expect(await screen.findByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-category")).toBeNull();
  });

  it("organizer door: the submit body carries kind='organizer' and no categories", async () => {
    await renderWizard({ as: "organizer" });
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(STORY_MARKER);
    fireEvent.change(screen.getByTestId("register-referral-source"), {
      target: { value: "instagram" },
    });
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const body = api.post.mock.calls[0][1];
    expect(body.kind).toBe("organizer");
    expect(body.category_ids).toEqual([]);
  });

  it("business door: the submit body still carries kind='producer'", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByTestId("pick-category"));
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(STORY_MARKER);
    // MEH-3074 control: the business door does get the preview.
    expect(screen.getByTestId("card-preview-stub")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("register-referral-source"), {
      target: { value: "instagram" },
    });
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1].kind).toBe("producer");
  });

  it("the organizer path never asks the fulfilment question", async () => {
    // MEH-2640: "איך קונים אצלכם?" is a business question. An organizer runs
    // markets; she has no counter and no deliveries, and the gate must not
    // stop her.
    await renderWizard({ as: "organizer" });
    await fillAccountToDetails();
    fillDetailsFields();
    expect(screen.queryByTestId("register-fulfilment")).toBeNull();
    fireEvent.click(nextBtn());
    await screen.findByPlaceholderText(STORY_MARKER);
  });
});
