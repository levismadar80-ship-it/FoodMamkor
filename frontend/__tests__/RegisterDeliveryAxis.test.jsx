import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import RegisterProducerClient from "@/app/[locale]/register/producer/RegisterProducerClient";
import api from "@/lib/api";

/**
 * MEH-1838 chunk B — the delivery axis on producer registration.
 *
 * Chunk A (#2959) added the four fields to `ProducerRegister`
 * (schemas.py:701-704). The form never sent them, and **Pydantic drops unknown
 * fields silently** — so the request returned 200, the seller saw success, and
 * every business landed on the same default shape. That is the failure mode
 * this file is built against: a green happy-path test proves nothing here,
 * because the happy path was already green while the feature did not exist.
 *
 * So the load-bearing assertions read the **POST body** (`api.post.mock.calls`)
 * rather than the rendered form or the response. Delete the payload block in
 * `handleSubmit` and every one of them goes red; delete the UI and the gate
 * tests go red. Neither can pass against a form that captures nothing.
 */

// next-intl unscoped in the component, so t(key) returns the literal key path.
// NOTE this is exactly why the i18n block at the bottom of this file reads the
// real JSON instead: under this mock a MISSING key is indistinguishable from a
// present one, so the mock can never catch the wrong-namespace trap.
// MEH-2200: `.rich` added for the collection notice on the STORY frame, which
// this file walks through. Plain-string lookups are unchanged.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => {
    const t = (key, values) => {
      const p = scope ? `${scope}.${key}` : key;
      return values ? `${p} ${Object.values(values).join(" ")}` : p;
    };
    t.rich = (key, tags = {}) => {
      const p = scope ? `${scope}.${key}` : key;
      return [
        p,
        ...Object.entries(tags).map(([name, render]) => (
          <span key={name}>{render(name)}</span>
        )),
      ];
    };
    return t;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const refreshUser = vi.fn();
const authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading, refreshUser }),
}));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

vi.mock("@/components/CitySearch", () => ({
  // MEH-2241 chunk B: the wizard gates DETAILS→CATEGORY on CitySearch's
  // `{ known }` verdict (chunk A contract), so a one-argument emit now reads
  // as an unknown town and blocks the advance. This file's subject is not
  // the city gate — every town it types is vouched for.
  default: ({ value, onChange, id }) => (
    <input data-testid="city" id={id} value={value || ""} onChange={(e) => onChange(e.target.value, { known: true })} />
  ),
}));

vi.mock("@/components/CategorySelector", () => ({
  default: ({ onChange }) => (
    <button type="button" data-testid="pick-category" onClick={() => onChange(1)}>
      category
    </button>
  ),
}));

vi.mock("@/components/ProducerOAuthButtons", () => ({ default: () => <div data-testid="oauth" /> }));

vi.mock("@/components/MiniMap", () => ({ default: () => <div data-testid="mini-map" /> }));

vi.mock("@/components/AddressSearch", () => ({
  default: ({ value, onChange, inputTestId, id, placeholder }) => (
    <input
      id={id}
      data-testid={inputTestId}
      placeholder={placeholder}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// CitiesAutocomplete stub — the real component owns its own tests. Two distinct
// buttons so a test can prove the list is carried through as DATA (two cities,
// in order) rather than merely "something non-empty was set".
vi.mock("@/components/CitiesAutocomplete", () => ({
  default: ({ value, onChange }) => (
    <div>
      <span data-testid="cities-value">{(value || []).join("|")}</span>
      <button type="button" data-testid="add-city" onClick={() => onChange(["חיפה"])}>
        add
      </button>
      <button
        type="button"
        data-testid="add-two-cities"
        onClick={() => onChange(["חיפה", "זכרון יעקב"])}
      >
        add two
      </button>
    </div>
  ),
}));

const K = "auth.register.producer";
const A = "admin.producers.form.fields";
const ph = (key) => screen.getByPlaceholderText(`${K}.fields.${key}`);
const nextBtn = () => screen.getByText(`${K}.actions.next`);

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [{ id: 1, name: "ביצים" }] });
  api.post.mockResolvedValue({ data: {} });
  authState.user = null;
  refreshUser.mockReset();
  try {
    localStorage.clear();
  } catch {
    /* jsdom */
  }
});

async function renderWizard() {
  render(<RegisterProducerClient />);
  fireEvent.click(await screen.findByTestId("register-preflight-start"));
}

async function fillAccountToDetails() {
  fireEvent.change(ph("name"), { target: { value: "טסט" } });
  fireEvent.change(ph("email"), { target: { value: "t@example.com" } });
  fireEvent.change(ph("password"), { target: { value: "Abcdefgh1234" } });
  fireEvent.click(nextBtn());
  await screen.findByText(`${K}.steps.business.title`);
}

// Fills the DETAILS required fields but does NOT advance — so each test below
// can set the axis itself and then decide whether the advance should succeed.
function fillDetailsFields() {
  fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
  fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
  fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
  fireEvent.change(ph("address"), { target: { value: "הרצל 1" } });
}

// DETAILS → CATEGORY → STORY → submit. Assumes the axis is already valid.
async function advanceAndSubmit() {
  fireEvent.click(nextBtn()); // → CATEGORY
  fireEvent.click(await screen.findByTestId("pick-category"));
  fireEvent.click(nextBtn()); // → STORY
  await screen.findByPlaceholderText(`${K}.fields.tagline_placeholder`);
  fireEvent.change(screen.getByTestId("register-referral-source"), {
    target: { value: "instagram" },
  });
  screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
  fireEvent.click(screen.getByText(`${K}.actions.submit`));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  return api.post.mock.calls[0][1];
}

describe("MEH-1838 chunk B — the axis reaches the POST body (control)", () => {
  it("physical-only: the three flags are SENT, and delivery_cities is absent", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    const body = await advanceAndSubmit();

    // The control. Each of these is `undefined` if the payload block in
    // handleSubmit is removed — which is the exact state this ticket found.
    expect(body).toHaveProperty("has_physical_location", true);
    expect(body).toHaveProperty("offers_delivery", false);
    expect(body).toHaveProperty("delivery_nationwide", false);

    // The card's acceptance criterion: physical-only sends no empty array.
    expect(body).not.toHaveProperty("delivery_cities");
  });

  it("nationwide: offers_delivery + delivery_nationwide true, still no city array", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-offers-delivery"));
    fireEvent.click(screen.getByTestId("register-delivery-nationwide"));
    const body = await advanceAndSubmit();

    expect(body).toHaveProperty("offers_delivery", true);
    expect(body).toHaveProperty("delivery_nationwide", true);
    expect(body).not.toHaveProperty("delivery_cities");
  });

  it("city list: the cities are carried as DATA, in order, with nationwide false", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-offers-delivery"));
    fireEvent.click(screen.getByTestId("add-two-cities"));
    const body = await advanceAndSubmit();

    expect(body).toHaveProperty("offers_delivery", true);
    expect(body).toHaveProperty("delivery_nationwide", false);
    // Asserting the VALUES, not just that the key exists — a payload that
    // forwards `true` or `[]` would pass a presence-only check.
    expect(body.delivery_cities).toEqual(["חיפה", "זכרון יעקב"]);
  });

  it("physical-only + delivery together is a valid shape and both flags survive", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    // has_physical_location defaults true; add delivery on top of it.
    fireEvent.click(screen.getByTestId("register-offers-delivery"));
    fireEvent.click(screen.getByTestId("register-delivery-nationwide"));
    const body = await advanceAndSubmit();

    expect(body).toHaveProperty("has_physical_location", true);
    expect(body).toHaveProperty("offers_delivery", true);
  });
});

describe("MEH-1838 chunk B — the client-side gate mirrors the server validator", () => {
  it("neither physical nor delivery: the advance is BLOCKED and the error shows", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-has-physical-location")); // untick → neither

    fireEvent.click(nextBtn());

    // Still on DETAILS — a blocked advance is the point (schemas.py:857+ would
    // otherwise 422 two frames later, naming a field no longer on screen).
    expect(screen.getByText(`${K}.steps.business.title`)).toBeInTheDocument();
    expect(screen.getByTestId("register-delivery-axis-error")).toHaveTextContent(
      `${A}.type_validation`,
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("delivery with neither nationwide nor cities: BLOCKED", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-offers-delivery")); // no nationwide, no cities

    fireEvent.click(nextBtn());

    expect(screen.getByText(`${K}.steps.business.title`)).toBeInTheDocument();
    // The inline error renders under exactly this condition, so assert it too —
    // otherwise a refactor that drops the error element while keeping the
    // advance-block still passes, and the seller is left with a button that
    // silently does nothing. The sibling test above asserts its own error for
    // the same reason.
    expect(screen.getByTestId("register-delivery-cities-error")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("the happy default (physical-only) is NOT blocked — the gate discriminates", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    // Reaching CATEGORY proves the gate blocks the two bad shapes above for
    // their own reason, not because it blocks everything.
    expect(await screen.findByTestId("pick-category")).toBeInTheDocument();
  });
});

describe("MEH-1838 chunk B — unticking delivery clears what its block owned (MEH-1879)", () => {
  it("nationwide and cities are reset when offers_delivery goes off", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();

    fireEvent.click(screen.getByTestId("register-offers-delivery"));
    fireEvent.click(screen.getByTestId("register-delivery-nationwide"));
    expect(screen.getByTestId("register-delivery-nationwide")).toBeChecked();

    fireEvent.click(screen.getByTestId("register-offers-delivery")); // untick
    // The block is unmounted; its state must not survive into the payload.
    expect(screen.queryByTestId("register-delivery-nationwide")).not.toBeInTheDocument();

    const body = await advanceAndSubmit();
    // Without the reset this posts delivery_nationwide=true with
    // offers_delivery=false — rejected by the validator, and a 500 at the DB
    // CHECK (MEH-1849) on the manual-approval path.
    expect(body).toHaveProperty("offers_delivery", false);
    expect(body).toHaveProperty("delivery_nationwide", false);
  });

  it("a city list does not survive unticking delivery", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();

    fireEvent.click(screen.getByTestId("register-offers-delivery"));
    fireEvent.click(screen.getByTestId("add-city"));
    expect(screen.getByTestId("cities-value")).toHaveTextContent("חיפה");

    fireEvent.click(screen.getByTestId("register-offers-delivery")); // untick
    const body = await advanceAndSubmit();

    // Leaving them would write delivery_areas rows for a business declaring no
    // delivery — a cross-table contradiction no DB CHECK can express.
    expect(body).not.toHaveProperty("delivery_cities");
  });
});

describe("MEH-1838 chunk B — the i18n keys actually resolve", () => {
  /**
   * The `next-intl` mock above returns the key path for ANY key, so a component
   * asking for a nonexistent key looks identical to one asking for a real one.
   * Every assertion in this file would therefore pass against a wrong namespace.
   *
   * That is not hypothetical: the admin form reaches these strings as
   * `producers.form.fields.*` only because it scopes `useTranslations("admin")`
   * (ProducerForm.jsx:57). A top-level `producers` key ALSO exists and does not
   * contain them — copying the admin call into this unscoped component renders
   * the key name to the seller. This block is the only thing that catches it.
   */
  const KEYS = [
    "has_physical_location",
    "offers_delivery",
    "delivery_nationwide",
    "type_validation",
    "delivery_cities_label",
    "delivery_cities_required",
  ];

  const load = (locale) =>
    JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"),
    );

  it.each(["he", "en"])("%s: every key the component asks for is a non-empty string", (locale) => {
    const fields = load(locale)?.admin?.producers?.form?.fields;
    expect(fields, `admin.producers.form.fields missing from ${locale}.json`).toBeTruthy();

    for (const key of KEYS) {
      expect(typeof fields[key], `${locale}: ${key} is not a string`).toBe("string");
      expect(fields[key].trim().length, `${locale}: ${key} is empty`).toBeGreaterThan(0);
    }
    // A `KEYS.filter(k => k in fields)` length check stood here and was removed:
    // it was ENTAILED by the loop above (a missing key already fails
    // `toBe("string")` on `typeof undefined`), so it read as coverage while
    // being underivable from anything the loop had not already proven. Its
    // comment claimed it guarded against a stale count literal — there was no
    // literal. Deleted rather than reformulated, per testing.md; the
    // reformulation of an entailed assertion tends to be entailed too.
  });

  it("the wrong namespace really is wrong — the trap this guards is live", () => {
    // Control: proves the assertion above discriminates. If `producers.form.
    // fields` ever DID carry these, the test above would pass for the wrong
    // reason and this line tells us the ground shifted.
    const he = load("he");
    const wrong = he?.producers?.form?.fields;
    const wrongHasThem = KEYS.every((k) => typeof wrong?.[k] === "string");
    expect(
      wrongHasThem,
      "producers.form.fields now carries these too — re-check which namespace the component should use",
    ).toBe(false);
  });
});
