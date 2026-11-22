// MEH-3540: part 2 of 2 of the former RegisterProducerClient.test.jsx, split mechanically by
// top-level describe block (no test body changed). Shared fixtures and helpers:
// the setup above the first describe is repeated in each part on purpose —
// vi.mock and the top-level hooks only apply to the file they are written in.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

// MEH-3074: the STORY-step preview mounts the real ProducerCard. Its own
// behaviour is covered in ProducerCard.test.jsx; here only the producer object
// the wizard hands it crosses the boundary.
vi.mock("@/components/ProducerCard", () => ({
  default: ({ producer }) => (
    <div data-testid="preview-card" data-producer={JSON.stringify(producer)} />
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
  // MEH-2640: step 2's one question is required and starts unanswered, so a
  // traversal that does not answer it no longer leaves DETAILS.
  fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
  fireEvent.click(nextBtn()); // → CATEGORY
  fireEvent.click(await screen.findByTestId("pick-category")); // select category id 1
  fireEvent.click(nextBtn()); // → STORY
  await screen.findByPlaceholderText(`${K}.fields.tagline_placeholder`); // STORY marker
}

// MEH-1471: the attribution dropdown on the STORY step. MEH-2183 made it
// OPTIONAL (no submit gate), but the flows below still pick a key so they keep
// asserting the populated payload. The <select> stores English keys (labels
// come from i18n, mocked to key paths), so change the value directly.
function selectReferral(value = "instagram") {
  fireEvent.change(screen.getByTestId("register-referral-source"), {
    target: { value },
  });
}

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
// MEH-2181 — city-scoped address lookup + the soft mismatch notice.
//
// The notice is a SOFT signal by design: it never blocks, and it offers no
// "use {found} instead" control, because MEH-213 forbids a raw provider string
// from landing in `city` (CitySearch owns that value). These tests pin both
// halves — that it appears when the towns disagree, and that it stays absent
// in the three states where it would be noise.
// MEH-2182 — draggable confirmation pin. The seller, not the geocoder, has the
// last word on where her gate is. The drag moves the POINT only: the address
// text must not be rewritten (no reverse-geocode), and nothing new rides the
// payload.
//
// Failing-by-construction, all four measured against this block (65 green at
// control), and each reddens a DIFFERENT subset — no single edit satisfies them
// all, which is what makes them evidence rather than decoration:
//   • drop `draggableMarker` + `onMarkerDragEnd` from the confirm map → 5 red
//   • drop `setPinAdjusted(false)` from the address onChange       → 1 red (reset)
//   • render the confirmed line without the `pinAdjusted` branch   → 1 red (swap)
//   • delete the drag-hint paragraph                                → 1 red (hint)



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

/**
 * MEH-2915 — `setAndSave` writes the draft from inside the form updater, so an
 * updater that returns `prev` unchanged used to write anyway. The write is not
 * harmless: the envelope re-stamps `savedAt`, which restarts MEH-1977's 7-day
 * expiry for a change that never happened.
 *
 * `handleCityKnownChange` is the live path — a late /cities response that
 * confirms the verdict the field already had. The stub's blur re-asserts the
 * SAME verdict; its double-click flips it, which is the control.
 *
 * The clock is advanced on every `Date.now()` so that a write would be visible:
 * without it two writes in the same millisecond produce identical JSON and the
 * assertion passes whether or not the guard exists.
 */
describe("MEH-2915 · a no-op update writes no draft", () => {
  const seedCity = async () => {
    await renderWizard();
    await fillAccountToDetails();
    fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
    const stored = localStorage.getItem(DRAFT_KEY);
    expect(stored, "precondition: the keystroke itself wrote a draft").not.toBeNull();
    return stored;
  };

  it("re-asserting the verdict the field already had leaves the draft untouched", async () => {
    const clock = { t: 1_760_000_000_000 };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => (clock.t += 1000));
    try {
      const before = await seedCity();
      fireEvent.blur(screen.getByTestId("city")); // onKnownChange(true) — already true
      expect(localStorage.getItem(DRAFT_KEY)).toBe(before);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("control — a verdict that actually flips still writes", async () => {
    const clock = { t: 1_760_000_000_000 };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => (clock.t += 1000));
    try {
      const before = await seedCity();
      fireEvent.doubleClick(screen.getByTestId("city")); // onKnownChange(false)
      const after = localStorage.getItem(DRAFT_KEY);
      expect(after).not.toBe(before);
      expect(JSON.parse(after).form.city_known).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

/**
 * MEH-2915, found by adversarial review — two consequences of taking identity
 * off the draft that the first pass left open.
 *
 * 1. Stripping on read keeps the fields out of the FORM. It does not by itself
 *    change what is on disk: the mount effect only rewrote the key on the
 *    pre-envelope restamp branch, so a v2 draft kept its bytes until the next
 *    keystroke, a dismiss, or the 7-day expiry.
 * 2. The draft no longer carries a phone and nothing prefills one, so a resume
 *    onto CATEGORY or STORY completes a frame and then bounces at submit, back
 *    to DETAILS, onto a field the seller never saw go empty.
 */
describe("MEH-2915 · an existing draft is rewritten, and the resume stops where it can finish", () => {
  // A minute old, not a fixed epoch: MEH-1977 expires a draft at 7 days
  // against the REAL clock, so a hard-coded stamp would make these cells pass
  // only until that date — the trap .claude/rules/testing.md names for
  // clock-dependent seeds. A minute is still far enough from `Date.now()` for
  // an unwanted re-stamp to be visible.
  const seedV2 = (form, step) => {
    const savedAt = Date.now() - 60_000;
    localStorage.setItem("token", "tok-123");
    authState.user = { role: "user" };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 2, savedAt, step, form }));
    return savedAt;
  };

  it("rewrites a stored draft that still carries identity, at its original savedAt", async () => {
    {
      const savedAt = seedV2(
        {
          producer_name: "הבית של דנה",
          city: "תל אביב",
          city_known: true,
          email: "dana@example.com",
          name: "דנה לוי",
          phone: "0501234567",
          address: "הרצל 1",
        },
        2,
      );
      await renderWizard();
      await screen.findByTestId("register-draft-banner");

      const raw = localStorage.getItem(DRAFT_KEY);
      for (const gone of ["dana@example.com", "דנה לוי", "0501234567", "הרצל 1"]) {
        expect(raw, `${gone} must be off the device, not just out of the form`).not.toContain(
          gone,
        );
      }
      expect(raw, "control: the business half stays").toContain("הבית של דנה");
      // The rewrite must not restart MEH-1977's clock: the seed is a minute
      // old, so a re-stamp at Date.now() would move this by ~60_000.
      expect(JSON.parse(raw).savedAt).toBe(savedAt);
    }
  });

  it("leaves a draft that carries no identity completely untouched", async () => {
    // Control: without this, the case above passes for a mount effect that
    // rewrites every draft it reads — which would restart the expiry clock on
    // drafts that never needed touching.
    seedV2({ producer_name: "הבית של דנה", city: "תל אביב", city_known: true }, 2);
    const before = localStorage.getItem(DRAFT_KEY);
    await renderWizard();
    await screen.findByTestId("register-draft-banner");
    expect(localStorage.getItem(DRAFT_KEY)).toBe(before);
  });

  it("a resume stored at STORY lands on DETAILS, where the missing phone lives", async () => {
    seedV2(
      { producer_name: "הבית של דנה", city: "תל אביב", city_known: true, category_ids: [1] },
      4, // STORY
    );
    await renderWizard();
    fireEvent.click(await screen.findByTestId("register-draft-continue"));
    expect(await screen.findByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-story")).not.toBeInTheDocument();

    // Control: STORY is reachable — the landing above is the cap, not a wizard
    // that cannot move. Fill the one thing the draft could not carry.
    fireEvent.change(screen.getByTestId("register-details-phone"), {
      target: { value: "0501234567" },
    });
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });
});

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

describe("non-upgrade confirm screen — the way in that exists (MEH-2920)", () => {
  it("links to login-then-dashboard as the primary action; home is secondary", async () => {
    api.post.mockResolvedValue({ data: {} }); // anti-enum ack, no token
    await fillWizardAndSubmit();
    const cta = await screen.findByTestId("register-confirm-dashboard-cta");
    expect(cta.tagName).toBe("A");
    expect(cta.getAttribute("href")).toBe("/login?redirect=%2Fproducer%2Fdashboard");
    expect(cta.textContent).toBe(`${K}.success.cta`);
    expect(screen.getByTestId("register-confirm-home").textContent).toBe(`${K}.success.back_home`);
  });
});

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

  // MEH-2915 amended this cell. Its subject — with a token the ACCOUNT gate is
  // SKIPPED, because the password problem that strands a signed-out resume
  // does not apply — is unchanged and still asserted. What changed is how far
  // past ACCOUNT a resume may land: the draft no longer carries a phone and
  // nothing prefills one, so STORY is a frame she could fill completely and
  // then bounce out of at submit (CROSS_STEP_REQUIRED), back to DETAILS, onto
  // a required field she never saw go empty. This describe block is named
  // "land where they can finish"; with no phone, that frame is DETAILS.
  it("signed in: skips ACCOUNT and lands on the furthest frame it can finish from", async () => {
    localStorage.setItem("token", "tok-123");
    authState.user = { role: "user" };
    seedDraftAtStep(4); // STORY
    await renderWizard();
    fireEvent.click(await screen.findByTestId("register-draft-continue"));

    // The token's effect — the thing this cell has always been about.
    expect(screen.queryByTestId("register-frame-account")).toBeNull();
    expect(await screen.findByTestId("register-frame-details")).toBeTruthy();
    expect(screen.queryByTestId("register-frame-story")).toBeNull();

    // …and the restore was still worth something: the business name is there.
    expect(ph("producer_name").value).toBe("העסק שלי");
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

// MEH-2138 chunk F. The wizard is one long page, so CONFIRM mounts wherever the
// seller left the scroll — measured at 1440 on staging: docH 1493, viewport 900,
// scrollY 539, i.e. the success screen entirely above the fold.
//
// WHAT THIS LAYER CAN AND CANNOT SAY. jsdom does no layout, so "the heading is
// inside the viewport" is unfalsifiable here — it passes against the broken code
// too, which is exactly the trap the MEH-2148 harness fell into. This describe
// therefore asserts only the CALL: that reaching CONFIRM asks the window to go
// to the top, on BOTH confirm branches. The geometric claim is a browser
// assertion and lives in e2e/flows/28-register-success-state.spec.ts at 1440.
describe("RegisterProducerClient — CONFIRM scrolls to the top (MEH-2138 chunk F)", () => {
  async function fillStoryAndSubmit() {
    fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
      target: { value: "הכי טרי שיש" },
    });
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  }

  /** The requirement, not the spelling of it. `behavior` is asserted as
   *  "not smooth" rather than "=== instant" so swapping the literal for an
   *  equally-instant one does not red this, while an animated ride to a screen
   *  the user has never seen does. */
  function expectScrolledToTop() {
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    const [arg] = scrollToSpy.mock.calls[0];
    expect(arg).toMatchObject({ top: 0 });
    expect(arg.behavior, "an animated approach to an unseen screen is the thing prefers-reduced-motion suppresses").not.toBe("smooth");
  }

  // MEH-2927 CHANGED THIS CONTROL'S MECHANISM, NOT ITS PURPOSE — read before
  // editing. It used to assert `scrollTo` was never called before the submit,
  // so that the two "scrolled to the top" assertions below could only be
  // satisfied by the CONFIRM effect. MEH-2927 makes every step change scroll to
  // the top (pilot B3a), so a global count of zero is no longer available as
  // the device.
  //
  // The purpose survives intact and is now enforced per transition: each test
  // below clears the spy immediately before the submit, so a call counted after
  // it can still only have come from CONFIRM. That is strictly stronger than
  // the old global zero — it isolates the CONFIRM transition instead of relying
  // on the rest of the wizard being silent. A component with no CONFIRM effect
  // still goes red, which is the property MEH-2138 built this for.
  it("asks for the top once per frame change, and no more", async () => {
    await renderWizard();
    await fillAccountToDetails(); // ACCOUNT → DETAILS
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    await fillDetailsToStory(); // DETAILS → CATEGORY → STORY
    expect(scrollToSpy).toHaveBeenCalledTimes(3);
  });

  it("inbox-check branch (no access_token) scrolls to the top", async () => {
    api.post.mockResolvedValue({ data: {} });
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    scrollToSpy.mockClear(); // MEH-2927: isolate the CONFIRM transition
    await fillStoryAndSubmit();

    expect(await screen.findByTestId("register-frame-confirm")).toBeInTheDocument();
    expectScrolledToTop();
  });

  it("upgrade branch (access_token present) scrolls to the top", async () => {
    // The second branch is not redundant with the first: CONFIRM renders two
    // different screens, and a fix written inside one of them would leave the
    // other exactly as broken while the suite went green.
    authState.user = { email: "p@example.com" };
    api.post.mockResolvedValue({ data: { access_token: "tok-123", whatsapp_sent: true } });
    await renderWizard();
    await screen.findByText(`${K}.steps.business.title`);
    await fillDetailsToStory();
    scrollToSpy.mockClear(); // MEH-2927: isolate the CONFIRM transition
    await fillStoryAndSubmit();

    expect(await screen.findByTestId("register-success-pending")).toBeInTheDocument();
    expectScrolledToTop();
  });
});

// ── MEH-2241 chunk B — «free-text city forbidden» (MEH-213) enforced at the
// DETAILS→CATEGORY gate. Three states of the city field, per the 5-state rule:
// empty / picked-from-list / typed-but-unknown. The first two are controls the
// MEH-2015 chunk-B tests above already pin (empty blocks, "תל אביב" advances);
// they are restated here so the three cells sit in one place.
describe("MEH-2241 chunk B — a typed town CitySearch could not match is as missing as an empty one", () => {
  async function reachDetailsFilledExceptCity() {
    await renderWizard();
    await fillAccountToDetails();
    fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
  }

  it("the stub's sentinel literal matches FREE_TEXT_TOWN (guards the hoisted duplicate)", async () => {
    await reachDetailsFilledExceptCity();
    // If the literal inside vi.mock() drifted from the constant, the constant
    // would be emitted as a KNOWN town and this advance would succeed.
    fireEvent.change(screen.getByTestId("city"), { target: { value: FREE_TEXT_TOWN } });
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(screen.queryByTestId("register-frame-category")).not.toBeInTheDocument();
  });

  it("A — empty city still blocks the DETAILS advance (control)", async () => {
    await reachDetailsFilledExceptCity();
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(screen.getByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-category")).not.toBeInTheDocument();
    expect(document.getElementById("register-city-error")).toHaveTextContent(
      `${K}.validation.city_required`,
    );
  });

  it("B — a town CitySearch vouches for advances (control)", async () => {
    await reachDetailsFilledExceptCity();
    fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
    // MEH-2640: answer step 2's one required question, so this cell's own
    // subject is what decides the advance.
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });

  it("C — a typed town with no match is refused at the field, focused, with the city message", async () => {
    await reachDetailsFilledExceptCity();
    fireEvent.change(screen.getByTestId("city"), { target: { value: FREE_TEXT_TOWN } });
    fireEvent.click(screen.getByTestId("register-details-next"));
    // did NOT advance
    expect(screen.getByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-category")).not.toBeInTheDocument();
    // the message is the city one, not a neighbour's
    expect(document.getElementById("register-city-error")).toHaveTextContent(
      `${K}.validation.city_pick_from_list`,
    );
    const cityInput = screen.getByTestId("city");
    expect(cityInput).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(cityInput);
  });

  it("C→B — the async verdict (onKnownChange) unblocks without a re-emit of the value", async () => {
    await reachDetailsFilledExceptCity();
    const cityInput = screen.getByTestId("city");
    fireEvent.change(cityInput, { target: { value: FREE_TEXT_TOWN } });
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(screen.getByTestId("register-frame-details")).toBeInTheDocument();
    // a late /cities response says the value IS a town after all
    expect(cityInput).toHaveAttribute("data-has-known-change", "1");
    fireEvent.blur(cityInput);
    // MEH-2640: answer step 2's one required question, so this cell's own
    // subject is what decides the advance.
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });

  it("B→C — a late response revoking the match re-blocks, without the value changing", async () => {
    await reachDetailsFilledExceptCity();
    const cityInput = screen.getByTestId("city");
    fireEvent.change(cityInput, { target: { value: "תל אביב" } }); // known at emit
    fireEvent.doubleClick(cityInput); // async verdict: not a town after all
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(screen.getByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-category")).not.toBeInTheDocument();
    expect(document.getElementById("register-city-error")).toHaveTextContent(
      `${K}.validation.city_pick_from_list`,
    );
    expect(cityInput.value).toBe("תל אביב"); // the value itself was never re-emitted
  });

  // Draft round-trip (CI reviewer on #3461): `packDraft` spreads every form
  // field except DRAFT_OMITTED_FIELDS (lib/register-draft.js), so the verdict
  // survives a reload. Asserted end-to-end — a restored draft is NOT
  // re-challenged when the town was picked, and IS challenged when it was not
  // — rather than by reading the stored JSON, which would pass identically if
  // restoreDraft dropped the key on the way back in.
  // `city_known` is not an omitted field, so it rides the draft; MEH-2915 took
  // the phone off it, which is why the helper types one. Two cases, one per
  // outcome, so a red in one cannot hide the other (CI reviewer on this PR).
  async function restoreDraftWithCity(known) {
    localStorage.setItem("token", "tok-123");
    authState.user = { role: "user" };
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        step: 2, // DETAILS
        form: {
          producer_name: "העסק שלי",
          city: known ? "תל אביב" : FREE_TEXT_TOWN,
          city_known: known,
        },
      }),
    );
    await renderWizard();
    fireEvent.click(await screen.findByTestId("register-draft-continue"));
    await screen.findByTestId("register-frame-details");
    // MEH-2915: the phone is no longer part of the draft (packDraft omits it,
    // parseDraft strips it), so a restored draft arrives without one and the
    // required gate would block the advance for a reason that is not this
    // cell's subject. Typed in here, where it is setup rather than assertion.
    fireEvent.change(screen.getByTestId("register-details-phone"), {
      target: { value: "0501234567" },
    });
  }

  it("draft round-trip — a restored list-picked town passes the gate", async () => {
    await restoreDraftWithCity(true);
    // MEH-2640: answer step 2's one required question, so this cell's own
    // subject is what decides the advance.
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });

  it("draft round-trip — a restored free-text town is re-challenged", async () => {
    await restoreDraftWithCity(false);
    fireEvent.click(screen.getByTestId("register-details-next"));
    expect(screen.getByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-category")).not.toBeInTheDocument();
    expect(document.getElementById("register-city-error")).toHaveTextContent(
      `${K}.validation.city_pick_from_list`,
    );
  });

  it("the flag never reaches the POST body", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    // whatever the submit path sends, `city_known` is wizard state, not payload
    api.post.mockResolvedValue({ data: {} });
    fireEvent.change(screen.getByPlaceholderText(`${K}.fields.tagline_placeholder`), {
      target: { value: "הכי טרי שיש" },
    });
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(`${K}.actions.submit`));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = api.post.mock.calls[0];
    expect(body).not.toHaveProperty("city_known");
    expect(body.city).toBe("תל אביב");
  });
});

// MEH-2927 (C13 / pilot B3a): a step change has to start at the top of the new
// step. Measured at 390x844 on a local `next start` before the fix: advancing
// from ACCOUNT to DETAILS kept scrollY=460 and left the step heading at
// y=-330 — the seller lands in the middle of a form whose top she has never
// seen. The committed frame qa-artifacts/MEH-2927/02-step2-on-entry-390-AFTER.webp
// is that view AFTER the fix; the before frame was not committed, so the before
// state is cited as the probe's numbers rather than as a file.
/**
 * MEH-2927 (pilot B3d) — ticking «יש לי רישיון ייצור» must not move «הבא».
 *
 * The hint below the checkbox used to mount on the tick, which pushed the
 * button row down 36px in document space at the exact moment the thumb was on
 * it. Reserved instead: the element is always rendered and hidden with
 * `visibility`, so its real height — however many lines it wraps to — is held
 * either way.
 *
 * 🔴 HONEST LIMIT, stated rather than glossed: jsdom computes no layout, so
 * this file asserts the CLASS CONTRACT (always mounted, `invisible` only when
 * unchecked). That discriminates on this change — the old code rendered
 * nothing at all when unchecked — but it is NOT evidence about rendered
 * pixels. The pixel measurement is in qa-meh2927-register-chrome.mjs [deleted probe, docs/media-archive.md],
 * where a stylesheet exists, and its numbers are in the PR.
 */
describe("MEH-2927 · the licence hint reserves its space (B3d)", () => {
  const hint = () => screen.queryByTestId("register-license-pending-hint");

  async function reachLicenceCategory() {
    // Same override as the MEH-530 block above (:774): the default
    // /categories fixture is «ביצים», which needs no licence, so the block
    // under test would never render. Id 1 is what the CategorySelector stub
    // selects.
    api.get.mockResolvedValue({ data: [{ id: 1, name: "חלב וגבינות" }] });
    await renderWizard();
    await fillAccountToDetails();
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
    fireEvent.change(ph("producer_name"), { target: { value: "משק בדיקה" } });
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(nextBtn());
    await screen.findByTestId("register-frame-category");
    fireEvent.click(await screen.findByTestId("pick-category"));
  }

  it("the hint is in the DOM before the box is ticked, holding its height", async () => {
    await reachLicenceCategory();
    const optin = screen.queryByTestId("register-license-pending-optin");
    if (!optin) return expect.unreachable("the licence opt-in did not render");

    expect(hint(), "mounted while unchecked — that is what reserves the space").toBeTruthy();
    expect(hint().className).toContain("invisible");
  });

  it("…and becomes visible when it is ticked, without being re-mounted", async () => {
    await reachLicenceCategory();
    const optin = screen.queryByTestId("register-license-pending-optin");
    if (!optin) return expect.unreachable("the licence opt-in did not render");

    const before = hint();
    fireEvent.click(optin);
    expect(hint().className).not.toContain("invisible");
    expect(hint(), "the same node, not a new one").toBe(before);
  });
});

describe("RegisterProducerClient — a step change starts at the top (MEH-2927)", () => {
  // Uses the module-level `scrollToSpy` (see its note at the top of the file)
  // rather than a second vi.spyOn over it — stacking a spy on a spy is the one
  // thing that note asks callers not to do.
  it("scrolls to the top when the wizard advances a frame", async () => {
    await renderWizard();
    scrollToSpy.mockClear();

    await fillAccountToDetails();

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it("scrolls to the top when the wizard goes BACK a frame", async () => {
    await renderWizard();
    await fillAccountToDetails();
    scrollToSpy.mockClear();

    fireEvent.click(screen.getByTestId("register-details-back"));
    await screen.findByTestId("register-frame-account");

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  // The one case that must NOT scroll: a cross-step validation bounce owns the
  // viewport, because MEH-1807 focuses the offending field and scrolls it to
  // `block: "center"`. Jumping to the top first would move the page out from
  // under that, and the seller would land above the error she was sent to fix.
  //
  // This cell used to drive the DETAILS gate with an empty business name. That
  // is a SAME-step refusal — runRequiredGate → requestFocus → return, and
  // `setStep` never runs — so the step effect never fired and the case was
  // green with the guard deleted. It proved nothing about the guard it was
  // named after (MEH-1619: the construction must discriminate). The real
  // cross-step bounce is the STORY submit, which calls
  // `setStep(offenders[0].step)` — a genuine step change that must still not
  // scroll. Rebuilt on the existing blanked-field harness, and shown red with
  // `if (pendingFocusIdRef.current) return;` removed.
  it("leaves the viewport to MEH-1807 when a cross-step bounce focuses a field", async () => {
    // non-empty city → hasDraftContent() raises the banner at mount
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ city: "חיפה" }));
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    expect(screen.getByTestId("register-frame-story")).toBeInTheDocument();

    // another tab blanks the business name; «continue» merges it back in
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ producer_name: "", city: "חיפה" }));
    fireEvent.click(screen.getByTestId("register-draft-continue"));
    selectReferral();
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    scrollToSpy.mockClear();

    fireEvent.click(screen.getByText(`${K}.actions.submit`));

    // The bounce really happened — a step CHANGE, not a same-step refusal.
    // Without this assertion the one below would pass on a form that never
    // moved at all, which is exactly how the previous version failed.
    expect(await screen.findByTestId("register-frame-details")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId("register-details-name"));
    // …and the step effect left the viewport to MEH-1807.
    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe("STORY step — card preview (MEH-3074)", () => {
  it("offers a closed, inert preview of the real card, fed from the form", async () => {
    await renderWizard();
    await fillAccountToDetails();
    await fillDetailsToStory();
    fireEvent.change(screen.getByTestId("register-story-tagline"), {
      target: { value: "לחם מחמצת" },
    });

    const details = screen.getByTestId("register-card-preview");
    expect(details.tagName).toBe("DETAILS");
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary").textContent).toBe(`${K}.card_preview.summary`);
    // Closed: the card is not mounted at all, so none of its effects run.
    expect(screen.queryByTestId("preview-card")).toBeNull();

    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByTestId("register-card-preview-body").hasAttribute("inert")).toBe(true);

    const producer = JSON.parse(screen.getByTestId("preview-card").dataset.producer);
    expect(producer.name).toBe("העסק שלי");
    expect(producer.city).toBe("תל אביב");
    expect(producer.short_description).toBe("לחם מחמצת");
    expect(producer.categories.map((c) => c.id)).toEqual([1]);
    expect(producer.has_physical_location).toBe(true);
    expect(producer.offers_delivery).toBe(false);
    expect(producer.images).toEqual([]);
  });
});

// MEH-3193: a failed GET /categories used to leave step 3 with no tiles and a
// required choice nobody could make, with no message. Now step 3 says the list
// did not load and offers a retry that refetches it.
// DISCRIMINATION: against the old `.then(...)` with no catch, the failed block
// never renders (and the rejection is unhandled), so the first findBy fails.
describe("RegisterProducerClient — categories load failure (MEH-3193)", () => {
  async function walkToCategory() {
    await renderWizard();
    await fillAccountToDetails();
    fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
    fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
    fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    fireEvent.click(nextBtn()); // → CATEGORY
  }

  it("shows the load error + retry, and the retry refetches", async () => {
    let failCategories = true;
    api.get.mockImplementation((url) =>
      url === "/categories" && failCategories
        ? Promise.reject(new Error("network"))
        : Promise.resolve({ data: [{ id: 1, name: "ביצים" }] }),
    );
    await walkToCategory();
    const failed = await screen.findByTestId("register-categories-failed");
    expect(within(failed).getByText("dashboard.producer.categories.fetch_error")).toBeInTheDocument();
    const before = api.get.mock.calls.filter(([u]) => u === "/categories").length;
    failCategories = false;
    fireEvent.click(within(failed).getByText("errors.boundary.retry"));
    await waitFor(() =>
      expect(screen.queryByTestId("register-categories-failed")).not.toBeInTheDocument(),
    );
    expect(api.get.mock.calls.filter(([u]) => u === "/categories").length).toBe(before + 1);
    expect(await screen.findByTestId("pick-category")).toBeInTheDocument();
  });

  it("no error block when the list loads", async () => {
    await walkToCategory();
    await screen.findByTestId("pick-category");
    expect(screen.queryByTestId("register-categories-failed")).not.toBeInTheDocument();
  });
});
